import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { loadCsv, saveCsv } from "../src/csv-store.mjs";

test("loads and saves CSV rows with quoted prompt newlines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tryon-csv-"));
  const path = join(dir, "cases.csv");
  const rows = [
    {
      user_image: "https://example.com/user.jpg",
      outfit_image: "https://example.com/outfit.jpg",
      ai_content: "https://example.com/original.png",
      coze_run_1_prompt: "line 1\nline 2, with comma\n\"quoted\"",
    },
  ];

  await saveCsv(path, rows, ["user_image", "outfit_image", "ai_content", "coze_run_1_prompt"]);
  const loaded = await loadCsv(path);

  assert.deepEqual(loaded.rows, rows);
  assert.deepEqual(loaded.headers, ["user_image", "outfit_image", "ai_content", "coze_run_1_prompt"]);

  const raw = await readFile(path, "utf8");
  assert.match(raw, /^user_image,outfit_image,ai_content,coze_run_1_prompt/);
  assert.match(raw, /"line 1\nline 2, with comma\n""quoted"""/);

  await rm(dir, { recursive: true, force: true });
});

test("upserts run columns without dropping existing columns", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tryon-csv-"));
  const path = join(dir, "cases.csv");

  await saveCsv(path, [{ user_image: "u", 备注: "keep" }], ["user_image", "备注"]);
  const loaded = await loadCsv(path);
  loaded.rows[0].coze_run_1_content = "https://example.com/new.png";
  await saveCsv(path, loaded.rows, [...loaded.headers, "coze_run_1_content"]);

  const saved = await loadCsv(path);
  assert.deepEqual(saved.headers, ["user_image", "备注", "coze_run_1_content"]);
  assert.equal(saved.rows[0].备注, "keep");
  assert.equal(saved.rows[0].coze_run_1_content, "https://example.com/new.png");

  await rm(dir, { recursive: true, force: true });
});

test("keeps duplicate assessment columns addressable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tryon-csv-"));
  const path = join(dir, "cases.csv");

  await saveCsv(path, [{
    "问题类型": "",
    "问题类型__dup2": "背景AI/穿帮",
    "归因备注": "",
    "归因备注__dup2": "模型原因",
  }], ["问题类型", "问题类型__dup2", "归因备注", "归因备注__dup2"]);

  const raw = await readFile(path, "utf8");
  assert.match(raw.split("\n")[0], /^问题类型,问题类型,归因备注,归因备注$/);

  const loaded = await loadCsv(path);
  assert.deepEqual(loaded.headers, ["问题类型", "问题类型__dup2", "归因备注", "归因备注__dup2"]);
  assert.equal(loaded.rows[0]["问题类型"], "");
  assert.equal(loaded.rows[0]["问题类型__dup2"], "背景AI/穿帮");
  assert.equal(loaded.rows[0]["归因备注__dup2"], "模型原因");

  await rm(dir, { recursive: true, force: true });
});
