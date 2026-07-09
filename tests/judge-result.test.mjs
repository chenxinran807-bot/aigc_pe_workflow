import assert from "node:assert/strict";
import test from "node:test";

import { extractJudgeResult } from "../src/judge-result.mjs";
import { buildJudgeWorkflowInputs, runJudge } from "../src/judge-automation.mjs";

test("extracts judge_result JSON from Coze output text", () => {
  const result = extractJudgeResult({
    timestamp: "t",
    text: [
      "运行结果",
      "输出变量",
      'judge_result : "{\\"improved\\":\\"部分改善\\",\\"suggestion\\":\\"加强短发保留\\",\\"confidence\\":0.72}"',
      "预览",
    ].join("\n"),
  });

  assert.equal(result.timestamp, "t");
  assert.equal(result.raw, '{"improved":"部分改善","suggestion":"加强短发保留","confidence":0.72}');
  assert.deepEqual(result.parsed, {
    improved: "部分改善",
    suggestion: "加强短发保留",
    confidence: 0.72,
  });
});

test("extracts judge_json from new Coze judge workflow output", () => {
  const result = extractJudgeResult({
    timestamp: "t",
    text: [
      "运行结果",
      "输出变量",
      'judge_json : "{\\"generated_type\\":\\"run_1\\",\\"overall_score\\":2,\\"root_cause\\":\\"无明显问题\\"}"',
      "error_msg : \"\"",
      "试运行",
    ].join("\n"),
  });

  assert.equal(result.parsed.generated_type, "run_1");
  assert.equal(result.parsed.overall_score, 2);
});

test("falls back to raw output when judge_result field is absent", () => {
  const result = extractJudgeResult({
    timestamp: "t",
    text: "运行结果\n输出变量\n{\"improved\":\"未改善\"}",
  });

  assert.equal(result.parsed.improved, "未改善");
});

test("builds new Coze multimodal judge workflow inputs", () => {
  const inputs = buildJudgeWorkflowInputs({
    user_image: "https://example.com/user.png",
    outfit_image: "https://example.com/outfit.png",
    generated_image: "https://example.com/new.png",
    generated_type: "run_1",
    original_prompt: "保留短发，打压长发",
    run_prompt: "更强约束短发",
    user_vlm: "user 是短发",
    outfit_vlm: "outfit 是长发",
    judge_mode: "原始 case 校准",
    judge_target: "原始 case",
    judge_expectation: "判断是否命中人工问题",
    judge_request_id: "judge-test-1",
  });

  assert.equal(inputs.user_image, "https://example.com/user.png");
  assert.equal(inputs.outfit_image, "https://example.com/outfit.png");
  assert.equal(inputs.generated_image, "https://example.com/new.png");
  assert.equal(inputs.generated_type, "run_1");
  assert.match(inputs.prompt, /更强约束短发/);
  assert.match(inputs.user_vlm, /user 是短发/);
  assert.match(inputs.outfit_vlm, /outfit 是长发/);
  assert.equal(Object.keys(inputs).length, 7);
});

test("converts Coze missing-info judge output into a fallback result", async () => {
  const result = await runJudge({
    judge_mode: "原始 case 校准",
    problem_type: "主体严重的多指/手指融合畸形",
    attribution_note: "模型原因，多手",
    original_content: "https://example.com/original.png",
    new_content: "https://example.com/original.png",
  }, {
    runner: async ({ inputs }) => ({
      ok: true,
      scrape: {
        text: [
          "运行结果",
          "输出变量",
          'judge_result : "{\\"improved\\":\\"无法判断\\",\\"suggestion\\":\\"请提供完整的user_image、outfit_image等信息\\",\\"confidence\\":0}"',
          "试运行",
        ].join("\\n"),
      },
      inputs,
    }),
  });

  assert.equal(result.cozeJudgeFailed, true);
  assert.equal(result.parsed.improved, "原始case命中");
  assert.match(result.parsed.suggestion, /人工标注/);
});
