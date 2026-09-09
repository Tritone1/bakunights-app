import assert from "node:assert/strict";
import test from "node:test";
import { rescheduleDealWindow } from "../src/lib/deal-schedule.js";

const dinnerStart = new Date("2026-09-08T15:00:00.000Z"); // 19:00 in Baku
const dinnerEnd = new Date("2026-09-08T20:00:00.000Z"); // 00:00 in Baku

test("keeps dinner hours when repeated before today's window", () => {
  const result = rescheduleDealWindow(dinnerStart, dinnerEnd, new Date("2026-09-09T09:58:00.000Z")); // 13:58 in Baku

  assert.equal(result.startsAt.toISOString(), "2026-09-09T15:00:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-09-09T20:00:00.000Z");
});

test("uses today's full original window when repeated during it", () => {
  const result = rescheduleDealWindow(dinnerStart, dinnerEnd, new Date("2026-09-09T15:30:00.000Z")); // 19:30 in Baku

  assert.equal(result.startsAt.toISOString(), "2026-09-09T15:00:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-09-09T20:00:00.000Z");
});

test("moves an already-finished daytime window to tomorrow", () => {
  const lunchStart = new Date("2026-09-08T08:00:00.000Z"); // 12:00 in Baku
  const lunchEnd = new Date("2026-09-08T12:00:00.000Z"); // 16:00 in Baku
  const result = rescheduleDealWindow(lunchStart, lunchEnd, new Date("2026-09-09T16:00:00.000Z")); // 20:00 in Baku

  assert.equal(result.startsAt.toISOString(), "2026-09-10T08:00:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-09-10T12:00:00.000Z");
});
