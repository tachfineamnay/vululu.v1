"""Pool de processus borné : annulation réelle des tâches natives, aucune saturation de threads.

Pourquoi des processus : un appel natif (OpenCV, NumPy, Pillow) qui dépasse le délai ne peut pas
être interrompu dans un thread — le tuer est la seule annulation réellement applicable. Le pool est
borné de bout en bout :

- au plus "size" processus enfants, donc au plus "size" tâches natives simultanées ;
- une file d'attente bornée refuse le surplus (503 "overloaded") au lieu d'empiler des requêtes ;
- aucun thread du serveur n'est bloqué : lecture asynchrone non bloquante sur socket loopback ;
- un enfant tué (délai dépassé, panne) est remplacé avant de rendre la main.

Transport : socket TCP sur 127.0.0.1 avec port éphémère et nonce à usage unique (voir ipc.py).
"""

from __future__ import annotations

import asyncio
import hmac
import multiprocessing as mp
import secrets
import socket
from dataclasses import dataclass
from typing import Any, Callable

from . import ipc
from .config import settings
from .errors import ToolError
from .worker import child_main

_KILL_JOIN_SECONDS = 5.0


@dataclass
class _Slot:
    process: Any
    sock: socket.socket | None
    ready: bool = False


class _SlotLost(Exception):
    """Le processus courant n'est plus utilisable : il doit être remplacé."""

    def __init__(self, code: str, message: str, status: int, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


class ProcessPool:
    def __init__(
        self,
        size: int | None = None,
        timeout_seconds: float | None = None,
        start_seconds: float | None = None,
        target: Callable[[int, str], None] | None = None,
        context: Any | None = None,
        max_inflight: int | None = None,
    ) -> None:
        config = settings()
        self._size = size if size is not None else config.max_concurrency
        self._timeout = timeout_seconds if timeout_seconds is not None else config.timeout_seconds
        self._start_seconds = start_seconds if start_seconds is not None else config.worker_start_seconds
        self._target = target or child_main
        self._context = context or mp.get_context("spawn")
        self._max_inflight = max_inflight if max_inflight is not None else max(2, self._size * 4)
        self._slots: list[_Slot] = []
        self._idle: asyncio.Queue[_Slot] | None = None
        self._capacity: asyncio.Semaphore | None = None
        self._inflight = 0
        self._running = False

    # -- cycle de vie -------------------------------------------------------------------
    async def start(self) -> None:
        if self._running:
            return
        self._idle = asyncio.Queue()
        self._capacity = asyncio.Semaphore(self._size)
        self._slots = []
        self._running = True
        try:
            for _ in range(self._size):
                slot = await self._spawn()
                self._slots.append(slot)
                self._idle.put_nowait(slot)
        except BaseException:
            self._running = False
            await self.stop()
            raise

    async def stop(self) -> None:
        self._running = False
        for slot in list(self._slots):
            self._kill(slot)
        self._slots = []
        self._idle = None
        self._capacity = None
        self._inflight = 0

    def ready(self) -> bool:
        if not self._running or self._idle is None:
            return False
        return len(self._slots) == self._size and all(
            slot.ready and slot.process.is_alive() for slot in self._slots
        )

    def stats(self) -> dict[str, object]:
        return {
            "size": self._size,
            "alive": sum(1 for slot in self._slots if slot.process.is_alive()),
            "idle": self._idle.qsize() if self._idle is not None else 0,
            "inFlight": self._inflight,
            "maxInFlight": self._max_inflight,
            "timeoutSeconds": self._timeout,
            "running": self._running,
            "ready": self.ready(),
        }

    # -- exécution ----------------------------------------------------------------------
    async def run(self, job: dict[str, Any], timeout_seconds: float | None = None) -> dict[str, Any]:
        if not self._running or self._idle is None or self._capacity is None:
            raise ToolError("worker_unavailable", "Service de traitement indisponible.", 503, True)
        if self._inflight >= self._max_inflight:
            raise ToolError("overloaded", "Trop de requêtes simultanées : réessayez dans un instant.", 503, True)
        self._inflight += 1
        try:
            await self._capacity.acquire()
            try:
                slot = await self._idle.get()
                try:
                    result = await self._exchange(slot, job, timeout_seconds if timeout_seconds is not None else self._timeout)
                except _SlotLost as lost:
                    await self._replace(slot)
                    raise ToolError(lost.code, lost.message, lost.status, lost.retryable) from None
                except BaseException:
                    if slot.ready and slot.process.is_alive():
                        self._idle.put_nowait(slot)
                    else:
                        await self._replace(slot)
                    raise
                else:
                    self._idle.put_nowait(slot)
                    return result
            finally:
                self._capacity.release()
        finally:
            self._inflight -= 1

    async def _exchange(self, slot: _Slot, job: dict[str, Any], timeout: float) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        if not slot.ready or slot.sock is None or not slot.process.is_alive():
            raise _SlotLost("worker_crashed", "Le processus de traitement a échoué.", 503, True)
        deadline = loop.time() + max(0.1, timeout)
        try:
            await ipc.async_write(loop, slot.sock, job, max(0.1, timeout))
            message = await ipc.async_read(loop, slot.sock, deadline)
        except asyncio.TimeoutError as error:
            # Annulation réelle : le processus est tué, la tâche native ne survit pas au délai.
            raise _SlotLost(
                "processing_timeout",
                "Traitement trop long : relancez avec une image plus petite.",
                504,
                True,
            ) from error
        except (ConnectionError, ipc.FrameError) as error:
            raise _SlotLost("worker_crashed", "Le processus de traitement a échoué.", 503, True) from error
        except OSError as error:
            raise _SlotLost("worker_crashed", "Le processus de traitement a échoué.", 503, True) from error
        if message.get("ok") is True and isinstance(message.get("result"), dict):
            return message["result"]
        error = message.get("error") if isinstance(message.get("error"), dict) else {}
        code = str(error.get("code") or "internal_error")
        status = error.get("status")
        raise ToolError(
            code,
            str(error.get("message") or "Échec du traitement."),
            int(status) if isinstance(status, int) and 400 <= status <= 599 else 500,
            bool(error.get("retryable")),
        )

    # -- processus ----------------------------------------------------------------------
    async def _spawn(self) -> _Slot:
        loop = asyncio.get_running_loop()
        nonce = secrets.token_hex(32)
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.setblocking(False)
        port = int(listener.getsockname()[1])
        process = self._context.Process(
            target=self._target, args=(port, nonce), name="python-tool-worker", daemon=True
        )
        process.start()
        slot = _Slot(process=process, sock=None, ready=False)
        try:
            conn, _ = await asyncio.wait_for(loop.sock_accept(listener), max(1.0, self._start_seconds))
        except (asyncio.TimeoutError, OSError):
            listener.close()
            self._kill(slot)
            raise ToolError("worker_start_failed", "Le processus de traitement n'a pas démarré.", 503, True) from None
        finally:
            listener.close()
        conn.setblocking(False)
        slot.sock = conn
        deadline = loop.time() + max(1.0, self._start_seconds)
        try:
            hello = await ipc.async_read(loop, conn, deadline)
        except (asyncio.TimeoutError, ConnectionError, ipc.FrameError, OSError):
            self._kill(slot)
            raise ToolError("worker_start_failed", "Le processus de traitement n'a pas démarré.", 503, True) from None
        if hello.get("event") != "ready" or not hmac.compare_digest(str(hello.get("nonce") or ""), nonce):
            self._kill(slot)
            raise ToolError("worker_start_failed", "Le processus de traitement n'a pas démarré.", 503, True)
        slot.ready = True
        return slot

    async def _replace(self, slot: _Slot) -> _Slot:
        self._kill(slot)
        try:
            self._slots.remove(slot)
        except ValueError:
            pass
        replacement = await self._spawn()
        self._slots.append(replacement)
        assert self._idle is not None
        self._idle.put_nowait(replacement)
        return replacement

    def _kill(self, slot: _Slot) -> None:
        try:
            if slot.process.is_alive():
                slot.process.terminate()
                slot.process.join(_KILL_JOIN_SECONDS)
            if slot.process.is_alive():
                slot.process.kill()
                slot.process.join(_KILL_JOIN_SECONDS)
        except (ValueError, OSError):
            pass
        finally:
            slot.ready = False
            if slot.sock is not None:
                try:
                    slot.sock.close()
                except OSError:
                    pass
                slot.sock = None
