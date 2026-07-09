import assert from "node:assert/strict";
import test from "node:test";

import { buildTechReasonMap, normalizeTechReasonCategory } from "../src/tech-reason-import.mjs";

test("maps imported technical reasons by ai_content URL", () => {
  const rows = [
    { ai_content: " https://example.com/a.png ", "技术原因": "1.模型能力；2.prompt增加负向提示词-穿模" },
    { ai_content: "", "技术原因": "无效" },
  ];
  const map = buildTechReasonMap(rows);
  assert.equal(map.get("https://example.com/a.png")["技术原因"], "1.模型能力；2.prompt增加负向提示词-穿模");
  assert.equal(map.has(""), false);
});

test("normalizes technical reasons into prompt optimization clusters", () => {
  assert.equal(
    normalizeTechReasonCategory("1.模型能力；2.prompt增加负向提示词-穿模"),
    "Prompt + 模型能力 + 穿模/穿帮",
  );
});
