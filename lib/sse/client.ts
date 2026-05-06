// 클라이언트용 SSE fetch + 파서.
// EventSource는 GET-only라 POST + body가 필요한 우리 채팅 엔드포인트에는 못 씀 → fetch 직접.
// 사용 예:
//   await streamSseFetch("/api/chat", {
//     method: "POST",
//     body: JSON.stringify({ message: "..." }),
//   }, {
//     onEvent: (name, data) => { ... },
//   });

export type SseHandlers = {
  onEvent?: (event: string, data: unknown) => void;
  onError?: (err: unknown) => void;
  signal?: AbortSignal;
};

export async function streamSseFetch(
  url: string,
  init: RequestInit,
  handlers: SseHandlers,
): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "text/event-stream");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      signal: handlers.signal,
    });
  } catch (e) {
    handlers.onError?.(e);
    return;
  }

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    handlers.onError?.(
      new Error(`HTTP ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`),
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        let eventName = "message";
        let dataStr = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr += line.slice(6);
        }
        let data: unknown = null;
        try {
          data = JSON.parse(dataStr);
        } catch {
          // non-JSON 페이로드는 raw 문자열로
          data = dataStr;
        }
        handlers.onEvent?.(eventName, data);
      }
    }
  } catch (e) {
    handlers.onError?.(e);
  }
}
