import assert from "node:assert/strict";
import test from "node:test";

import { latestImprovementStatus, matchesImprovementFilter } from "../public/run-status.js";

test("finds latest run improvement and treats unmarked latest run as pending", () => {
  const row = {
    coze_run_1_content: "old",
    coze_run_1_improvement: "改善",
    coze_run_2_content: "new",
  };

  assert.equal(latestImprovementStatus(row), "待确认");
  assert.equal(matchesImprovementFilter(row, "待确认"), true);
  assert.equal(matchesImprovementFilter(row, "needs-review"), true);
});

test("filters not improved cases for quick review", () => {
  const row = {
    coze_run_3_error: "failed",
    coze_run_3_improvement: "未改善",
  };

  assert.equal(matchesImprovementFilter(row, "未改善"), true);
  assert.equal(matchesImprovementFilter(row, "needs-review"), true);
  assert.equal(matchesImprovementFilter(row, "改善"), false);
});
