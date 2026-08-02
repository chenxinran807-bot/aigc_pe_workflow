import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkflowFiles } from "../src/coze-string-workflow.mjs";

test("normalizes only non-empty absolute local workflow files", () => {
  assert.deepEqual(normalizeWorkflowFiles({
    user_image: "/tmp/user.jpg",
    outfit_image: "",
    generated_image: "/tmp/generated.jpg",
  }), {
    user_image: "/tmp/user.jpg",
    generated_image: "/tmp/generated.jpg",
  });
  assert.throws(() => normalizeWorkflowFiles({ user_image: "relative.jpg" }), /absolute/);
});
