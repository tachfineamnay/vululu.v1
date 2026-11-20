"""Registre de capacités explicite et versionné. Aucun outil n'est découvert dynamiquement."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata


@dataclass(frozen=True)
class Capability:
    name: str
    version: int
    action: str
    effect: str
    description: str
    engine: str
    params_model: str
    outputs: tuple[str, ...]
    limits: dict[str, object]


CAPABILITIES: dict[str, Capability] = {
    "image.analyze@1": Capability(
        name="image.analyze", version=1, action="READ", effect="read",
        description="Analyse une ressource confirmée : dimensions, exposition, contraste, netteté, entropie, couleurs dominantes, empreinte perceptuelle.",
        engine="pillow+numpy+opencv", params_model="AnalyzeRequest",
        outputs=("ImageAnalysis",), limits={"maxPixels": 24_000_000},
    ),
    "image.segment@1": Capability(
        name="image.segment", version=1, action="GENERATE", effect="derives-asset",
        description="Détoure un sujet (GrabCut local) et produit un PNG transparent et/ou un masque alpha, sans modèle externe ni téléchargement.",
        engine="opencv-grabcut", params_model="SegmentRequest",
        outputs=("cutout", "mask"), limits={"maxDimension": 4096},
    ),
}

_DEPENDENCIES = {
    "fastapi": "fastapi",
    "pydantic": "pydantic",
    "pillow": "pillow",
    "numpy": "numpy",
    "opencv-python-headless": "opencv-python-headless",
}


def dependency_status() -> dict[str, dict[str, object]]:
    status: dict[str, dict[str, object]] = {}
    for label, package in _DEPENDENCIES.items():
        try:
            version = metadata.version(package)
            status[label] = {"present": True, "version": version}
        except metadata.PackageNotFoundError:
            status[label] = {"present": False, "version": None}
    return status


def ready() -> bool:
    return all(entry["present"] for entry in dependency_status().values())


def catalog(models_dir: str, models: list[dict[str, object]]) -> dict[str, object]:
    return {
        "service": "vululu-python-tools",
        "capabilities": [
            {
                "key": key,
                "name": capability.name,
                "version": capability.version,
                "action": capability.action,
                "effect": capability.effect,
                "description": capability.description,
                "engine": capability.engine,
                "paramsModel": capability.params_model,
                "outputs": list(capability.outputs),
                "limits": capability.limits,
            }
            for key, capability in CAPABILITIES.items()
        ],
        "dependencies": dependency_status(),
        "models": models,
    }
