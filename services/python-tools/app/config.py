"""Configuration stricte du service python-tools (échec au démarrage si mal configuré)."""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    """Configuration absente ou invalide : le service doit refuser de démarrer."""


@dataclass(frozen=True)
class Settings:
    token: str
    max_source_bytes: int
    max_pixels: int
    max_dimension: int
    timeout_seconds: float
    max_concurrency: int
    models_dir: str
    log_level: str


def _int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigError(name + " doit être un entier.") from error
    if value < minimum or value > maximum:
        raise ConfigError(name + " hors bornes [" + str(minimum) + ", " + str(maximum) + "].")
    return value


def _float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as error:
        raise ConfigError(name + " doit être un nombre.") from error
    if value < minimum or value > maximum:
        raise ConfigError(name + " hors bornes [" + str(minimum) + ", " + str(maximum) + "].")
    return value


def settings() -> Settings:
    token = os.environ.get("PYTHON_TOOLS_TOKEN", "").strip()
    if len(token) < 24:
        raise ConfigError("PYTHON_TOOLS_TOKEN absent ou trop court (24 caractères minimum).")
    return Settings(
        token=token,
        max_source_bytes=_int("PYTHON_TOOLS_MAX_SOURCE_BYTES", 16 * 1024 * 1024, 1024, 32 * 1024 * 1024),
        max_pixels=_int("PYTHON_TOOLS_MAX_PIXELS", 24_000_000, 65_536, 64_000_000),
        max_dimension=_int("PYTHON_TOOLS_MAX_DIMENSION", 4096, 256, 8192),
        timeout_seconds=_float("PYTHON_TOOLS_TIMEOUT_SECONDS", 25.0, 1.0, 120.0),
        max_concurrency=_int("PYTHON_TOOLS_MAX_CONCURRENCY", 2, 1, 8),
        models_dir=os.environ.get("PYTHON_TOOLS_MODELS_DIR", "/models").strip() or "/models",
        log_level=os.environ.get("PYTHON_TOOLS_LOG_LEVEL", "info").strip() or "info",
    )
