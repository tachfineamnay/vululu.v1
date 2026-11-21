"""Contrats d'entrée/sortie typés (Pydantic). Aucune URL, aucun chemin, aucun identifiant externe."""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .config import settings

_ALLOWED_MIME = Literal["image/png", "image/jpeg", "image/webp"]
_ALLOWED_AUDIO_MIME = Literal["audio/wav"]
ASSET_ID_PATTERN = r"^[A-Za-z0-9_-]{1,128}$"
SHA256_PATTERN = r"^[a-f0-9]{64}$"


def _max_base64_length() -> int:
    # 4 caractères par 3 octets + marge d'en-tête base64.
    return math.ceil(settings().max_source_bytes * 4 / 3) + 16


class SourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    assetVersionId: str = Field(pattern=ASSET_ID_PATTERN)
    sha256: str = Field(pattern=SHA256_PATTERN)
    mimeType: _ALLOWED_MIME
    imageBase64: str = Field(min_length=16, max_length=_max_base64_length())


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    source: SourceRef


class SegmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    source: SourceRef
    outputs: list[Literal["cutout", "mask"]] = Field(default_factory=lambda: ["cutout", "mask"], min_length=1, max_length=2)
    maxDimension: int = Field(default=2048, ge=256, le=4096)


class DominantColor(BaseModel):
    rgb: list[int] = Field(min_length=3, max_length=3)
    ratio: float = Field(ge=0, le=1)


class ImageAnalysis(BaseModel):
    width: int
    height: int
    format: str
    mode: str
    transparent: bool
    brightness: float
    contrast: float
    sharpness: float
    entropy: float
    dominantColors: list[DominantColor]
    perceptualHash: str
    analyzedWidth: int
    analyzedHeight: int


class ImageOutput(BaseModel):
    kind: Literal["cutout", "mask"]
    mimeType: Literal["image/png"] = "image/png"
    base64: str
    sha256: str = Field(pattern=SHA256_PATTERN)
    width: int
    height: int
    sizeBytes: int


class AnalyzeData(BaseModel):
    analysis: ImageAnalysis


class SegmentData(BaseModel):
    outputs: list[ImageOutput]
    analysis: ImageAnalysis
    coverage: float
    boundingBox: list[int] = Field(min_length=4, max_length=4)
    sourceSha256: str = Field(pattern=SHA256_PATTERN)


class AudioSourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    assetVersionId: str = Field(pattern=ASSET_ID_PATTERN)
    sha256: str = Field(pattern=SHA256_PATTERN)
    mimeType: _ALLOWED_AUDIO_MIME
    audioBase64: str = Field(min_length=16, max_length=_max_base64_length())


class AnalyzeAudioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    source: AudioSourceRef


class SilenceSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: float = Field(ge=0, le=300)
    end: float = Field(ge=0, le=300)


class AudioAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration: float = Field(gt=0, le=300)
    sampleRate: int = Field(ge=8_000, le=96_000)
    channels: int = Field(ge=1, le=2)
    sampleWidth: int = Field(ge=1, le=4)
    frames: int = Field(ge=1)
    peakDbfs: float = Field(ge=-120, le=0)
    rmsDbfs: float = Field(ge=-120, le=0)
    clippingRatio: float = Field(ge=0, le=1)
    silenceRatio: float = Field(ge=0, le=1)
    silenceSegments: list[SilenceSegment] = Field(default_factory=list, max_length=20)


class AnalyzeAudioData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis: AudioAnalysis
    sourceSha256: str = Field(pattern=SHA256_PATTERN)
