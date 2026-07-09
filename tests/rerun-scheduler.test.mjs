import assert from "node:assert/strict";
import test from "node:test";

import { runWithConcurrency } from "../src/rerun-scheduler.mjs";

test("runs tasks up to the configured concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const started = [];
  const tasks = Array.from({ length: 5 }, (_, index) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    started.push(index);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return `done-${index}`;
  });

  const results = await runWithConcurrency(tasks, 2);

  assert.equal(maxActive, 2);
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  assert.deepEqual(results, ["done-0", "done-1", "done-2", "done-3", "done-4"]);
});

test("preserves result positions when a task fails", async () => {
  const results = await runWithConcurrency([
    async () => "ok-0",
    async () => {
      throw new Error("boom");
    },
    async () => "ok-2",
  ], 3);

  assert.equal(results[0], "ok-0");
  assert.equal(results[2], "ok-2");
  assert.equal(results[1].error, "boom");
});
