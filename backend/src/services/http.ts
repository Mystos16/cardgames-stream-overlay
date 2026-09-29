import type { HttpRequestInit, PluginHttp } from "@cso/shared";

const USER_AGENT = "cardgames-stream-overlay/0.1 (+https://github.com/topicusonderwijs/cardgames-stream-overlay)";

export class RateLimiter {
  private readonly intervalMs: number;
  private next = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / Math.max(requestsPerSecond, 0.1);
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const slot = this.chain.then(async () => {
      const wait = this.next - Date.now();
      if (wait > 0) await sleep(wait);
      this.next = Math.max(Date.now(), this.next) + this.intervalMs;
    });
    this.chain = slot.catch(() => {});
    return slot.then(task);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

async function withRetries(limiter: RateLimiter, url: string, init: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await limiter.schedule(() => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }));
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= retries) {
      if (!response.ok) throw new HttpError(response.status, url);
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
  }
}

export function createPluginHttp(limiter: RateLimiter, userAgent = USER_AGENT): PluginHttp {
  return {
    async json<T>(url: string, init: HttpRequestInit = {}): Promise<T> {
      const response = await withRetries(limiter, url, {
        method: init.method ?? "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json;q=0.9,*/*;q=0.8",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      return (await response.json()) as T;
    },
  };
}

export async function downloadBinary(limiter: RateLimiter, url: string, userAgent = USER_AGENT): Promise<{ data: Buffer; contentType: string }> {
  const response = await withRetries(limiter, url, { headers: { "User-Agent": userAgent, Accept: "image/*" } });
  return { data: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "" };
}
