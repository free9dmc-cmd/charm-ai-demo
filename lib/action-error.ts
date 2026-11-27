/**
 * lib/action-error.ts — turn a failed dashboard API call into one honest,
 * human sentence.
 *
 * Why this exists: the inbox's "Approve & send" button used to fire-and-forget.
 * It never looked at the response, so a 429 (the approve route is capped at
 * 20/min), a 403, or a Twilio failure (500) all looked exactly like success —
 * the draft just sat there, the provider assumed it went out, and the client
 * never got a reply. On this product a silently unsent reply is a lost booking.
 *
 * Kept pure (no fetch, no React) so the wording can be unit-tested and reused
 * by any dashboard action that needs the same treatment.
 */

export interface ActionFailureInput {
  /** HTTP status, or null when the request never got a response (offline, DNS, CORS). */
  status: number | null;
  /** Raw response body text, if any. Routes return JSON `{error}` or a plain string. */
  bodyText?: string | null;
  /** Value of the Retry-After header (seconds), if the server sent one. */
  retryAfter?: string | null;
}

/** Longest server message we'll show verbatim — anything longer is probably a stack/HTML page. */
const MAX_SERVER_MESSAGE = 140;

/**
 * Pull a short, safe, human-readable message out of a response body.
 * Accepts `{"error":"..."}`, `{"message":"..."}`, or a short plain-text body.
 * Returns null for HTML error pages, empty bodies, and anything overly long.
 */
export function extractServerMessage(bodyText?: string | null): string | null {
  const text = bodyText?.trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const candidate = typeof parsed.error === "string" ? parsed.error : parsed.message;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim().slice(0, MAX_SERVER_MESSAGE);
      }
    } catch {
      /* looks like JSON but isn't — treat as noise, not as a message */
    }
    return null;
  }

  // An HTML error page (Vercel/Next 500) is noise to a provider, never show it.
  if (text.startsWith("<")) return null;
  return text.length <= MAX_SERVER_MESSAGE ? text : null;
}

/**
 * The sentence shown to the provider when `verb` ("send", "discard") failed.
 * Status-specific wording first, because the right reaction differs:
 * wait (429), sign in again (401), refresh (404), or retry (5xx / network).
 */
export function describeActionFailure(verb: string, input: ActionFailureInput): string {
  const { status } = input;

  if (status === null) {
    return `Couldn't ${verb} — no connection to the server. Check your internet and try again.`;
  }
  if (status === 429) {
    const secs = Number.parseInt(input.retryAfter ?? "", 10);
    const wait = Number.isFinite(secs) && secs > 0 ? `about ${secs}s` : "a moment";
    return `Too many at once — nothing was ${verb === "send" ? "sent" : "changed"}. Wait ${wait} and try again.`;
  }
  if (status === 401) return `Your session expired — sign in again, then retry.`;
  if (status === 403) return `You don't have access to this conversation.`;
  if (status === 404) return `This draft no longer exists — it may have been handled on another device.`;

  const server = extractServerMessage(input.bodyText);
  if (status >= 500) {
    return `Couldn't ${verb} — the server hit an error${server ? ` (${server})` : ""}. Nothing went out; try again.`;
  }
  return `Couldn't ${verb}${server ? `: ${server}` : ` (error ${status})`}.`;
}

/**
 * fetch() wrapper for dashboard actions: resolves to `{ ok: true }` or
 * `{ ok: false, error }` with the sentence above — never throws, so a caller's
 * loading spinner can't get stuck on a network exception.
 */
export async function runDashboardAction(
  verb: string,
  url: string,
  init?: RequestInit,
  request: typeof fetch = fetch
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await request(url, init);
  } catch {
    return { ok: false, error: describeActionFailure(verb, { status: null }) };
  }
  if (res.ok) return { ok: true };

  const bodyText = await res.text().catch(() => "");
  return {
    ok: false,
    error: describeActionFailure(verb, {
      status: res.status,
      bodyText,
      retryAfter: res.headers.get("retry-after"),
    }),
  };
}
