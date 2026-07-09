import assert from "node:assert/strict";
import test from "node:test";

import { investigationClusterParts } from "../public/investigation-cluster.js";

test("builds an investigation cluster from PM dropdown diagnosis even without free-text fields", () => {
  const parts = investigationClusterParts({
    pmIssueLocation: "模型理解能力",
    pmResolutionType: "记录模型能力问题",
  });

  assert.equal(parts.location, "模型理解能力");
  assert.equal(parts.resolutionType, "记录模型能力问题");
  assert.equal(parts.phrase, "模型理解能力 记录模型能力问题");
});

test("uses specific issue as the investigation phrase when present", () => {
  const parts = investigationClusterParts({
    pmIssueLocation: "生图 Prompt",
    pmResolutionType: "修改生图 Prompt",
    pmSpecificIssue: "短发被 outfit 长发污染",
  });

  assert.equal(parts.phrase, "短发被 outfit 长发污染");
  assert.equal(parts.sampleNote, "短发被 outfit 长发污染");
});
