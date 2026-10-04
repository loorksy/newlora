# Security boundaries

Single-owner authentication uses an Argon2 password hash supplied by deployment. Short-lived JWTs have audience/issuer/expiry and a database-backed device-session ID. Refresh tokens are hashed, rotate on use, and can be revoked. Every resource lookup enforces owner identity. Keys are encrypted with Fernet under a VPS master key, returned only as configured/last-four/status metadata. API validation errors omit input values.

The deployment terminates TLS at Caddy. Android requires HTTPS. Redis rate limits fail closed. Request validation and body limits bound public input. Public WebSocket uses a first-frame token with a timeout and periodic reconnection; no token appears in the URL. The production entrypoints disable raw access logs, and structured runtime logs contain identifiers/timings only.

Browser and egress proxy are isolated from the database network and host filesystem. Every proxy target is resolved, every returned address must be public, and the TCP socket connects to a validated IP. Redirects produce new proxy requests and are checked again. Schemes, credentials in URLs and nonstandard ports are rejected. Browser downloads, service workers and local-file navigation are disabled. The agent has no host shell, source editor or arbitrary filesystem tool.

Provider SDK adapters discard hidden reasoning fields. Public text streaming filters split reasoning tags. Activity events use a fixed typed allowlist and correspond to actual operations. Neither usage records nor logs contain prompt/response bodies. Retrieved web pages are untrusted context and cannot add tool capabilities.

Artifacts use UUID filenames and authenticated ownership checks. Chart files are persisted with restrictive permissions. Browser contexts are closed in `finally` blocks. Database leases and fencing protect against stale worker writes; they do not guarantee exactly-once external provider billing or push delivery.

Before internet exposure: verify reverse-proxy trusted IP behavior and rate-limit grouping for your network, protect `.env`/backups, configure Firebase credentials, test backup restoration and complete live/device acceptance. This implementation has not undergone an independent security audit.
