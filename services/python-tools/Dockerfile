# Vululu python-tools — image de production interne, non-root, sans réseau sortant applicatif.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    HOME=/tmp \
    PYTHONPATH=/app \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    PATH="/app/.venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.10.6 /uv /usr/local/bin/uv

# libglib2.0-0 est requis par les wheels OpenCV headless sur Debian slim.
RUN apt-get update \
 && apt-get install --no-install-recommends --yes libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 tools \
 && useradd --system --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin tools

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
RUN chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8090

# Disponibilité réelle : pool de processus vivant + chaîne native auto-testée (jamais /healthz seul).
HEALTHCHECK --interval=10s --timeout=4s --retries=6 --start-period=30s \
  CMD python -c "import json,urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:8090/readyz',timeout=3); sys.exit(0 if json.load(r).get('status')=='ready' else 1)"

CMD ["python", "-m", "app"]
