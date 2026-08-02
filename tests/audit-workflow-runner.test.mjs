import test from "node:test";
import assert from "node:assert/strict";

import { extractAuditResult, hasMissingImageResult, runAuditCase } from "../src/audit-workflow-runner.mjs";

test("extracts nested audit_result JSON from Coze text", () => {
  const payload = JSON.stringify({ clothing: { score: 1, issues: ["logo模糊"] } });
  const quoted = JSON.stringify(payload);
  const result = extractAuditResult({ text: `运行结果\naudit_result : ${quoted}` });
  assert.equal(result.parsed.clothing.score, 1);
});

test("sends the three image roles without human labels", async () => {
  let received;
  const runner = async (request) => {
    received = request;
    const payload = JSON.stringify({ face: { issues: [] } });
    return { ok: true, scrape: { text: `audit_result : ${JSON.stringify(payload)}` } };
  };
  const result = await runAuditCase({
    caseId: "c1",
    images: { user: "u", outfit: "o", generated: "g" },
    dimensions: { clothing: { issues: ["human-secret"] } },
  }, { runner, reuseOpenPage: false });
  assert.deepEqual(received.inputs, {
    generated_image: "g",
    outfit_image: "o",
    user_image: "u",
  });
  assert.equal(JSON.stringify(received).includes("human-secret"), false);
  assert.equal(result.ok, true);
  assert.equal(received.inputSettleMs, 3500);
});

test("retries once when Coze accepts URLs before images are available", async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    const payload = calls === 1
      ? { face: { issues: ["输入缺失"] } }
      : { face: { issues: ["发型发生轻微改变"] } };
    return { ok: true, scrape: { text: `audit_result : ${JSON.stringify(JSON.stringify(payload))}` } };
  };
  const result = await runAuditCase({
    caseId: "c2",
    images: { user: "u", outfit: "o", generated: "g" },
  }, { runner });
  assert.equal(calls, 2);
  assert.equal(result.inputWarmRetry, true);
  assert.deepEqual(result.parsed.face.issues, ["发型发生轻微改变"]);
});

test("recognizes only explicit missing-input results", () => {
  assert.equal(hasMissingImageResult({ face: { issues: ["输入缺失"] } }), true);
  assert.equal(hasMissingImageResult({ face: { issues: ["未获取用户图相关信息"] } }), true);
  assert.equal(hasMissingImageResult({ face: { issues: ["发型发生轻微改变"] } }), false);
});
