# Durable monitoring

`TaskConfig` carries objective, context, instrument, schedule, interval/at/until, recommendation linkage and notification mode. A one-shot needs an explicit timezone-aware time; repeating/condition/continuous monitoring needs a polling interval. The 30-second minimum is a service capacity bound, not a market threshold.

The scheduler locks due tasks and writes a unique run for each scheduled occurrence. A task already queued/running is not duplicated. The worker locks conversations, preventing two live runs from sharing one conversation context, then claims a run with a lease and random fence. It renews the lease while working; a new worker may reclaim an expired lease. Every mutating tool checks the fence under a row lock.

The `task_outcome` tool records the condition result. Only a met condition follows the stored notification policy; silent tasks create no push. An outbox row and task result commit together. Push retries can repeat external delivery; Android uses a stable notification ID. No global emergency price movement or universal significance threshold exists.

Pause/cancel requests also request cancellation of queued/running occurrences. Resume schedules a new check. One-shot failures are visible; interval tasks retain the last error and can check again. Service restarts do not delete tasks, next checks, results, messages or outbox rows.

## Calendar recurrence

`TaskConfig` retains interval, once, condition and continuous schedules and adds `schedule="recurrence"`, an RFC 5545 RRULE value in `recurrence`, explicit IANA `timezone`, aware `start`, optional aware `until`, optional `condition`, objective/context, notification mode and recommendation link. Recurrence requires a start anchor; a local-time request without a known user timezone needs clarification. Do not infer a location from language.

Examples (RRULE value without the `RRULE:` prefix):

- Weekdays at the start's local time: `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR`.
- Monday 08:00 London: start at 08:00 in `Europe/London`, `FREQ=WEEKLY;BYDAY=MO`.
- Daily 19:00 local: start at 19:00 in the user's explicit IANA timezone, `FREQ=DAILY`.
- Every thirty minutes during conventional London hours: `FREQ=HOURLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8,9,10,11,12,13,14,15,16;BYMINUTE=0,30`, `Europe/London`.

Session windows are task-specific metadata, not market-open guarantees or trading filters. “Before New York open” requires the user/model to specify the offset and appropriate local session convention; RRULE does not invent that offset or exchange holidays. “Until Friday close” needs a resolved date/time; actual OANDA tradeability remains separately queried.

The scheduler computes occurrences with python-dateutil and ZoneInfo. DST spring gaps are skipped; the first occurrence of a repeated fall-back wall time runs once (`fold=0`). An `until` bound is inclusive for occurrence calculation; tasks whose deadline has already elapsed are completed without a late monitoring run. Missed runs coalesce after downtime rather than flooding the worker. Pause/resume recomputes the next valid local occurrence. Calendar recurrence never substitutes a fixed 24-hour interval for a day.

The occurrence key includes task ID and persisted occurrence instant. Row locks, unique run keys and active-run checks prevent duplicate scheduling. Mutation journaling makes task creation and task outcomes resumable. A notifier rechecks task status before handing a queued notification to FCM. A previously handed-off push cannot be recalled; incoming call acceptance checks current task/notification availability again. Final calendar outcomes mark an exhausted recurrence completed.
