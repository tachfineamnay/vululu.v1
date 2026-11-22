"""Fixtures médias générées en mémoire : JPEG/PNG/WebP réalistes, transparence, ratios extrêmes,
fichiers corrompus, WAV. Aucun binaire n'est commité et aucun fichier n'est lu depuis le disque.

Les images sont déterministes (graine fixe) : elles constituent un corpus reproductible pour les
tests de contrat et de qualité, pas une certification de qualité visuelle.
"""

from __future__ import annotations

import io
import struct
import wave

import numpy as np
from PIL import Image, ImageDraw


def photo(width: int = 640, height: int = 480, seed: int = 7) -> Image.Image:
    """Image « photo » synthétique déterministe : ciel dégradé, sol, soleil, bruit léger."""
    rng = np.random.default_rng(seed)
    y = np.linspace(0.0, 1.0, height)[:, None]
    x = np.linspace(0.0, 1.0, width)[None, :]
    sky = np.stack(
        [0.25 + 0.35 * (1.0 - y) + 0.0 * x, 0.45 + 0.30 * (1.0 - y) + 0.0 * x, 0.80 + 0.15 * (1.0 - y) + 0.0 * x],
        axis=-1,
    )
    ground = (y > 0.62).astype(np.float64)[..., None]
    sky = sky * (1.0 - ground) + np.array([0.32, 0.26, 0.20]) * ground
    distance = np.sqrt((x - 0.72) ** 2 + (y - 0.22) ** 2)
    sun = (distance < 0.07)[..., None]
    values = np.where(sun, np.array([1.0, 0.92, 0.70]), sky)
    noise = rng.normal(0.0, 0.02, (height, width, 1))
    array = np.clip((values + noise) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(array, "RGB")


def subject(width: int = 512, height: int = 512, seed: int = 3) -> Image.Image:
    """Sujet net centré sur fond uni légèrement bruité : cas nominal du détourage GrabCut."""
    image = Image.new("RGB", (width, height), (238, 232, 220))
    draw = ImageDraw.Draw(image)
    box_w, box_h = int(width * 0.5), int(height * 0.6)
    left, top = (width - box_w) // 2, (height - box_h) // 2
    draw.ellipse((left, top, left + box_w, top + box_h), fill=(188, 62, 48))
    draw.ellipse((left + int(box_w * 0.2), top + int(box_h * 0.15), left + int(box_w * 0.45), top + int(box_h * 0.5)), fill=(120, 30, 24))
    rng = np.random.default_rng(seed)
    base = np.asarray(image, dtype=np.int16)
    noise = rng.integers(-3, 4, (height, width, 1), dtype=np.int16)
    return Image.fromarray(np.clip(base + noise, 0, 255).astype(np.uint8), "RGB")


def encode(image: Image.Image, image_format: str, **options: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=image_format, **options)
    return buffer.getvalue()


def png_photo(width: int = 640, height: int = 480) -> bytes:
    return encode(photo(width, height), "PNG")


def jpeg_photo(width: int = 640, height: int = 480, progressive: bool = False, quality: int = 88) -> bytes:
    return encode(photo(width, height), "JPEG", quality=quality, progressive=progressive)


def webp_photo(width: int = 640, height: int = 480, quality: int = 80) -> bytes:
    return encode(photo(width, height), "WEBP", quality=quality)


def png_rgba_transparent(width: int = 256, height: int = 192) -> bytes:
    """PNG RGBA avec transparence réelle (coins totalement transparents)."""
    image = subject(width, height).convert("RGBA")
    rgba = np.asarray(image).copy()
    band = max(2, min(width, height) // 12)
    rgba[:band, :band, 3] = 0
    rgba[:band, -band:, 3] = 0
    rgba[-band:, :band, 3] = 0
    rgba[-band:, -band:, 3] = 0
    return encode(Image.fromarray(rgba, "RGBA"), "PNG")


def png_palette_transparent(width: int = 128, height: int = 96) -> bytes:
    """PNG palette (mode P) avec index transparent (tRNS) : la transparence est déclarée, pas alpha."""
    image = subject(width, height).convert("P", palette=Image.Palette.ADAPTIVE, colors=16)
    return encode(image, "PNG", transparency=0)


def webp_alpha(width: int = 192, height: int = 144) -> bytes:
    image = subject(width, height).convert("RGBA")
    rgba = np.asarray(image).copy()
    rgba[:, :, 3] = 255
    rgba[:8, :8, 3] = 0
    return encode(Image.fromarray(rgba, "RGBA"), "WEBP", lossless=True)


def panorama(width: int = 2048, height: int = 16) -> bytes:
    return encode(photo(width, max(16, height)), "PNG")


def poster(width: int = 16, height: int = 2048) -> bytes:
    return encode(photo(max(16, width), height), "PNG")


def truncated(raw: bytes, keep: float = 0.6) -> bytes:
    """Fichier corrompu : tronqué au milieu des données (en-tête valide, flux incomplet)."""
    return raw[: max(16, int(len(raw) * keep))]


def garbage(size: int = 512, header: bytes = b"") -> bytes:
    rng = np.random.default_rng(11)
    return header + rng.integers(0, 256, size, dtype=np.uint8).tobytes()


def wav(seconds: float = 0.5, sample_rate: int = 44100, channels: int = 2, amplitude: float = 0.4) -> bytes:
    """WAV PCM 16 bits déterministe (440 Hz + silence final), 1 ou 2 canaux."""
    frames = int(seconds * sample_rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as stream:
        stream.setnchannels(channels)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        payload = bytearray()
        for index in range(frames):
            value = int(32767 * amplitude * np.sin(2 * np.pi * 440 * index / sample_rate))
            if index > frames * 0.75:
                value = 0
            payload += struct.pack("<h", value) * (1 if channels == 1 else 2)
        stream.writeframes(bytes(payload))
    return buffer.getvalue()


def wav_truncated(raw: bytes) -> bytes:
    return raw[: len(raw) // 2]
