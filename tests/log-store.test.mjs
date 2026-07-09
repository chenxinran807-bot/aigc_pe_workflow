import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { appendLog, caseKey, deleteEvaluation, deleteExperiment, deleteTableWorkspace, loadEvaluations, loadExperiments, loadTableWorkspaces, readLogs, saveEvaluation, saveExperiment, saveNoteRecord, saveTableWorkspace } from "../src/log-store.mjs";

test("builds stable case keys from core image fields", () => {
  assert.equal(caseKey({
    user_image: "u",
    outfit_image: "o",
    ai_content: "a",
  }), "u|o|a");
});

test("stores notes and append-only prompt logs", async () => {
  const dir = join(tmpdir(), `tryon-log-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const prevDataDir = process.env.TRYON_DATA_DIR;
  process.env.TRYON_DATA_DIR = dir;
  try {
    const note = await saveNoteRecord({
      caseKey: "case-1",
      manualNote: "发型被污染",
      optimizationDirection: "强化 user 发型",
    });
    assert.equal(note.manualNote, "发型被污染");

    await appendLog({ type: "prompt_applied", caseKey: "case-1", changeSummary: "删除长发描述" });
    const logs = await readLogs();
    assert.equal(logs[0].type, "prompt_applied");
    assert.equal(logs[1].type, "note_saved");

    const raw = await readFile(join(dir, "prompt-change-log.jsonl"), "utf8");
    assert.match(raw, /prompt_applied/);
  } finally {
    if (prevDataDir === undefined) {
      delete process.env.TRYON_DATA_DIR;
    } else {
      process.env.TRYON_DATA_DIR = prevDataDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("stores independent experiment boards", async () => {
  const dir = join(tmpdir(), `tryon-experiment-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const prevDataDir = process.env.TRYON_DATA_DIR;
  process.env.TRYON_DATA_DIR = dir;
  try {
    const created = await saveExperiment({
      theme: "短发负向约束验证",
      headers: ["user_image", "outfit_image", "ai_content"],
      rows: [{ user_image: "u1", outfit_image: "o1", ai_content: "" }],
    });
    assert.equal(created.theme, "短发负向约束验证");

    await saveExperiment({
      ...created,
      rows: [{ user_image: "u1", outfit_image: "o1", ai_content: "new-run" }],
    });

    const experiments = await loadExperiments();
    assert.equal(experiments.length, 1);
    assert.equal(experiments[0].rows[0].ai_content, "new-run");

    await deleteExperiment(created.id);
    assert.deepEqual(await loadExperiments(), []);
  } finally {
    if (prevDataDir === undefined) {
      delete process.env.TRYON_DATA_DIR;
    } else {
      process.env.TRYON_DATA_DIR = prevDataDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("stores independent imported table workspaces", async () => {
  const dir = join(tmpdir(), `tryon-table-workspace-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const prevDataDir = process.env.TRYON_DATA_DIR;
  process.env.TRYON_DATA_DIR = dir;
  try {
    const created = await saveTableWorkspace({
      title: "白底人像",
      path: "/tmp/white.csv",
      headers: ["user_image", "outfit_image", "ai_content"],
      rows: [{ user_image: "u1", outfit_image: "o1", ai_content: "a1" }],
    });
    assert.equal(created.title, "白底人像");

    await saveTableWorkspace({
      title: "非白底人像",
      path: "/tmp/non-white.csv",
      headers: ["user_image", "outfit_image", "ai_content"],
      rows: [{ user_image: "u2", outfit_image: "o2", ai_content: "a2" }],
    });

    const workspaces = await loadTableWorkspaces();
    assert.equal(workspaces.length, 2);
    assert.equal(workspaces[0].rows[0].ai_content, "a1");

    await deleteTableWorkspace(created.id);
    assert.equal((await loadTableWorkspaces()).length, 1);
  } finally {
    if (prevDataDir === undefined) {
      delete process.env.TRYON_DATA_DIR;
    } else {
      process.env.TRYON_DATA_DIR = prevDataDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("stores independent evaluation rounds", async () => {
  const dir = join(tmpdir(), `tryon-evaluation-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const prevDataDir = process.env.TRYON_DATA_DIR;
  process.env.TRYON_DATA_DIR = dir;
  try {
    const created = await saveEvaluation({
      theme: "v5 prompt final evaluation",
      evaluationDate: "2026-05-08",
      totalSampleSize: 400,
      vlmPromptVersion: "vlm-v3",
      generationPromptVersion: "gen-v8",
      rows: [{ user_image: "u", "面部特征与妆造发型还原": "2" }],
      headers: ["user_image", "面部特征与妆造发型还原"],
      summary: { qualifiedRate: 0.8 },
    });
    assert.equal(created.theme, "v5 prompt final evaluation");
    assert.equal(created.totalSampleSize, 400);
    assert.equal(created.summary.qualifiedRate, 0.8);

    const evaluations = await loadEvaluations();
    assert.equal(evaluations.length, 1);
    assert.equal(evaluations[0].vlmPromptVersion, "vlm-v3");

    await deleteEvaluation(created.id);
    assert.deepEqual(await loadEvaluations(), []);
  } finally {
    if (prevDataDir === undefined) {
      delete process.env.TRYON_DATA_DIR;
    } else {
      process.env.TRYON_DATA_DIR = prevDataDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
