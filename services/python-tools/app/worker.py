"""Exécution réelle d'une capacité dans un processus enfant dédié.

Un appel natif (OpenCV, NumPy, Pillow) qui dépasse le délai ne peut pas être interrompu dans un
thread : l'exécution a donc lieu dans un processus séparé, que le pool peut tuer. Aucune capacité
n'est découverte dynamiquement : la table ci-dessous est fermée, comme le registre.
"""

from __future__ import annotations

import base64
import hashlib
import socket
import time
from typing import Any, Callable

from pydantic import ValidationError

from .audio import analyze as analyze_audio
from .audio import decode_source as decode_audio_source
from .contracts import (
    AnalyzeAudioData,
    AnalyzeAudioRequest,
    AnalyzeData,
    AnalyzeRequest,
    ImageOutput,
    SegmentData,
    SegmentRequest,
)
from .errors import PayloadTooLarge, ToolError
from .imaging import analyze, decode_source, segment
from . import ipc


def pipeline_self_test() -> dict[str, object]:
    """Vérifie que la chaîne native répond réellement (aucune I/O, aucun réseau, aucun modèle)."""
    try:
        import cv2
        import numpy as np
        from PIL import Image

        array = np.zeros((16, 16, 3), dtype=np.uint8)
        sharpness = float(cv2.Laplacian(array, cv2.CV_64F).var())
        sample = Image.new("RGB", (16, 16), (1, 2, 3)).resize((8, 8))
        return {
            "ok": True,
            "cv2": cv2.__version__,
            "numpy": np.__version__,
            "pillow": Image.__version__,
            "laplacian": round(sharpness, 4),
            "resized": list(sample.size),
        }
    except Exception as error:  # l'échec est rapporté, jamais masqué
        return {"ok": False, "reason": type(error).__name__}


def _source_image(source: Any) -> tuple[bytes, dict[str, object]]:
    raw = decode_source(source.imageBase64, source.sha256, source.mimeType)
    return raw, {"assetVersionId": source.assetVersionId, "sha256": source.sha256, "mimeType": source.mimeType}


def _analyze_image(request: AnalyzeRequest) -> dict[str, object]:
    raw, source_meta = _source_image(request.source)
    started = time.perf_counter()
    analysis = analyze(raw)
    return {
        "data": AnalyzeData(analysis=analysis).model_dump(),
        "source": source_meta,
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }


def _segment_image(request: SegmentRequest) -> dict[str, object]:
    raw, source_meta = _source_image(request.source)
    started = time.perf_counter()
    outcome = segment(raw, request.maxDimension, request.outputs)
    outputs: list[dict[str, object]] = []
    for kind, payload in outcome.outputs.items():
        width, height = outcome.dimensions[kind]
        outputs.append(
            ImageOutput(
                kind=kind,
                base64=base64.b64encode(payload).decode("ascii"),
                sha256=hashlib.sha256(payload).hexdigest(),
                width=width,
                height=height,
                sizeBytes=len(payload),
            ).model_dump()
        )
    analysis = analyze(raw)
    return {
        "data": SegmentData(
            outputs=outputs,
            analysis=analysis,
            coverage=outcome.coverage,
            boundingBox=list(outcome.bounding_box),
            sourceSha256=request.source.sha256,
        ).model_dump(),
        "source": source_meta,
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }


def _analyze_audio(request: AnalyzeAudioRequest) -> dict[str, object]:
    raw = decode_audio_source(request.source.audioBase64, request.source.sha256)
    started = time.perf_counter()
    analysis = analyze_audio(raw)
    return {
        "data": AnalyzeAudioData(analysis=analysis, sourceSha256=request.source.sha256).model_dump(),
        "source": {
            "assetVersionId": request.source.assetVersionId,
            "sha256": request.source.sha256,
            "mimeType": request.source.mimeType,
        },
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }


def _validated(model: type, payload: Any) -> Any:
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        # Un champ de source trop long est un dépassement de taille (413), pas une syntaxe invalide.
        if any(item.get("type") in ("string_too_long", "too_long") for item in error.errors()):
            raise PayloadTooLarge("Source au-delà de la limite interne.") from error
        raise ToolError("invalid_request", "Requête interne invalide.", 422) from error


_HANDLERS: dict[str, Callable[[Any], dict[str, object]]] = {
    "image.analyze@1": lambda payload: _analyze_image(_validated(AnalyzeRequest, payload)),
    "image.segment@1": lambda payload: _segment_image(_validated(SegmentRequest, payload)),
    "audio.analyze@1": lambda payload: _analyze_audio(_validated(AnalyzeAudioRequest, payload)),
}


def execute(job: dict[str, Any]) -> dict[str, object]:
    """Exécute une capacité fermée. Toute erreur reste structurée et sans détail interne."""
    capability = job.get("capability")
    handler = _HANDLERS.get(capability) if isinstance(capability, str) else None
    if handler is None:
        raise ToolError("unknown_capability", "Capacité inconnue.", 404)
    return handler(job.get("request"))


def _error_payload(error: ToolError) -> dict[str, object]:
    return {
        "ok": False,
        "error": {"code": error.code, "message": error.message, "status": error.status, "retryable": error.retryable},
    }


def child_main(port: int, nonce: str) -> None:
    """Boucle du processus enfant : un travail à la fois, aucune trace d'erreur non structurée.

    L'enfant se connecte à la boucle locale du parent avec le nonce à usage unique : aucun
    descripteur n'est partagé, aucun named pipe Windows n'est utilisé.
    """
    try:
        conn = socket.create_connection(("127.0.0.1", port), timeout=30.0)
    except OSError:
        return
    try:
        conn.settimeout(None)
        ipc.write_frame(conn, {"nonce": nonce, "event": "ready"})
        while True:
            try:
                job = ipc.read_frame(conn)
            except (ipc.FrameError, OSError):
                return
            if job is None:
                return
            try:
                ipc.write_frame(conn, {"ok": True, "result": execute(job)})
            except ToolError as error:
                ipc.write_frame(conn, _error_payload(error))
            except Exception:
                ipc.write_frame(
                    conn,
                    {
                        "ok": False,
                        "error": {
                            "code": "internal_error",
                            "message": "Échec interne du traitement.",
                            "status": 500,
                            "retryable": False,
                        },
                    },
                )
    finally:
        try:
            conn.close()
        except OSError:
            pass
