import assert from "node:assert/strict";
import test from "node:test";

import { extractRunResult } from "../src/result-extract.mjs";

test("extracts content and prompt from Coze visible run text", () => {
  const scrape = {
    timestamp: "2026-04-29T03:25:52.615Z",
    images: ["https://example.com/fallback.png"],
    text: [
      "运行结果",
      "输出变量",
      'content : "https://example.com/generated.png"',
      'prompt : "\\n\\n【正向提示词】\\n保留短发\\n【负向提示词】\\n长发"',
      "预览",
      "vlm_result {2}",
      "试运行",
      "大模型",
    ].join("\n"),
  };

  const result = extractRunResult(scrape);

  assert.equal(result.timestamp, "2026-04-29T03:25:52.615Z");
  assert.equal(result.content, "https://example.com/generated.png");
  assert.equal(result.prompt, "\n\n【正向提示词】\n保留短发\n【负向提示词】\n长发");
  assert.match(result.rawOutput, /输出变量/);
});

test("falls back to latest image when content field is absent", () => {
  const result = extractRunResult({
    timestamp: "t",
    images: ["https://example.com/one.png", "https://example.com/two.png"],
    text: "运行结果\n输出变量\nerror_msg : \"empty\"",
  });

  assert.equal(result.content, "https://example.com/two.png");
  assert.equal(result.error, "empty");
});
