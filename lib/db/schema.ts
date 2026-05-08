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
  vector,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ============================================================
// USERS
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

// OAuth provider별 refresh token 저장. encryptedRefreshToken은 pgcrypto
// pgp_sym_encrypt 결과를 base64 인코딩해 text로 보관 — 평문 저장 금지.
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
// 같은 방식 — pgp_sym_encrypt(value, OAUTH_TOKEN_KEY) → base64. maskedTail은 마지막 4자
// (UI 표시용 평문 안전). verifiedAt은 마지막 검증 성공 시각 (저장은 검증 통과 후만).
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

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
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
// TODO & CALENDAR
// ============================================================
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("idea"),
    description: text("description"),
    githubRepo: text("github_repo"),
    iconEmoji: text("icon_emoji"),
    colorHex: text("color_hex"),
    notes: text("notes"),
    metricsJson: jsonb("metrics_json").default({}).notNull(),
    lastCommitAt: timestamp("last_commit_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("products_status_idx").on(t.status)],
);

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    priority: text("priority").notNull().default("P2"),
    status: text("status").notNull().default("todo"),
    projectId: uuid("project_id").references(() => products.id, {
      onDelete: "set null",
    }),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceRule: text("recurrence_rule"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("todos_status_due_idx").on(t.status, t.dueDate),
    index("todos_project_idx").on(t.projectId),
  ],
);

export const calendarEventsCache = pgTable(
  "calendar_events_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleEventId: text("google_event_id").notNull().unique(),
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
  ],
);

// ============================================================
// GOALS & REVIEWS
// ============================================================
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("quarter"),
  targetDate: date("target_date"),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const goalLinks = pgTable("goal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  linkedType: text("linked_type").notNull(),
  linkedId: text("linked_id").notNull(),
});

export const weeklyReviews = pgTable("weekly_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: date("week_start").notNull().unique(),
  todosCompleted: integer("todos_completed").notNull().default(0),
  habitsCompletionRate: decimal("habits_completion_rate", {
    precision: 5,
    scale: 2,
  }),
  githubCommits: integer("github_commits").notNull().default(0),
  obsidianNotesCreated: integer("obsidian_notes_created").notNull().default(0),
  aiSummary: text("ai_summary"),
  aiSuggestions: jsonb("ai_suggestions").default([]).notNull(),
  userNotes: text("user_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// HABITS & YEAR IN PIXELS
// ============================================================
export const habits = pgTable("habits", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  targetFrequency: text("target_frequency").notNull().default("daily"),
  colorHex: text("color_hex"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completed: boolean("completed").notNull().default(false),
    note: text("note"),
  },
  (t) => [unique("habit_logs_habit_date_unique").on(t.habitId, t.date)],
);

export const yearPixels = pgTable("year_pixels", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull().unique(),
  moodScore: integer("mood_score").notNull(),
  colorHex: text("color_hex"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// KNOWLEDGE
// ============================================================
export const quickCaptures = pgTable("quick_captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  url: text("url"),
  imageUrl: text("image_url"),
  aiCategory: text("ai_category"),
  processed: boolean("processed").notNull().default(false),
  movedToTable: text("moved_to_table"),
  movedToId: uuid("moved_to_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const readLater = pgTable("read_later", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  title: text("title"),
  domain: text("domain"),
  thumbnailUrl: text("thumbnail_url"),
  content: text("content"),
  aiSummary: text("ai_summary"),
  estimatedMinutes: integer("estimated_minutes"),
  status: text("status").notNull().default("unread"),
  priority: text("priority").notNull().default("medium"),
  tags: jsonb("tags").default([]).notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const learnings = pgTable("learnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  tags: jsonb("tags").default([]).notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const obsidianNotes = pgTable(
  "obsidian_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filePath: text("file_path").notNull().unique(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").default([]).notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    wordCount: integer("word_count").notNull().default(0),
    lastModified: timestamp("last_modified", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("obsidian_notes_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ============================================================
// BUSINESS — GitHub
// ============================================================
export const githubActivity = pgTable(
  "github_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    githubId: text("github_id").notNull(),
    title: text("title"),
    url: text("url"),
    aiSummary: text("ai_summary"),
    rawJson: jsonb("raw_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("github_activity_product_created_idx").on(
      t.productId,
      t.createdAt,
    ),
    unique("github_activity_type_github_id_unique").on(t.type, t.githubId),
  ],
);

// product 단위/전체 헤드라인 단위로 LLM이 생성한 요약. 같은 period(시작 시각) 재계산은 update.
// productId IS NULL → kind='headline' (전체 종합).
export const githubDigests = pgTable(
  "github_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    activityCount: integer("activity_count").notNull().default(0),
    model: text("model").notNull(),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("github_digests_kind_period_idx").on(t.kind, t.periodStart),
    unique("github_digests_unique").on(t.productId, t.kind, t.periodStart),
  ],
);

// ============================================================
// DEV TOOLS — Claude Skills
// ============================================================
export const claudeSkills = pgTable("claude_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  scope: text("scope").notNull().default("global"),
  projectPath: text("project_path"),
  category: text("category"),
  version: text("version"),
  filePath: text("file_path"),
  fileContent: text("file_content"),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  tags: jsonb("tags").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const skillUsageLogs = pgTable("skill_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => claudeSkills.id, { onDelete: "cascade" }),
  context: text("context"),
  usedAt: timestamp("used_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// NEWS
// ============================================================
export const newsSources = pgTable("news_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  category: text("category"),
  active: boolean("active").notNull().default(true),
  fetchFrequencyMin: integer("fetch_frequency_min").notNull().default(60),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
});

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => newsSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content"),
    aiSummary: text("ai_summary"),
    category: text("category"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("news_items_published_idx").on(t.publishedAt),
    unique("news_items_source_url_unique").on(t.sourceId, t.url),
  ],
);

export const dailyBriefings = pgTable("daily_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull().unique(),
  hyewonIntro: text("hyewon_intro"),
  sectionsJson: jsonb("sections_json").default([]).notNull(),
  audioUrl: text("audio_url"),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// MAIL
// ============================================================
export const gmailCache = pgTable(
  "gmail_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    threadId: text("thread_id").notNull(),
    fromEmail: text("from_email"),
    fromName: text("from_name"),
    subject: text("subject"),
    snippet: text("snippet"),
    aiPriority: text("ai_priority"),
    needsReply: boolean("needs_reply").notNull().default(false),
    aiSummary: text("ai_summary"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    read: boolean("read").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("gmail_cache_received_idx").on(t.receivedAt),
    index("gmail_cache_priority_idx").on(t.aiPriority),
  ],
);
