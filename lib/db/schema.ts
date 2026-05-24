import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  decimal,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ============================================================
// USERS & AUTH
// ============================================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  settingsJson: jsonb("settings_json").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// OAuth provider별 refresh token. encryptedRefreshToken은 pgcrypto
// pgp_sym_encrypt 결과를 base64로 보관 — 평문 저장 금지.
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    scope: text("scope").notNull().default(""),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("oauth_tokens_user_provider_unique").on(t.userId, t.provider),
  ],
);

// 사용자가 설정 UI에서 입력한 API 키. provider별 1개. encryptedValue는 oauth_tokens와
// 같은 방식 — pgp_sym_encrypt(value, OAUTH_TOKEN_KEY) → base64.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    maskedTail: text("masked_tail").notNull().default(""),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("api_keys_user_provider_unique").on(t.userId, t.provider)],
);

// ============================================================
// AGENTS & CHAT
// ============================================================
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    englishName: text("english_name").notNull(),
    role: text("role").notNull(),
    description: text("description").notNull(),

    model: text("model").notNull(),
    temperature: decimal("temperature", { precision: 3, scale: 2 }),
    maxTokens: integer("max_tokens").notNull().default(1024),
    topP: decimal("top_p", { precision: 3, scale: 2 }),

    systemPrompt: text("system_prompt").notNull(),

    colorHex: text("color_hex").notNull(),
    avatarEmoji: text("avatar_emoji"),

    isActive: boolean("is_active").notNull().default(true),
    isPausedReason: text("is_paused_reason"),

    triggerConfig: jsonb("trigger_config").default({}).notNull(),
    toolPermissions: jsonb("tool_permissions").default({}).notNull(),

    dailyCostLimitUsd: decimal("daily_cost_limit_usd", {
      precision: 10,
      scale: 4,
    }),
    monthlyCostLimitUsd: decimal("monthly_cost_limit_usd", {
      precision: 10,
      scale: 4,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("agents_english_name_unique").on(t.englishName)],
);

export const agentPromptVersions = pgTable(
  "agent_prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    changedBy: text("changed_by").notNull().default("user"),
    changeNote: text("change_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("agent_prompt_versions_agent_version_unique").on(
      t.agentId,
      t.version,
    ),
  ],
);

// chat_sessions.agentId nullable: null이면 멀티 채팅(메인), 값이 있으면 그 에이전트와 1:1.
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  title: text("title"),
  // 사이드패널처럼 사용자에게 직접 노출 안 되는 임시 세션이면 true.
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    toolCalls: jsonb("tool_calls"),
    /**
     * 메시지에 첨부된 파일 메타. 현재는 이미지만 지원.
     * 형태: [{ type: "image", storagePath, contentType, fileName, sizeBytes }, ...]
     * supabase storage `diary` bucket 재사용 (path prefix: chat/<userId>/...).
     * LLM 호출 시 signed URL 발급해 Anthropic content block에 image source로 첨부.
     */
    attachments: jsonb("attachments").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId, t.createdAt)],
);

export const agentLogs = pgTable(
  "agent_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    isError: boolean("is_error").notNull().default(false),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("agent_logs_agent_created_idx").on(t.agentId, t.createdAt),
    index("agent_logs_created_idx").on(t.createdAt),
  ],
);

// ============================================================
// DIARY — 하루 1개 일기 (entry_date unique). 이미지는 별도 테이블.
// ============================================================
export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    title: text("title"),
    bodyMd: text("body_md").notNull().default(""),
    mood: text("mood"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("diary_entries_user_date_unique").on(t.userId, t.entryDate),
    index("diary_entries_user_date_idx").on(t.userId, t.entryDate),
  ],
);

// Supabase Storage bucket "diary" 안의 path. signed URL로 client 업로드.
export const diaryImages = pgTable(
  "diary_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => diaryEntries.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("diary_images_entry_idx").on(t.entryId, t.sortOrder)],
);

// ============================================================
// MEMO — 날짜별, 하루 여러 개 가능. body_md에 마크다운 직접 저장.
// ============================================================
export const memos = pgTable(
  "memos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    title: text("title"),
    bodyMd: text("body_md").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("memos_user_date_idx").on(t.userId, t.entryDate),
    index("memos_user_archived_idx").on(t.userId, t.archived),
  ],
);

// ============================================================
// TODO — 중요 / 기한 / 프로젝트 태그 / 보관 / 삭제.
// 반복 규칙은 v2에서 out of scope, due_date만.
// ============================================================
export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    dueDate: date("due_date"),
    isImportant: boolean("is_important").notNull().default(false),
    tag: text("tag"),
    archived: boolean("archived").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("todos_user_due_idx").on(t.userId, t.dueDate),
    index("todos_user_archived_idx").on(t.userId, t.archived),
    index("todos_user_completed_idx").on(t.userId, t.completedAt),
  ],
);

// ============================================================
// CALENDAR — Google Calendar 동기화 캐시. v1 그대로 재사용.
// ============================================================
export const calendarEventsCache = pgTable(
  "calendar_events_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: text("calendar_id").notNull(),
    calendarSummary: text("calendar_summary"),
    calendarColorHex: text("calendar_color_hex"),
    googleEventId: text("google_event_id").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    attendees: jsonb("attendees").default([]).notNull(),
    location: text("location"),
    rawJson: jsonb("raw_json").default({}).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("calendar_events_cache_start_idx").on(t.startAt),
    unique("calendar_events_cache_cal_event_uq").on(
      t.calendarId,
      t.googleEventId,
    ),
  ],
);

// ============================================================
// NOTIFICATIONS — 인앱 헤더 종 배지 + 텔레그램 push 단일 소스.
// kind: daily_report / agent_alert / discussion_result / calendar_reminder
// ============================================================
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
  ],
);

// ============================================================
// DISCUSSIONS — 메인 에이전트가 진행하는 다중 에이전트 토론.
// 사용자에게 과정은 보여주지 않고 결과 리포트(summary_md)만 노출,
// 상세 페이지에서 discussion_turns 전체 텍스트 열람 가능.
// status: running / done / failed
// ============================================================
export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    targetAgents: jsonb("target_agents").default([]).notNull(),
    status: text("status").notNull().default("running"),
    summaryMd: text("summary_md"),
    tokenBudgetUsd: decimal("token_budget_usd", {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default("0.5000"),
    totalCostUsd: decimal("total_cost_usd", {
      precision: 10,
      scale: 6,
    })
      .notNull()
      .default("0"),
    roundsRun: integer("rounds_run").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("discussions_user_started_idx").on(t.userId, t.startedAt),
    index("discussions_status_idx").on(t.status),
  ],
);

export const discussionTurns = pgTable(
  "discussion_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    speakerAgentId: uuid("speaker_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("discussion_turns_discussion_idx").on(
      t.discussionId,
      t.round,
      t.createdAt,
    ),
  ],
);
