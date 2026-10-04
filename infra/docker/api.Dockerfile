# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS chart
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
COPY apps/mobile/package.json apps/mobile/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --workspace @newlora/chart --workspace @newlora/contracts --include-workspace-root
RUN npm run chart:build
FROM python:3.12-slim-bookworm
WORKDIR /app
COPY pyproject.toml uv.lock requirements.lock ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.lock
COPY services/api services/api
COPY services/browser/proxy.py services/browser/proxy.py
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir --no-deps .
COPY packages/shared packages/shared
COPY --from=chart /app/packages/chart/dist packages/chart/dist
COPY alembic.ini ./
RUN useradd -u 10001 -m newlora && mkdir -p /data/artifacts && chown -R newlora /data && chmod -R a+rX /app
USER newlora
EXPOSE 8000
CMD ["uvicorn", "newlora.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
