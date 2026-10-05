# syntax=docker/dockerfile:1
FROM newlora-api:local
USER root
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    PLAYWRIGHT_BROWSERS_PATH=/opt/newlora-browsers playwright install --with-deps chromium && \
    chmod -R a+rX /opt/newlora-browsers
COPY --chown=10001:10001 services/browser /app/services/browser
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/newlora-browsers
USER newlora
EXPOSE 8090
CMD ["uvicorn", "services.browser.app:app", "--host", "0.0.0.0", "--port", "8090", "--no-access-log"]
