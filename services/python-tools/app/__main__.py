"""Point d'entrée du conteneur : un seul worker, concurrence bornée, aucun accès réseau entrant public."""

from __future__ import annotations

import os

import uvicorn

from .config import settings


def main() -> None:
    config = settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8090")),
        workers=1,
        limit_concurrency=max(8, config.max_concurrency * 4),
        timeout_keep_alive=5,
        access_log=False,
        log_level=config.log_level,
        server_header=False,
        date_header=False,
    )


if __name__ == "__main__":
    main()
