"""Détection des modèles locaux facultatifs. Aucun téléchargement au démarrage ni à l'exécution."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionalModel:
    filename: str
    purpose: str
    used_by: tuple[str, ...]
    expected_sha256: str | None = None


# P06 n'active aucun modèle : le détourage repose sur un algorithme local (GrabCut).
# Ce registre est le point d'ancrage pour un modèle embarqué (P07+) monté en lecture seule.
OPTIONAL_MODELS: tuple[OptionalModel, ...] = (
    OptionalModel("u2netp.onnx", "Détourage avancé (non activé en P06)", ("image.segment@1",)),
)


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_status(models_dir: str) -> list[dict[str, object]]:
    """État réel des modèles facultatifs, sans téléchargement ni chemin utilisateur."""
    statuses: list[dict[str, object]] = []
    for model in OPTIONAL_MODELS:
        path = os.path.join(models_dir, model.filename)
        exists = os.path.isfile(path)
        checksum = _sha256(path) if exists else None
        statuses.append(
            {
                "filename": model.filename,
                "purpose": model.purpose,
                "usedBy": list(model.used_by),
                "present": exists,
                "sha256": checksum,
                "verified": checksum is not None and (model.expected_sha256 is None or checksum == model.expected_sha256),
                "download": "forbidden",
            }
        )
    return statuses
