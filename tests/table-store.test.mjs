import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { loadTable, saveTable } from "../src/table-store.mjs";

const PYTHON = "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

test("loads and saves XLSX tables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tryon-xlsx-"));
  const path = join(dir, "cases.xlsx");
  spawnSync(PYTHON, ["-c", `
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.append(['user_image', 'outfit_image', 'ai_content'])
ws.append(['u', 'o', 'a'])
wb.save(r'''${path}''')
`], { stdio: "inherit" });

  const loaded = await loadTable(path);
  assert.deepEqual(loaded.headers, ["user_image", "outfit_image", "ai_content"]);
  assert.equal(loaded.rows[0].ai_content, "a");

  loaded.rows[0].coze_run_1_content = "new";
  await saveTable(path, loaded.rows, [...loaded.headers, "coze_run_1_content"]);
  const saved = await loadTable(path);
  assert.equal(saved.rows[0].coze_run_1_content, "new");

  await rm(dir, { recursive: true, force: true });
});

test("explains that Feishu online links need export or API credentials", async () => {
  await assert.rejects(
    () => loadTable("https://bytedance.larkoffice.com/wiki/example"),
    /飞书.*导出为 Excel\/CSV|飞书 API/,
  );
});
