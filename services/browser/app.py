import asyncio
import base64
import os
import secrets
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from playwright.async_api import async_playwright
from pydantic import BaseModel, Field

browser = None
slots = asyncio.Semaphore(3)


@asynccontextmanager
async def lifespan(app):
    global browser
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True, args=["--disable-dev-shm-usage"], chromium_sandbox=True
        )
        yield
        await browser.close()


app = FastAPI(lifespan=lifespan)


def auth(authorization: str = Header(default="")):
    token = os.environ["BROWSER_TOKEN"]
    if not secrets.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "unauthorized")


class Render(BaseModel):
    instrument: str
    timeframe: str
    candles: list[dict] = Field(max_length=5000)
    drawings: list[dict] = Field(default_factory=list, max_length=100)
    locale: str = "en"


class Action(BaseModel):
    type: Literal["click", "type", "scroll", "key"]
    x: int = Field(default=0, ge=0, le=1920)
    y: int = Field(default=0, ge=0, le=1080)
    text: str = Field(default="", max_length=1000)


class Browse(BaseModel):
    url: str = Field(max_length=2048)
    actions: list[Action] = Field(default_factory=list, max_length=12)
    screenshot: bool = False


@app.get("/health")
async def health():
    return {"ok": bool(browser and browser.is_connected())}


@app.post("/render", dependencies=[Depends(auth)])
async def render(data: Render):
    async with slots, asyncio.timeout(45):
        context = await browser.new_context(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=1.5,
            service_workers="block",
        )
        try:
            # Trusted chart render cannot fetch any remote page or subresource.
            await context.route(
                "**/*",
                lambda route: (
                    route.continue_()
                    if route.request.url.startswith("http://127.0.0.1:8090/chart/")
                    else route.abort()
                ),
            )
            page = await context.new_page()
            await page.goto("http://127.0.0.1:8090/chart/")
            await page.wait_for_function("window.newlora !== undefined")
            await page.evaluate("data => window.newlora.load(data)", data.model_dump())
            await page.wait_for_function("window.newlora.ready")
            await page.evaluate(
                "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"
            )
            png = await page.screenshot(type="png")
            return {"png": base64.b64encode(png).decode(), "width": 2400, "height": 1500}
        finally:
            await context.close()


@app.post("/browse", dependencies=[Depends(auth)])
async def browse(data: Browse):
    if not data.url.startswith(("https://", "http://")):
        raise HTTPException(400, "unsafe_url")
    async with slots, asyncio.timeout(45):
        context = await browser.new_context(
            viewport={"width": 1440, "height": 1000},
            proxy={
                "server": os.environ.get("EGRESS_PROXY", "http://egress:8091"),
                "bypass": "<-loopback>",
            },
            service_workers="block",
            accept_downloads=False,
        )
        try:

            async def route(req):
                if req.request.url.startswith(
                    ("http://", "https://")
                ) and req.request.resource_type not in {"media", "font"}:
                    await req.continue_()
                else:
                    await req.abort()

            await context.route("**/*", route)
            page = await context.new_page()
            await page.goto(data.url, wait_until="domcontentloaded", timeout=25000)
            for action in data.actions:
                if action.type == "click":
                    await page.mouse.click(action.x, action.y)
                elif action.type == "type":
                    await page.keyboard.insert_text(action.text)
                elif action.type == "scroll":
                    await page.mouse.wheel(action.x, action.y)
                elif action.type == "key" and action.text in {
                    "Enter",
                    "Tab",
                    "Escape",
                    "ArrowDown",
                    "ArrowUp",
                }:
                    await page.keyboard.press(action.text)
            result = {
                "url": page.url,
                "title": await page.title(),
                "text": (await page.locator("body").inner_text(timeout=5000))[:30000],
            }
            if data.screenshot:
                result["png"] = base64.b64encode(await page.screenshot()).decode()
            return result
        finally:
            await context.close()


app.mount(
    "/chart",
    StaticFiles(directory=os.environ.get("CHART_DIST", "/app/packages/chart/dist"), html=True),
    name="chart",
)
