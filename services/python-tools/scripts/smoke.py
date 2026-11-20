"""Smoke local python-tools : analyse et détourage réels sur une image générée, sans réseau ni fournisseur.

Ce n'est pas une certification : il prouve seulement que l'API interne, les contrats et les
algorithmes locaux répondent dans cet interpréteur. L'image Docker et Compose restent NOT_RUN ici.
"""

from __future__ import annotations

import base64
import hashlib
import io
import os
import secrets
import sys
import uuid

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

    failures = [name for name, ok, _ in checks if not ok]
    for name, ok, detail in checks:
        print(("PASS " if ok else "FAIL ") + name + " (" + detail + ")")
    print("SMOKE_RESULT=" + ("PASS" if not failures else "FAIL") + " checks=" + str(len(checks)) + " failures=" + str(len(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
