import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExtraFindingReviewInput,
  findingIdFor,
  summarizeReview,
  validateReviewRecord,
} from "../src/extra-finding-review.mjs";

const caseOne = {
  caseId: "case-1",
  images: { user: "u1", outfit: "o1", generated: "g1" },
  dimensions: {
    face: { issues: [] },
    pose: { issues: ["手指异常"] },
    clothing: { issues: [] },
    scene: { issues: [] },
  },
};

test("finding id is stable for normalized finding content", () => {
  const first = findingIdFor({ caseId: "case-1", dimension: "clothing", label: " Logo 变形 ", evidence: "领口 左侧" });
  const second = findingIdFor({ caseId: "case-1", dimension: "clothing", label: "logo变形", evidence: "领口左侧" });
  assert.equal(first, second);
});

test("review input includes train cases only", () => {
  const input = buildExtraFindingReviewInput({
    trainCases: [caseOne],
    extras: [
      { caseId: "case-1", dimension: "clothing", label: "领口变形", evidence: "领口不同" },
      { caseId: "validation-case", dimension: "face", label: "发型变化", evidence: "发型不同" },
    ],
    model: "doubao-1.6-vision-250815",
    promptVersion: "baseline",
  });
  assert.equal(input.cases.length, 1);
  assert.equal(input.cases[0].caseId, "case-1");
  assert.equal(input.cases[0].extraFindings.length, 1);
  assert.deepEqual(input.cases[0].humanIssues.pose, ["手指异常"]);
});

test("verdict validation rejects unknown values", () => {
  assert.throws(() => validateReviewRecord({ caseId: "c", findingId: "f", verdict: "pass" }), /invalid verdict/);
  assert.equal(validateReviewRecord({ caseId: "c", findingId: "f", verdict: "uncertain", note: "看不清" }).verdict, "uncertain");
});

test("summary excludes unreviewed findings from rate denominators", () => {
  const summary = summarizeReview({ totalFindings: 4, records: [
    { verdict: "confirmed_issue", dimension: "pose", label: "hand" },
    { verdict: "false_positive", dimension: "pose", label: "hand" },
    { verdict: "uncertain", dimension: "scene", label: "background" },
  ] });
  assert.equal(summary.reviewed, 3);
  assert.equal(summary.pending, 1);
  assert.equal(summary.confirmedRate, 0.5);
  assert.equal(summary.falsePositiveRate, 0.5);
  assert.equal(summary.uncertainRate, 1 / 3);
});
