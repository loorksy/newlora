# Official provider integrations

Verified 2026-10-04. Dependencies resolved after inspecting official documentation and SDK source:

- OpenAI `openai==3.24.0`: https://developers.openai.com/api/docs/models and https://github.com/openai/openai-python . Adapter uses `AsyncOpenAI.responses.create(stream=True, store=False)`; model discovery uses `models.list()`.
- Anthropic `anthropic==1.11.0`: https://github.com/anthropics/anthropic-sdk-python and its `types/model.py`, `types/model_info.py`. The canonical documentation URL https://platform.claude.com/docs/en/about-claude/models/overview returned HTTP 403 in this environment; SDK source was inspected instead. Adapter uses `AsyncAnthropic.messages.stream()` and the SDK models API. Availability must be confirmed by the authenticated account's listing.
- Z.AI `zai-sdk==0.2.3`, `from zai import ZaiClient`: https://docs.z.ai/guides/develop/python/introduction and https://docs.z.ai/guides/overview/overview . The official SDK currently exposes no models resource; Newlora uses an official-source manifest. Synchronous streaming runs off the event loop. There is no OpenAI-compatible substitute.

`packages/shared/models.json` records exact IDs, provenance, production eligibility, tool/vision/voice capability and verification date. Refresh fetches account-visible IDs, intersects with verified capability metadata, excludes unrelated models, sorts by API creation date, and returns up to seven. For Z.AI the documented manifest rank is used. A provider exposing fewer than seven verified available models displays fewer: IDs are never invented to fill slots. Update or mount the server manifest when providers change; no APK release is needed. Catalog cache lasts six hours and explicit refresh bypasses it.

Provider-native options stay on each adapter's `native` argument. They are not blindly forwarded across vendors. Public text and function calls are normalized; private reasoning blocks are never read into persisted state. Streaming also suppresses tagged reasoning split across chunk boundaries. Tool results stay paired with call IDs, and image input is encoded using each official SDK's native format.

Every main/router/research/memory call gets a content-free usage record, including failures. SDK retries are disabled so hidden retries do not evade accounting. Unknown usage and cost are null. `packages/shared/pricing.json` is deliberately empty until effective-date rates including modality/cache/tier/region are verified. Live voice reports audio duration, not invented token counts.

Live key validation, regional model availability, Z.AI multi-step reasoning continuation behavior, Arabic speech quality and provider error/rate-limit recovery still require account-backed acceptance tests. Do not interpret mocked adapter tests as proof of account access.
