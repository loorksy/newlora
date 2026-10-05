# Third-party notices

Newlora is independently implemented. It is not a nanobot fork and does not depend on nanobot.

| Project | Inspected revision/version | License | Usage |
|---|---|---|---|
| HKUDS/nanobot | 63bdd402803a3b055d7a249fd059c4cfb0e7ca98 (WebUI visual system). Earlier architectural review: 96ad7b4dbf617b11e0991e92c7d295dbd828a956 | MIT, copyright 2025-present Xubin Ren and the nanobot contributors | Mobile visual system adapted from `webui/` at the pinned commit. Newlora does not vendor Nanobot source, backend, tools, or product logic. Full MIT text: `docs/licenses/nanobot-MIT.txt` |
| klinecharts/pro | 4234b79f0bcfc26734d0a721c38cbd6d23aa38f5; npm 0.1.1 | Apache-2.0 | Chart dependency; original Arabic locale and datafeed |
| klinecharts | npm 9.8.12 | Apache-2.0 | Pro peer dependency and deterministic overlay APIs |
| lobehub/lobe-icons | 82e641b4fece9d1028a127149af9ded00df5ac0c; icons-rn 2.14.0 | MIT, copyright 2023 LobeHub | Official provider icon components |
| React Native community template | 0.81.5 | MIT | Android/iOS native build scaffold generated with official community CLI |
| OpenAI Python | 3.24.0 | Apache-2.0 | Official provider SDK, Responses, GPT-Live and Realtime |
| Anthropic Python | 1.11.0 | MIT | Official provider SDK |
| pypdf | 6.19.0 | BSD-3-Clause | Bounded PDF text extraction in a resource-limited subprocess |
| python-dateutil | 2.9.0.post0 | Dual Apache-2.0 / BSD-3-Clause | iCalendar recurrence expansion |
| Z.AI Python | zai-sdk 0.2.3 | MIT | Official provider SDK, import `zai` |

The Newlora Android interface adapts the visual system of the Nanobot WebUI (`webui/`, including `globals.css`, the sidebar, thread header, composer, message timeline, settings surfaces, and automations presentation) from https://github.com/HKUDS/nanobot at commit `63bdd402803a3b055d7a249fd059c4cfb0e7ca98`. That work is MIT licensed, copyright 2025-present Xubin Ren and the nanobot contributors. The notice in `docs/licenses/nanobot-MIT.txt` applies to those adapted visual patterns. Newlora remains a separate product: it does not include Nanobot's gateway, shell, coding tools, Apps, Skills, or MCP product surfaces, and it is not named Nanobot.

The complete verified upstream nanobot, KLineChart Pro, and Lobe Icons license texts are retained in `docs/licenses/`. Dependency distributions retain their own licenses. `uv.lock`, `requirements.lock`, and `package-lock.json` enumerate resolved dependencies. Vendor trademarks belong to their respective owners. No affiliation is implied.

No upstream source notices have been removed. The nanobot checkout remains outside this repository. KLineChart Pro source is consumed as an unmodified dependency; its API is not patched.

Three unmodified Mono icon components are extracted from the pinned `@lobehub/icons-rn` published source map by `scripts/provider-icons.mjs`, under `apps/mobile/src/vendor/lobe/`. Only their type-only import path is adjusted. Each retains LobeHub attribution; the complete MIT notice is in `docs/licenses/Lobe-Icons-MIT.txt`. This curated subset avoids evaluating the package’s entire icon catalog and Expo gradient imports in Metro.

`infra/docker/chromium-seccomp.json` is adapted from the Playwright Docker Chromium seccomp profile from https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json, retrieved 2026-10-04. Microsoft/Playwright, Apache-2.0; full license retained at `docs/licenses/Playwright-Apache-2.0.txt`.

The seccomp adaptation permits `chroot` alongside user-namespace creation, so Chromium can apply its namespace-local sandbox with all container capabilities dropped. It does not grant a host capability or privileged container mode.
