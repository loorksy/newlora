import type { Artifact, Recommendation, Resource, Task } from '@newlora/contracts';

export type ScreenId =
  | 'home'
  | 'chats'
  | 'recommendations'
  | 'tasks'
  | 'usage'
  | 'settings';

export type ChatMessage = {
  id?: number;
  clientId: string;
  role: string;
  text: string;
  timestamp?: string;
  attachmentIds?: string[];
};

export type HistoryPayload = {
  activeRunId?: string | null;
  activeRunStatus?: string;
  messages: ChatMessage[];
  resources: Resource[];
};

export type ActivityItem = { key: string; label: string };

export type UsageSummary = {
  tokens: number;
  cost: number | null;
  calls: number;
  failedCalls?: number;
  breakdowns: Record<string, Record<string, number>>;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  latencyMs?: number | null;
};

export type TaskConfigView = Task['config'] & {
  schedule?: string;
  interval_seconds?: number | null;
  recurrence?: string | null;
  at?: string | null;
  condition?: string | null;
  timezone?: string;
  notification?: string;
};

export type ChartContext = {
  instrument: string;
  timeframe: string;
  artifactId: string;
};

export type ArtifactResource = Resource<Artifact>;
export type RecommendationResource = Resource<Recommendation>;
