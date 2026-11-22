"""API interne FastAPI : contrats typés, limites strictes, erreurs structurées, aucun accès réseau sortant.

Le traitement natif (OpenCV/NumPy/Pillow) s'exécute dans des processus enfants bornés : un délai
dépassé tue réellement la tâche au lieu de laisser un thread la poursuivre.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .auth import require_token
from .config import settings
from .contracts import AnalyzeAudioRequest, AnalyzeRequest, SegmentRequest
from .errors import ToolError, Unauthorized
from .limits import BodyLimitMiddleware
from .models import model_status
from .pool import ProcessPool
from .registry import CAPABILITIES, catalog, dependency_status
from .worker import pipeline_self_test

_logger = logging.getLogger("vululu.python_tools")


def _log(event: str, **fields: object) -> None:
    record: dict[str, object] = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event,
        "service": "vululu-python-tools",
    }
    record.update(fields)
    _logger.info(json.dumps(record, ensure_ascii=False, sort_keys=True))


def _envelope(capability: str, request_id: str, payload: dict[str, object]) -> dict[str, object]:
    return {
        "requestId": request_id,
        "capability": capability,
        "capabilityVersion": CAPABILITIES[capability].version,
        "version": __version__,
        **payload,
    }


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid.uuid4())


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    pool: ProcessPool = app.state.pool
    app.state.self_test = pipeline_self_test()
    await pool.start()
    _log("started", workers=pool.stats(), selfTest=app.state.self_test)
    try:
        yield
    finally:
        await pool.stop()
        _log("stopped")


def create_app() -> FastAPI:
    config = settings()
    _logger.setLevel(config.log_level.upper())

    app = FastAPI(
        title="vululu-python-tools",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=_lifespan,
    )
    app.state.pool = ProcessPool(
        size=config.max_concurrency,
        timeout_seconds=config.timeout_seconds,
        start_seconds=config.worker_start_seconds,
    )
    app.state.self_test = {"ok": False, "reason": "not_started"}
    # La limite de corps s'applique AVANT tout tamponnage, même sans Content-Length (chunked).
    app.add_middleware(BodyLimitMiddleware, max_body_bytes=config.max_body_bytes)

    @app.middleware("http")
    async def request_context(request: Request, call_next: Callable[[Request], Any]) -> Any:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        _log(
            "request",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            durationMs=round((time.perf_counter() - started) * 1000, 1),
        )
        return response

    @app.exception_handler(ToolError)
    async def tool_error_handler(request: Request, error: ToolError) -> JSONResponse:
        request_id = _request_id(request)
        _log("tool_error", requestId=request_id, code=error.code, status=error.status)
        return JSONResponse(
            status_code=error.status,
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "requestId": request_id,
                    "retryable": error.retryable,
                }
            },
        )

    @app.exception_handler(Unauthorized)
    async def unauthorized_handler(request: Request, error: Unauthorized) -> JSONResponse:
        request_id = _request_id(request)
        _log("unauthorized", requestId=request_id)
        return JSONResponse(
            status_code=401,
            headers={"www-authenticate": "Bearer"},
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "requestId": request_id,
                    "retryable": False,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
        request_id = _request_id(request)
        fields = [
            {"path": ".".join(str(part) for part in item.get("loc", ())), "type": item.get("type", "invalid")}
            for item in error.errors()
        ]
        _log("invalid_request", requestId=request_id, fields=fields)
        # Un champ de source au-delà de sa borne est un dépassement de taille (413), pas une syntaxe
        # invalide : le client doit pouvoir le distinguer sans rejouer la requête.
        if any(item.get("type") in ("string_too_long", "too_long") for item in error.errors()):
            return JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "payload_too_large",
                        "message": "Source au-delà de la limite interne.",
                        "requestId": request_id,
                        "retryable": False,
                        "fields": fields,
                    }
                },
            )
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": "Requête invalide.",
                    "requestId": request_id,
                    "retryable": False,
                    "fields": fields,
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, error: StarletteHTTPException) -> JSONResponse:
        request_id = _request_id(request)
        code = "not_found" if error.status_code == 404 else "http_error"
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": code, "message": str(error.detail), "requestId": request_id, "retryable": False}},
        )

    def pool_of(request: Request) -> ProcessPool:
        return request.app.state.pool

    async def run_capability(request: Request, capability: str, payload: dict[str, Any]) -> dict[str, object]:
        pool = pool_of(request)
        return await pool.run({"capability": capability, "request": payload})

    @app.get("/healthz")
    async def healthz() -> dict[str, object]:
        """Vivacité : le processus répond, sans présumer des traitements."""
        return {"status": "ok", "service": "vululu-python-tools", "version": __version__}

    @app.get("/readyz")
    async def readyz(request: Request) -> JSONResponse:
        """Disponibilité réelle : pool de processus vivant + chaîne native auto-testée."""
        pool = pool_of(request)
        self_test = request.app.state.self_test
        dependencies = dependency_status()
        models = model_status(config.models_dir)
        ready = bool(pool.ready() and isinstance(self_test, dict) and self_test.get("ok") is True)
        payload = {
            "status": "ready" if ready else "unavailable",
            "version": __version__,
            "selfTest": self_test,
            "workers": pool.stats(),
            "dependencies": dependencies,
            "models": models,
            "limits": {
                "maxSourceBytes": config.max_source_bytes,
                "maxBodyBytes": config.max_body_bytes,
                "maxPixels": config.max_pixels,
                "maxDimension": config.max_dimension,
                "maxOutputBytes": config.max_output_bytes,
                "maxAudioSamples": config.max_audio_samples,
                "maxConcurrency": config.max_concurrency,
                "timeoutSeconds": config.timeout_seconds,
            },
        }
        if not ready:
            _log("not_ready", workers=payload["workers"], selfTest=self_test)
        return JSONResponse(status_code=200 if ready else 503, content=payload)

    @app.get("/v1/capabilities", dependencies=[Depends(require_token)])
    async def capabilities() -> dict[str, object]:
        return catalog(config.models_dir, model_status(config.models_dir))

    @app.post("/v1/tools/image.analyze@1", dependencies=[Depends(require_token)])
    async def image_analyze(request: Request, body: AnalyzeRequest) -> dict[str, object]:
        payload = await run_capability(request, "image.analyze@1", body.model_dump())
        return _envelope("image.analyze@1", body.requestId, payload)

    @app.post("/v1/tools/image.segment@1", dependencies=[Depends(require_token)])
    async def image_segment(request: Request, body: SegmentRequest) -> dict[str, object]:
        payload = await run_capability(request, "image.segment@1", body.model_dump())
        return _envelope("image.segment@1", body.requestId, payload)

    @app.post("/v1/tools/audio.analyze@1", dependencies=[Depends(require_token)])
    async def audio_analyze(request: Request, body: AnalyzeAudioRequest) -> dict[str, object]:
        payload = await run_capability(request, "audio.analyze@1", body.model_dump())
        return _envelope("audio.analyze@1", body.requestId, payload)

    return app


app = create_app()
