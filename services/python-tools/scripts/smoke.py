"""Smoke local python-tools : analyse, détourage et analyse audio réels sur des médias générés, sans réseau ni fournisseur.

Ce n'est pas une certification : il prouve seulement que l'API interne, les contrats et les
algorithmes locaux (vision, WAV/PCM) répondent dans cet interpréteur. L'image Docker et Compose restent NOT_RUN ici.
"""

from __future__ import annotations

import base64
import hashlib
import io
import math
import os
import secrets
import struct
import sys
import uuid
import wave

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Jeton éphémère généré localement : aucun secret constant n'est commité.
os.environ.setdefault("PYTHON_TOOLS_TOKEN", secrets.token_hex(24))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from app.main import app  # noqa: E402

AUTH = {"Authorization": "Bearer " + os.environ["PYTHON_TOOLS_TOKEN"]}
checks: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str) -> None:
    checks.append((name, bool(condition), detail))


def sample_png() -> bytes:
    image = Image.new("RGB", (256, 192), (238, 233, 222))
    draw = ImageDraw.Draw(image)
    draw.ellipse((76, 34, 180, 150), fill=(196, 74, 52))
    draw.rectangle((96, 120, 160, 166), fill=(64, 40, 30))
    image = image.filter(ImageFilter.GaussianBlur(0.6))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def source(raw: bytes, version_id: str = "asset-version-smoke") -> dict[str, str]:
    return {
        "assetVersionId": version_id,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "mimeType": "image/png",
        "imageBase64": base64.b64encode(raw).decode("ascii"),
    }


def sample_wav() -> bytes:
    """WAV stéréo 16 bits 44,1 kHz de 2 s (440 Hz) : signal déterministe généré localement."""
    sample_rate = 44100
    frames = sample_rate * 2
    amplitude = int(32767 * 0.5)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as stream:
        stream.setnchannels(2)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        payload = bytearray()
        for index in range(frames):
            value = int(amplitude * math.sin(2 * math.pi * 440 * index / sample_rate))
            payload += struct.pack("<hh", value, value)
        stream.writeframes(bytes(payload))
    return buffer.getvalue()


def audio_source(raw: bytes, version_id: str = "asset-version-audio-smoke") -> dict[str, str]:
    return {
        "assetVersionId": version_id,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "mimeType": "audio/wav",
        "audioBase64": base64.b64encode(raw).decode("ascii"),
    }


def main() -> int:
    client = TestClient(app)
    raw = sample_png()

    health = client.get("/healthz")
    check("healthz", health.status_code == 200 and health.json().get("status") == "ok", str(health.status_code))

    unauthorized = client.post("/v1/tools/image.analyze@1", json={})
    check("jeton requis", unauthorized.status_code == 401, str(unauthorized.status_code))

    request_id = str(uuid.uuid4())
    analysis_response = client.post(
        "/v1/tools/image.analyze@1",
        headers=AUTH,
        json={"requestId": request_id, "source": source(raw)},
    )
    analysis_body = analysis_response.json()
    analysis = analysis_body.get("data", {}).get("analysis", {})
    check("analyse 200", analysis_response.status_code == 200, str(analysis_response.status_code))
    check("analyse dimensions", analysis.get("width") == 256 and analysis.get("height") == 192, str(analysis.get("width")))
    check("analyse couleurs dominantes", len(analysis.get("dominantColors", [])) >= 2, str(len(analysis.get("dominantColors", []))))
    check("analyse pHash", isinstance(analysis.get("perceptualHash"), str) and len(analysis["perceptualHash"]) == 16, str(analysis.get("perceptualHash")))
    check("analyse netteté", isinstance(analysis.get("sharpness"), (int, float)) and analysis["sharpness"] > 0, str(analysis.get("sharpness")))

    tampered = source(raw)
    tampered["sha256"] = "0" * 64
    rejected = client.post("/v1/tools/image.analyze@1", headers=AUTH, json={"requestId": str(uuid.uuid4()), "source": tampered})
    check("empreinte source refusée", rejected.status_code == 422, str(rejected.status_code))

    segment_response = client.post(
        "/v1/tools/image.segment@1",
        headers=AUTH,
        json={"requestId": str(uuid.uuid4()), "source": source(raw), "outputs": ["cutout", "mask"], "maxDimension": 512},
    )
    segment_body = segment_response.json()
    check("détourage 200", segment_response.status_code == 200, str(segment_response.status_code))
    outputs = {item["kind"]: item for item in segment_body.get("data", {}).get("outputs", [])}
    check("sortie cutout", "cutout" in outputs and "mask" in outputs, str(sorted(outputs)))
    for kind, item in outputs.items():
        data = base64.b64decode(item["base64"])
        check(kind + " sha256", hashlib.sha256(data).hexdigest() == item["sha256"], kind)
        check(kind + " PNG", data.startswith(b"\x89PNG\r\n\x1a\n"), kind)
    if "cutout" in outputs:
        cutout = Image.open(io.BytesIO(base64.b64decode(outputs["cutout"]["base64"])))
        check("cutout alpha", cutout.mode == "RGBA" and cutout.getextrema()[3][0] == 0, cutout.mode)
    if "mask" in outputs:
        mask = Image.open(io.BytesIO(base64.b64decode(outputs["mask"]["base64"])))
        check("mask dimensions", mask.size == (256, 192), str(mask.size))

    wav = sample_wav()
    audio_response = client.post(
        "/v1/tools/audio.analyze@1",
        headers=AUTH,
        json={"requestId": str(uuid.uuid4()), "source": audio_source(wav)},
    )
    audio_body = audio_response.json()
    audio = audio_body.get("data", {}).get("analysis", {})
    check("audio 200", audio_response.status_code == 200, str(audio_response.status_code))
    check("audio capacité", audio_body.get("capability") == "audio.analyze@1", str(audio_body.get("capability")))
    check("audio durée", isinstance(audio.get("duration"), (int, float)) and abs(audio["duration"] - 2.0) < 0.01, str(audio.get("duration")))
    check("audio fréquence", audio.get("sampleRate") == 44100, str(audio.get("sampleRate")))
    check("audio canaux", audio.get("channels") == 2, str(audio.get("channels")))
    tampered_audio = audio_source(wav)
    tampered_audio["sha256"] = "0" * 64
    rejected_audio = client.post(
        "/v1/tools/audio.analyze@1",
        headers=AUTH,
        json={"requestId": str(uuid.uuid4()), "source": tampered_audio},
    )
    rejected_audio_body = rejected_audio.json()
    check("audio empreinte refusée",
          rejected_audio.status_code == 422 and rejected_audio_body.get("error", {}).get("code") == "source_checksum_mismatch",
          str(rejected_audio.status_code) + " " + str(rejected_audio_body.get("error", {}).get("code")))

    failures = [name for name, ok, _ in checks if not ok]
    for name, ok, detail in checks:
        print(("PASS " if ok else "FAIL ") + name + " (" + detail + ")")
    print("SMOKE_RESULT=" + ("PASS" if not failures else "FAIL") + " checks=" + str(len(checks)) + " failures=" + str(len(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
