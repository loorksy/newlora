# VPS deployment

Use a Linux VPS with Docker Compose v2, DNS pointing to the VPS, inbound TCP 80/443, and enough RAM for Chromium plus the selected worker concurrency (start with 4 CPU / 8 GB RAM, measure before scaling). No host Docker socket is mounted into any service.

1. Clone Newlora, `uv sync --frozen`, and run `uv run python scripts/bootstrap.py` interactively. It refuses to overwrite existing secrets. Back up the encryption key separately.
2. Set `DOMAIN`, `PUBLIC_URL`, and a random SearXNG secret in `infra/docker/searxng.yml`. Database password must match the URL. Do not expose PostgreSQL, Redis, browser or egress ports.
3. `docker compose up -d postgres redis`.
4. `docker compose build api`, then `docker compose build browser` (the browser build consumes the local API chart build stage).
5. `docker compose run --rm migrate`.
6. `docker compose up -d`.
7. Check `/health/live` and `/health/ready`. Readiness includes database, Redis, worker, scheduler, notifier, voice worker and browser.
8. Install the APK, authenticate, configure providers/OANDA, and run the acceptance flow in `VALIDATION.md`.

API/worker/scheduler/notifier/voice use one application image. PostgreSQL records tasks, runs, messages and side effects. Redis is disposable coordination/cache infrastructure. Named volumes persist PostgreSQL, Redis AOF, chart PNGs and Caddy certificates. Every Compose service uses `restart: unless-stopped`. With Docker enabled at boot, a VPS reboot brings the same Newlora containers back. Use `docker compose -p newlora down` without `-v` during Newlora maintenance. Do not run that command from another project directory, and do not use global prune commands.

## Credentials added later

OANDA Practice, OpenAI, Anthropic, and Z.AI are encrypted in PostgreSQL after login. They are not read from another project and they are not environment variables. `PUT /settings/credentials/{name}` accepts `openai`, `anthropic`, `zai`, and `oanda`, with body `{"key":"..."}`. OANDA also requires `account` and should send `"environment":"practice"`. `POST /settings/credentials/{name}/test` checks a stored credential. `GET /settings` returns only `configured`, `lastFour`, and `connectionStatus`.

Firebase stays unset until a Newlora service-account file is mounted read-only at `/run/secrets/firebase-admin.json` in the notifier and `FCM_CREDENTIALS` points at that path. Do not invent a hostname. Leave the API on `127.0.0.1:18080` until `DOMAIN` and `PUBLIC_URL` are real, then start the Caddy service.

## Host firewall exception for Newlora bridges

Some hosts keep a stale `iptables-legacy` table whose `FORWARD` policy is `DROP` and whose Docker chains mention only `docker0`. Docker 29 writes the live bridge rules to nftables. Both tables apply, so Newlora containers can resolve each other and still be unable to connect. The fix is a Newlora-only allowance. It does not change the global policy and does not name another project's bridges.

`infra/deploy/newlora-firewall.sh` reads networks named `newlora_*`, inserts `DOCKER-FORWARD -i <bridge> -j ACCEPT` for each, and for the non-internal outbound network also inserts an established-return `DOCKER-CT` rule and a `POSTROUTING` masquerade for that subnet. Install it as `/opt/newlora/bin/newlora-firewall.sh` and enable `newlora-firewall.service` (`Type=oneshot`, `After=docker.service`). Kernel rules do not survive a reboot by themselves. On a host whose init is systemd, the unit reapplies them after Docker starts. This environment's PID 1 is not systemd, so the unit file and enable symlink are installed but the unit was not started by init. The script was run directly and is idempotent. A live reboot was not performed.

On the current host the networks are `newlora_backend` `br-e1d8a36782c7` `172.18.0.0/16`, `newlora_browser` `br-f2074909a97f` `172.20.0.0/16`, and `newlora_outbound` `br-ffa08efde3bb` `172.19.0.0/16`. The exact rules are:

```
iptables-legacy -I DOCKER-FORWARD -i br-e1d8a36782c7 -j ACCEPT
iptables-legacy -I DOCKER-FORWARD -i br-f2074909a97f -j ACCEPT
iptables-legacy -I DOCKER-FORWARD -i br-ffa08efde3bb -j ACCEPT
iptables-legacy -I DOCKER-CT -o br-ffa08efde3bb -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables-legacy -t nat -A POSTROUTING -s 172.19.0.0/16 ! -o br-ffa08efde3bb -j MASQUERADE
```

Rollback, while those networks still exist:

```
sudo /opt/newlora/bin/newlora-firewall.sh rollback
sudo systemctl disable --now newlora-firewall.service
```

Bridge names change if the Newlora networks are recreated. Use the script rather than deleting a hardcoded rule after that.

## FCM

Mount a Firebase service-account JSON read-only at `/run/secrets/firebase-admin.json` in notifier and set `FCM_CREDENTIALS` to that path. Register the matching Android application and configure `google-services.json` before building. No fabricated Firebase project/configuration is shipped. The dedicated notifier delivers independently of agent latency. The notification outbox retries after a lease timeout and marks exhausted attempts failed; Android deduplicates notification IDs. External push delivery is at-least-once, not exactly-once.

## Backups and upgrades

Take daily encrypted `pg_dump` backups and persistent artifact-volume backups. Retain at least seven daily and four weekly recovery points. Store the master key separately: encrypted credentials cannot be recovered without it. Test restoring into an isolated VPS monthly. Capture a database backup before migrations; apply migrations before starting a newer worker. Never restore production data into CI.

Pin container tags to audited digests in your deployment manifest after acceptance. The search service's upstream `latest` tag should be replaced with the tested digest for your rollout. Rotate owner credentials, JWT secret and device sessions as needed. Rotating the encryption key requires re-encryption, not replacing the variable in place.

## Browser isolation

Browser is on its own internal network, has no DB network, no host mounts and no secrets except an internal API token. Public pages use an egress proxy that resolves every target and connects to the validated IP. DNS rebinding cannot replace that IP between validation and connection. Trusted chart renders reject all remote resources. Chromium runs as a non-root user with sandbox enabled; The included Playwright-derived seccomp profile allows user namespaces and namespace-local chroot while every container capability remains dropped. The host kernel must support unprivileged user namespaces. If sandbox startup fails, fix the host configuration rather than granting privileged mode.

In managed proxy environments, use Docker BuildKit `--secret id=proxy_ca,src=/path/to/combined-ca.pem` for build trust, and mount runtime CA trust where needed. Production builds without a proxy use normal CA roots. Never disable TLS verification.

Apply schema `0002` before starting the new API/workers. It preserves original messages and existing resources. Drain workers first, back up PostgreSQL and artifacts, run `docker compose run --rm migrate`, then restart services. Runtime checkpoints use the same master encryption key as credentials; loss/rotation without re-encryption prevents run recovery. Retrieval backfill is automatic and bounded; allow the scheduler to finish it before evaluating historical search completeness. Include uploads under the artifacts volume in backups.
