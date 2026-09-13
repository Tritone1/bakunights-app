import assert from "node:assert/strict";
import test from "node:test";
import { bakuDate } from "../src/lib/baku-date.js";

test("uses the Baku calendar date before the UTC day changes", () => {
  assert.equal(bakuDate(new Date("2026-09-13T19:59:59.999Z")).toISOString(), "2026-09-13T00:00:00.000Z");
});

test("resets the daily spin date at midnight in Baku", () => {
  assert.equal(bakuDate(new Date("2026-09-13T20:00:00.000Z")).toISOString(), "2026-09-14T00:00:00.000Z");
});
