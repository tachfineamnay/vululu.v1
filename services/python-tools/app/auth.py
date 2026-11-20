"""Authentification interne worker→python-tools : jeton partagé, comparaison à temps constant."""

from __future__ import annotations

import hmac

from fastapi import Header

from .config import settings
from .errors import Unauthorized


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise Unauthorized()
    provided = authorization[len("Bearer ") :]
    if not hmac.compare_digest(provided, settings().token):
        raise Unauthorized()
