"""Détection des modèles locaux facultatifs. Aucun téléchargement au démarrage ni à l'exécution.

Aucun modèle n'est ACTIVÉ : les trois capacités sont classiques (Pillow/NumPy/OpenCV, module wave).
Un fichier ONNX présent dans /models est seulement *détecté* ; il n'est jamais chargé, et il n'est
jamais présenté comme actif ni comme vérifié sans empreinte épinglée.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionalModel:
    filename: str
    purpose: str
    #: Capacités qui utilisent RÉELLEMENT ce fichier. Vide = aucun usage (état actuel).
    used_by: tuple[str, ...]
    expected_sha256: str | None = None


# Le détourage repose sur GrabCut (algorithme classique local), pas sur un réseau de neurones.
# Ce registre est le point d'ancrage d'un éventuel modèle embarqué : il ne l'active pas.
OPTIONAL_MODELS: tuple[OptionalModel, ...] = (
    OptionalModel(
        filename="u2netp.onnx",
        purpose="Détourage par réseau de neurones — NON ACTIVÉ (GrabCut classique utilisé à la place)",
        used_by=(),
    ),
)


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_status(models_dir: str) -> list[dict[str, object]]:
    """État réel des modèles facultatifs : détecté, jamais activé, jamais téléchargé.

    `verified` n'est vrai que si une empreinte attendue est épinglée et correspond : un fichier
    présent sans empreinte de référence n'est jamais déclaré vérifié.
    """
    statuses: list[dict[str, object]] = []
    for model in OPTIONAL_MODELS:
        path = os.path.join(models_dir, model.filename)
        exists = os.path.isfile(path)
        checksum = _sha256(path) if exists else None
        pinned = model.expected_sha256 is not None
        statuses.append(
            {
                "filename": model.filename,
                "purpose": model.purpose,
                "usedBy": list(model.used_by),
                "present": exists,
                "sizeBytes": os.path.getsize(path) if exists else None,
                "sha256": checksum,
                "sha256Pinned": pinned,
                "verified": bool(pinned and checksum is not None and checksum == model.expected_sha256),
                "active": False,
                "loaded": False,
                "download": "forbidden",
            }
        )
    return statuses
