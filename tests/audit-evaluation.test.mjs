import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalIssueLabel,
  evaluateAuditResults,
  isMissingImagePrediction,
} from "../src/audit-evaluation.mjs";

test("reports missed labels and keeps extras separate from official errors", () => {
  const cases = [{
    caseId: "case-1",
    dimensions: {
      face: { issues: [] },
      pose: { issues: [] },
      clothing: { issues: ["图案/logo轻微变形模糊", "材质/光影变化"] },
      scene: { issues: [] },
    },
  }];
  const predictions = [{
    caseId: "case-1",
    parsed: {
      face: { issues: [] },
      pose: { issues: ["手部轻微异常"], evidence: "右手边缘异常" },
      clothing: { issues: ["材质/光影变化"], evidence: "面料反光不同" },
      scene: { issues: [] },
    },
  }];
  const report = evaluateAuditResults(cases, predictions);
  assert.equal(report.summary.issueRecall, 0.5);
  assert.equal(report.badcases.length, 1);
  assert.equal(report.badcases[0].label, "pattern_logo_distortion");
  assert.equal(report.unverifiedExtraFindings.length, 1);
  assert.equal(report.unverifiedExtraFindings[0].label, "hand_finger_defect");
});

test("matches free-form model findings to dimension-specific canonical labels", () => {
  assert.equal(canonicalIssueLabel("pose", "手指数量异常"), "hand_finger_defect");
  assert.equal(canonicalIssueLabel("pose", "主体手指/关节有轻微瑕疵"), "hand_finger_defect");
  assert.equal(canonicalIssueLabel("face", "发型特征不符"), "hairstyle_change");
  assert.equal(canonicalIssueLabel("clothing", "上衣图案错误"), "pattern_logo_distortion");
  assert.equal(canonicalIssueLabel("scene", "背景颜色偏差"), "background_change");
});

test("separates missing-image responses from visual model errors", () => {
  const parsed = {
    face: { issues: ["未获取用户图与生成图的人脸信息"] },
    pose: { issues: [] },
    clothing: { issues: [] },
    scene: { issues: [] },
  };
  assert.equal(isMissingImagePrediction(parsed), true);
  const report = evaluateAuditResults([{
    caseId: "missing",
    dimensions: {
      face: { issues: [] }, pose: { issues: [] }, clothing: { issues: [] }, scene: { issues: [] },
    },
  }], [{ caseId: "missing", parsed }]);
  assert.equal(report.summary.inputFailures, 1);
  assert.equal(report.summary.evaluatedCases, 0);
});
