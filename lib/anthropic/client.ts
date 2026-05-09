// DEPRECATED: 이 파일은 backward-compat shim입니다.
// 실제 구현은 lib/llm/router.ts (multi-provider) — 새 코드는 그쪽을 import 할 것.
//
// 기존 import 경로(@/lib/anthropic/client)를 깨지 않기 위해 re-export.

import "server-only";
export { invokeAgent, streamAgent } from "@/lib/llm/router";
export type { AgentTool, InvokeAgentParams, StreamHandle } from "@/lib/llm/router";
