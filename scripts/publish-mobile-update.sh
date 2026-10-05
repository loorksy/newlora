#!/usr/bin/env bash
# Build, sign, and publish one immutable Newlora Android OTA.
# The private key is used only on the host that stores /opt/newlora/secrets/ota-signing-key.
set -euo pipefail

CHANNEL="${1:-}"
case "$CHANNEL" in
  preview|stable|harness|harness-bad) ;;
  *)
    echo "usage: scripts/publish-mobile-update.sh preview|stable" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "git tree is dirty; commit or stash before publishing" >&2
  exit 2
fi
SHA="$(git rev-parse HEAD)"
LABEL="${OTA_LABEL:-redesign}"
RUNTIME="${OTA_RUNTIME:-newlora-android-runtime-1}"
NOTES="${OTA_NOTES:-Newlora mobile update}"
case "$LABEL" in *[!A-Za-z0-9._-]*|'') echo "label is not safe" >&2; exit 2 ;; esac
case "$RUNTIME" in *[!A-Za-z0-9._-]*|'') echo "runtime is not safe" >&2; exit 2 ;; esac
case "$NOTES" in *$'\n'*|*$'\r'*) echo "notes must be one line" >&2; exit 2 ;; esac

STAMP="$ROOT/apps/mobile/src/ota/buildStamp.ts"
BACKUP="$(mktemp)"
cp "$STAMP" "$BACKUP"
restore() { cp "$BACKUP" "$STAMP"; rm -f "$BACKUP"; }
trap restore EXIT

CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$STAMP" << EOF
/** Factory-bundle label. Publish overwrites a temporary copy while bundling an OTA. */
export const NATIVE_VERSION = '1.2';
export const VERSION_CODE = 3;
export const GIT_SHA = '${SHA}';
export const RELEASE_LABEL = '${LABEL}';
EOF

WORK="$(mktemp -d)"
cleanup() { restore; rm -rf "$WORK"; trap - EXIT; }
trap cleanup EXIT

cd "$ROOT/apps/mobile"
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output "$WORK/index.android.bundle" \
  --assets-dest "$WORK/assets" \
  --minify true \
  --reset-cache
HERMES="$ROOT/node_modules/react-native/sdks/hermesc/linux64-bin/hermesc"
if [ ! -x "$HERMES" ]; then
  echo "hermesc is missing" >&2
  exit 1
fi
"$HERMES" -O -emit-binary -out "$WORK/bundle" "$WORK/index.android.bundle"
if [ -d "$WORK/assets" ] && find "$WORK/assets" -type f | grep -q .; then
  echo "this release contains asset files; the client publishes the JS bundle only" >&2
  exit 1
fi

HASH="$(node "$ROOT/scripts/ota-lib.mjs" sha256 "$WORK/bundle")"
SIZE="$(wc -c < "$WORK/bundle" | tr -d ' ')"
ID="$(date -u +%Y%m%dT%H%M%SZ)-${HASH:0:12}"
URL="https://newlora.lork.cloud/app-updates/android/${CHANNEL}/releases/${ID}/bundle"
cat > "$WORK/manifest.json" << EOF
{
  "id": "${ID}",
  "channel": "${CHANNEL}",
  "platform": "android",
  "version": "1.2",
  "runtimeVersion": "${RUNTIME}",
  "createdAt": "${CREATED}",
  "gitSha": "${SHA}",
  "bundle": {
    "url": "${URL}",
    "sha256": "${HASH}",
    "size": ${SIZE},
    "contentType": "application/octet-stream"
  },
  "assets": [],
  "notes": "${NOTES}",
  "signature": ""
}
EOF
node "$ROOT/scripts/ota-lib.mjs" canonical "$WORK/manifest.json" > "$WORK/message.txt"

publish_local() {
  local root="/opt/newlora/updates"
  local dest="${root}/android/${CHANNEL}/releases/${ID}"
  if [ -e "$dest" ]; then
    echo "release already exists" >&2
    exit 1
  fi
  openssl pkeyutl -sign -inkey /opt/newlora/secrets/ota-signing-key -rawin -in "$WORK/message.txt" -out "$WORK/sig.bin"
  python3 - "$WORK" "$dest" "$root" "$CHANNEL" << 'PY'
import base64, json, os, sys
from pathlib import Path
work, dest, root, channel = sys.argv[1:]
manifest = json.loads(Path(work, "manifest.json").read_text())
manifest["signature"] = base64.b64encode(Path(work, "sig.bin").read_bytes()).decode()
text = json.dumps(manifest, separators=(",", ":"))
target = Path(dest)
target.mkdir(parents=True, exist_ok=False)
os.chmod(target, 0o755)
bundle = target / "bundle"
bundle.write_bytes(Path(work, "bundle").read_bytes())
(target / "manifest.json").write_text(text)
os.chmod(bundle, 0o644)
os.chmod(target / "manifest.json", 0o644)
channel_dir = Path(root) / "android" / channel
channel_dir.mkdir(parents=True, exist_ok=True)
os.chmod(channel_dir, 0o755)
tmp = channel_dir / "manifest.next"
tmp.write_text(text)
os.chmod(tmp, 0o644)
os.replace(tmp, channel_dir / "manifest")
PY
}

publish_remote() {
  : "${VPS:?Set VPS to the update host}"
  : "${VPSPASS:?Set VPSPASS for the update host}"
  local askpass="${SSH_ASKPASS:-/tmp/newlora-askpass}"
  if [ ! -x "$askpass" ]; then
    cat > "$askpass" << 'EOF'
#!/bin/sh
python3 -c 'import os; print(os.environ["VPSPASS"], end="")'
EOF
    chmod 700 "$askpass"
  fi
  export SSH_ASKPASS="$askpass"
  export SSH_ASKPASS_REQUIRE=force
  export DISPLAY="${DISPLAY:-none}"
  local ssh=(setsid ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1)
  local scp=(setsid scp -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1)
  local remote="/opt/newlora/updates-staging/${ID}"
  "${ssh[@]}" "root@${VPS}" "rm -rf '${remote}' && install -d -m 700 '${remote}'"
  "${scp[@]}" "$WORK/bundle" "$WORK/message.txt" "$WORK/manifest.json" "root@${VPS}:${remote}/"
  "${ssh[@]}" "root@${VPS}" "openssl pkeyutl -sign -inkey /opt/newlora/secrets/ota-signing-key -rawin -in '${remote}/message.txt' -out '${remote}/sig.bin' && rm -f '${remote}/message.txt'"
  "${scp[@]}" "$ROOT/scripts/ota-install-remote.py" "root@${VPS}:${remote}/install.py"
  "${ssh[@]}" "root@${VPS}" "python3 '${remote}/install.py' '${CHANNEL}' '${ID}'"
}

if [ -f /opt/newlora/secrets/ota-signing-key ]; then
  publish_local
else
  publish_remote
fi

echo "published ${CHANNEL} ${ID} sha256=${HASH} git=${SHA} runtime=${RUNTIME}"
