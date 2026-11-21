"""Qualité et contrats des capacités Python : formats réels, ratios extrêmes, fichiers corrompus,
empreintes, qualité du détourage, honnêteté des modèles, disponibilité et parité avec TypeScript.

Aucun réseau, aucun modèle téléchargé, aucun binaire commité : les médias sont générés en mémoire.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import uuid
from pathlib import Path

import pytest

os.environ.setdefault("PYTHON_TOOLS_TOKEN", "0123456789abcdef0123456789abcdef")
os.environ.setdefault("PYTHON_TOOLS_TIMEOUT_SECONDS", "20")

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from app import __version__  # noqa: E402
from app.config import settings  # noqa: E402
from app.contracts import (  # noqa: E402
    ASSET_ID_PATTERN,
    AnalyzeAudioData,
    AnalyzeData,
    AudioSourceRef,
    ImageOutput,
    SegmentData,
    SegmentRequest,
    SourceRef,
)
from app.main import create_app  # noqa: E402
from app.registry import CAPABILITIES  # noqa: E402
from tests import fixtures  # noqa: E402

AUTH = {"Authorization": "Bearer " + os.environ["PYTHON_TOOLS_TOKEN"]}
REPO = Path(__file__).resolve().parents[3]
ADAPTER = REPO / "apps/api/src/infrastructure/python/adapter.ts"
CLIENT = REPO / "apps/api/src/infrastructure/python/client.ts"
REGISTRY = REPO / "apps/api/src/infrastructure/execution/registry.ts"


def app_with(monkeypatch: pytest.MonkeyPatch, **env: str):
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return create_app()


def image_body(raw: bytes, mime: str = "image/png", sha: str | None = None) -> dict[str, object]:
    return {
        "requestId": str(uuid.uuid4()),
        "source": {
            "assetVersionId": "asset-version-" + uuid.uuid4().hex[:10],
            "sha256": sha or hashlib.sha256(raw).hexdigest(),
            "mimeType": mime,
            "imageBase64": base64.b64encode(raw).decode("ascii"),
        },
    }


def audio_body(raw: bytes, sha: str | None = None) -> dict[str, object]:
    return {
        "requestId": str(uuid.uuid4()),
        "source": {
            "assetVersionId": "asset-version-" + uuid.uuid4().hex[:10],
            "sha256": sha or hashlib.sha256(raw).hexdigest(),
            "mimeType": "audio/wav",
            "audioBase64": base64.b64encode(raw).decode("ascii"),
        },
    }


def analyze(client: TestClient, raw: bytes, mime: str = "image/png", sha: str | None = None):
    return client.post("/v1/tools/image.analyze@1", headers=AUTH, json=image_body(raw, mime, sha))


def segment(client: TestClient, raw: bytes, mime: str = "image/png", **extra: object):
    payload = image_body(raw, mime)
    payload.update(extra)
    return client.post("/v1/tools/image.segment@1", headers=AUTH, json=payload)


def decode_png(body: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(body)))


# --- 1. formats réels -------------------------------------------------------------------------
FORMATS = {
    "png": lambda: (fixtures.png_photo(), "image/png", "PNG", False),
    "jpeg-baseline": lambda: (fixtures.jpeg_photo(), "image/jpeg", "JPEG", False),
    "jpeg-progressif": lambda: (fixtures.jpeg_photo(progressive=True), "image/jpeg", "JPEG", False),
    "webp": lambda: (fixtures.webp_photo(), "image/webp", "WEBP", False),
    "png-rgba": lambda: (fixtures.png_rgba_transparent(), "image/png", "PNG", True),
    "png-palette-trns": lambda: (fixtures.png_palette_transparent(), "image/png", "PNG", True),
    "webp-alpha": lambda: (fixtures.webp_alpha(), "image/webp", "WEBP", True),
}


@pytest.mark.parametrize("name", sorted(FORMATS))
def test_analyze_real_formats(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    raw, mime, expected_format, transparent = FORMATS[name]()
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        response = analyze(client, raw, mime)
    assert response.status_code == 200, name + ": " + response.text
    analysis = response.json()["data"]["analysis"]
    assert analysis["format"] == expected_format, name
    assert analysis["transparent"] is transparent, name
    assert 0.0 <= analysis["brightness"] <= 1.0 and 0.0 <= analysis["entropy"] <= 8.0
    assert len(analysis["perceptualHash"]) == 16


def test_aspect_ratios_extreme(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    cases = {
        "panorama": (fixtures.panorama(), 2048, 16),
        "poster": (fixtures.poster(), 16, 2048),
        "paysage": (fixtures.png_photo(1920, 1080), 1920, 1080),
        "portrait": (fixtures.png_photo(1080, 1920), 1080, 1920),
    }
    with TestClient(app) as client:
        for name, (raw, width, height) in cases.items():
            response = analyze(client, raw)
            assert response.status_code == 200, name + ": " + response.text
            analysis = response.json()["data"]["analysis"]
            assert (analysis["width"], analysis["height"]) == (width, height), name
        # Ratio extrême et détourage : échec explicite quand la marge ne laisse pas 8 px de sujet.
        tiny = segment(client, fixtures.panorama(1024, 16), maxDimension=512)
        assert tiny.status_code == 422
        assert tiny.json()["error"]["code"] == "image_too_small"
        bande = segment(client, fixtures.png_photo(1024, 64), maxDimension=512)
        assert bande.status_code == 200, bande.text
        mask = [item for item in bande.json()["data"]["outputs"] if item["kind"] == "mask"][0]
        assert (mask["width"], mask["height"]) == (1024, 64)


# --- 2. fichiers corrompus ou incohérents : échecs explicites ----------------------------------
def test_corrupted_and_inconsistent_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    png = fixtures.png_photo()
    jpeg = fixtures.jpeg_photo()
    cases = [
        ("png tronqué", fixtures.truncated(png), "image/png", 422, "invalid_image"),
        ("jpeg tronqué", fixtures.truncated(jpeg, 0.4), "image/jpeg", 422, "invalid_image"),
        ("signature PNG valide, corps aléatoire", fixtures.garbage(512, bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), "image/png", 422, "invalid_image"),
        ("format annoncé faux", jpeg, "image/png", 422, "source_format_mismatch"),
    ]
    with TestClient(app) as client:
        for name, raw, mime, status, code in cases:
            response = analyze(client, raw, mime)
            assert response.status_code == status, name + ": " + response.text
            assert response.json()["error"]["code"] == code, name
        tiny = Image.new("RGB", (4, 4), (10, 20, 30))
        buffer = io.BytesIO()
        tiny.save(buffer, format="PNG")
        too_small = analyze(client, buffer.getvalue())
        assert too_small.status_code == 422 and too_small.json()["error"]["code"] == "image_too_small"
        header_only = b"\x89PNG\r\n\x1a\n" + b"0" * 8  # signature valide, aucun IHDR exploitable
        empty = client.post(
            "/v1/tools/image.analyze@1",
            headers=AUTH,
            json=image_body(header_only, sha=hashlib.sha256(header_only).hexdigest()),
        )
        assert empty.status_code == 422 and empty.json()["error"]["code"] == "invalid_image"


def test_audio_wav_quality_and_corruption(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        for name, raw, channels in [
            ("mono", fixtures.wav(seconds=1.2, channels=1), 1),
            ("stéréo", fixtures.wav(seconds=1.2, channels=2, sample_rate=48000), 2),
        ]:
            response = client.post("/v1/tools/audio.analyze@1", headers=AUTH, json=audio_body(raw))
            assert response.status_code == 200, name + ": " + response.text
            analysis = response.json()["data"]["analysis"]
            assert analysis["channels"] == channels, name
            assert analysis["silenceSegments"], name
            assert 0.0 <= analysis["clippingRatio"] <= 1.0
        corrupt = client.post(
            "/v1/tools/audio.analyze@1",
            headers=AUTH,
            json=audio_body(fixtures.wav_truncated(fixtures.wav())),
        )
        assert corrupt.status_code == 422
        assert corrupt.json()["error"]["code"] in {"audio_data_truncated", "invalid_wave"}


# --- 3. empreintes source et sortie ------------------------------------------------------------
def test_source_and_output_sha256_verification(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    raw = fixtures.png_photo(384, 288)
    digest = hashlib.sha256(raw).hexdigest()
    subject = fixtures.encode(fixtures.subject(384, 384), "PNG")
    with TestClient(app) as client:
        response = analyze(client, raw)
        assert response.status_code == 200
        assert response.json()["source"]["sha256"] == digest
        assert response.json()["source"]["mimeType"] == "image/png"

        tampered = bytearray(raw)
        tampered[-24] ^= 0xFF
        rejected = analyze(client, bytes(tampered), sha=digest)
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "source_checksum_mismatch"

        segmented = segment(client, subject, maxDimension=384)
        assert segmented.status_code == 200, segmented.text
        for output in segmented.json()["data"]["outputs"]:
            decoded = base64.b64decode(output["base64"])
            assert hashlib.sha256(decoded).hexdigest() == output["sha256"]
            assert len(decoded) == output["sizeBytes"]
            assert decoded.startswith(b"\x89PNG\r\n\x1a\n")
        assert segmented.json()["data"]["sourceSha256"] == hashlib.sha256(subject).hexdigest()


# --- 4. qualité du détourage (sujet réel, alpha et masque) -------------------------------------
def test_segmentation_quality_measures_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    cases = [("carré", 512, 512), ("paysage", 640, 360), ("portrait", 360, 640)]
    results: list[tuple[str, bool, str]] = []
    with TestClient(app) as client:
        for name, width, height in cases:
            raw = fixtures.encode(fixtures.subject(width, height), "PNG")
            response = segment(client, raw, maxDimension=min(512, width))
            if response.status_code != 200:
                code = response.json().get("error", {}).get("code", "")
                results.append((name, False, "http " + str(response.status_code) + " " + str(code)))
                continue
            outputs = {item["kind"]: item for item in response.json()["data"]["outputs"]}
            problems: list[str] = []
            if set(outputs) != {"cutout", "mask"}:
                problems.append("sorties=" + str(sorted(outputs)))
            mask_item = outputs.get("mask")
            cutout_item = outputs.get("cutout")
            if mask_item:
                mask = decode_png(mask_item["base64"])
                if mask.size != (width, height):
                    problems.append("mask " + str(mask.size))
                if mask.mode != "L":
                    problems.append("mask mode " + mask.mode)
                raw_mask = mask.tobytes()
                if set(raw_mask) != {0, 255}:
                    problems.append("mask valeurs " + str(sorted(set(raw_mask)))[:40])
                opaque = raw_mask.count(255) / float(width * height)
                if not 0.002 < opaque < 0.995:
                    problems.append("couverture " + str(round(opaque, 4)))
                corners = [
                    mask.getpixel((0, 0)),
                    mask.getpixel((width - 1, 0)),
                    mask.getpixel((0, height - 1)),
                    mask.getpixel((width - 1, height - 1)),
                ]
                if any(corners):
                    problems.append("coins non transparents " + str(corners))
                if mask.getpixel((width // 2, height // 2)) != 255:
                    problems.append("centre non opaque")
            if cutout_item:
                cutout = decode_png(cutout_item["base64"])
                if cutout.mode != "RGBA":
                    problems.append("cutout mode " + cutout.mode)
                alpha = set(cutout.getchannel("A").tobytes())
                if 0 not in alpha:
                    problems.append("aucun pixel transparent")
                if 255 not in alpha:
                    problems.append("aucun pixel opaque")
                if cutout.size[0] > width or cutout.size[1] > height:
                    problems.append("cutout plus grand que la source")
            results.append((name, not problems, "; ".join(problems)))
    failures = [item for item in results if not item[1]]
    assert not failures, "détourages en échec: " + json.dumps(failures, ensure_ascii=False)


def test_segmentation_without_subject_fails_explicitly(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    flat = Image.new("RGB", (256, 256), (200, 200, 200))
    buffer = io.BytesIO()
    flat.save(buffer, format="PNG")
    with TestClient(app) as client:
        response = segment(client, buffer.getvalue(), maxDimension=256)
    assert response.status_code == 422
    # Aucune sortie synthétique : un échec explicite, jamais un PNG inventé.
    assert response.json()["error"]["code"] in {"segmentation_empty", "image_too_small"}
    assert "outputs" not in response.json()


# --- 5. honnêteté : GrabCut n est pas une segmentation apprise --------------------------------
def test_capabilities_are_classical_and_models_are_not_active(monkeypatch: pytest.MonkeyPatch) -> None:
    import shutil

    # Répertoire existant et ignoré par git (data/) : ce bac à sable refuse la création de
    # fichiers dans un dossier tout juste créé. Le faux modèle est supprimé en fin de test.
    models_dir = Path(os.getcwd()).parents[1] / "data"
    models_dir.mkdir(parents=True, exist_ok=True)
    fake_model = models_dir / "u2netp.onnx"
    fake_model.write_bytes(b"not-a-real-onnx-model")
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1", PYTHON_TOOLS_MODELS_DIR=str(models_dir))
    with TestClient(app) as client:
        catalog = client.get("/v1/capabilities", headers=AUTH).json()
        for capability in catalog["capabilities"]:
            assert capability["learned"] is False, capability["key"]
            assert capability["modelUsed"] is None, capability["key"]
            assert "onnx" not in capability["engine"].lower(), capability["key"]
        engines = {item["key"]: item["engine"] for item in catalog["capabilities"]}
        assert engines["image.segment@1"] == "opencv-grabcut"
        assert engines["image.analyze@1"] == "pillow+numpy+opencv"
        assert engines["audio.analyze@1"] == "wave+numpy"

        ready = client.get("/readyz")
        assert ready.status_code == 200  # un modèle facultatif n est jamais requis
        models = ready.json()["models"]
        assert len(models) == 1
        entry = models[0]
        assert entry["present"] is True
        assert entry["active"] is False and entry["loaded"] is False
        assert entry["usedBy"] == []
        assert entry["sha256Pinned"] is False
        assert entry["verified"] is False  # présent sans empreinte épinglée reste non vérifié
        assert entry["download"] == "forbidden"
        assert entry["sha256"] == hashlib.sha256(fake_model.read_bytes()).hexdigest()
        assert ready.json()["selfTest"]["ok"] is True
    fake_model.unlink(missing_ok=True)
    shutil.rmtree(models_dir / ".models-probe", ignore_errors=True)


# --- 6. disponibilité et santé -----------------------------------------------------------------
def test_health_and_availability_reporting(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    with TestClient(app) as client:
        health = client.get("/healthz")
        assert health.status_code == 200 and health.json()["status"] == "ok"
        ready = client.get("/readyz")
        body = ready.json()
        assert ready.status_code == 200 and body["status"] == "ready"
        limits = body["limits"]
        assert limits["maxSourceBytes"] == settings().max_source_bytes
        assert limits["maxOutputBytes"] == settings().max_output_bytes
        assert limits["maxBodyBytes"] > limits["maxSourceBytes"]
        assert limits["maxPixels"] == settings().max_pixels
        assert body["workers"]["ready"] is True and body["workers"]["alive"] == 1
        assert client.get("/v1/capabilities").status_code == 401
        catalog = client.get("/v1/capabilities", headers=AUTH).json()
        keys = {item["key"] for item in catalog["capabilities"]}
        assert keys == {"image.analyze@1", "image.segment@1", "audio.analyze@1"}


# --- 7. parité de contrats Pydantic / Zod / ToolBroker -----------------------------------------
def test_contract_parity_pydantic_typescript_broker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PYTHON_TOOLS_MAX_SOURCE_BYTES", raising=False)
    monkeypatch.delenv("PYTHON_TOOLS_MAX_OUTPUT_BYTES", raising=False)
    config = settings()
    adapter = ADAPTER.read_text(encoding="utf-8")
    client_source = CLIENT.read_text(encoding="utf-8")
    registry = REGISTRY.read_text(encoding="utf-8")

    # Bornes alignées entre les trois couches (constantes TypeScript = défauts Python).
    assert "maxSourceBytes = 16 * 1024 * 1024" in adapter
    assert config.max_source_bytes == 16 * 1024 * 1024
    assert "maxOutputBytes = 8 * 1024 * 1024" in adapter
    assert config.max_output_bytes == 8 * 1024 * 1024
    assert "maxDimension < 256 || maxDimension > 4096" in adapter
    assert SegmentRequest.model_fields["maxDimension"].default == 2048
    base = {"requestId": str(uuid.uuid4()), "source": _valid_source()}
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate({**base, "maxDimension": 255})
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate({**base, "maxDimension": 4097})
    assert "outputs.length < 1 || outputs.length > 2" in adapter

    # Corps envoyé par l adaptateur = champs exigés par Pydantic.
    source_keys = set(SourceRef.model_fields)
    assert source_keys == {"assetVersionId", "sha256", "mimeType", "imageBase64"}
    assert set(AudioSourceRef.model_fields) == {"assetVersionId", "sha256", "mimeType", "audioBase64"}
    for key in source_keys:
        assert key + ":" in adapter, key
    assert "audioBase64: base64" in adapter
    assert "Bearer " not in adapter  # le jeton reste dans le client, jamais dans le corps

    # Réponse lue par l adaptateur = champs exposés par Pydantic.
    output_keys = set(ImageOutput.model_fields)
    assert {"kind", "base64", "sha256", "width", "height", "sizeBytes"} <= output_keys
    for key in ("kind", "base64", "sha256", "width", "height", "sizeBytes"):
        assert "output." + key in adapter, key
    assert "data?.analysis" in adapter
    assert set(AnalyzeData.model_fields) == {"analysis"}
    assert set(SegmentData.model_fields) == {"outputs", "analysis", "coverage", "boundingBox", "sourceSha256"}
    assert set(AnalyzeAudioData.model_fields) == {"analysis", "sourceSha256"}

    # Client : enveloppe d erreur et bornes.
    assert "envelope?.code" in client_source and "envelope?.retryable" in client_source
    assert "maxResponseBytes = 48 * 1024 * 1024" in client_source
    assert "Math.min(120_000" in client_source

    # ToolBroker : mêmes paramètres bornés que l adaptateur, aucun contenu brut.
    schemes = {
        "image.analyze@1": {"versionId"},
        "image.segment@1": {"versionId", "outputs", "maxDimension"},
        "audio.analyze@1": {"versionId"},
    }
    for tool, expected in schemes.items():
        line = next(item for item in registry.splitlines() if "'" + tool + "'" in item and "params:" in item)
        params = re.search(r"z\.strictObject\(\{([^}]*)\}\)", line)
        assert params, tool
        keys = set(re.findall(r"\b([A-Za-z][A-Za-z0-9]*)\s*:", params.group(1)))
        assert keys == expected, tool + " -> " + str(sorted(keys))
        assert "imageBase64" not in line and "audioBase64" not in line, tool
    assert "versionId: z.string().min(1).max(128)" in registry
    assert "z.array(z.enum(['cutout', 'mask'])).min(1).max(2)" in registry
    assert "maxDimension: z.int().min(256).max(4096)" in registry
    # L'adaptateur applique le même espace d'identifiants que le contrat : motif Pydantic identique.
    assert "/^[A-Za-z0-9_-]{1,128}$/.test(value.versionId)" in adapter
    assert ASSET_ID_PATTERN == "^[A-Za-z0-9_-]{1,128}$"

    # Borne de champ : la longueur base64 maximale du contrat Python correspond à la limite TS.
    base64_field = SourceRef.model_fields["imageBase64"]
    assert any(getattr(item, "max_length", None) == config.max_base64_chars for item in base64_field.metadata)


def _valid_source() -> dict[str, str]:
    raw = fixtures.png_photo(64, 64)
    return {
        "assetVersionId": "asset-version-parity",
        "sha256": hashlib.sha256(raw).hexdigest(),
        "mimeType": "image/png",
        "imageBase64": base64.b64encode(raw).decode("ascii"),
    }


# --- 8. garde-fous de l adaptateur : droits, propriété, confirmation, persistance --------------
def test_adapter_guards_order_ownership_and_immutable_persistence() -> None:
    """Le contrat de sûreté de l adaptateur est vérifié statiquement, dans l ordre exigé."""
    source = ADAPTER.read_text(encoding="utf-8")
    order = [
        "if (!pythonToolsConfig())",
        "const params = parseParams(job.tool, job.params)",
        "if (!decisionRow) return fail('project_not_found'",
        "if (!decision.confirmed) return fail('assets_required'",
        "if (!confirmed) return fail('asset_not_confirmed'",
        "where: { id: params.versionId, state: 'ready', asset: { userId: job.accountId, contextId: decisionRow.contextId } }",
        "if (version.license === 'unknown') return fail('asset_license_unknown'",
        "if (version.sizeBytes > maxSourceBytes) return fail('asset_too_large'",
        "const digest = createHash('sha256').update(bytes).digest('hex')",
        "if (digest !== version.sha256) return fail('asset_integrity'",
        "const response = await callPythonTool(",
        "if (createHash('sha256').update(data).digest('hex') !== output.sha256) return fail('python_tools_output_checksum_mismatch'",
        "if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return fail('python_tools_output_not_png'",
        "const uploaded = await assets.upload(",
        "license: version.license === 'commercial' ? 'commercial' : 'internal'",
        "provenance: 'python-tools · image.segment@1 · source ' + params.versionId + ' · ' + output.sha256",
    ]
    positions = []
    for marker in order:
        index = source.find(marker)
        assert index >= 0, "garde-fou absent: " + marker
        positions.append(index)
    assert positions == sorted(positions), "ordre des garde-fous incorrect"
    # Aucune écriture avant vérification d empreinte, et aucune sortie non vérifiée persistée.
    uploads = source.count("assets.upload(")
    assert uploads == 1
    assert source.index("assets.upload(") > source.index("python_tools_output_not_png")
    # La licence de la version source est propagée, jamais inventée.
    assert "license: version.license === 'commercial' ? 'commercial' : 'internal'" in source
    # Aucun succès simulé : chaque refus est un code stable renvoyé par fail(...).
    assert source.count("return fail(") >= 12


# --- 9. rejeu du corps exact construit par l adaptateur ---------------------------------------
def test_adapter_body_replay_satisfies_response_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    app = app_with(monkeypatch, PYTHON_TOOLS_MAX_CONCURRENCY="1")
    raw = fixtures.png_photo(320, 240)
    digest = hashlib.sha256(raw).hexdigest()
    request_id = str(uuid.uuid4())
    body = {
        "requestId": request_id,
        "source": {
            "assetVersionId": "asset-version-replay",
            "sha256": digest,
            "mimeType": "image/png",
            "imageBase64": base64.b64encode(raw).decode("ascii"),
        },
    }
    with TestClient(app) as client:
        response = client.post("/v1/tools/image.analyze@1", headers=AUTH, json=body)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["capability"] == "image.analyze@1"
        assert payload["capabilityVersion"] == CAPABILITIES["image.analyze@1"].version
        assert payload["version"] == __version__
        assert payload["requestId"] == request_id
        assert isinstance(payload["durationMs"], (int, float))
        AnalyzeData.model_validate(payload["data"])
        assert payload["source"]["sha256"] == digest

        segment_body = dict(body)
        segment_body["requestId"] = str(uuid.uuid4())
        segment_body["outputs"] = ["cutout", "mask"]
        segment_body["maxDimension"] = 256
        segmented = client.post("/v1/tools/image.segment@1", headers=AUTH, json=segment_body)
        assert segmented.status_code == 200, segmented.text
        SegmentData.model_validate(segmented.json()["data"])
        assert {item["kind"] for item in segmented.json()["data"]["outputs"]} == {"cutout", "mask"}
