"""Traitement d'image local et borné : analyse réelle et détourage GrabCut (aucun modèle externe)."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import io
import math
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from .config import settings
from .errors import InvalidSource, PayloadTooLarge

_ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
_DCT_CACHE: np.ndarray | None = None


def decode_source(base64_text: str, expected_sha256: str, mime_type: str) -> bytes:
    """Décode et vérifie l'empreinte avant toute utilisation : l'octet traité est celui annoncé."""
    limits = settings()
    # Borne AVANT l'allocation : une chaîne base64 trop longue est refusée sans décodage complet.
    if len(base64_text) > limits.max_base64_chars:
        raise PayloadTooLarge("Image source au-delà de la limite interne.")
    try:
        raw = base64.b64decode(base64_text, validate=True)
    except (binascii.Error, ValueError) as error:
        raise InvalidSource("invalid_base64", "Contenu image illisible.") from error
    if not raw:
        raise InvalidSource("empty_source", "Contenu image vide.")
    if len(raw) > limits.max_source_bytes:
        raise PayloadTooLarge("Image source au-delà de la limite interne.")
    digest = hashlib.sha256(raw).hexdigest()
    if not hmac.compare_digest(digest, expected_sha256):
        raise InvalidSource("source_checksum_mismatch", "L'empreinte de la source ne correspond pas aux octets reçus.")
    expected_prefix = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}[mime_type]
    if _sniff_format(raw) != expected_prefix:
        raise InvalidSource("source_format_mismatch", "Le format réel de l'image ne correspond pas au type annoncé.")
    return raw


def _sniff_format(raw: bytes) -> str | None:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if raw.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "WEBP"
    return None


def load_image(raw: bytes) -> Image.Image:
    """Ouvre l'image et contrôle les dimensions DÉCLARÉES avant tout décodage de pixels.

    Une bombe de décompression (fichier minuscule annonçant des millions de pixels) allouerait sinon
    plusieurs gigaoctets avant le contrôle : l'en-tête est donc vérifié avant `image.load()`.
    """
    limits = settings()
    Image.MAX_IMAGE_PIXELS = max(limits.max_pixels, 65_536)
    try:
        image = Image.open(io.BytesIO(raw))
    except Image.DecompressionBombError as error:
        raise InvalidSource("image_pixels_exceeded", "Nombre de pixels au-delà de la limite interne.") from error
    except (UnidentifiedImageError, OSError) as error:
        raise InvalidSource("invalid_image", "Image illisible ou corrompue.") from error
    if image.format not in _ALLOWED_FORMATS:
        raise InvalidSource("unsupported_image_format", "Format d'image non pris en charge.")
    width, height = image.size
    if width < 8 or height < 8:
        raise InvalidSource("image_too_small", "Image trop petite pour être traitée.")
    if width > limits.max_dimension or height > limits.max_dimension:
        raise InvalidSource("image_dimensions_exceeded", "Dimensions au-delà de la limite interne.")
    if width * height > limits.max_pixels:
        raise InvalidSource("image_pixels_exceeded", "Nombre de pixels au-delà de la limite interne.")
    try:
        image.load()
    except Image.DecompressionBombError as error:
        raise InvalidSource("image_pixels_exceeded", "Nombre de pixels au-delà de la limite interne.") from error
    except OSError as error:
        raise InvalidSource("invalid_image", "Image illisible ou corrompue.") from error
    return image


def _dct_matrix(size: int = 32) -> np.ndarray:
    global _DCT_CACHE
    if _DCT_CACHE is None:
        k = np.arange(size, dtype=np.float64)
        matrix = np.cos(np.pi * (2 * k[:, None] + 1) * k[None, :] / (2 * size))
        matrix[0, :] *= 1 / math.sqrt(2)
        _DCT_CACHE = matrix * math.sqrt(2 / size)
    return _DCT_CACHE


def perceptual_hash(gray: Image.Image) -> str:
    small = gray.resize((32, 32), Image.Resampling.LANCZOS)
    values = np.asarray(small, dtype=np.float64)
    matrix = _dct_matrix()
    coefficients = matrix @ values @ matrix.T
    low = coefficients[:8, :8].flatten()
    median = float(np.median(low[1:]))
    bits = low > median
    result = 0
    for bit in bits:
        result = (result << 1) | int(bool(bit))
    return format(result, "016x")


def _dominant_colors(image: Image.Image, limit: int = 5) -> list[dict[str, object]]:
    palette_image = image.convert("P", palette=Image.Palette.ADAPTIVE, colors=8)
    counts = np.bincount(np.asarray(palette_image).ravel(), minlength=256).astype(np.float64)
    palette = palette_image.getpalette() or []
    total = float(counts.sum()) or 1.0
    order = np.argsort(counts)[::-1][:limit]
    colors: list[dict[str, object]] = []
    for index in order:
        if counts[index] <= 0 or len(palette) < index * 3 + 3:
            continue
        colors.append({"rgb": [int(palette[int(index) * 3]), int(palette[int(index) * 3 + 1]), int(palette[int(index) * 3 + 2])],
                       "ratio": round(float(counts[index]) / total, 4)})
    return colors


def analyze(raw: bytes) -> dict[str, object]:
    image = load_image(raw)
    width, height = image.size
    gray = image.convert("L")
    sample = gray.copy()
    sample.thumbnail((512, 512), Image.Resampling.LANCZOS)
    arrays = np.asarray(sample, dtype=np.float64)
    brightness = float(arrays.mean() / 255.0)
    contrast = float(arrays.std() / 255.0)
    histogram = np.histogram(arrays, bins=256, range=(0, 255))[0].astype(np.float64)
    probabilities = histogram[histogram > 0] / histogram.sum()
    entropy = float(-(probabilities * np.log2(probabilities)).sum())
    sharpness = float(cv2.Laplacian(np.asarray(sample, dtype=np.uint8), cv2.CV_64F).var())
    transparent = image.mode in ("RGBA", "LA") or "transparency" in image.info
    return {
        "width": width, "height": height, "format": image.format or "unknown", "mode": image.mode,
        "transparent": bool(transparent),
        "brightness": round(brightness, 4), "contrast": round(contrast, 4),
        "sharpness": round(sharpness, 2), "entropy": round(entropy, 4),
        "dominantColors": _dominant_colors(image),
        "perceptualHash": perceptual_hash(gray),
        "analyzedWidth": sample.width, "analyzedHeight": sample.height,
    }


def _png_bytes(image: Image.Image) -> bytes:
    """Encode en PNG et borne la sortie : aucune réponse non bornée ne quitte le service."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    payload = buffer.getvalue()
    if len(payload) > settings().max_output_bytes:
        raise PayloadTooLarge("Sortie image au-delà de la limite interne.")
    return payload


@dataclass(frozen=True)
class SegmentOutcome:
    outputs: dict[str, bytes]
    dimensions: dict[str, tuple[int, int]]
    coverage: float
    bounding_box: tuple[int, int, int, int]


def segment(raw: bytes, max_dimension: int, wanted: list[str]) -> SegmentOutcome:
    image = load_image(raw)
    width, height = image.size
    scale = min(1.0, max_dimension / float(max(width, height)))
    if scale < 1.0:
        work = image.convert("RGB").resize((max(8, int(round(width * scale))), max(8, int(round(height * scale)))), Image.Resampling.LANCZOS)
    else:
        work = image.convert("RGB")
    bgr = cv2.cvtColor(np.asarray(work), cv2.COLOR_RGB2BGR)
    mask = np.zeros(bgr.shape[:2], dtype=np.uint8)
    margin_x = max(1, int(bgr.shape[1] * 0.02))
    margin_y = max(1, int(bgr.shape[0] * 0.02))
    rect = (margin_x, margin_y, bgr.shape[1] - 2 * margin_x, bgr.shape[0] - 2 * margin_y)
    if rect[2] < 8 or rect[3] < 8:
        raise InvalidSource("image_too_small", "Image trop petite pour un détourage.")
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(bgr, mask, rect, background_model, foreground_model, 5, cv2.GC_INIT_WITH_RECT)
    binary = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8) * 255
    kernel = np.ones((3, 3), dtype=np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    components, labels, stats, _ = cv2.connectedComponentsWithStats((binary > 0).astype(np.uint8), 8)
    if components <= 1:
        raise InvalidSource("segmentation_empty", "Aucun sujet détecté : utilisez une photo avec un sujet net.")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    binary = np.where(labels == largest, 255, 0).astype(np.uint8)
    coverage = float(np.count_nonzero(binary)) / float(binary.size)
    if coverage < 0.002 or coverage > 0.995:
        raise InvalidSource("segmentation_empty", "Détourage non fiable : le sujet occupe une part trop faible ou trop large de l'image.")
    full_mask = cv2.resize(binary, (width, height), interpolation=cv2.INTER_LINEAR)
    full_mask = np.where(full_mask > 127, 255, 0).astype(np.uint8)
    rows, columns = np.where(full_mask > 0)
    if not rows.size:
        raise InvalidSource("segmentation_empty", "Aucun sujet détecté après mise à l'échelle.")
    padding = max(1, int(round(max(width, height) * 0.01)))
    x0 = max(0, int(columns.min()) - padding)
    y0 = max(0, int(rows.min()) - padding)
    x1 = min(width - 1, int(columns.max()) + padding)
    y1 = min(height - 1, int(rows.max()) + padding)
    rgba = image.convert("RGBA")
    rgba.putalpha(Image.fromarray(full_mask, mode="L"))
    cutout = rgba.crop((x0, y0, x1 + 1, y1 + 1))
    mask_image = Image.fromarray(full_mask, mode="L")
    outputs: dict[str, bytes] = {}
    dimensions: dict[str, tuple[int, int]] = {}
    if "cutout" in wanted:
        outputs["cutout"] = _png_bytes(cutout)
        dimensions["cutout"] = cutout.size
    if "mask" in wanted:
        outputs["mask"] = _png_bytes(mask_image)
        dimensions["mask"] = mask_image.size
    return SegmentOutcome(outputs=outputs, dimensions=dimensions, coverage=round(coverage, 4), bounding_box=(x0, y0, x1 + 1, y1 + 1))
