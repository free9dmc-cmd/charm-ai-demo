/**
 * tests/action-error.test.ts — a failed "Approve & send" must never look like success.
 *
 * The inbox used to ignore the approve route's response entirely, so a 429
 * (20/min ceiling), 403 or Twilio 500 left the draft unsent with no sign of it.
 * These pin the wording helper and the fetch wrapper the inbox now relies on.
 *
 * Run with `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { describeActionFailure, extractServerMessage, runDashboardAction } from "../lib/action-error";

test("429 says nothing was sent and how long to wait", () => {
  const msg = describeActionFailure("send", { status: 429, retryAfter: "42" });
  assert.match(msg, /nothing was sent/);
  assert.match(msg, /42s/);
});

test("429 without a usable Retry-After still gives an instruction", () => {
  assert.match(describeActionFailure("send", { status: 429, retryAfter: "soon" }), /a moment/);
  assert.match(describeActionFailure("discard", { status: 429 }), /nothing was changed/);
});

test("network failure is distinguished from a server error", () => {
  assert.match(describeActionFailure("send", { status: null }), /no connection/);
});

test("5xx says nothing went out and surfaces a short server reason", () => {
  const msg = describeActionFailure("send", { status: 500, bodyText: '{"error":"Twilio 21610"}' });
  assert.match(msg, /Nothing went out/);
  assert.match(msg, /Twilio 21610/);
});

test("auth / ownership / gone each get their own instruction", () => {
  assert.match(describeActionFailure("send", { status: 401 }), /sign in again/);
  assert.match(describeActionFailure("send", { status: 403 }), /access/);
  assert.match(describeActionFailure("send", { status: 404 }), /no longer exists/);
});

test("other 4xx shows the route's plain-text message", () => {
  const msg = describeActionFailure("send", { status: 400, bodyText: "Only assistant drafts can be approved" });
  assert.equal(msg, "Couldn't send: Only assistant drafts can be approved.");
});

test("extractServerMessage never shows HTML, broken JSON, or walls of text", () => {
  assert.equal(extractServerMessage("<!DOCTYPE html><html>500</html>"), null);
  assert.equal(extractServerMessage("{not json"), null);
  assert.equal(extractServerMessage("x".repeat(500)), null);
  assert.equal(extractServerMessage(""), null);
  assert.equal(extractServerMessage('{"message":"hi"}'), "hi");
});

// --- runDashboardAction: stub global fetch ---------------------------------

// `fetch` is declared as a global function, so assign through a widened view.
const g = globalThis as unknown as { fetch: typeof fetch };

function withFetch(impl: typeof fetch, fn: () => Promise<void>) {
  const original = g.fetch;
  g.fetch = impl;
  return fn().finally(() => {
    g.fetch = original;
  });
}

test("runDashboardAction resolves ok on 2xx", async () => {
  await withFetch(async () => new Response('{"ok":true}', { status: 200 }), async () => {
    assert.deepEqual(await runDashboardAction("send", "/x"), { ok: true });
  });
});

test("runDashboardAction reports a 429 instead of pretending it worked", async () => {
  await withFetch(
    async () => new Response('{"error":"Too many requests"}', { status: 429, headers: { "Retry-After": "12" } }),
    async () => {
      const r = await runDashboardAction("send", "/x");
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /12s/);
    }
  );
});

test("runDashboardAction never throws on a network error", async () => {
  await withFetch(async () => { throw new TypeError("Failed to fetch"); }, async () => {
    const r = await runDashboardAction("discard", "/x");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /no connection/);
  });
});
