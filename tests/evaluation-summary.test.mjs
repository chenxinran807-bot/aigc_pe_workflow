import assert from "node:assert/strict";
import test from "node:test";

import { buildEvaluationClusters, buildEvaluationSummary } from "../public/evaluation-summary.js";

test("computes overall qualified and perfect rates from four dimensions", () => {
  const rows = [
    row([2, 2, 2, 2]),
    row([1, 2, 2, 2]),
    row([0, 2, 2, 2], "发型污染"),
  ];

  const summary = buildEvaluationSummary(rows);

  assert.equal(summary.scored, 3);
  assert.equal(summary.qualified, 2);
  assert.equal(summary.perfect, 1);
  assert.equal(summary.dimensions[0].pass, 2);
  assert.equal(summary.dimensions[0].perfect, 1);
});

test("clusters fail and imperfect attribution cases", () => {
  const rows = [
    row([0, 2, 2, 2], "发型污染"),
    row([1, 2, 2, 2], "头肩比例"),
  ];

  assert.equal(buildEvaluationClusters(rows, "fail")[0].title, "面部/妆造/发型 · 发型污染");
  assert.deepEqual(buildEvaluationClusters(rows, "imperfect").map((item) => item.sampleNote), ["发型污染", "头肩比例"]);
});

function row(scores, faceAttribution = "") {
  return {
    "面部特征与妆造发型还原": scores[0],
    "问题类型": faceAttribution,
    "归因": faceAttribution,
    "归因备注": faceAttribution,
    "姿势微调与肢体自然度": scores[1],
    "服装特征保留度": scores[2],
    "场景氛围与背景幻觉": scores[3],
  };
}
