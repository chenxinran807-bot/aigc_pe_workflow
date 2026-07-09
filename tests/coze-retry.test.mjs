import assert from "node:assert/strict";
import test from "node:test";

import { isTransientCozeRunError, runWithTransientRetry } from "../src/coze-retry.mjs";
import { cozeWorkflowConcurrency } from "../src/rerun-scheduler.mjs";

test("recognizes Coze test-run panel failures as transient", () => {
  assert.equal(isTransientCozeRunError(new Error("test run panel unavailable")), true);
  assert.equal(isTransientCozeRunError(new Error("Coze 工作流内嵌页不可用，可能需要刷新或重新登录。")), true);
  assert.equal(isTransientCozeRunError(new Error("input fill failed")), false);
});

test("retries transient Coze run failures once", async () => {
  let calls = 0;
  const result = await runWithTransientRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error("test run panel unavailable");
    return "ok";
  }, { attempts: 2 });

  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("caps Coze workflow concurrency to a stable default", () => {
  assert.equal(cozeWorkflowConcurrency({ requested: 10, casesCount: 6, runCount: 4 }), 4);
  assert.equal(cozeWorkflowConcurrency({ requested: 10, casesCount: 2, runCount: 1 }), 2);
});

