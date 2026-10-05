# In-app voice

Official sources verified 2026-10-04: https://developers.openai.com/api/docs/guides/voice-webrtc and the installed `openai` SDK's Live/Realtime typed resources. The current guide documents `gpt-live-1`, `client.live.create(session=..., transport={type: webrtc, sdp: ...})`, and its returned `session.id` and `transport.sdp`.

For GPT-Live, Android creates an SDP offer; the authenticated API brokers it with the official SDK and returns only the SDP answer and local IDs. Media flows by WebRTC directly to OpenAI. A separate voice worker attaches through the official SDK sideband. Only public user-transcript fragments, delegation metadata, and cumulative audio usage are consumed. Research is queued through the same durable agent runtime, then a short public result is sent via `session.commentary.append`. Private reasoning events are neither read nor forwarded. Frontend data-channel event permissions exclude hidden events.

For Realtime models, Android supplies SDP and the backend brokers it through the official `client.realtime.calls.create` API. The returned call ID is trusted because it comes directly from the provider; the voice worker attaches with `client.realtime.connect(call_id=...)` for server-side tools and response usage. An official 60-second client-secret endpoint is retained for integrations that do not supply SDP. Semantic VAD supports interruption and natural turn taking. A single `research` function routes market work back through the authenticated backend. The permanent API key never goes to Android.

The native client requests microphone permission, provides mute/speaker/end controls, and offers reconnect after a failed media connection. Reconnect creates a new media session; conversation research remains durable. A task's `call` policy sends an FCM incoming-call notification, which opens an acceptance screen. No cellular/PSTN capability is implied.

GPT-Live audio seconds come from authenticated sideband usage events. Token values/cost remain unknown where the provider does not report them. Realtime response usage is recorded from the authenticated sideband with provider response-ID deduplication; mobile-reported counters are never accepted as financial accounting. The optional client-secret-only fallback cannot provide authoritative media usage and leaves counters unknown.

Live Arabic/English speech, Bluetooth routes, Android background restrictions, interruption, FCM acceptance and provider account permissions require real-device/account validation. Mock tests and an APK build cannot certify these behaviors.

## Hardening and acceptance boundary

Stopping a call now closes its authenticated backend record and changes its fence, preventing a stale broker from recording subsequent events. Closed records reject mobile research requests; request deduplication includes voice-session identity. Missing provider/session/response IDs fail safely or leave usage unrecorded rather than inventing identifiers. Mobile deduplicates Realtime research events, stops microphone/peer resources on cancellation and reconnects with a fresh session object. Incoming notification availability is checked before starting audio.

Automated tests mock official SDKs and native WebRTC. They cover ownership, malformed IDs, cancellation, duplicate usage/events, research failure and disconnect/reconnect UI state. They do not certify actual bidirectional audio, Bluetooth routing, echo behavior, Arabic/English barge-in, killed-app delivery or provider reconnect behavior. Those require a physical Android device, Firebase and real OpenAI access using the checklist in VALIDATION.md. Calls remain in-app AI calls, never PSTN/cellular calls.

Call-screen cleanup follows the current connection after reconnect. Closing during incoming-call authorization prevents media startup, and stale callbacks cannot change a replacement session’s UI. Jest component tests cover both races.
