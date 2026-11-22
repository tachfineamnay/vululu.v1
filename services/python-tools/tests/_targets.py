"""Cibles de test du pool : elles imitent une tâche native qui ignore toute annulation asyncio."""

from __future__ import annotations

import os
import socket
import time
from typing import Any

from app import ipc


def flaky(port: int, nonce: str) -> None:
    """Enfant de test : "hang" imite OpenCV qui bloque, "sleep" une tâche lente, sinon écho immédiat."""
    try:
        conn = socket.create_connection(("127.0.0.1", port), timeout=30.0)
    except OSError:
        return
    try:
        conn.settimeout(None)
        ipc.write_frame(conn, {"nonce": nonce, "event": "ready"})
        while True:
            try:
                job = ipc.read_frame(conn)
            except (ipc.FrameError, OSError):
                return
            if job is None:
                return
            if job.get("hang"):
                while True:  # aucune annulation coopérative : seul un kill du processus l'arrete
                    time.sleep(0.05)
            if job.get("sleep"):
                time.sleep(float(job["sleep"]))
            ipc.write_frame(conn, {"ok": True, "result": {"echo": job.get("value"), "pid": os.getpid()}})
    finally:
        try:
            conn.close()
        except OSError:
            pass
