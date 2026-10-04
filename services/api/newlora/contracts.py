from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

ProviderName = Literal["openai", "anthropic", "zai"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelSelection(Contract):
    provider: ProviderName
    model: str = Field(min_length=1, max_length=100)


class Preferences(Contract):
    language: Literal["ar", "en"] = "ar"
    main: ModelSelection | None = None
    subagent: ModelSelection | None = None
    voice: ModelSelection | None = None


class Intent(Contract):
    intent: Literal[
        "general_question",
        "trading_question",
        "analyze_instrument",
        "visual_analysis",
        "recommendation",
        "recommendation_followup",
        "market_status",
        "session_status",
        "news",
        "news_monitoring",
        "create_task",
        "edit_task",
        "pause_task",
        "resume_task",
        "stop_task",
        "chart",
        "annotated_chart",
        "historical_comparison",
        "artifact",
        "voice_call",
        "settings",
    ]
    instrument: str | None = None
    timeframe: str | None = None
    needs_market_data: bool = False
    needs_visual_chart: bool = False
    needs_news: bool = False
    needs_subagents: bool = False
    needs_persistent_task: bool = False


class Recommendation(Contract):
    instrument: str = Field(pattern=r"^[A-Z0-9_]{3,24}$")
    summary: str = Field(min_length=1, max_length=5000)
    direction: Literal["buy", "sell", "neutral"] | None = None
    entry: float | None = None
    stop: float | None = None
    targets: list[float] = Field(default_factory=list)
    timeframes: list[str] = Field(default_factory=list)
    rationale_summary: str | None = Field(default=None, max_length=8000)
    status: Literal["draft", "active", "updated", "invalidated", "completed", "cancelled"] = "draft"
    chart_artifact_id: str | None = None
    monitoring_task_id: str | None = None


class TaskConfig(Contract):
    objective: str = Field(min_length=1, max_length=8000)
    instrument: str | None = None
    context: str = Field(default="", max_length=12000)
    schedule: Literal["interval", "once", "condition", "continuous"]
    interval_seconds: int | None = Field(default=None, ge=30, le=31536000)
    at: AwareDatetime | None = None
    until: AwareDatetime | None = None
    notification: Literal["silent", "normal", "urgent", "call"] = "normal"
    recommendation_id: str | None = None

    @model_validator(mode="after")
    def schedule_valid(self):
        if self.schedule == "once" and self.at is None:
            raise ValueError("one-shot task needs an explicit time")
        if self.schedule != "once" and self.interval_seconds is None:
            raise ValueError("monitoring needs a polling interval")
        if self.at and self.until and self.until <= self.at:
            raise ValueError("until must follow start")
        return self


class TaskOutcome(Contract):
    summary: str = Field(min_length=1, max_length=8000)
    condition_met: bool
    completed: bool = False


class Artifact(Contract):
    type: Literal["sheet", "data_table", "chart", "agent_text", "select_item"]
    title: str = Field(min_length=1, max_length=200)
    data: dict[str, Any]

    @model_validator(mode="after")
    def validate_data(self):
        if self.type in ("sheet", "data_table"):
            if not isinstance(self.data.get("columns"), list) or not isinstance(
                self.data.get("rows"), list
            ):
                raise ValueError("table requires columns and rows")
        if self.type == "agent_text" and not isinstance(self.data.get("text"), str):
            raise ValueError("report requires text")
        if self.type == "select_item":
            options = self.data.get("options")
            if (
                not isinstance(options, list)
                or not options
                or not all(
                    isinstance(x, dict)
                    and isinstance(x.get("id"), str)
                    and isinstance(x.get("label"), str)
                    for x in options
                )
            ):
                raise ValueError("selection requires id/label options")
        return self


class Drawing(Contract):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    kind: Literal["trendline", "horizontal", "vertical", "zone", "label", "marker", "arrow"]
    points: list[dict[str, float]] = Field(min_length=1, max_length=8)
    label: str | None = Field(default=None, max_length=120)


class ActivityEvent(Contract):
    type: Literal[
        "agent_started",
        "intent_detected",
        "tool_started",
        "tool_completed",
        "market_data_loaded",
        "chart_rendered",
        "chart_annotation_added",
        "subagent_spawned",
        "subagent_completed",
        "recommendation_created",
        "recommendation_updated",
        "task_created",
        "task_checked",
        "artifact_created",
        "notification_sent",
        "voice_call_requested",
        "memory_compacted",
    ]
    tool: str | None = None
    instrument: str | None = None
    timeframe: str | None = None
    entity_id: str | None = None


class EventEnvelope(Contract):
    id: int
    event: str
    version: Literal[1] = 1
    sessionId: str | None
    runId: str | None
    timestamp: datetime
    payload: dict[str, Any]
