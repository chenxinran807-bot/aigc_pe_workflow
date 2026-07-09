import assert from "node:assert/strict";
import test from "node:test";

import { judgeBatch, judgeCase } from "../src/local-judge.mjs";

test("classifies prompt-fixable hair contamination from prompt and VLM evidence", () => {
  const result = judgeCase({
    caseId: "case-1",
    judgeMode: "复跑改善判断",
    problemType: "肤色/妆容/发型严重崩坏",
    attributionNote: "短发变成长发",
    originalPrompt: "保留 user 短发，打压 outfit 长发",
    runPrompt: "强约束保留 user 短发，禁止长发污染",
    userVlm: "用户图：黑色短发，自然妆容",
    outfitVlm: "穿搭图：模特为长发",
    originalContent: "https://example.com/original.png",
    newContent: "https://example.com/new.png",
  });

  assert.equal(result.caseId, "case-1");
  assert.equal(result.category, "identity_hair_makeup");
  assert.equal(result.rootCause, "模型生成能力问题");
  assert.equal(result.promptFixability, "medium");
  assert.match(result.recommendation, /发型/);
  assert.ok(result.evidence.some((item) => item.includes("短发")));
});

test("marks missing rerun content as engineering pipeline issue", () => {
  const result = judgeCase({
    problemType: "主体严重的多指/手指融合畸形",
    attributionNote: "模型原因，多手",
    originalContent: "https://example.com/original.png",
    newContent: "",
  });

  assert.equal(result.status, "needs_rerun");
  assert.equal(result.rootCause, "工程链路问题");
  assert.match(result.recommendation, /复跑/);
});

test("aggregates batch judge results into prioritized optimization themes", () => {
  const report = judgeBatch([
    {
      caseId: "a",
      problemType: "主体严重的多指/手指融合畸形",
      attributionNote: "模型原因，多手",
      originalContent: "https://example.com/a.png",
      newContent: "https://example.com/a2.png",
    },
    {
      caseId: "b",
      problemType: "服装特征保留度差",
      attributionNote: "裙摆颜色错误",
      originalPrompt: "复刻蓝色裙摆",
      runPrompt: "保持蓝色裙摆",
      originalContent: "https://example.com/b.png",
      newContent: "https://example.com/b2.png",
    },
    {
      caseId: "c",
      problemType: "肤色/妆容/发型严重崩坏",
      attributionNote: "短发变成长发",
      userVlm: "短发",
      outfitVlm: "长发",
      originalContent: "https://example.com/c.png",
      newContent: "https://example.com/c2.png",
    },
  ]);

  assert.equal(report.total, 3);
  assert.equal(report.results.length, 3);
  assert.ok(report.themes.find((theme) => theme.category === "pose_limb"));
  assert.ok(report.themes.find((theme) => theme.category === "clothing"));
  assert.match(report.nextActions.join("\n"), /手部|服装|发型/);
});
