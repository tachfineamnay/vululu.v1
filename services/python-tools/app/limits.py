"""Limite de corps de requête appliquée AVANT tout tamponnage non borné.

Un client peut omettre `Content-Length` (transfert chunked) : la limite porte donc sur les octets
réellement reçus. Le corps n'est jamais lu au-delà de la borne, puis il est rejoué à l'application.
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

Message = dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
Scope = dict[str, Any]

_ERROR_BODY = {
    "error": {
        "code": "payload_too_large",
        "message": "Corps de requête au-delà de la limite interne.",
        "retryable": False,
    }
}
_BOUNDED_METHODS = frozenset({"POST", "PUT", "PATCH"})


class BodyLimitMiddleware:
    """Middleware ASGI pur : borne le corps entrant même sans `Content-Length`."""

    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]], max_body_bytes: int) -> None:
        self._app = app
        self._max_body_bytes = max(1, int(max_body_bytes))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http" or scope.get("method") not in _BOUNDED_METHODS:
            await self._app(scope, receive, send)
            return
        declared = _declared_length(scope)
        if declared is not None and declared > self._max_body_bytes:
            await self._reject(send)
            return
        chunks: list[bytes] = []
        received = 0
        while True:
            message = await receive()
            if message.get("type") == "http.disconnect":
                return
            body = message.get("body", b"") or b""
            received += len(body)
            if received > self._max_body_bytes:
                await self._reject(send)
                return
            if body:
                chunks.append(body)
            if not message.get("more_body", False):
                break
        payload = b"".join(chunks)
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if delivered:
                return {"type": "http.disconnect"}
            delivered = True
            return {"type": "http.request", "body": payload, "more_body": False}

        await self._app(scope, replay, send)

    async def _reject(self, send: Send) -> None:
        body = json.dumps(_ERROR_BODY).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body, "more_body": False})


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers") or []:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None
