#!/usr/bin/env python3
"""Install one staged OTA into the public directory. Does not read or print the signing key."""
import base64
import json
import os
import sys
from pathlib import Path

channel, release_id = sys.argv[1], sys.argv[2]
remote = Path("/opt/newlora/updates-staging") / release_id
root = Path("/opt/newlora/updates")
manifest = json.loads((remote / "manifest.json").read_text())
if manifest["id"] != release_id or manifest["channel"] != channel:
    raise SystemExit("staged manifest does not match")
manifest["signature"] = base64.b64encode((remote / "sig.bin").read_bytes()).decode()
text = json.dumps(manifest, separators=(",", ":"))
dest = root / "android" / channel / "releases" / release_id
if dest.exists():
    raise SystemExit("release already exists")
dest.mkdir(parents=True, exist_ok=False)
os.chmod(dest, 0o755)
(dest / "bundle").write_bytes((remote / "bundle").read_bytes())
(dest / "manifest.json").write_text(text)
os.chmod(dest / "bundle", 0o644)
os.chmod(dest / "manifest.json", 0o644)
channel_dir = root / "android" / channel
channel_dir.mkdir(parents=True, exist_ok=True)
os.chmod(root, 0o755)
os.chmod(channel_dir.parent, 0o755)
os.chmod(channel_dir, 0o755)
temporary = channel_dir / "manifest.next"
temporary.write_text(text)
os.chmod(temporary, 0o644)
os.replace(temporary, channel_dir / "manifest")
for child in remote.iterdir():
    child.unlink()
remote.rmdir()
print(release_id)
