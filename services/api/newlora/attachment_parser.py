"""Fixed-purpose parser subprocess. Never evaluates uploaded content."""

import io
import json
import resource
import sys


def main():
    resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (6, 6))
    raw = sys.stdin.buffer.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError("limit")
    mime = sys.argv[1]
    if mime.startswith("image/"):
        from PIL import Image

        Image.MAX_IMAGE_PIXELS = 16_000_000
        source = Image.open(io.BytesIO(raw))
        expected = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
        if source.format != expected[mime] or source.width * source.height > 16_000_000:
            raise ValueError("image_type")
        source.load()
        output = io.BytesIO()
        source.convert("RGB").save(output, format="PNG")
        result = output.getvalue()
        if len(result) > 12_000_000:
            raise ValueError("image_limit")
        sys.stdout.buffer.write(result)
    else:
        if mime == "application/pdf":
            from pypdf import PdfReader

            if not raw.startswith(b"%PDF-"):
                raise ValueError("pdf_type")
            reader = PdfReader(io.BytesIO(raw), strict=True)
            if reader.is_encrypted:
                raise ValueError("encrypted_pdf")
            parts, budget = [], 24000
            for page in reader.pages[:20]:
                content = (page.extract_text() or "")[:budget]
                parts.append(content)
                budget -= len(content)
                if budget <= 0:
                    break
            text = "\n".join(parts)[:24000]
        else:
            text = raw.decode("utf-8-sig")
            if (
                text.lstrip().startswith(("#!", "MZ"))
                or "\x00" in text
                or any(ord(c) < 32 and c not in "\n\r\t" for c in text)
            ):
                raise ValueError("not_text")
            text = text[:24000]
        sys.stdout.write(json.dumps({"text": text, "bounded": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Suppress parser exception details and any submitted bytes.
        sys.exit(1)
