import assert from "node:assert/strict";
import test from "node:test";

import { applyBatchRunResults, clearRunRecords, clearRunRecordsForRows, nextRunIndex, runIndexes } from "../public/run-results.js";

test("records failed batch run attempts as run error rows", () => {
  const rows = [{ user_image: "u", outfit_image: "o" }];

  applyBatchRunResults(rows, [{
    clientIndex: 0,
    results: [
      { timestamp: "t1", content: "https://ok.png", prompt: "p1", rawOutput: "raw1" },
      { timestamp: "t2", error: "test run panel unavailable" },
    ],
  }]);

  assert.deepEqual(runIndexes(rows[0]), [2, 1]);
  assert.equal(rows[0].coze_run_1_content, "https://ok.png");
  assert.equal(rows[0].coze_run_2_error, "test run panel unavailable");
  assert.equal(nextRunIndex(rows[0]), 3);
});

test("detects run indexes from error-only rows", () => {
  const row = { coze_run_4_error: "failed" };

  assert.deepEqual(runIndexes(row), [4]);
  assert.equal(nextRunIndex(row), 5);
});

test("clears rerun records without touching source case fields", () => {
  const row = {
    user_image: "u",
    outfit_image: "o",
    ai_content: "original",
    coze_run_1_content: "https://ok.png",
    coze_run_1_prompt: "prompt",
    coze_run_2_error: "failed",
  };

  const removed = clearRunRecords(row);

  assert.equal(removed, 3);
  assert.deepEqual(row, {
    user_image: "u",
    outfit_image: "o",
    ai_content: "original",
  });
  assert.deepEqual(runIndexes(row), []);
});

test("clears rerun records for multiple selected cases", () => {
  const rows = [
    { user_image: "u1", coze_run_1_content: "ok", coze_run_1_improvement: "改善" },
    { user_image: "u2", coze_run_2_error: "failed" },
    { user_image: "u3", coze_run_1_content: "keep" },
  ];

  const result = clearRunRecordsForRows(rows, [0, 1]);

  assert.deepEqual(result, { cases: 2, fields: 3 });
  assert.deepEqual(rows, [
    { user_image: "u1" },
    { user_image: "u2" },
    { user_image: "u3", coze_run_1_content: "keep" },
  ]);
});
