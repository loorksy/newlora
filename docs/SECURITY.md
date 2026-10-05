# Security boundaries

Single-owner authentication uses an Argon2 password hash supplied by deployment. Short-lived JWTs have audience/issuer/expiry and a database-backed device-session ID. Refresh tokens are hashed, rotate on use, and can be revoked. Every resource lookup enforces owner identity. Keys are encrypted with Fernet under a VPS master key, returned only as configured/last-four/status metadata. API validation errors omit input values.

The deployment terminates TLS at Caddy. Android requires HTTPS. Redis rate limits fail closed. Request validation and body limits bound public input. Public WebSocket uses a first-frame token with a timeout and periodic reconnection; no token appears in the URL. The production entrypoints disable raw access logs, and structured runtime logs contain identifiers/timings only.

Browser and egress proxy are isolated from the database network and host filesystem. Every proxy target is resolved, every returned address must be public, and the TCP socket connects to a validated IP. Redirects produce new proxy requests and are checked again. Schemes, credentials in URLs and nonstandard ports are rejected. Browser downloads, service workers and local-file navigation are disabled. The agent has no host shell, source editor or arbitrary filesystem tool.

Provider SDK adapters discard hidden reasoning fields. Public text streaming filters split reasoning tags. Activity events use a fixed typed allowlist and correspond to actual operations. Neither usage records nor logs contain prompt/response bodies. Retrieved web pages are untrusted context and cannot add tool capabilities.

Artifacts use UUID filenames and authenticated ownership checks. Chart files are persisted with restrictive permissions. Browser contexts are closed in `finally` blocks. Database leases and fencing protect against stale worker writes; they do not guarantee exactly-once external provider billing or push delivery.

Before internet exposure: verify reverse-proxy trusted IP behavior and rate-limit grouping for your network, protect `.env`/backups, configure Firebase credentials, test backup restoration and complete live/device acceptance. This implementation has not undergone an independent security audit.

## User uploads and hardening

Only PNG/JPEG/WebP, PDF, UTF-8 plain text and CSV are accepted, up to 8 MB each and four per message. ASGI counts actual body bytes, including chunked requests, with an 8.1 MB multipart request ceiling; other API bodies remain capped at 2 MB. Storage and display names are generated UUIDs; original names never become paths or model instructions. MIME is checked against decoded image format/PDF signature/text validity. Executable MIME types, binary text and shebang scripts are rejected. Images are decoded/re-encoded to PNG without original EXIF metadata and capped at 16 million pixels.

The parser is a fixed Python module subprocess with 384 MiB address-space, six-second CPU and ten-second wall-time limits. PDFs are not executed; encrypted PDFs fail safely, and extraction is bounded to twenty pages/24,000 characters. The subprocess is resource-limited, not a separate OS security sandbox; a dedicated parser container is a future defense-in-depth improvement. Keep parser dependencies patched. No OCR is claimed for scanned PDFs: supply images for multimodal inspection.

Files live on the persistent artifact volume with mode 0600. Extracted text and runtime checkpoints are encrypted with the application key. Checkpoints store image references, not Base64 payloads, and hydration rejects another owner's or another conversation's attachment or chart before a provider call. Authenticated downloads enforce owner scope and use no-store/nosniff. Message linking checks conversation ownership and rejects already-sent or foreign attachments. Conversation deletion removes metadata and files. User content is always untrusted reference data; no shell, arbitrary file accessor or execution tool is added.

Retrieval projections include only explicit public fields and redact recognizable secrets. Canonical fact writes reject recognized credential patterns, and consolidation requires verbatim user evidence for a narrow preference key set. Do not submit arbitrary secrets in chat; no lexical redaction algorithm can identify every possible secret. Credentials entered in Settings never enter model context, retrieval, logs or Android responses.
