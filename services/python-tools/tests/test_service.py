"""Tests du service python-tools : limites, auth, isolation processus, disponibilité, arrêt propre.

Aucun accès réseau, aucun modèle, aucun fournisseur : uniquement FastAPI/httpx locaux, le pool de
processus réel et des médias générés en mémoire.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import multiprocessing as mp
import os
import secrets
import struct
import time
import uuid
import wave
import zlib

import pytest

os.environ.setdefault("PYTHON_TOOLS_TOKEN", secrets.token_hex(24))
os.environ.setdefault("PYTHON_TOOLS_TIMEOUT_SECONDS", "10")

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.config import ConfigError, settings  # noqa: E402
from app.errors import ToolError  # noqa: E402
from app.limits import BodyLimitMiddleware  # noqa: E402
from app.main import create_app  # noqa: E402
from app.pool import ProcessPool  # noqa: E402
from tests._targets import flaky  # noqa: E402

AUTH = {"Authorization": "Bearer " + os.environ["PYTHON_TOOLS_TOKEN"]}


# --- aides de construction de médias (aucun fichier, aucun réseau) -----------------------------
def png_in_memory(width: int = 64, height: int = 48, noisy: bool = False) -> bytes:
    if noisy:
        image = Image.frombytes("RGB", (width, height), os.urandom(width * height * 3))
    else:
        image = Image.new("RGB", (width, height), (235, 230, 220))
        for x in range(width // 4, width // 2):
            for y in range(height // 4, height // 2):
                image.putpixel((x, y), (180, 60, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def png_with_declared_size(width: int, height: int) -> bytes:
    """PNG minuscule dont l'en-tête IHDR annonce des dimensions énormes (bombe de décompression)."""
    raw = png_in_memory(16, 16)
    header = bytearray(raw)
    struct.pack_into(">II", header, 16, width, height)
    crc = zlib.crc32(bytes(header[12:29])) & 0xFFFFFFFF
    struct.pack_into(">I", header, 29, crc)
    return bytes(header)


def image_source(raw: bytes) -> dict[str, str]:
    return {
        "assetVersionId": "asset-version-test-" + uuid.uuid4().hex[:8],
        "sha256": hashlib.sha256(raw).hexdigest(),
        "mimeType": "image/png",
        "imageBase64": base64.b64encode(raw).decode("ascii"),
    }


def wav_in_memory(seconds: float = 0.2, sample_rate: int = 8000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(b"\x00\x00" * int(seconds * sample_rate))
    return buffer.getvalue()


def app_for(monkeypatch: pytest.MonkeyPatch, **env: str):
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return create_app()


# --- configuration -----------------------------------------------------------------------------
def test_missing_token_refuses_to_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PYTHON_TOOLS_TOKEN", "trop-court")
    with pytest.raises(ConfigError):
        settings()


def test_invalid_limit_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PYTHON_TOOLS_MAX_PIXELS", "10")
    with pytest.raises(ConfigError):
        settings()


# --- authentification --------------------------------------------------------------------------
def test_missing_and_invalid_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        assert client.get("/v1/capabilities").status_code == 401
        assert client.get("/v1/capabilities", headers={"Authorization": "Bearer mauvais"}).status_code == 401
        assert client.get("/v1/capabilities", headers={"Authorization": "Basic abc"}).status_code == 401
        # En-tête non ASCII (octets bruts, comme un client HTTP réel) : refus structuré, jamais un 500.
        non_ascii = {"Authorization": b"Bearer t\xc3\xb6k\xc3\xa9n-inesp\xc3\xa9r\xc3\xa9"}
        assert client.get("/v1/capabilities", headers=non_ascii).status_code == 401
        # Jeton valide : route authentifiée servie.
        assert client.get("/v1/capabilities", headers=AUTH).status_code == 200


# --- limites de corps --------------------------------------------------------------------------
def test_body_limit_declared_content_length(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_SOURCE_BYTES="1024", PYTHON_TOOLS_MAX_CONCURRENCY="1")
    limit = settings().max_body_bytes
    with TestClient(app) as client:
        response = client.post(
            "/v1/tools/image.analyze@1",
            headers={**AUTH, "content-type": "application/json"},
            content=b"x" * (limit + 1024),
        )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_body_limit_chunked_without_content_length() -> None:
    """Sans Content-Length : arrêt dès le dépassement, jamais le corps entier en mémoire.

    Preuve au niveau ASGI (le transport de test httpx tamponne le corps avant l'appel, il ne peut
    donc pas démontrer l'abandon anticipé).
    """
    limit = 2048
    chunks = [{"type": "http.request", "body": b"x" * 1024, "more_body": True} for _ in range(10)]
    pulled = {"count": 0}
    sent: list[dict] = []

    async def app(scope, receive, send):
        raise AssertionError("l'application ne doit pas être appelée pour un corps hors limite")

    async def receive():
        pulled["count"] += 1
        return chunks[pulled["count"] - 1]

    async def send(message):
        sent.append(message)

    middleware = BodyLimitMiddleware(app, limit)
    asyncio.run(middleware({"type": "http", "method": "POST", "headers": []}, receive, send))

    assert sent[0]["status"] == 413
    assert json.loads(sent[1]["body"])["error"]["code"] == "payload_too_large"
    # 1024 + 1024 + 1024 > 2048 : le troisième morceau suffit, les sept suivants ne sont jamais lus.
    assert pulled["count"] == 3


def test_body_limit_chunked_http_response(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_SOURCE_BYTES="1024", PYTHON_TOOLS_MAX_CONCURRENCY="1")

    def stream():
        for _ in range(64):
            yield b"x" * 4096

    with TestClient(app) as client:
        response = client.post(
            "/v1/tools/image.analyze@1",
            headers={**AUTH, "content-type": "application/json"},
            content=stream(),
        )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


# --- bornes de décodage ------------------------------------------------------------------------
def test_oversized_decoded_base64_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_SOURCE_BYTES="1024", PYTHON_TOOLS_MAX_CONCURRENCY="1")
    raw = os.urandom(2048)
    payload = {
        "requestId": str(uuid.uuid4()),
        "source": {
            "assetVersionId": "asset-version-big",
            "sha256": hashlib.sha256(raw).hexdigest(),
            "mimeType": "image/png",
            "imageBase64": base64.b64encode(raw).decode("ascii"),
        },
    }
    with TestClient(app) as client:
        response = client.post("/v1/tools/image.analyze@1", headers=AUTH, json=payload)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_decompression_bomb_rejected_before_decode(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(
        monkeypatch,
        PYTHON_TOOLS_MAX_DIMENSION="8192",
        PYTHON_TOOLS_MAX_PIXELS="65536",
        PYTHON_TOOLS_MAX_CONCURRENCY="1",
    )
    bomb = png_with_declared_size(6000, 6000)
    with TestClient(app) as client:
        response = client.post(
            "/v1/tools/image.analyze@1",
            headers=AUTH,
            json={"requestId": str(uuid.uuid4()), "source": image_source(bomb)},
        )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "image_pixels_exceeded"


def test_malformed_image_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    raw = b"\x89PNG\r\n\x1a\n" + os.urandom(64)
    with TestClient(app) as client:
        response = client.post(
            "/v1/tools/image.analyze@1",
            headers=AUTH,
            json={"requestId": str(uuid.uuid4()), "source": image_source(raw)},
        )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_image"


def test_output_size_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    """Toute sortie PNG est bornée : un encodage trop volumineux échoue explicitement (413)."""
    monkeypatch.setenv("PYTHON_TOOLS_MAX_OUTPUT_BYTES", "65536")
    from app.errors import PayloadTooLarge
    from app.imaging import _png_bytes

    noisy = Image.frombytes("RGB", (512, 512), os.urandom(512 * 512 * 3))
    with pytest.raises(PayloadTooLarge):
        _png_bytes(noisy)


# --- chaîne réelle -----------------------------------------------------------------------------
def test_analyze_and_audio_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        analysis = client.post(
            "/v1/tools/image.analyze@1",
            headers=AUTH,
            json={"requestId": str(uuid.uuid4()), "source": image_source(png_in_memory(64, 48))},
        )
        assert analysis.status_code == 200, analysis.text
        assert analysis.json()["data"]["analysis"]["width"] == 64

        wav = wav_in_memory()
        audio = client.post(
            "/v1/tools/audio.analyze@1",
            headers=AUTH,
            json={
                "requestId": str(uuid.uuid4()),
                "source": {
                    "assetVersionId": "asset-version-audio",
                    "sha256": hashlib.sha256(wav).hexdigest(),
                    "mimeType": "audio/wav",
                    "audioBase64": base64.b64encode(wav).decode("ascii"),
                },
            },
        )
        assert audio.status_code == 200, audio.text
        assert audio.json()["data"]["analysis"]["sampleRate"] == 8000


# --- pool : délai, remplacement, concurrence, surcharge ---------------------------------------
def test_timeout_kills_worker_and_pool_recovers() -> None:
    pool = ProcessPool(size=1, timeout_seconds=0.5, start_seconds=20, target=flaky)
    asyncio.run(_timeout_scenario(pool))


async def _timeout_scenario(pool: ProcessPool) -> None:
    await pool.start()
    try:
        started = time.perf_counter()
        with pytest.raises(ToolError) as failure:
            await pool.run({"hang": True})
        assert failure.value.code == "processing_timeout"
        assert failure.value.status == 504
        assert time.perf_counter() - started < 15
        # Le processus bloqué a été tué : le suivant est servi par un enfant neuf.
        result = await pool.run({"value": "apres-incident"})
        assert result["echo"] == "apres-incident"
        assert pool.ready()
    finally:
        await pool.stop()


def test_concurrency_is_bounded_by_pool_size() -> None:
    pool = ProcessPool(size=2, timeout_seconds=10, start_seconds=20, target=flaky, max_inflight=8)
    asyncio.run(_concurrency_scenario(pool))


async def _concurrency_scenario(pool: ProcessPool) -> None:
    await pool.start()
    try:
        results = await asyncio.gather(*[pool.run({"sleep": 0.2, "value": index}) for index in range(6)])
        assert [item["echo"] for item in results] == list(range(6))
        pids = {item["pid"] for item in results}
        assert len(pids) <= 2  # au plus "size" processus, jamais un par requête
        assert pool.stats()["alive"] == 2
    finally:
        await pool.stop()


def test_overload_rejected_instead_of_queueing() -> None:
    pool = ProcessPool(size=1, timeout_seconds=10, start_seconds=20, target=flaky, max_inflight=1)
    asyncio.run(_overload_scenario(pool))


async def _overload_scenario(pool: ProcessPool) -> None:
    await pool.start()
    try:
        first = asyncio.create_task(pool.run({"sleep": 0.4, "value": "long"}))
        await asyncio.sleep(0.05)
        with pytest.raises(ToolError) as failure:
            await pool.run({"value": "trop"})
        assert failure.value.code == "overloaded"
        assert failure.value.status == 503
        assert (await first)["echo"] == "long"
    finally:
        await pool.stop()


# --- cycle de vie et disponibilité --------------------------------------------------------------
def test_startup_readiness_and_clean_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        ready = client.get("/readyz")
        assert ready.status_code == 200, ready.text
        body = ready.json()
        assert body["status"] == "ready"
        assert body["workers"]["alive"] == 1
        assert body["selfTest"]["ok"] is True
        assert client.get("/healthz").json()["status"] == "ok"
        assert len(mp.active_children()) >= 1
    # Arrêt : aucun processus orphelin, le pool est fermé.
    deadline = time.time() + 10
    while time.time() < deadline and mp.active_children():
        time.sleep(0.05)
    assert mp.active_children() == []
    assert app.state.pool.stats()["running"] is False


def test_readiness_reflects_pool_state(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_for(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        assert client.get("/readyz").status_code == 200
        asyncio.run(app.state.pool.stop())
        degraded = client.get("/readyz")
        assert degraded.status_code == 503
        assert degraded.json()["status"] == "unavailable"
        # La vivacité ne dépend pas de la disponibilité du traitement.
        assert client.get("/healthz").status_code == 200
