"""Calendar schedules use local wall time; nonexistent times are skipped, folds run once."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from dateutil.rrule import rrulestr
from dateutil.tz import datetime_exists


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def validate_recurrence(rule: str, timezone: str, start: datetime):
    zone = ZoneInfo(timezone)
    # Single bounded RRULE; no embedded DTSTART, RDATE, EXDATE or SECONDLY amplification.
    if len(rule) > 1000 or "\n" in rule or rule.startswith("RRULE:"):
        raise ValueError("recurrence_must_be_single_rrule")
    fields = dict(part.split("=", 1) for part in rule.upper().split(";"))
    if fields.get("FREQ") not in {"MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"}:
        raise ValueError("unsupported_recurrence_frequency")
    if "COUNT" in fields and int(fields["COUNT"]) > 100000:
        raise ValueError("recurrence_count_too_large")
    rrulestr(rule, dtstart=start.astimezone(zone))


def next_check(config: dict, after: datetime, *, initial: bool = False) -> datetime | None:
    after = utc(after)
    until = utc(datetime.fromisoformat(config["until"])) if config.get("until") else None
    start_value = config.get("start") or config.get("at")
    start = utc(datetime.fromisoformat(start_value)) if start_value else after
    kind = config["schedule"]
    if kind == "recurrence":
        zone = ZoneInfo(config["timezone"])
        rule = rrulestr(config["recurrence"], dtstart=start.astimezone(zone))
        candidate = rule.after(after.astimezone(zone), inc=initial)
        # Bounded calendar search guards malicious/impossible sparse schedules.
        for _ in range(10000):
            if candidate is None:
                return None
            # dateutil can generate imaginary local times. Never silently shift the user's time.
            if datetime_exists(candidate) and (
                utc(candidate) > after or initial and utc(candidate) == after
            ):
                break
            candidate = rule.after(candidate)
        else:
            raise ValueError("recurrence_search_limit")
        result: datetime | None = utc(candidate.replace(fold=0))
    elif kind == "once":
        result = start if initial else None
    else:
        seconds = config["interval_seconds"]
        # Advance from the persisted anchor, not the scheduler's wall clock.
        result = (
            max(start, after + timedelta(seconds=seconds))
            if initial
            else after + timedelta(seconds=seconds)
        )
    if result is not None and until is not None and result > until:
        return None
    return result
