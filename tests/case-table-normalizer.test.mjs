import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCaseTable } from "../src/case-table-normalizer.mjs";

test("normalizes uploaded case table aliases and extracts output JSON evidence", () => {
  const table = normalizeCaseTable({
    headers: ["user_image_url", "outfit_image_url", "ai_content_url", "输出列JSON"],
    rows: [{
      user_image_url: "https://example.com/user.jpg",
      outfit_image_url: "https://example.com/outfit.jpg",
      ai_content_url: "",
      输出列JSON: JSON.stringify({
        content: "https://example.com/content.png",
        prompt: "原始提示词",
        vlm_result: {
          user_vlm: { Hair_Style: "短发" },
          outfit_vlm: { Neg_Hair_Feature: "长发" },
        },
      }),
    }],
  });

  assert.deepEqual(table.headers.slice(0, 7), ["user_image", "outfit_image", "ai_content", "输出", "prompt", "user_vlm", "outfit_vlm"]);
  assert.equal(table.rows[0].user_image, "https://example.com/user.jpg");
  assert.equal(table.rows[0].outfit_image, "https://example.com/outfit.jpg");
  assert.equal(table.rows[0].ai_content, "https://example.com/content.png");
  assert.equal(table.rows[0].prompt, "原始提示词");
  assert.match(table.rows[0].user_vlm, /短发/);
  assert.match(table.rows[0].outfit_vlm, /长发/);
});

test("maps evaluation res_url column to original ai_content", () => {
  const table = normalizeCaseTable({
    headers: ["user_image", "outfit_image", "res_url"],
    rows: [{
      user_image: "https://example.com/user.jpg",
      outfit_image: "https://example.com/outfit.jpg",
      res_url: "https://example.com/generated.png",
    }],
  });

  assert.equal(table.rows[0].ai_content, "https://example.com/generated.png");
});
