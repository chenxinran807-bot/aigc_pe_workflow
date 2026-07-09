import assert from "node:assert/strict";
import test from "node:test";

import { buildMultimodalJudgeRequest, judgeMultimodalBatch, parseJudgeModelOutput } from "../src/multimodal-judge.mjs";

test("builds an OpenAI-compatible multimodal judge request with four image URLs and text evidence", () => {
  const request = buildMultimodalJudgeRequest({
    caseId: "case-1",
    userImage: "https://example.com/user.png",
    outfitImage: "https://example.com/outfit.png",
    originalContent: "https://example.com/original.png",
    newContent: "https://example.com/new.png",
    problemType: "发型严重崩坏",
    attributionNote: "短发变成长发",
    originalPrompt: "保留短发",
    runPrompt: "强约束短发",
    userVlm: "用户是短发",
    outfitVlm: "模特是长发",
  }, { model: "vision-model" });

  assert.equal(request.model, "vision-model");
  const userContent = request.messages[1].content;
  assert.equal(userContent.filter((part) => part.type === "image_url").length, 4);
  assert.match(userContent[0].text, /发型严重崩坏/);
  assert.match(userContent[0].text, /强约束短发/);
});

test("parses JSON returned by a multimodal judge model", () => {
  const parsed = parseJudgeModelOutput("```json\n{\"improved\":\"明显改善\",\"confidence\":0.8,\"evidence\":[\"发型已恢复\"]}\n```");

  assert.equal(parsed.improved, "明显改善");
  assert.equal(parsed.confidence, 0.8);
  assert.deepEqual(parsed.evidence, ["发型已恢复"]);
});

test("runs a multimodal batch through an injected OpenAI-compatible fetcher", async () => {
  const calls = [];
  const report = await judgeMultimodalBatch([
    {
      caseId: "case-1",
      userImage: "https://example.com/user.png",
      outfitImage: "https://example.com/outfit.png",
      originalContent: "https://example.com/original.png",
      newContent: "https://example.com/new.png",
      problemType: "多指",
      attributionNote: "模型原因",
    },
  ], {
    apiKey: "key",
    baseUrl: "https://api.example.com/v1",
    model: "vision-model",
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: "{\"improved\":\"未改善\",\"root_cause\":\"模型生成能力问题\",\"confidence\":0.7,\"evidence\":[\"仍有多指\"]}",
              },
            }],
          };
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(report.results[0].improved, "未改善");
  assert.equal(report.results[0].source, "multimodal_model");
  assert.match(report.nextActions.join("\n"), /模型生成能力问题/);
});

test("reports configuration errors without calling the model", async () => {
  const report = await judgeMultimodalBatch([{ caseId: "case-1" }], {});

  assert.equal(report.ok, false);
  assert.match(report.error, /JUDGE_API_KEY/);
});
