"""Durable, fenced mutations. No provider wording is used in logical identities."""

import hashlib
import json

from sqlalchemy import select

from .db import Effect, Event, Operation, Record, Task, now, record_json, sessions
from .security import encrypt


def operation_key(run_id: str, tool: str, args: dict, slot: str | None = None) -> str:
    # One creation per subject per request; a later user request gets a new run identity.
    # Distinct instruments/recommendations remain independent operations.
    subject = args.get("id") or args.get("recommendation_id") or args.get("instrument") or "request"
    if tool == "create_artifact":
        subject = args.get("type", "artifact")
    if tool == "manage_task":
        subject += ":" + args.get("action", "")
    if slot and tool in {
        "update_recommendation",
        "manage_task",
        "create_artifact",
        "chart_render",
    }:
        subject += ":" + slot
    digest = hashlib.sha256(json.dumps([tool, subject]).encode()).hexdigest()
    return run_id + ":" + digest


async def plan(runtime, tool: str, args: dict) -> str:
    key = operation_key(runtime.run_id, tool, args, runtime.operation_slot)
    async with sessions() as db:
        await runtime.fence_transaction(db)
        row = await db.get(Operation, key)
        if not row:
            row = Operation(id=key, run_id=runtime.run_id, tool=tool, arguments=encrypt(args))
            # Upgrade compatibility: import pre-journal commits from their auditable creation events.
            legacy_key = (
                runtime.run_id
                + ":"
                + hashlib.sha256((tool + json.dumps(args, sort_keys=True)).encode()).hexdigest()
            )
            legacy = await db.get(Effect, legacy_key)
            result = legacy.result if legacy else None
            event_type = {
                "create_recommendation": "recommendation_created",
                "create_task": "task_created",
                "create_artifact": "artifact_created",
            }.get(tool)
            if result is None and event_type:
                events = (
                    await db.scalars(
                        select(Event).where(
                            Event.run_id == runtime.run_id,
                            Event.event == "agent.activity",
                            Event.payload["type"].as_string() == event_type,
                        )
                    )
                ).all()
                for event in events:
                    resource = await db.get(
                        Task if tool == "create_task" else Record, event.payload.get("entity_id")
                    )
                    if not resource:
                        continue
                    original = resource.config if isinstance(resource, Task) else resource.data
                    if operation_key(runtime.run_id, tool, original) == key:
                        result = (
                            {
                                "id": resource.id,
                                "status": resource.status,
                                "config": resource.config,
                            }
                            if isinstance(resource, Task)
                            else record_json(resource)
                        )
                        break
            if result is not None:
                row.state, row.result, row.committed_at = "committed", result, now()
            db.add(row)
        await db.commit()
    return key
