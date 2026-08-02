import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAuditSheet, splitIssues } from "../src/audit-dataset.mjs";

test("normalizes a historical audit sheet into blind-test cases", () => {
  const sheet = {
    name: "DataPage",
    columns: [
      "id", "user_image", "outfit_image", "tryon_gen_image",
      "面部特征与妆造发型还原", "问题类型",
      "姿势微调与肢体自然度", "问题类型",
      "服装特征保留度", "问题类型",
      "场景氛围与背景幻觉", "问题类型",
    ],
    data: [[
      13, "user-url", "outfit-url", "generated-url",
      2, "", 2, "", 1, "图案/Logo轻微变形模糊,衣服材质/光影发生改变", 2, "",
    ]],
  };
  const result = normalizeAuditSheet(sheet, { sourceId: "test" });
  assert.equal(result.eligible, true);
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].images.user, "user-url");
  assert.deepEqual(result.cases[0].dimensions.clothing.issues, [
    "图案/logo轻微变形模糊",
    "材质/光影变化",
  ]);
});

test("splits and deduplicates issue labels", () => {
  assert.deepEqual(splitIssues("Logo模糊，Logo模糊；材质发生改变"), [
    "图案/logo变形模糊",
    "材质/光影变化",
  ]);
});
