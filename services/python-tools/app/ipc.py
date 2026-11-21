"""Cadre de messages JSON sur socket loopback (longueur 4 octets + JSON UTF-8).

Pourquoi pas multiprocessing.Pipe : sous Windows il repose sur des named pipes, et le partage de
descripteurs entre processus passe par un serveur de ressources qui en crée aussi. Le pool écoute
donc sur 127.0.0.1 avec un port éphémère, et chaque enfant s'authentifie avec un nonce à usage
unique avant le premier message. Aucun port n'est exposé hors de la boucle locale du conteneur.
"""

from __future__ import annotations

import asyncio
import json
import socket
import struct
from typing import Any

MAX_FRAME_BYTES = 64 * 1024 * 1024
_HEADER = struct.Struct(">I")
_CHUNK = 1024 * 1024


class FrameError(RuntimeError):
    """Trame illisible, trop grande ou incomplète."""


def encode(message: dict[str, Any]) -> bytes:
    body = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_FRAME_BYTES:
        raise FrameError("frame_too_large")
    return _HEADER.pack(len(body)) + body


def write_frame(sock: socket.socket, message: dict[str, Any]) -> None:
    sock.sendall(encode(message))


def read_exact(sock: socket.socket, size: int) -> bytes | None:
    chunks: list[bytes] = []
    remaining = size
    while remaining > 0:
        chunk = sock.recv(min(remaining, _CHUNK))
        if not chunk:
            return None
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_frame(sock: socket.socket) -> dict[str, Any] | None:
    """Lecture bloquante côté enfant : un blocage est interrompu par le kill du parent."""
    header = read_exact(sock, _HEADER.size)
    if header is None:
        return None
    (size,) = _HEADER.unpack(header)
    if size <= 0 or size > MAX_FRAME_BYTES:
        raise FrameError("frame_size_invalid")
    body = read_exact(sock, size)
    if body is None:
        return None
    return decode(body)


def decode(body: bytes) -> dict[str, Any]:
    try:
        message = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FrameError("frame_json_invalid") from error
    if not isinstance(message, dict):
        raise FrameError("frame_shape_invalid")
    return message


async def async_write(
    loop: asyncio.AbstractEventLoop, sock: socket.socket, message: dict[str, Any], timeout: float
) -> None:
    await asyncio.wait_for(loop.sock_sendall(sock, encode(message)), timeout)


async def async_read_exact(
    loop: asyncio.AbstractEventLoop, sock: socket.socket, size: int, deadline: float
) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining > 0:
        budget = deadline - loop.time()
        if budget <= 0:
            raise asyncio.TimeoutError
        chunk = await asyncio.wait_for(loop.sock_recv(sock, min(remaining, _CHUNK)), budget)
        if not chunk:
            raise ConnectionError("worker_closed")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


async def async_read(
    loop: asyncio.AbstractEventLoop, sock: socket.socket, deadline: float
) -> dict[str, Any]:
    header = await async_read_exact(loop, sock, _HEADER.size, deadline)
    (size,) = _HEADER.unpack(header)
    if size <= 0 or size > MAX_FRAME_BYTES:
        raise FrameError("frame_size_invalid")
    return decode(await async_read_exact(loop, sock, size, deadline))
