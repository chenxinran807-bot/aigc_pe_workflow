import assert from "node:assert/strict";
import test from "node:test";

import { applyImageUrlOverrides, buildAdHocRunCase, buildAdHocRunGroup, shouldReplaceAdHocImageValue } from "../public/case-inputs.js";

test("applies image URL overrides to selected cases only", () => {
  const rows = [
    { user_image: "u1", outfit_image: "o1" },
    { user_image: "u2", outfit_image: "o2" },
  ];

  const changed = applyImageUrlOverrides(rows, [1], { user_image: "new-user", outfit_image: "" });

  assert.deepEqual(changed, [1]);
  assert.deepEqual(rows, [
    { user_image: "u1", outfit_image: "o1" },
    { user_image: "new-user", outfit_image: "o2" },
  ]);
});

test("ignores blank image URL overrides", () => {
  const rows = [{ user_image: "u1", outfit_image: "o1" }];

  const changed = applyImageUrlOverrides(rows, [0], { user_image: "  ", outfit_image: "" });

  assert.deepEqual(changed, []);
  assert.deepEqual(rows[0], { user_image: "u1", outfit_image: "o1" });
});

test("builds an ad-hoc Coze run case from image URLs and current prompts", () => {
  const result = buildAdHocRunCase({
    user_image: " https://example.com/user.png ",
    outfit_image: " https://example.com/outfit.png ",
    promptsUsed: { promptCode: "return prompt;" },
  });

  assert.deepEqual(result, {
    clientIndex: 0,
    user_image: "https://example.com/user.png",
    outfit_image: "https://example.com/outfit.png",
    promptsUsed: { promptCode: "return prompt;" },
    log: {
      caseId: "临时图片复跑",
      rowIndex: 0,
      user_image: "https://example.com/user.png",
      outfit_image: "https://example.com/outfit.png",
      promptsUsed: { promptCode: "return prompt;" },
      notes: {},
    },
  });
});

test("rejects ad-hoc Coze run cases without both image URLs", () => {
  assert.throws(
    () => buildAdHocRunCase({ user_image: "https://example.com/user.png", outfit_image: "" }),
    /请填写新的 user_image 和 outfit_image URL/,
  );
});

test("builds visible ad-hoc run groups for pending and failed runs", () => {
  const pending = buildAdHocRunGroup({
    user_image: "u",
    outfit_image: "o",
    count: 2,
    status: "running",
  });

  assert.equal(pending.status, "running");
  assert.equal(pending.results.length, 2);
  assert.equal(pending.results[0].pending, true);

  const failed = buildAdHocRunGroup({
    user_image: "u",
    outfit_image: "o",
    count: 2,
    status: "failed",
    error: "Coze panel unavailable",
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.results.length, 2);
  assert.equal(failed.results[0].error, "Coze panel unavailable");
});

test("replaces ad-hoc image input only when blank, forced, or previously auto-filled", () => {
  assert.equal(shouldReplaceAdHocImageValue({ currentValue: "", previousAutoValue: "old" }), true);
  assert.equal(shouldReplaceAdHocImageValue({ currentValue: "old", previousAutoValue: "old" }), true);
  assert.equal(shouldReplaceAdHocImageValue({ currentValue: "manual", previousAutoValue: "old" }), false);
  assert.equal(shouldReplaceAdHocImageValue({ currentValue: "manual", previousAutoValue: "old", force: true }), true);
});
