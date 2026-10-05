The worker, scheduler and voice-worker entrypoints share the API domain package so contracts and transactional invariants cannot drift:

- `python -m newlora.jobs worker`
- `python -m newlora.jobs scheduler`
- `python -m newlora.voice`

They are separate Docker services and processes, not API background tasks.
