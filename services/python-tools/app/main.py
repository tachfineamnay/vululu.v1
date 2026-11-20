"""API interne FastAPI : contrats typés, limites strictes, erreurs structurées, aucun accès réseau sortant."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .auth import require_token
from .config import settings
from .contracts import AnalyzeRequest, AnalyzeData, ImageOutput, SegmentData, SegmentRequest
from .errors import ToolError
from .imaging import analyze, decode_source, segment
from .models import model_status
from .registry import CAPABILITIES, catalog, dependency_status, ready

_settings = settings()  # échoue au démarrage si le jeton ou les limites sont invalides
_executor = ThreadPoolExecutor(max_workers=_settings.max_concurrency, thread_name_prefix="python-tool")
_slots = asyncio.Semaphore(_settings.max_concurrency)
_logger = logging.getLogger("vululu.python_tools")
_logger.setLevel(_settings.log_level.upper())


def _log(event: str, **fields: object) -> None:
    record: dict[str, object] = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "event": event, "service": "vululu-python-tools"}
    record.update(fields)
    _logger.info(json.dumps(record, ensure_ascii=False, sort_keys=True))


async def _bounded(call: Callable[[], Any]) -> Any:
    loop = asyncio.get_running_loop()
    async with _slots:
        try:
            return await asyncio.wait_for(loop.run_in_executor(_executor, call), timeout=_settings.timeout_seconds)
        except asyncio.TimeoutError as error:
            raise ToolError("processing_timeout", "Traitement trop long : relancez avec une image plus petite.", 504, True) from error


app = FastAPI(title="vululu-python-tools", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def request_context(request: Request, call_next: Callable[[Request], Any]) -> Any:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    declared = request.headers.get("content-length")
    limit = int(len(json.dumps({"source": {"imageBase64": "x" * int(_settings.max_source_bytes * 4 / 3 + 32)}})))
    if declared and declared.isdigit() and int(declared) > limit:
        _log("request_rejected", requestId=request_id, reason="payload_too_large")
        return JSONResponse(status_code=413, content={"error": {"code": "payload_too_large", "message": "Corps de requête au-delà de la limite interne.", "requestId": request_id, "retryable": False}})
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    _log("request", requestId=request_id, method=request.method, path=request.url.path, status=response.status_code,
         durationMs=round((time.perf_counter() - started) * 1000, 1))
    return response


@app.exception_handler(ToolError)
async def tool_error_handler(request: Request, error: ToolError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    _log("tool_error", requestId=request_id, code=error.code, status=error.status)
    return JSONResponse(status_code=error.status,
                        content={"error": {"code": error.code, "message": error.message, "requestId": request_id, "retryable": error.retryable}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    fields = [{"path": ".".join(str(part) for part in item.get("loc", ())), "type": item.get("type", "invalid")} for item in error.errors()]
    _log("invalid_request", requestId=request_id, fields=fields)
    return JSONResponse(status_code=422,
                        content={"error": {"code": "invalid_request", "message": "Requête invalide.", "requestId": request_id, "retryable": False, "fields": fields}})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, error: StarletteHTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    code = "not_found" if error.status_code == 404 else "http_error"
    return JSONResponse(status_code=error.status_code,
                        content={"error": {"code": code, "message": str(error.detail), "requestId": request_id, "retryable": False}})


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {"status": "ok", "service": "vululu-python-tools", "version": __version__}


@app.get("/readyz")
async def readyz() -> JSONResponse:
    dependencies = dependency_status()
    models = model_status(_settings.models_dir)
    payload = {"status": "ready" if ready() else "unavailable", "version": __version__, "dependencies": dependencies, "models": models}
    return JSONResponse(status_code=200 if ready() else 503, content=payload)


@app.get("/v1/capabilities", dependencies=[Depends(require_token)])
async def capabilities() -> dict[str, object]:
    return catalog(_settings.models_dir, model_status(_settings.models_dir))


def _source_image(source: Any) -> tuple[bytes, dict[str, object]]:
    raw = decode_source(source.imageBase64, source.sha256, source.mimeType)
    return raw, {"assetVersionId": source.assetVersionId, "sha256": source.sha256, "mimeType": source.mimeType}


def _analyze_sync(request: AnalyzeRequest) -> dict[str, object]:
    raw, source_meta = _source_image(request.source)
    started = time.perf_counter()
    analysis = analyze(raw)
    return {"data": AnalyzeData(analysis=analysis).model_dump(), "source": source_meta, "durationMs": round((time.perf_counter() - started) * 1000, 1)}


def _segment_sync(request: SegmentRequest) -> dict[str, object]:
    raw, source_meta = _source_image(request.source)
    started = time.perf_counter()
    outcome = segment(raw, request.maxDimension, request.outputs)
    outputs: list[dict[str, object]] = []
    for kind, payload in outcome.outputs.items():
        width, height = outcome.dimensions[kind]
        outputs.append(ImageOutput(kind=kind, base64=base64.b64encode(payload).decode("ascii"),
                                   sha256=hashlib.sha256(payload).hexdigest(), width=width, height=height,
                                   sizeBytes=len(payload)).model_dump())
    analysis = analyze(raw)
    return {"data": SegmentData(outputs=outputs, analysis=analysis, coverage=outcome.coverage,
                                boundingBox=list(outcome.bounding_box), sourceSha256=request.source.sha256).model_dump(),
            "source": source_meta, "durationMs": round((time.perf_counter() - started) * 1000, 1)}


def _envelope(capability: str, request_id: str, payload: dict[str, object]) -> dict[str, object]:
    return {"requestId": request_id, "capability": capability, "capabilityVersion": CAPABILITIES[capability].version,
            "version": __version__, **payload}


@app.post("/v1/tools/image.analyze@1", dependencies=[Depends(require_token)])
async def image_analyze(request: AnalyzeRequest) -> dict[str, object]:
    payload = await _bounded(lambda: _analyze_sync(request))
    return _envelope("image.analyze@1", request.requestId, payload)


@app.post("/v1/tools/image.segment@1", dependencies=[Depends(require_token)])
async def image_segment(request: SegmentRequest) -> dict[str, object]:
    payload = await _bounded(lambda: _segment_sync(request))
    return _envelope("image.segment@1", request.requestId, payload)
