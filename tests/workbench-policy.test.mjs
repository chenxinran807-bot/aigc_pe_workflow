import assert from "node:assert/strict";
import test from "node:test";

import { apiPath, deploymentPrefix, shouldAutoLoadCsvPath } from "../public/workbench-policy.js";

test("does not auto-load remembered local table paths on deployed domains", () => {
  assert.equal(shouldAutoLoadCsvPath("AI试穿线下评测集v4.0-0420副本.csv", "5241-demo.bytedance.net"), false);
});

test("allows local auto-restore on localhost only", () => {
  assert.equal(shouldAutoLoadCsvPath("/Users/bytedance/cases.csv", "127.0.0.1"), true);
  assert.equal(shouldAutoLoadCsvPath("/Users/bytedance/cases.csv", "localhost"), true);
});

test("builds API paths that follow deployment prefixes", () => {
  assert.equal(deploymentPrefix("/landing"), "/landing");
  assert.equal(deploymentPrefix("/landing/index.html"), "/landing");
  assert.equal(deploymentPrefix("/"), "");
  assert.equal(apiPath("/api/experiments/list", "/landing"), "/landing/api/experiments/list");
  assert.equal(apiPath("/api/experiments/list", "/"), "/api/experiments/list");
});
