"""Analyse audio locale et bornée : WAV/PCM uniquement (module standard `wave` + NumPy, aucun modèle).

Aucun accès réseau, aucun téléchargement, aucun chemin de fichier : les octets arrivent en base64
et sont vérifiés par SHA-256 avant tout décodage PCM. Le décodage est plafonné par les gardes de
durée, de fréquence et de nombre de canaux.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import io
import math
import struct
import wave

import numpy as np

from .config import settings
from .errors import InvalidSource, PayloadTooLarge

_MAX_SECONDS = 300.0
_MIN_SAMPLE_RATE = 8_000
_MAX_SAMPLE_RATE = 96_000
_MAX_CHANNELS = 2
_MIN_SAMPLE_WIDTH = 1
_MAX_SAMPLE_WIDTH = 4
_SILENCE_WINDOW_SECONDS = 0.05
_SILENCE_THRESHOLD_DBFS = -50.0
_SILENCE_MIN_SECONDS = 0.2
_MAX_SILENCE_SEGMENTS = 20
_MIN_DBFS = -120.0


def _is_wave(raw: bytes) -> bool:
    """En-tête RIFF/WAVE minimal : aucun décodage n'a lieu avant cette vérification."""
    return len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WAVE"


def _dbfs(amplitude: float) -> float:
    """Niveau relatif à la pleine échelle, plancher fini pour rester sérialisable en JSON."""
    if amplitude <= 1e-12:
        return _MIN_DBFS
    return max(_MIN_DBFS, 20.0 * math.log10(amplitude))


def decode_source(base64_text: str, expected_sha256: str) -> bytes:
    """Décode, borne et vérifie l'empreinte de la source avant tout décodage PCM."""
    try:
        raw = base64.b64decode(base64_text, validate=True)
    except (binascii.Error, ValueError) as error:
        raise InvalidSource("invalid_base64", "Contenu audio illisible.") from error
    if not raw:
        raise InvalidSource("empty_source", "Contenu audio vide.")
    if len(raw) > settings().max_source_bytes:
        raise PayloadTooLarge("Audio source au-delà de la limite interne.")
    digest = hashlib.sha256(raw).hexdigest()
    if not hmac.compare_digest(digest, expected_sha256):
        raise InvalidSource("source_checksum_mismatch", "L'empreinte de la source ne correspond pas aux octets reçus.")
    if not _is_wave(raw):
        raise InvalidSource("source_format_mismatch", "Le contenu reçu n'est pas un fichier WAV.")
    return raw


def _pcm_samples(data: bytes, sample_width: int, channels: int) -> tuple[np.ndarray, int]:
    """Décode le PCM (8/16/24/32 bits) en flottants [-1, 1] et compte les échantillons à pleine échelle.

    La pleine échelle dépend de la largeur native : 0/255 en 8 bits non signé, puis les bornes
    signées minimales et maximales pour 16, 24 et 32 bits.
    """
    if sample_width == 1:
        values = np.frombuffer(data, dtype=np.uint8).astype(np.int32)
        clipped = int(np.count_nonzero((values == 0) | (values == 255)))
        samples = (values.astype(np.float64) - 128.0) / 128.0
    elif sample_width == 2:
        values = np.frombuffer(data, dtype="<i2").astype(np.int32)
        clipped = int(np.count_nonzero((values == 32_767) | (values == -32_768)))
        samples = values.astype(np.float64) / 32_768.0
    elif sample_width == 3:
        triplets = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        values = triplets[:, 0] | (triplets[:, 1] << 8) | (triplets[:, 2] << 16)
        values = np.where(values >= 8_388_608, values - 16_777_216, values)
        clipped = int(np.count_nonzero((values == 8_388_607) | (values == -8_388_608)))
        samples = values.astype(np.float64) / 8_388_608.0
    elif sample_width == 4:
        values = np.frombuffer(data, dtype="<i4").astype(np.int64)
        clipped = int(np.count_nonzero((values == 2_147_483_647) | (values == -2_147_483_648)))
        samples = values.astype(np.float64) / 2_147_483_648.0
    else:
        raise InvalidSource("audio_sample_width_out_of_range", "Largeur d'échantillon non prise en charge.")
    return samples.reshape(-1, channels), clipped


def _silence_stats(mono: np.ndarray, sample_rate: int, duration: float) -> tuple[float, list[dict[str, float]]]:
    """Détecte les silences par fenêtres de 50 ms (< -50 dBFS), fusionne puis garde >= 0,2 s.

    Retourne le ratio de silence (tous segments qualifiants) et au plus 20 segments arrondis.
    """
    frames = int(mono.size)
    window_frames = max(1, int(round(sample_rate * _SILENCE_WINDOW_SECONDS)))
    segments: list[tuple[int, int]] = []
    open_start: int | None = None
    for start in range(0, frames, window_frames):
        end = min(start + window_frames, frames)
        rms = float(np.sqrt(np.mean(np.square(mono[start:end]))))
        silent = _dbfs(rms) < _SILENCE_THRESHOLD_DBFS
        if silent and open_start is None:
            open_start = start
        elif not silent and open_start is not None:
            segments.append((open_start, start))
            open_start = None
    if open_start is not None:
        segments.append((open_start, frames))
    kept = [(start, end) for start, end in segments if (end - start) / sample_rate >= _SILENCE_MIN_SECONDS]
    kept_seconds = sum((end - start) / sample_rate for start, end in kept)
    ratio = min(1.0, kept_seconds / duration) if duration > 0 else 0.0
    return ratio, [
        {"start": round(start / sample_rate, 4), "end": round(end / sample_rate, 4)}
        for start, end in kept[:_MAX_SILENCE_SEGMENTS]
    ]


def analyze(raw: bytes) -> dict[str, object]:
    """Analyse bornée d'un WAV/PCM : métadonnées, niveaux, écrêtage et silences."""
    if not _is_wave(raw):
        raise InvalidSource("source_format_mismatch", "Le contenu reçu n'est pas un fichier WAV.")
    try:
        with wave.open(io.BytesIO(raw), "rb") as stream:
            channels = stream.getnchannels()
            sample_rate = stream.getframerate()
            sample_width = stream.getsampwidth()
            frames = stream.getnframes()
            if channels < 1 or channels > _MAX_CHANNELS:
                raise InvalidSource("audio_channels_unsupported", "Seuls les WAV mono ou stéréo sont pris en charge.")
            if sample_rate < _MIN_SAMPLE_RATE or sample_rate > _MAX_SAMPLE_RATE:
                raise InvalidSource("audio_sample_rate_out_of_range", "Fréquence d'échantillonnage hors bornes [8000, 96000] Hz.")
            if sample_width < _MIN_SAMPLE_WIDTH or sample_width > _MAX_SAMPLE_WIDTH:
                raise InvalidSource("audio_sample_width_out_of_range", "Largeur d'échantillon hors bornes [1, 4] octets.")
            duration = frames / float(sample_rate)
            if frames <= 0 or duration <= 0.0 or duration > _MAX_SECONDS:
                raise InvalidSource("audio_duration_out_of_range", "Durée audio nulle ou au-delà de 300 secondes.")
            data = stream.readframes(frames)
    except EOFError as error:
        raise InvalidSource("audio_data_truncated", "Les données audio sont incomplètes ou tronquées.") from error
    except (wave.Error, RuntimeError, struct.error, ValueError) as error:
        # Le module wave peut lever RuntimeError (chunk incohérent) ou struct.error (en-tête tronqué) :
        # toute anomalie de structure reste une erreur 422 structurée, jamais une erreur interne.
        raise InvalidSource("invalid_wave", "Fichier WAV illisible ou corrompu.") from error
    if len(data) != frames * channels * sample_width:
        raise InvalidSource("audio_data_truncated", "Les données audio sont incomplètes ou tronquées.")
    values, clipped = _pcm_samples(data, sample_width, channels)
    total = int(values.size)
    peak = float(np.max(np.abs(values))) if total else 0.0
    rms = float(np.sqrt(np.mean(np.square(values)))) if total else 0.0
    silence_ratio, silence_segments = _silence_stats(values.mean(axis=1), sample_rate, duration)
    return {
        "duration": round(duration, 6),
        "sampleRate": int(sample_rate),
        "channels": int(channels),
        "sampleWidth": int(sample_width),
        "frames": int(frames),
        "peakDbfs": round(_dbfs(peak), 2),
        "rmsDbfs": round(_dbfs(rms), 2),
        "clippingRatio": round(clipped / float(total), 6) if total else 0.0,
        "silenceRatio": round(silence_ratio, 6),
        "silenceSegments": silence_segments,
    }
