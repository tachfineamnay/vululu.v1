"""Authentification interne worker→python-tools : jeton partagé, comparaison à temps constant."""

from __future__ import annotations

import hmac

from fastapi import Header

from .config import settings
from .errors import Unauthorized

_MAX_AUTHORIZATION_LENGTH = 512


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or len(authorization) > _MAX_AUTHORIZATION_LENGTH:
        raise Unauthorized()
    scheme, separator, provided = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not provided:
        raise Unauthorized()
    token = settings().token
    # compare_digest n'accepte que des octets : un jeton non ASCII reste un refus structuré (401),
    # jamais une exception interne, et la comparaison demeure à temps constant.
    try:
        candidate = provided.encode("utf-8")
    except UnicodeEncodeError:
        raise Unauthorized() from None
    if not hmac.compare_digest(candidate, token.encode("utf-8")):
        raise Unauthorized()
