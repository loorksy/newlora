# Durable monitoring

`TaskConfig` carries objective, context, instrument, schedule, interval/at/until, recommendation linkage and notification mode. A one-shot needs an explicit timezone-aware time; repeating/condition/continuous monitoring needs a polling interval. The 30-second minimum is a service capacity bound, not a market threshold.

The scheduler locks due tasks and writes a unique run for each scheduled occurrence. A task already queued/running is not duplicated. The worker locks conversations, preventing two live runs from sharing one conversation context, then claims a run with a lease and random fence. It renews the lease while working; a new worker may reclaim an expired lease. Every mutating tool checks the fence under a row lock.

The `task_outcome` tool records the condition result. Only a met condition follows the stored notification policy; silent tasks create no push. An outbox row and task result commit together. Push retries can repeat external delivery; Android uses a stable notification ID. No global emergency price movement or universal significance threshold exists.

Pause/cancel requests also request cancellation of queued/running occurrences. Resume schedules a new check. One-shot failures are visible; interval tasks retain the last error and can check again. Service restarts do not delete tasks, next checks, results, messages or outbox rows.
