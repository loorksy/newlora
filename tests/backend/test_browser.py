import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx


async def test_browser_errors_omit_sensitive_page_content(monkeypatch, tmp_path):
    monkeypatch.setenv("CHART_DIST", str(tmp_path))
    source = Path(__file__).resolve().parents[2] / "services/browser/app.py"
    spec = importlib.util.spec_from_file_location("browser_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.browser = SimpleNamespace(
        new_context=AsyncMock(side_effect=RuntimeError("sensitive-url-or-page-content"))
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=module.app), base_url="http://browser"
    ) as client:
        payload = {"instrument": "XAU_USD", "timeframe": "M15", "candles": []}
        assert (await client.post("/render", json=payload)).status_code == 401
        client.headers["Authorization"] = "Bearer test-browser-token"
        response = await client.post("/render", json=payload)
        assert response.status_code == 502 and response.json() == {"code": "browser_unavailable"}
        response = await client.post("/render", json={"instrument": "sensitive-input"})
        assert response.status_code == 422 and "sensitive-input" not in response.text
