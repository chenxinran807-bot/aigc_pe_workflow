# AI 试穿额外发现审查工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个训练集专用的本地审查页，帮助人工核验当前 17 个模型额外发现，并把结论交给后续豆包 1.6 平衡型 Prompt 优化。

**Architecture:** 新增独立的数据组装模块、审查结果存储模块和轻量页面，不改动现有评测工作台主流程。脚本从训练分区、豆包 1.6 预测和评测报告生成运行时输入；服务端只提供读取输入、保存判定和读取汇总三个接口，所有包含内部图片 URL 的文件都保存在被 Git 忽略的 `work/` 下。

**Tech Stack:** Node.js 20+ ESM、原生 `node:test`、原生 HTTP 服务、原生浏览器 JavaScript、HTML/CSS。

---

## 主线边界

这个页面只是 Prompt 设计前的诊断工具，不是项目主产品。范围严格限制为：

1. 展示训练比较集中的三张图、人工标签和豆包 1.6 额外发现；
2. 保存 17 条发现的人工结论；
3. 导出确认率、误报率和不确定率；
4. 完成审查后立即回到 Prompt 优化、冻结验证集回归和单模型能力判断。

不增加用户体系、多人协作、飞书回写、Coze 发布、通用标注平台或验证/测试集浏览能力。

## 文件结构

- Create: `src/extra-finding-review.mjs` — 生成稳定 findingId、组装训练集审查输入、校验 verdict、计算汇总。
- Create: `src/extra-finding-review-store.mjs` — 原子读取和写入本地审查结果。
- Create: `scripts/build-extra-finding-review.mjs` — 从固定数据文件生成 `work/extra-finding-review-input.json`。
- Create: `tests/extra-finding-review.test.mjs` — 数据隔离、稳定 ID、校验和统计单元测试。
- Create: `tests/extra-finding-review-store.test.mjs` — 覆盖保存、覆盖和损坏文件处理。
- Create: `public/extra-review.html` — 独立审查页语义结构。
- Create: `public/extra-review.js` — 页面状态、筛选、判定、自动保存和大图交互。
- Create: `public/extra-review.css` — 三图聚焦布局和状态样式。
- Create: `public/extra-review-state.js` — 可独立测试的前端状态与统计纯函数。
- Create: `tests/extra-review-state.test.mjs` — 前端筛选、进度和完成规则测试。
- Modify: `server.mjs` — 增加三个审查 API，保留现有 API 行为。
- Modify: `package.json` — 增加审查输入构建命令。
- Modify: `.gitignore` — 明确忽略审查输入和人工结果。
- Modify: `AUDIT_EVALUATION.md` — 记录辅助审查到 Prompt 优化的操作顺序。

### Task 1: 审查领域模型与训练集隔离

**Files:**
- Create: `src/extra-finding-review.mjs`
- Create: `tests/extra-finding-review.test.mjs`

- [ ] **Step 1: 写稳定 ID 与训练集隔离的失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExtraFindingReviewInput,
  findingIdFor,
  summarizeReview,
  validateReviewRecord,
} from "../src/extra-finding-review.mjs";

const caseOne = {
  caseId: "case-1",
  images: { user: "u1", outfit: "o1", generated: "g1" },
  dimensions: {
    face: { issues: [] },
    pose: { issues: ["手指异常"] },
    clothing: { issues: [] },
    scene: { issues: [] },
  },
};

test("finding id is stable for normalized finding content", () => {
  const first = findingIdFor({ caseId: "case-1", dimension: "clothing", label: " Logo 变形 ", evidence: "领口 左侧" });
  const second = findingIdFor({ caseId: "case-1", dimension: "clothing", label: "logo变形", evidence: "领口左侧" });
  assert.equal(first, second);
});

test("review input includes train cases only", () => {
  const input = buildExtraFindingReviewInput({
    trainCases: [caseOne],
    extras: [
      { caseId: "case-1", dimension: "clothing", label: "领口变形", evidence: "领口不同" },
      { caseId: "validation-case", dimension: "face", label: "发型变化", evidence: "发型不同" },
    ],
    model: "doubao-1.6-vision-250815",
    promptVersion: "baseline",
  });
  assert.equal(input.cases.length, 1);
  assert.equal(input.cases[0].caseId, "case-1");
  assert.equal(input.cases[0].extraFindings.length, 1);
  assert.deepEqual(input.cases[0].humanIssues.pose, ["手指异常"]);
});

test("verdict validation rejects unknown values", () => {
  assert.throws(() => validateReviewRecord({ caseId: "c", findingId: "f", verdict: "pass" }), /invalid verdict/);
  assert.equal(validateReviewRecord({ caseId: "c", findingId: "f", verdict: "uncertain", note: "看不清" }).verdict, "uncertain");
});

test("summary excludes unreviewed findings from rate denominators", () => {
  const summary = summarizeReview({ totalFindings: 4, records: [
    { verdict: "confirmed_issue", dimension: "pose", label: "hand" },
    { verdict: "false_positive", dimension: "pose", label: "hand" },
    { verdict: "uncertain", dimension: "scene", label: "background" },
  ] });
  assert.equal(summary.reviewed, 3);
  assert.equal(summary.pending, 1);
  assert.equal(summary.confirmedRate, 0.5);
  assert.equal(summary.falsePositiveRate, 0.5);
  assert.equal(summary.uncertainRate, 1 / 3);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/extra-finding-review.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/extra-finding-review.mjs`.

- [ ] **Step 3: 实现最小领域模型**

```js
import { createHash } from "node:crypto";

const DIMENSIONS = ["face", "pose", "clothing", "scene"];
const VERDICTS = new Set(["confirmed_issue", "false_positive", "uncertain"]);

export function findingIdFor(finding) {
  const normalized = [finding.caseId, finding.dimension, finding.label, finding.evidence]
    .map((value) => String(value ?? "").toLowerCase().replace(/\s+/g, ""))
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export function buildExtraFindingReviewInput({ trainCases, extras, model, promptVersion }) {
  const extrasByCase = new Map();
  const trainIds = new Set(trainCases.map((item) => item.caseId));
  for (const finding of extras) {
    if (!trainIds.has(finding.caseId)) continue;
    const normalized = { ...finding, findingId: findingIdFor(finding) };
    const list = extrasByCase.get(finding.caseId) || [];
    list.push(normalized);
    extrasByCase.set(finding.caseId, list);
  }
  return {
    model,
    promptVersion,
    generatedAt: new Date().toISOString(),
    cases: trainCases.filter((item) => extrasByCase.has(item.caseId)).map((item) => ({
      caseId: item.caseId,
      images: item.images,
      humanIssues: Object.fromEntries(DIMENSIONS.map((key) => [key, item.dimensions?.[key]?.issues || []])),
      extraFindings: extrasByCase.get(item.caseId),
    })),
  };
}

export function validateReviewRecord(record) {
  if (!record?.caseId || !record?.findingId) throw new Error("caseId and findingId are required");
  if (!VERDICTS.has(record.verdict)) throw new Error("invalid verdict");
  return {
    caseId: String(record.caseId),
    findingId: String(record.findingId),
    verdict: record.verdict,
    note: String(record.note || "").trim(),
    reviewedAt: record.reviewedAt || new Date().toISOString(),
  };
}

export function summarizeReview({ totalFindings, records }) {
  const counts = { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
  const byDimension = {};
  const byLabel = {};
  for (const record of records) {
    counts[record.verdict] += 1;
    const dimension = record.dimension || "unknown";
    const label = record.label || "unknown";
    byDimension[dimension] ||= { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
    byLabel[label] ||= { confirmed_issue: 0, false_positive: 0, uncertain: 0 };
    byDimension[dimension][record.verdict] += 1;
    byLabel[label][record.verdict] += 1;
  }
  const reviewed = records.length;
  const decided = counts.confirmed_issue + counts.false_positive;
  return {
    totalFindings,
    reviewed,
    pending: Math.max(0, totalFindings - reviewed),
    ...counts,
    confirmedRate: decided ? counts.confirmed_issue / decided : null,
    falsePositiveRate: decided ? counts.false_positive / decided : null,
    uncertainRate: reviewed ? counts.uncertain / reviewed : null,
    byDimension,
    byLabel,
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/extra-finding-review.test.mjs`

Expected: 4 tests pass.

- [ ] **Step 5: 提交领域模型**

```bash
git add src/extra-finding-review.mjs tests/extra-finding-review.test.mjs
git commit -m "Add extra finding review domain model"
```

### Task 2: 生成训练集审查输入

**Files:**
- Create: `scripts/build-extra-finding-review.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `tests/extra-finding-review.test.mjs`

- [ ] **Step 1: 增加去重断言**

把 `review input includes train cases only` 测试的 `extras` 替换为以下内容，并保留长度断言：

```js
extras: [
  { caseId: "case-1", dimension: "clothing", label: "领口变形", evidence: "领口不同" },
  { caseId: "case-1", dimension: "clothing", label: "领口变形", evidence: "领口不同" },
  { caseId: "validation-case", dimension: "face", label: "发型变化", evidence: "发型不同" },
],
assert.equal(input.cases[0].extraFindings.length, 1);
```

- [ ] **Step 2: 运行测试并确认重复项导致失败**

Run: `node --test tests/extra-finding-review.test.mjs`

Expected: FAIL because two identical findings are returned.

- [ ] **Step 3: 在组装函数中按 findingId 去重**

将 `buildExtraFindingReviewInput` 中的追加逻辑改为：

```js
const list = extrasByCase.get(finding.caseId) || [];
if (!list.some((item) => item.findingId === normalized.findingId)) list.push(normalized);
extrasByCase.set(finding.caseId, list);
```

- [ ] **Step 4: 创建命令行构建脚本**

```js
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildExtraFindingReviewInput } from "../src/extra-finding-review.mjs";

const datasetPath = resolve(process.argv[2] || "work/audit-dataset.json");
const splitPath = resolve(process.argv[3] || "work/audit-split.json");
const reportPath = resolve(process.argv[4] || "work/fair-doubao-1.6-report.json");
const outputPath = resolve(process.argv[5] || "work/extra-finding-review-input.json");

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const split = JSON.parse(await readFile(splitPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const trainIds = new Set((split.partitions?.train || []).map((item) => typeof item === "string" ? item : item.caseId));
const trainCases = (dataset.cases || dataset).filter((item) => trainIds.has(item.caseId));
const input = buildExtraFindingReviewInput({
  trainCases,
  extras: report.unverifiedExtraFindings || [],
  model: report.model || "doubao-1.6-vision-250815",
  promptVersion: report.promptVersion || "baseline",
});

await writeFile(outputPath, `${JSON.stringify(input, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, output: outputPath, cases: input.cases.length, findings: input.cases.reduce((sum, item) => sum + item.extraFindings.length, 0) }));
```

- [ ] **Step 5: 增加命令和运行文件忽略规则**

在 `package.json` 的 scripts 中增加：

```json
"audit:build-review": "node scripts/build-extra-finding-review.mjs"
```

在 `.gitignore` 末尾增加：

```gitignore
work/extra-finding-review-input.json
work/extra-finding-review-results.json
work/extra-finding-review-results.json.tmp
```

- [ ] **Step 6: 验证单元测试和真实输入生成**

Run: `node --test tests/extra-finding-review.test.mjs`

Expected: 4 tests pass.

Run: `npm run audit:build-review -- work/audit-dataset.json work/audit-split.json work/fair-doubao-1.6-report.json work/extra-finding-review-input.json`

Expected: JSON output reports `findings: 17`; generated file contains train cases only and remains ignored by Git.

- [ ] **Step 7: 提交输入生成能力**

```bash
git add src/extra-finding-review.mjs tests/extra-finding-review.test.mjs scripts/build-extra-finding-review.mjs package.json .gitignore
git commit -m "Build training-only extra finding review input"
```

### Task 3: 审查结果原子存储与 API

**Files:**
- Create: `src/extra-finding-review-store.mjs`
- Create: `tests/extra-finding-review-store.test.mjs`
- Modify: `server.mjs`

- [ ] **Step 1: 写存储失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadReviewRecords, saveReviewRecord } from "../src/extra-finding-review-store.mjs";

test("saving the same finding replaces its previous verdict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "extra-review-"));
  const path = join(dir, "results.json");
  await saveReviewRecord(path, { caseId: "c1", findingId: "f1", verdict: "uncertain" });
  await saveReviewRecord(path, { caseId: "c1", findingId: "f1", verdict: "confirmed_issue", note: "确有问题" });
  const records = await loadReviewRecords(path);
  assert.equal(records.length, 1);
  assert.equal(records[0].verdict, "confirmed_issue");
  await assert.doesNotReject(async () => JSON.parse(await readFile(path, "utf8")));
});

test("corrupt result files are reported instead of silently reset", async () => {
  const dir = await mkdtemp(join(tmpdir(), "extra-review-"));
  const path = join(dir, "results.json");
  await writeFile(path, "not-json");
  await assert.rejects(() => loadReviewRecords(path), /cannot parse review results/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/extra-finding-review-store.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 实现原子存储**

```js
import { readFile, rename, writeFile } from "node:fs/promises";

import { validateReviewRecord } from "./extra-finding-review.mjs";

export async function loadReviewRecords(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`cannot parse review results: ${error.message}`);
  }
}

export async function saveReviewRecord(path, rawRecord) {
  const record = validateReviewRecord(rawRecord);
  const records = await loadReviewRecords(path);
  const key = `${record.caseId}:${record.findingId}`;
  const next = records.filter((item) => `${item.caseId}:${item.findingId}` !== key);
  next.push(record);
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, `${JSON.stringify({ records: next }, null, 2)}\n`);
  await rename(tempPath, path);
  return record;
}
```

- [ ] **Step 4: 运行存储测试并确认通过**

Run: `node --test tests/extra-finding-review-store.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: 在服务端增加固定本地路径和三个 API**

在 `server.mjs` 顶部增加：

```js
import { loadReviewRecords, saveReviewRecord } from "./src/extra-finding-review-store.mjs";
import { summarizeReview } from "./src/extra-finding-review.mjs";

const reviewInputPath = resolve(process.env.EXTRA_REVIEW_INPUT || join(__dirname, "work/extra-finding-review-input.json"));
const reviewResultsPath = resolve(process.env.EXTRA_REVIEW_RESULTS || join(__dirname, "work/extra-finding-review-results.json"));
```

在 `handleApi` 的 404 前增加：

```js
if (request.method === "GET" && pathname === "/api/extra-review/input") {
  const input = JSON.parse(await readFile(reviewInputPath, "utf8"));
  const records = await loadReviewRecords(reviewResultsPath);
  sendJson(response, 200, { ok: true, input, records });
  return;
}

if (request.method === "POST" && pathname === "/api/extra-review/save") {
  const body = await readJson(request);
  const record = await saveReviewRecord(reviewResultsPath, body.record);
  sendJson(response, 200, { ok: true, record });
  return;
}

if (request.method === "GET" && pathname === "/api/extra-review/summary") {
  const input = JSON.parse(await readFile(reviewInputPath, "utf8"));
  const findings = input.cases.flatMap((item) => item.extraFindings);
  const metadata = new Map(findings.map((item) => [item.findingId, item]));
  const records = (await loadReviewRecords(reviewResultsPath)).map((item) => ({ ...metadata.get(item.findingId), ...item }));
  sendJson(response, 200, { ok: true, summary: summarizeReview({ totalFindings: findings.length, records }) });
  return;
}
```

- [ ] **Step 6: 验证存储测试与全量回归**

Run: `npm test`

Expected: all existing tests and 6 new domain/store tests pass.

- [ ] **Step 7: 提交存储与 API**

```bash
git add src/extra-finding-review-store.mjs tests/extra-finding-review-store.test.mjs server.mjs
git commit -m "Persist extra finding review verdicts"
```

### Task 4: 可测试的页面状态逻辑

**Files:**
- Create: `public/extra-review-state.js`
- Create: `tests/extra-review-state.test.mjs`

- [ ] **Step 1: 写页面状态失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { caseCanComplete, filterCases, reviewProgress } from "../public/extra-review-state.js";

const cases = [
  { caseId: "c1", extraFindings: [{ findingId: "f1" }], imageErrors: [] },
  { caseId: "c2", extraFindings: [{ findingId: "f2" }], imageErrors: [] },
];

test("pending filter keeps cases with unreviewed findings", () => {
  assert.deepEqual(filterCases(cases, [{ findingId: "f1", verdict: "confirmed_issue" }], "pending").map((item) => item.caseId), ["c2"]);
});

test("case completion requires all verdicts and loaded images", () => {
  assert.equal(caseCanComplete(cases[0], [{ findingId: "f1", verdict: "false_positive" }]), true);
  assert.equal(caseCanComplete({ ...cases[0], imageErrors: ["generated"] }, [{ findingId: "f1", verdict: "false_positive" }]), false);
});

test("progress counts findings rather than cases", () => {
  assert.deepEqual(reviewProgress(cases, [{ findingId: "f1", verdict: "uncertain" }]), { reviewed: 1, total: 2, pending: 1 });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/extra-review-state.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 实现状态纯函数**

```js
export function reviewProgress(cases, records) {
  const reviewedIds = new Set(records.map((item) => item.findingId));
  const total = cases.reduce((sum, item) => sum + item.extraFindings.length, 0);
  const reviewed = [...new Set(cases.flatMap((item) => item.extraFindings.map((finding) => finding.findingId))
    .filter((id) => reviewedIds.has(id)))].length;
  return { reviewed, total, pending: total - reviewed };
}

export function filterCases(cases, records, filter) {
  const reviewedIds = new Set(records.map((item) => item.findingId));
  if (filter === "pending") return cases.filter((item) => item.extraFindings.some((finding) => !reviewedIds.has(finding.findingId)));
  if (filter === "reviewed") return cases.filter((item) => item.extraFindings.every((finding) => reviewedIds.has(finding.findingId)));
  return cases;
}

export function caseCanComplete(caseItem, records) {
  if ((caseItem.imageErrors || []).length) return false;
  const reviewedIds = new Set(records.map((item) => item.findingId));
  return caseItem.extraFindings.every((finding) => reviewedIds.has(finding.findingId));
}
```

- [ ] **Step 4: 运行状态测试并确认通过**

Run: `node --test tests/extra-review-state.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 5: 提交页面状态逻辑**

```bash
git add public/extra-review-state.js tests/extra-review-state.test.mjs
git commit -m "Add extra review page state logic"
```

### Task 5: 实现逐案例三图审查页

**Files:**
- Create: `public/extra-review.html`
- Create: `public/extra-review.js`
- Create: `public/extra-review.css`

- [ ] **Step 1: 创建独立页面语义结构**

`public/extra-review.html` 必须包含这些稳定选择器：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 试穿｜额外发现审查</title>
  <link rel="stylesheet" href="/extra-review.css">
</head>
<body>
  <header class="toolbar">
    <div><strong>额外发现审查</strong><span id="modelVersion"></span></div>
    <div id="progress"></div>
    <label>筛选 <select id="caseFilter"><option value="all">全部</option><option value="pending">待审</option><option value="reviewed">已审</option></select></label>
    <button id="prevCase" type="button">上一条</button>
    <button id="nextCase" type="button">下一条</button>
  </header>
  <main>
    <section id="status" role="status"></section>
    <section id="imageGrid" class="image-grid"></section>
    <section class="comparison-grid">
      <article><h2>人工历史标签</h2><div id="humanIssues"></div></article>
      <article><h2>模型额外发现</h2><div id="extraFindings"></div></article>
    </section>
    <section id="summary"></section>
  </main>
  <dialog id="lightbox"><button id="closeLightbox" type="button">关闭</button><img id="lightboxImage" alt="大图"></dialog>
  <script type="module" src="/extra-review.js"></script>
</body>
</html>
```

- [ ] **Step 2: 实现加载、渲染和自动保存**

`public/extra-review.js` 使用以下完整实现：

```js
import { filterCases, reviewProgress } from "./extra-review-state.js";

const state = { cases: [], records: [], index: 0, filter: "all", imageErrors: new Map() };
const dimensions = { face: "面部与妆造发型", pose: "姿势与肢体", clothing: "服装特征", scene: "场景与背景" };

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || "请求失败");
  return body;
}

async function load() {
  setStatus("正在加载审查数据…");
  const body = await request("/api/extra-review/input");
  state.cases = body.input.cases;
  state.records = body.records;
  document.querySelector("#modelVersion").textContent = `${body.input.model} · ${body.input.promptVersion}`;
  setStatus("");
  render();
}

async function save(caseId, finding, verdict, note) {
  setStatus("正在保存…");
  try {
    const body = await request("/api/extra-review/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record: { caseId, findingId: finding.findingId, verdict, note } }),
    });
    state.records = state.records.filter((item) => item.findingId !== finding.findingId);
    state.records.push(body.record);
    setStatus("已保存");
    renderProgress();
    await renderSummary();
  } catch (error) {
    setStatus(`保存失败：${error.message}`, true);
    throw error;
  }
}

function currentCases() {
  return filterCases(state.cases, state.records, state.filter);
}

function currentCase() {
  const visible = currentCases();
  if (!visible.length) return null;
  state.index = Math.min(state.index, visible.length - 1);
  return visible[state.index];
}

function recordFor(findingId) {
  return state.records.find((item) => item.findingId === findingId);
}

function setStatus(message, isError = false) {
  const node = document.querySelector("#status");
  node.textContent = message;
  node.classList.toggle("error", isError);
}

function render() {
  const item = currentCase();
  renderProgress();
  if (!item) {
    document.querySelector("#imageGrid").replaceChildren();
    document.querySelector("#humanIssues").textContent = "当前筛选没有 Case";
    document.querySelector("#extraFindings").replaceChildren();
    return;
  }
  renderImages(item);
  renderHumanIssues(item);
  renderFindings(item);
  renderSummary();
}

function renderProgress() {
  const progress = reviewProgress(state.cases, state.records);
  const visible = currentCases();
  document.querySelector("#progress").textContent = `发现 ${progress.reviewed}/${progress.total} · 待审 ${progress.pending} · Case ${visible.length ? state.index + 1 : 0}/${visible.length}`;
  document.querySelector("#prevCase").disabled = state.index <= 0;
  document.querySelector("#nextCase").disabled = state.index >= visible.length - 1;
}

function renderImages(item) {
  const grid = document.querySelector("#imageGrid");
  grid.replaceChildren();
  const roles = [["user", "用户图"], ["outfit", "搭配图"], ["generated", "生成图"]];
  for (const [role, title] of roles) {
    const card = document.createElement("article");
    card.className = "image-card";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const image = document.createElement("img");
    image.src = item.images[role];
    image.alt = title;
    image.addEventListener("click", () => openLightbox(image.src, title));
    image.addEventListener("load", () => {
      const errors = state.imageErrors.get(item.caseId) || new Set();
      errors.delete(role);
      state.imageErrors.set(item.caseId, errors);
      card.querySelector(".image-error")?.remove();
    });
    image.addEventListener("error", () => showImageError(item, role, card, image));
    card.append(heading, image);
    grid.append(card);
  }
}

function showImageError(item, role, card, image) {
  const errors = state.imageErrors.get(item.caseId) || new Set();
  errors.add(role);
  state.imageErrors.set(item.caseId, errors);
  if (card.querySelector(".image-error")) return;
  const message = document.createElement("div");
  message.className = "image-error error";
  message.textContent = "图片加载失败，当前 Case 不能视为完成。";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重试";
  retry.addEventListener("click", () => {
    message.remove();
    image.src = `${item.images[role]}${item.images[role].includes("?") ? "&" : "?"}retry=${Date.now()}`;
  });
  message.append(retry);
  card.append(message);
}

function renderHumanIssues(item) {
  const container = document.querySelector("#humanIssues");
  container.replaceChildren();
  for (const [key, title] of Object.entries(dimensions)) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const issues = item.humanIssues[key] || [];
    const content = document.createElement(issues.length ? "ul" : "p");
    if (issues.length) {
      for (const issue of issues) {
        const li = document.createElement("li");
        li.textContent = issue;
        content.append(li);
      }
    } else {
      content.textContent = "无已记录问题";
    }
    section.append(heading, content);
    container.append(section);
  }
}

function renderFindings(item) {
  const container = document.querySelector("#extraFindings");
  container.replaceChildren();
  for (const finding of item.extraFindings) {
    const record = recordFor(finding.findingId);
    const section = document.createElement("section");
    section.className = "finding";
    const heading = document.createElement("h3");
    heading.textContent = `${dimensions[finding.dimension] || finding.dimension} · ${finding.label}`;
    const evidence = document.createElement("p");
    evidence.textContent = finding.evidence || "模型未提供证据文本";
    const verdicts = document.createElement("div");
    verdicts.className = "verdicts";
    const note = document.createElement("textarea");
    note.placeholder = "可选备注";
    note.value = record?.note || "";
    for (const [value, label] of [["confirmed_issue", "真实问题"], ["false_positive", "模型误报"], ["uncertain", "不确定"]]) {
      const wrapper = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = finding.findingId;
      radio.value = value;
      radio.checked = record?.verdict === value;
      radio.addEventListener("change", async () => {
        try { await save(item.caseId, finding, value, note.value); } catch { radio.checked = false; }
      });
      wrapper.append(radio, document.createTextNode(label));
      verdicts.append(wrapper);
    }
    note.addEventListener("change", async () => {
      const selected = section.querySelector("input:checked");
      if (selected) await save(item.caseId, finding, selected.value, note.value);
    });
    section.append(heading, evidence, verdicts, note);
    container.append(section);
  }
}

async function renderSummary() {
  try {
    const body = await request("/api/extra-review/summary");
    const summary = body.summary;
    document.querySelector("#summary").textContent = `真实问题 ${summary.confirmed_issue} · 模型误报 ${summary.false_positive} · 不确定 ${summary.uncertain} · 待审 ${summary.pending}`;
  } catch (error) {
    document.querySelector("#summary").textContent = `汇总加载失败：${error.message}`;
  }
}

function openLightbox(src, title) {
  const dialog = document.querySelector("#lightbox");
  const image = document.querySelector("#lightboxImage");
  image.src = src;
  image.alt = title;
  dialog.showModal();
}

document.querySelector("#closeLightbox").addEventListener("click", () => document.querySelector("#lightbox").close());
document.querySelector("#caseFilter").addEventListener("change", (event) => { state.filter = event.target.value; state.index = 0; render(); });
document.querySelector("#prevCase").addEventListener("click", () => { state.index = Math.max(0, state.index - 1); render(); });
document.querySelector("#nextCase").addEventListener("click", () => { state.index = Math.min(currentCases().length - 1, state.index + 1); render(); });

load().catch((error) => setStatus(`加载失败：${error.message}`, true));
```

- [ ] **Step 3: 实现最小聚焦样式**

`public/extra-review.css` 使用三列图片和两列对照，在窄屏降为单列：

```css
:root { color-scheme: light; font-family: Inter, "PingFang SC", sans-serif; background: #f5f6f8; color: #1f2329; }
body { margin: 0; }
.toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 16px; align-items: center; padding: 14px 20px; background: white; border-bottom: 1px solid #dee0e3; }
main { max-width: 1480px; margin: 0 auto; padding: 20px; }
.image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.image-card, .comparison-grid article, #summary { background: white; border: 1px solid #dee0e3; border-radius: 12px; padding: 14px; }
.image-card img { width: 100%; height: 460px; object-fit: contain; background: #eef0f3; cursor: zoom-in; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; margin-top: 16px; }
.finding { border-top: 1px solid #dee0e3; padding: 16px 0; }
.verdicts { display: flex; gap: 14px; flex-wrap: wrap; }
.error { color: #d03050; }
#summary { margin-top: 16px; }
#lightbox img { max-width: 90vw; max-height: 85vh; object-fit: contain; }
@media (max-width: 900px) { .image-grid, .comparison-grid { grid-template-columns: 1fr; } .image-card img { height: 60vh; } }
```

- [ ] **Step 4: 启动页面并人工验证关键路径**

Run: `npm run dev`

Open: `http://127.0.0.1:5246/extra-review.html`

Expected:

- 三张图片按固定顺序同时显示；
- 人工标签和模型发现同时可见；
- 选择任一 verdict 后显示“已保存”，刷新后恢复；
- 备注修改后保存；
- 上一条、下一条和筛选不丢失结果；
- 点击图片打开大图；
- 图片失败时该 Case 显示错误和重试，不显示完成状态。

- [ ] **Step 5: 运行全量测试**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: 提交审查页面**

```bash
git add public/extra-review.html public/extra-review.js public/extra-review.css
git commit -m "Add focused three-image extra finding review page"
```

### Task 6: 文档、端到端验收与回归主线

**Files:**
- Modify: `AUDIT_EVALUATION.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: 写明辅助工具的固定操作顺序**

在 `AUDIT_EVALUATION.md` 增加：

```markdown
## 额外发现人工审查（Prompt 优化前置辅助步骤）

1. 使用训练分区的豆包 1.6 报告生成审查输入：`npm run audit:build-review -- <dataset> <split> <report> <output>`。
2. 启动本地服务并打开 `/extra-review.html`。
3. 对每条额外发现选择真实问题、模型误报或不确定；不修改历史人工标签。
4. 17 条全部处理后读取 `/api/extra-review/summary`，把确认项和误报项用于平衡型 Prompt 设计。
5. Prompt 候选只在训练集开发，随后进入冻结验证集比较；最终候选确定前不运行测试集。

审查页不是通用标注平台，不接入飞书写回、Coze 发布或验证/测试集浏览。
```

- [ ] **Step 2: 执行全量自动化验证**

Run: `npm test`

Expected: all tests pass with no skipped or failed tests.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 3: 使用当前真实 17 条发现完成端到端验收**

Run: `npm run audit:build-review -- work/audit-dataset.json work/audit-split.json work/fair-doubao-1.6-report.json work/extra-finding-review-input.json`

Expected: output reports exactly 17 findings and Git status does not include either runtime JSON file.

Run: `npm run dev`

Expected: `/extra-review.html` loads all review cases and `/api/extra-review/summary` initially reports 17 total findings.

- [ ] **Step 4: 更新交接记录**

在 `HANDOFF.md` 记录：页面路径、17 条输入生成结果、测试结果、人工审查是否完成；下一步必须写为“根据已确认/误报结论设计豆包 1.6 平衡型 Prompt，并只在训练集运行候选版本”。

- [ ] **Step 5: 提交文档并推送现有草稿 PR**

```bash
git add AUDIT_EVALUATION.md HANDOFF.md
git commit -m "Document extra finding review workflow"
git push origin codex/add-tryon-audit-evaluation
```

- [ ] **Step 6: 回到 AI 审核主线**

人工完成 17 条审查后，汇总：

- 已确认真实问题及其视觉证据模式；
- 已确认误报及需要提高的证据门槛；
- 不确定项及分辨率/标准限制。

基于该汇总编写豆包 1.6 Prompt v2，目标是提高发型、穿模、背景、Logo/图案召回，同时不让确认后的误报明显恶化。只有训练集指标改善的候选才进入 20 条冻结验证集；当前阶段不启用模型协作。
