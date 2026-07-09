import { apiPath, shouldAutoLoadCsvPath } from "./workbench-policy.js";
import { investigationClusterParts } from "./investigation-cluster.js";
import { matchesImprovementFilter } from "./run-status.js";
import { buildEvaluationClusters, buildEvaluationSummary } from "./evaluation-summary.js";
import { applyImageUrlOverrides, buildAdHocRunCase, buildAdHocRunGroup, shouldReplaceAdHocImageValue } from "./case-inputs.js";
import { applyBatchRunResults, clearRunRecordsForRows, runIndexes } from "./run-results.js";

const state = {
  csvPath: "",
  headers: [],
  rows: [],
  notes: {},
  peChanges: [],
  tableWorkspaces: [],
  currentTableWorkspaceId: "",
  experiments: [],
  evaluations: [],
  currentExperimentId: "",
  currentEvaluationId: "",
  evaluationRows: [],
  evaluationHeaders: [],
  promptSnapshot: null,
  selectedIndex: -1,
  checkedIndexes: new Set(),
  selectedClusterKey: "all",
  selectedEvaluationClusterKey: "",
  activeTab: "overview",
  adHocRuns: [],
  adHocAutoImages: { user_image: "", outfit_image: "" },
  running: false,
  filters: {
    dimension: "all",
    score: "all",
    keyword: "",
    improvement: "all",
    sort: "original",
  },
};

const STORAGE_KEY = "tryon_badcase_workbench_state_v1";
const EXPERIMENTS_STORAGE_KEY = "tryon_badcase_experiment_boards_v1";
const TABLE_WORKSPACES_STORAGE_KEY = "tryon_badcase_table_workspaces_v1";

const issueGroups = [
  {
    id: "face",
    label: "面部特征与妆造发型还原",
    score: "面部特征与妆造发型还原",
    problem: "问题类型",
    note: "归因备注",
  },
  {
    id: "pose",
    label: "姿势微调与肢体自然度",
    score: "姿势微调与肢体自然度",
    problem: "问题类型__dup2",
    note: "归因备注__dup2",
  },
  {
    id: "clothing",
    label: "服装特征保留度",
    score: "服装特征保留度",
    problem: "问题类型__dup3",
    note: "归因备注__dup3",
  },
  {
    id: "scene",
    label: "场景氛围与背景幻觉",
    score: "场景氛围与背景幻觉",
    problem: "问题类型__dup4",
    note: "归因备注__dup4",
  },
];

const el = {
  status: document.querySelector("#status"),
  app: document.querySelector(".app"),
  csvPath: document.querySelector("#csvPath"),
  workspace: document.querySelector(".workspace"),
  tableFileInput: document.querySelector("#tableFileInput"),
  tableWorkspaceSelect: document.querySelector("#tableWorkspaceSelect"),
  loadCsvBtn: document.querySelector("#loadCsvBtn"),
  saveCsvBtn: document.querySelector("#saveCsvBtn"),
  experimentSelect: document.querySelector("#experimentSelect"),
  experimentTheme: document.querySelector("#experimentTheme"),
  totalSampleSize: document.querySelector("#totalSampleSize"),
  manualCasesInput: document.querySelector("#manualCasesInput"),
  createExperimentBtn: document.querySelector("#createExperimentBtn"),
  saveExperimentBtn: document.querySelector("#saveExperimentBtn"),
  exportExperimentBtn: document.querySelector("#exportExperimentBtn"),
  deleteExperimentBtn: document.querySelector("#deleteExperimentBtn"),
  evaluationSelect: document.querySelector("#evaluationSelect"),
  evaluationTheme: document.querySelector("#evaluationTheme"),
  evaluationDate: document.querySelector("#evaluationDate"),
  evaluationSampleSize: document.querySelector("#evaluationSampleSize"),
  evaluationVlmVersion: document.querySelector("#evaluationVlmVersion"),
  evaluationGenVersion: document.querySelector("#evaluationGenVersion"),
  evaluationFileInput: document.querySelector("#evaluationFileInput"),
  saveEvaluationBtn: document.querySelector("#saveEvaluationBtn"),
  deleteEvaluationBtn: document.querySelector("#deleteEvaluationBtn"),
  loadPromptsBtn: document.querySelector("#loadPromptsBtn"),
  applyPromptsBtn: document.querySelector("#applyPromptsBtn"),
  runSelectedBtn: document.querySelector("#runSelectedBtn"),
  runCheckedBtn: document.querySelector("#runCheckedBtn"),
  rerunFailedCheckedBtn: document.querySelector("#rerunFailedCheckedBtn"),
  runCount: document.querySelector("#runCount"),
  selectFilteredTopBtn: document.querySelector("#selectFilteredTopBtn"),
  clearCheckedTopBtn: document.querySelector("#clearCheckedTopBtn"),
  workflowTabs: document.querySelector("#workflowTabs"),
  techReasonPath: document.querySelector("#techReasonPath"),
  importTechReasonsBtn: document.querySelector("#importTechReasonsBtn"),
  clusterSelect: document.querySelector("#clusterSelect"),
  selectClusterBtn: document.querySelector("#selectClusterBtn"),
  metricGrid: document.querySelector("#metricGrid"),
  reviewQuickFilters: document.querySelector("#reviewQuickFilters"),
  evaluationSummary: document.querySelector("#evaluationSummary"),
  evaluationCompare: document.querySelector("#evaluationCompare"),
  evaluationClusterList: document.querySelector("#evaluationClusterList"),
  clusterList: document.querySelector("#clusterList"),
  investigationBoard: document.querySelector("#investigationBoard"),
  peChangeBoard: document.querySelector("#peChangeBoard"),
  caseCount: document.querySelector("#caseCount"),
  prevCaseBtn: document.querySelector("#prevCaseBtn"),
  nextCaseBtn: document.querySelector("#nextCaseBtn"),
  caseJumpInput: document.querySelector("#caseJumpInput"),
  casePosition: document.querySelector("#casePosition"),
  dimensionFilter: document.querySelector("#dimensionFilter"),
  scoreFilter: document.querySelector("#scoreFilter"),
  keywordFilter: document.querySelector("#keywordFilter"),
  improvementFilter: document.querySelector("#improvementFilter"),
  sortOrder: document.querySelector("#sortOrder"),
  selectFilteredBtn: document.querySelector("#selectFilteredBtn"),
  clearCheckedBtn: document.querySelector("#clearCheckedBtn"),
  caseList: document.querySelector("#caseList"),
  imageGrid: document.querySelector("#imageGrid"),
  saveNotesBtn: document.querySelector("#saveNotesBtn"),
  applyInvestigationBtn: document.querySelector("#applyInvestigationBtn"),
  judgeTarget: document.querySelector("#judgeTarget"),
  judgeCaseBtn: document.querySelector("#judgeCaseBtn"),
  recordPeChangeBtn: document.querySelector("#recordPeChangeBtn"),
  applyPeChangeRunBtn: document.querySelector("#applyPeChangeRunBtn"),
  overrideUserImage: document.querySelector("#overrideUserImage"),
  overrideOutfitImage: document.querySelector("#overrideOutfitImage"),
  imageOverrideScope: document.querySelector("#imageOverrideScope"),
  applyImageOverridesBtn: document.querySelector("#applyImageOverridesBtn"),
  adHocUserImage: document.querySelector("#adHocUserImage"),
  adHocOutfitImage: document.querySelector("#adHocOutfitImage"),
  adHocRunCount: document.querySelector("#adHocRunCount"),
  fillAdHocImagesBtn: document.querySelector("#fillAdHocImagesBtn"),
  runAdHocBtn: document.querySelector("#runAdHocBtn"),
  adHocRunResults: document.querySelector("#adHocRunResults"),
  judgeResult: document.querySelector("#judgeResult"),
  pmIssueLocation: document.querySelector("#pmIssueLocation"),
  pmSpecificIssue: document.querySelector("#pmSpecificIssue"),
  pmSourceField: document.querySelector("#pmSourceField"),
  pmResolutionType: document.querySelector("#pmResolutionType"),
  pmApplyScope: document.querySelector("#pmApplyScope"),
  manualNote: document.querySelector("#manualNote"),
  optimizationDirection: document.querySelector("#optimizationDirection"),
  changeSummary: document.querySelector("#changeSummary"),
  effectConclusion: document.querySelector("#effectConclusion"),
  evidenceSelect: document.querySelector("#evidenceSelect"),
  evidenceMeta: document.querySelector("#evidenceMeta"),
  evidenceText: document.querySelector("#evidenceText"),
  runTabs: document.querySelector("#runTabs"),
  rerunFailedBtn: document.querySelector("#rerunFailedBtn"),
  clearRunsBtn: document.querySelector("#clearRunsBtn"),
  clearRunsScope: document.querySelector("#clearRunsScope"),
  runImprovementControls: document.querySelector("#runImprovementControls"),
  userSystemPrompt: document.querySelector("#userSystemPrompt"),
  userPrompt: document.querySelector("#userPrompt"),
  outfitSystemPrompt: document.querySelector("#outfitSystemPrompt"),
  outfitPrompt: document.querySelector("#outfitPrompt"),
  promptCode: document.querySelector("#promptCode"),
  runSelect: document.querySelector("#runSelect"),
  currentPrompt: document.querySelector("#currentPrompt"),
  rawOutput: document.querySelector("#rawOutput"),
  imageLightbox: document.querySelector("#imageLightbox"),
  imageLightboxImg: document.querySelector("#imageLightboxImg"),
  imageLightboxTitle: document.querySelector("#imageLightboxTitle"),
  imageLightboxClose: document.querySelector("#imageLightboxClose"),
};

el.loadCsvBtn.addEventListener("click", loadCsv);
el.tableFileInput.addEventListener("change", loadUploadedTableFile);
el.tableWorkspaceSelect.addEventListener("change", switchTableWorkspace);
el.saveCsvBtn.addEventListener("click", saveCsv);
el.createExperimentBtn.addEventListener("click", createExperiment);
el.saveExperimentBtn.addEventListener("click", saveCurrentExperiment);
el.exportExperimentBtn.addEventListener("click", exportExperimentResults);
el.deleteExperimentBtn.addEventListener("click", deleteCurrentExperiment);
el.evaluationSelect.addEventListener("change", switchEvaluation);
el.evaluationFileInput.addEventListener("change", loadEvaluationFile);
el.saveEvaluationBtn.addEventListener("click", saveCurrentEvaluation);
el.deleteEvaluationBtn.addEventListener("click", deleteCurrentEvaluation);
el.experimentSelect.addEventListener("change", switchExperiment);
el.loadPromptsBtn.addEventListener("click", loadPrompts);
el.applyPromptsBtn.addEventListener("click", applyPrompts);
el.runSelectedBtn.addEventListener("click", runSelectedCase);
el.runCheckedBtn.addEventListener("click", runCheckedCases);
el.rerunFailedCheckedBtn.addEventListener("click", rerunFailedCheckedCases);
el.rerunFailedBtn.addEventListener("click", rerunSelectedFailedRun);
el.clearRunsBtn.addEventListener("click", clearSelectedRunRecords);
el.csvPath.addEventListener("change", persistUiState);
el.techReasonPath.addEventListener("change", persistUiState);
el.runCount.addEventListener("change", persistUiState);
el.adHocUserImage.addEventListener("input", persistUiState);
el.adHocOutfitImage.addEventListener("input", persistUiState);
el.adHocRunCount.addEventListener("change", persistUiState);
el.totalSampleSize.addEventListener("input", () => {
  persistUiState();
  renderOptimizationBoard();
});
el.selectFilteredTopBtn.addEventListener("click", selectFilteredCases);
el.clearCheckedTopBtn.addEventListener("click", clearCheckedCases);
el.prevCaseBtn.addEventListener("click", () => moveSelectedCase(-1));
el.nextCaseBtn.addEventListener("click", () => moveSelectedCase(1));
el.caseJumpInput.addEventListener("change", jumpToCasePosition);
el.caseJumpInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") jumpToCasePosition();
});
el.workflowTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.activeTab = button.dataset.tab;
  persistUiState();
  render();
});
el.importTechReasonsBtn.addEventListener("click", importTechReasons);
el.clusterSelect.addEventListener("change", () => {
  state.selectedClusterKey = el.clusterSelect.value;
  persistUiState();
  render();
});
el.selectClusterBtn.addEventListener("click", selectCurrentClusterCases);
el.saveNotesBtn.addEventListener("click", () => busy("保存备注中...", async () => saveCurrentNotes("已保存分析备注")));
el.applyInvestigationBtn.addEventListener("click", () => busy("批量应用侦查中...", applyInvestigationToScope));
el.judgeCaseBtn.addEventListener("click", judgeCurrentCase);
el.recordPeChangeBtn.addEventListener("click", savePeChangeOnly);
el.applyPeChangeRunBtn.addEventListener("click", applyPeChangeAndRun);
el.applyImageOverridesBtn.addEventListener("click", applyImageOverridesToScope);
el.fillAdHocImagesBtn.addEventListener("click", () => fillAdHocImagesFromSelectedCase({ force: true }));
el.runAdHocBtn.addEventListener("click", applyPromptsAndRunAdHocImages);
el.evidenceSelect.addEventListener("change", () => {
  persistUiState();
  renderSelected();
});
el.runSelect.addEventListener("change", () => {
  persistUiState();
  renderSelected();
});
el.pmApplyScope.addEventListener("change", refreshAutoAnalysisFields);
for (const promptField of [el.userSystemPrompt, el.userPrompt, el.outfitSystemPrompt, el.outfitPrompt, el.promptCode]) {
  promptField.addEventListener("input", refreshAutoAnalysisFields);
}
el.dimensionFilter.addEventListener("change", updateFilters);
el.scoreFilter.addEventListener("change", updateFilters);
el.keywordFilter.addEventListener("input", updateFilters);
el.improvementFilter.addEventListener("change", updateFilters);
el.sortOrder.addEventListener("change", updateFilters);
el.selectFilteredBtn.addEventListener("click", selectFilteredCases);
el.clearCheckedBtn.addEventListener("click", clearCheckedCases);
el.imageLightboxClose.addEventListener("click", closeImageLightbox);
el.imageLightbox.addEventListener("click", (event) => {
  if (event.target === el.imageLightbox) closeImageLightbox();
});
window.__tryonSelectFilteredCases = selectFilteredCases;
window.__tryonClearCheckedCases = clearCheckedCases;
window.__tryonToggleCase = (checkbox) => {
  const index = Number(checkbox.dataset.index);
  if (checkbox.checked) {
    state.checkedIndexes.add(index);
  } else {
    state.checkedIndexes.delete(index);
  }
  persistUiState();
  render();
};
document.addEventListener("click", (event) => {
  const previewButton = event.target?.closest?.("[data-image-src]");
  if (previewButton) {
    openImageLightbox(previewButton.dataset.imageSrc, previewButton.dataset.imageTitle);
    return;
  }
  if (event.target?.id === "selectFilteredBtn") selectFilteredCases();
  if (event.target?.id === "clearCheckedBtn") clearCheckedCases();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.imageLightbox.hidden) closeImageLightbox();
});
restoreUiState();
void loadTableWorkspaces();
void loadExperiments();
void loadEvaluations();
void autoLoadLastCsv();

async function loadCsv() {
  await busy("加载表格中...", async () => {
    const data = await loadCsvFromPath(el.csvPath.value.trim(), { resetSelection: true });
    await saveCurrentTableWorkspace({ title: tableTitleFromPath(data.path) });
    setStatus(`已加载 ${data.rows.length} 个 case`);
  });
}

async function loadUploadedTableFile() {
  const file = el.tableFileInput.files?.[0];
  if (!file) return;
  await busy("上传并读取表格中...", async () => {
    const data = await loadTableFromFile(file, { resetSelection: true });
    await saveCurrentTableWorkspace({ title: file.name });
    setStatus(`已从 ${file.name} 读取 ${data.rows.length} 个 case`);
  });
}

async function loadCsvFromPath(path, options = {}) {
  const data = await api("/api/load-csv", { path });
  loadRowsIntoWorkspace(data, options);
  return data;
}

async function loadTableFromFile(file, options = {}) {
  const data = await readTableFile(file);
  loadRowsIntoWorkspace(data, options);
  return data;
}

async function readTableFile(file) {
  return api("/api/load-table-file", {
    filename: file.name,
    contentBase64: await fileToBase64(file),
  });
}

function loadRowsIntoWorkspace(data, options = {}) {
  state.currentExperimentId = "";
  state.currentTableWorkspaceId = options.tableWorkspaceId || "";
  state.csvPath = data.path;
  state.headers = data.headers;
  state.rows = data.rows;
  state.notes = data.notes || {};
  state.peChanges = data.peChanges || [];
  el.csvPath.value = data.path;
  el.experimentSelect.value = "";
  el.experimentTheme.value = "";
  if (options.resetSelection) {
    state.checkedIndexes = new Set();
    state.selectedIndex = data.rows.length ? 0 : -1;
  } else {
    state.checkedIndexes = new Set([...state.checkedIndexes].filter((index) => data.rows[index]));
    if (!data.rows[state.selectedIndex]) state.selectedIndex = data.rows.length ? 0 : -1;
  }
  render();
  persistUiState();
}

async function loadTableWorkspaces() {
  try {
    const data = await getApi("/api/table-workspaces/list");
    state.tableWorkspaces = data.tableWorkspaces || [];
  } catch {
    state.tableWorkspaces = readStoredTableWorkspaces();
  }
  renderTableWorkspaceSelect();
  if (state.currentTableWorkspaceId) {
    const workspace = state.tableWorkspaces.find((item) => item.id === state.currentTableWorkspaceId);
    if (workspace) loadTableWorkspaceIntoWorkspace(workspace, { keepSelection: true });
  }
}

function renderTableWorkspaceSelect() {
  el.tableWorkspaceSelect.innerHTML = [
    "<option value=\"\">当前表格</option>",
    ...state.tableWorkspaces
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title || tableTitleFromPath(item.path) || "未命名表格")}（${item.rows?.length || 0}）</option>`),
  ].join("");
  el.tableWorkspaceSelect.value = state.currentTableWorkspaceId || "";
}

async function switchTableWorkspace() {
  const id = el.tableWorkspaceSelect.value;
  if (!id) return;
  if (id === state.currentTableWorkspaceId) return;
  await saveCurrentTableWorkspace();
  const workspace = state.tableWorkspaces.find((item) => item.id === id);
  if (workspace) loadTableWorkspaceIntoWorkspace(workspace);
}

function loadTableWorkspaceIntoWorkspace(workspace, options = {}) {
  state.currentExperimentId = "";
  state.currentTableWorkspaceId = workspace.id;
  state.csvPath = workspace.path || "";
  state.headers = workspace.headers || ["user_image", "outfit_image", "ai_content"];
  state.rows = workspace.rows || [];
  state.notes = workspace.notes || {};
  state.peChanges = workspace.peChanges || [];
  state.checkedIndexes = new Set();
  state.selectedIndex = options.keepSelection && state.rows[state.selectedIndex]
    ? state.selectedIndex
    : Math.min(Math.max(0, Number(workspace.selectedIndex) || 0), Math.max(0, state.rows.length - 1));
  if (!state.rows.length) state.selectedIndex = -1;
  el.csvPath.value = state.csvPath;
  el.experimentSelect.value = "";
  el.experimentTheme.value = "";
  state.activeTab = "inspect";
  render();
  renderTableWorkspaceSelect();
  persistUiState();
}

async function saveCurrentTableWorkspace(options = {}) {
  if (!state.rows.length || state.currentExperimentId) return null;
  const record = {
    id: state.currentTableWorkspaceId,
    title: options.title || tableTitleFromPath(state.csvPath || el.csvPath.value.trim()) || "未命名表格",
    path: state.csvPath || el.csvPath.value.trim(),
    headers: state.headers,
    rows: state.rows,
    notes: state.notes,
    peChanges: state.peChanges,
    selectedIndex: state.selectedIndex,
  };
  try {
    const data = await api("/api/table-workspaces/save", { tableWorkspace: record });
    state.currentTableWorkspaceId = data.tableWorkspace?.id || state.currentTableWorkspaceId;
    state.tableWorkspaces = data.tableWorkspaces || state.tableWorkspaces;
    writeStoredTableWorkspaces(state.tableWorkspaces);
    renderTableWorkspaceSelect();
    persistUiState();
    return data.tableWorkspace;
  } catch {
    const saved = saveTableWorkspaceLocally(record);
    state.currentTableWorkspaceId = saved.id;
    state.tableWorkspaces = readStoredTableWorkspaces();
    renderTableWorkspaceSelect();
    persistUiState();
    return saved;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("文件读取失败")));
    reader.readAsDataURL(file);
  });
}

async function saveCsv() {
  await busy(state.currentExperimentId ? "保存实验看板中..." : "保存表格中...", async () => {
    await saveRunsToCsv();
    setStatus(state.currentExperimentId ? "已保存当前实验看板" : "已保存到表格");
  });
}

async function loadExperiments() {
  try {
    const data = await getApi("/api/experiments/list");
    state.experiments = data.experiments || [];
  } catch (error) {
    state.experiments = readStoredExperiments();
    if (!state.experiments.length) {
      setStatus("实验看板将保存在当前浏览器中；正式表格仍可按原方式加载和保存。");
    }
  }
  renderExperimentSelect();
  if (state.currentExperimentId) {
    const experiment = state.experiments.find((item) => item.id === state.currentExperimentId);
    if (experiment) {
      loadExperimentIntoWorkspace(experiment, { keepSelection: true });
      setStatus(`已恢复实验看板：${experiment.theme || "未命名实验"}`);
    } else {
      state.currentExperimentId = "";
      persistUiState();
      void autoLoadLastCsv();
    }
  }
}

async function loadEvaluations() {
  try {
    const data = await getApi("/api/evaluations/list");
    state.evaluations = data.evaluations || [];
  } catch {
    state.evaluations = readStoredEvaluations();
  }
  renderEvaluationSelect();
  if (state.currentEvaluationId) {
    const evaluation = state.evaluations.find((item) => item.id === state.currentEvaluationId);
    if (evaluation) loadEvaluationIntoWorkspace(evaluation, { keepTab: true });
  }
}

function renderExperimentSelect() {
  el.experimentSelect.innerHTML = [
    "<option value=\"\">表格工作台</option>",
    ...state.experiments
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.theme || "未命名实验")}（${item.rows?.length || 0}）</option>`),
  ].join("");
  el.experimentSelect.value = state.currentExperimentId || "";
}

function renderEvaluationSelect() {
  el.evaluationSelect.innerHTML = [
    "<option value=\"\">新建评测</option>",
    ...state.evaluations
      .slice()
      .sort((a, b) => String(b.evaluationDate || b.updatedAt || "").localeCompare(String(a.evaluationDate || a.updatedAt || "")))
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.theme || "未命名评测")}（${item.rows?.length || 0}）</option>`),
  ].join("");
  el.evaluationSelect.value = state.currentEvaluationId || "";
}

async function loadEvaluationFile() {
  const file = el.evaluationFileInput.files?.[0];
  if (!file) return;
  await busy("读取整体评测表中...", async () => {
    const data = await readTableFile(file);
    state.evaluationRows = data.rows || [];
    state.evaluationHeaders = data.headers || [];
    state.currentEvaluationId = "";
    el.evaluationSelect.value = "";
    if (!el.evaluationTheme.value.trim()) el.evaluationTheme.value = file.name.replace(/\.(csv|tsv|xlsx|xlsm)$/i, "");
    if (!el.evaluationDate.value) el.evaluationDate.value = new Date().toISOString().slice(0, 10);
    if (!el.evaluationSampleSize.value) el.evaluationSampleSize.value = String(data.rows.length || "");
    state.activeTab = "evaluation";
    render();
    persistUiState();
    setStatus(`已读取整体评测表：${data.rows.length} 个 case。填写版本信息后可保存为一轮评测。`);
  });
}

async function saveCurrentEvaluation() {
  if (!state.evaluationRows.length) {
    setStatus("请先在整体评测 tab 上传评测表");
    return;
  }
  await busy("保存整体评测记录中...", async () => {
    const summary = buildEvaluationSummary(state.evaluationRows);
    const data = await saveEvaluationRecord({
      id: state.currentEvaluationId,
      theme: el.evaluationTheme.value.trim() || "未命名评测",
      evaluationDate: el.evaluationDate.value || new Date().toISOString().slice(0, 10),
      totalSampleSize: Number(el.evaluationSampleSize.value) || state.evaluationRows.length,
      vlmPromptVersion: el.evaluationVlmVersion.value.trim(),
      generationPromptVersion: el.evaluationGenVersion.value.trim(),
      headers: state.evaluationHeaders,
      rows: state.evaluationRows,
      summary,
    });
    state.evaluations = data.evaluations || [];
    loadEvaluationIntoWorkspace(data.evaluation, { keepTab: true });
    renderEvaluationSelect();
    setStatus(`已保存整体评测：${data.evaluation.theme || "未命名评测"}`);
  });
}

async function deleteCurrentEvaluation() {
  if (!state.currentEvaluationId) {
    setStatus("当前没有选中的评测记录");
    return;
  }
  const current = currentEvaluation();
  const ok = window.confirm(`确认删除评测「${current.theme || "未命名评测"}」吗？`);
  if (!ok) return;
  await busy("删除整体评测记录中...", async () => {
    await deleteEvaluationRecord(state.currentEvaluationId);
    state.currentEvaluationId = "";
    state.evaluationRows = [];
    state.evaluationHeaders = [];
    clearEvaluationFields();
    renderEvaluationSelect();
    render();
    persistUiState();
    setStatus("已删除当前整体评测记录");
  });
}

function switchEvaluation() {
  const id = el.evaluationSelect.value;
  if (!id) {
    state.currentEvaluationId = "";
    state.evaluationRows = [];
    state.evaluationHeaders = [];
    clearEvaluationFields();
    persistUiState();
    render();
    return;
  }
  const evaluation = state.evaluations.find((item) => item.id === id);
  if (evaluation) loadEvaluationIntoWorkspace(evaluation);
}

function loadEvaluationIntoWorkspace(evaluation, options = {}) {
  state.currentEvaluationId = evaluation.id;
  state.evaluationRows = evaluation.rows || [];
  state.evaluationHeaders = evaluation.headers || [];
  el.evaluationTheme.value = evaluation.theme || "";
  el.evaluationDate.value = evaluation.evaluationDate || "";
  el.evaluationSampleSize.value = evaluation.totalSampleSize || "";
  el.evaluationVlmVersion.value = evaluation.vlmPromptVersion || "";
  el.evaluationGenVersion.value = evaluation.generationPromptVersion || "";
  if (!options.keepTab) state.activeTab = "evaluation";
  renderEvaluationSelect();
  render();
  persistUiState();
}

function clearEvaluationFields() {
  el.evaluationTheme.value = "";
  el.evaluationDate.value = "";
  el.evaluationSampleSize.value = "";
  el.evaluationVlmVersion.value = "";
  el.evaluationGenVersion.value = "";
  el.evaluationFileInput.value = "";
}

function currentEvaluation() {
  return state.evaluations.find((item) => item.id === state.currentEvaluationId) || {
    id: state.currentEvaluationId,
    theme: el.evaluationTheme.value.trim(),
  };
}

async function createExperiment() {
  const rows = parseManualCases(el.manualCasesInput.value);
  if (!rows.length) {
    setStatus("请先填写要复跑的 user_image_url、outfit_image_url，可选 ai_content_url");
    return;
  }
  const headers = ["user_image", "outfit_image", "ai_content", "输出", "prompt", "user_vlm", "outfit_vlm"];
  const theme = el.experimentTheme.value.trim() || `手动实验 ${new Date().toLocaleString()}`;
  await busy("创建实验看板中...", async () => {
    const data = await saveExperimentRecord({
      theme,
      totalSampleSize: sampleDenominator({ fallback: rows.length }),
      headers,
      rows,
    });
    state.experiments = data.experiments || [];
    loadExperimentIntoWorkspace(data.experiment);
    renderExperimentSelect();
    setStatus(`已创建实验：${theme}，共 ${rows.length} 个 case`);
  });
}

async function saveCurrentExperiment() {
  if (!state.currentExperimentId) {
    setStatus("当前是表格工作台，不是独立实验；请使用“保存结果”写回表格。");
    return;
  }
  await busy("保存实验看板中...", async () => {
    const experiment = currentExperiment();
    const data = await saveExperimentRecord({
      ...experiment,
      theme: el.experimentTheme.value.trim() || experiment?.theme || "未命名实验",
      totalSampleSize: sampleDenominator({ fallback: state.rows.length }),
      rows: state.rows,
      headers: state.headers,
    });
    state.experiments = data.experiments || [];
    renderExperimentSelect();
    setStatus("已保存当前实验看板");
  });
}

function switchExperiment() {
  const id = el.experimentSelect.value;
  if (!id) {
    state.currentExperimentId = "";
    el.experimentTheme.value = "";
    el.totalSampleSize.value = "";
    renderExperimentSelect();
    persistUiState();
    void autoLoadLastCsv();
    return;
  }
  const experiment = state.experiments.find((item) => item.id === id);
  if (!experiment) return;
  loadExperimentIntoWorkspace(experiment);
}

function loadExperimentIntoWorkspace(experiment, options = {}) {
  state.currentExperimentId = experiment.id;
  state.csvPath = "";
  state.headers = experiment.headers || ["user_image", "outfit_image", "ai_content"];
  state.rows = experiment.rows || [];
  state.checkedIndexes = new Set();
  if (options.keepSelection && state.rows[state.selectedIndex]) {
    state.selectedIndex = state.selectedIndex;
  } else {
    state.selectedIndex = state.rows.length ? 0 : -1;
  }
  el.experimentTheme.value = experiment.theme || "";
  el.totalSampleSize.value = experiment.totalSampleSize || "";
  el.pmApplyScope.value = "experiment";
  state.activeTab = "inspect";
  persistUiState();
  render();
  renderExperimentSelect();
}

function currentExperiment() {
  return state.experiments.find((item) => item.id === state.currentExperimentId) || {
    id: state.currentExperimentId,
    theme: el.experimentTheme.value.trim(),
    totalSampleSize: sampleDenominator({ fallback: state.rows.length }),
    createdAt: new Date().toISOString(),
  };
}

function parseManualCases(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const urls = line.match(/https?:\/\/[^\s,，]+/g) || [];
      if (urls.length < 2) return null;
      const output = parseManualOutputFromLine(line);
      return enrichManualCaseFromOutput({
        user_image: urls[0],
        outfit_image: urls[1],
        ai_content: urls[2] || "",
      }, output);
    })
    .filter(Boolean);
}

function parseManualOutputFromLine(line) {
  const start = line.indexOf("{");
  if (start < 0) return null;
  const raw = line.slice(start).trim();
  return { raw, parsed: parseJsonField(raw) };
}

function enrichManualCaseFromOutput(row, output) {
  if (!output?.parsed) return row;
  const parsed = output.parsed;
  const userVlm = parsed.vlm_result?.user_vlm || parsed.user_vlm || "";
  const outfitVlm = parsed.vlm_result?.outfit_vlm || parsed.outfit_vlm || "";
  return {
    ...row,
    ai_content: row.ai_content || parsed.content || "",
    "输出": output.raw,
    prompt: parsed.prompt || "",
    user_vlm: userVlm ? JSON.stringify(userVlm, null, 2) : "",
    outfit_vlm: outfitVlm ? JSON.stringify(outfitVlm, null, 2) : "",
  };
}

async function deleteCurrentExperiment() {
  if (!state.currentExperimentId) {
    setStatus("当前是表格工作台，没有可删除的实验。");
    return;
  }
  const experiment = currentExperiment();
  const ok = window.confirm(`确认删除实验「${experiment.theme || "未命名实验"}」吗？只删除实验看板，不会删除原始表格。`);
  if (!ok) return;
  await busy("删除实验中...", async () => {
    await deleteExperimentRecord(state.currentExperimentId);
    state.currentExperimentId = "";
    state.rows = [];
    state.headers = [];
    state.checkedIndexes = new Set();
    state.selectedIndex = -1;
    state.selectedClusterKey = "all";
    el.experimentTheme.value = "";
    el.manualCasesInput.value = "";
    state.activeTab = "overview";
    renderExperimentSelect();
    render();
    persistUiState();
    setStatus("已删除当前实验看板");
    void autoLoadLastCsv();
  });
}

async function exportExperimentResults() {
  if (!state.rows.length) {
    setStatus("当前没有可导出的实验结果");
    return;
  }
  await saveRunsToCsv();
  const baseName = sanitizeFileName(`${el.experimentTheme.value.trim() || currentExperiment().theme || "tryon-experiment"}-${new Date().toISOString().slice(0, 10)}`);
  const payload = buildExperimentExportPayload();
  downloadText(`${baseName}-实验结果.csv`, `\ufeff${buildExperimentExportCsv(payload)}`, "text/csv;charset=utf-8");
  setStatus(`已导出实验结果表格：${payload.rows.length} 个 case，${payload.summary.totalRuns} 个成功 run`);
}

function buildExperimentExportPayload() {
  const indexes = state.rows.map((_, index) => index);
  const stats = improvementStats(indexes);
  const rows = state.rows.map((row, index) => {
    const note = state.notes[caseKey(row)] || {};
    return {
      caseIndex: index + 1,
      user_image: row.user_image || "",
      outfit_image: row.outfit_image || "",
      ai_content: row.ai_content || row["输出"] || "",
      original_prompt: originalEvidence(row, "prompt"),
      user_vlm: originalEvidence(row, "user_vlm"),
      outfit_vlm: originalEvidence(row, "outfit_vlm"),
      issue: displayIssue(row),
      notes: note,
      runs: runIndexes(row)
        .slice()
        .reverse()
        .map((runIndex) => ({
          run: runIndex,
          content: runField(row, runIndex, "content"),
          prompt: runField(row, runIndex, "prompt"),
          raw_output: runField(row, runIndex, "raw_output"),
          time: runField(row, runIndex, "time"),
          improvement: runField(row, runIndex, "improvement") || "待确认",
          error: runField(row, runIndex, "error"),
        })),
      raw: row,
    };
  });
  return {
    exportedAt: new Date().toISOString(),
    mode: state.currentExperimentId ? "experiment" : "table",
    experiment: {
      id: state.currentExperimentId || "",
      theme: el.experimentTheme.value.trim() || currentExperiment().theme || "",
      totalSampleSize: sampleDenominator({ fallback: state.rows.length }),
      csvPath: state.csvPath || el.csvPath.value.trim(),
    },
    summary: {
      totalCases: state.rows.length,
      totalRuns: rows.reduce((sum, row) => sum + row.runs.filter((run) => run.content).length, 0),
      markedRuns: stats.total,
      improved: stats.improved,
      failed: stats.failed,
      pending: stats.pending,
      improvementRate: percent(stats.improved, stats.total),
    },
    rows,
  };
}

function buildExperimentExportCsv(payload) {
  const maxRuns = Math.max(0, ...payload.rows.map((row) => row.runs.length));
  const headers = [
    "experiment_theme",
    "total_sample_size",
    "case_index",
    "user_image",
    "outfit_image",
    "ai_content",
    "original_prompt",
    "user_vlm",
    "outfit_vlm",
    "issue_title",
    "issue_note",
    "pm_issue_location",
    "pm_specific_issue",
    "pm_source_field",
    "pm_resolution_type",
    "pm_apply_scope",
    "manual_note",
    "optimization_direction",
  ];
  for (let index = 1; index <= maxRuns; index += 1) {
    headers.push(
      `run_${index}_generated_image_url`,
      `run_${index}_improvement`,
      `run_${index}_time`,
      `run_${index}_prompt`,
    );
  }
  const records = payload.rows.map((row) => {
    const record = {
      experiment_theme: payload.experiment.theme,
      total_sample_size: payload.experiment.totalSampleSize,
      case_index: row.caseIndex,
      user_image: row.user_image,
      outfit_image: row.outfit_image,
      ai_content: row.ai_content,
      original_prompt: row.original_prompt,
      user_vlm: row.user_vlm,
      outfit_vlm: row.outfit_vlm,
      issue_title: row.issue.title || "",
      issue_note: row.issue.note || "",
      pm_issue_location: row.notes.pmIssueLocation || "",
      pm_specific_issue: row.notes.pmSpecificIssue || "",
      pm_source_field: row.notes.pmSourceField || "",
      pm_resolution_type: row.notes.pmResolutionType || "",
      pm_apply_scope: row.notes.pmApplyScope || "",
      manual_note: row.notes.manualNote || "",
      optimization_direction: row.notes.optimizationDirection || "",
    };
    row.runs.forEach((run, index) => {
      const runNumber = index + 1;
      record[`run_${runNumber}_generated_image_url`] = run.content || "";
      record[`run_${runNumber}_improvement`] = run.improvement || "";
      record[`run_${runNumber}_time`] = run.time || "";
      record[`run_${runNumber}_prompt`] = run.prompt || "";
    });
    return record;
  });
  return formatExportCsv(records, headers);
}

async function saveRunsToCsv() {
  if (state.currentExperimentId) {
    await saveCurrentExperimentSilently();
    return;
  }
  if (!state.rows.length) return;
  const path = state.csvPath || el.csvPath.value.trim();
  if (!path) return;
  const data = await api("/api/save-runs", {
    path,
    headers: state.headers,
    rows: state.rows,
  });
  state.headers = data.headers;
  await saveCurrentTableWorkspace({ title: tableTitleFromPath(path) });
}

async function saveCurrentExperimentSilently() {
  if (!state.currentExperimentId) return;
  const experiment = currentExperiment();
  const data = await saveExperimentRecord({
    ...experiment,
    theme: el.experimentTheme.value.trim() || experiment?.theme || "未命名实验",
    totalSampleSize: sampleDenominator({ fallback: state.rows.length }),
    rows: state.rows,
    headers: state.headers,
  });
  state.experiments = data.experiments || state.experiments;
  renderExperimentSelect();
}

async function saveExperimentRecord(experiment) {
  try {
    return await api("/api/experiments/save", { experiment });
  } catch {
    const saved = saveExperimentLocally(experiment);
    return { experiment: saved, experiments: readStoredExperiments() };
  }
}

async function saveEvaluationRecord(evaluation) {
  try {
    const data = await api("/api/evaluations/save", { evaluation });
    writeStoredEvaluations(data.evaluations || []);
    return data;
  } catch {
    const saved = saveEvaluationLocally(evaluation);
    return { evaluation: saved, evaluations: readStoredEvaluations() };
  }
}

async function deleteEvaluationRecord(id) {
  try {
    const data = await api("/api/evaluations/delete", { id });
    state.evaluations = data.evaluations || [];
    writeStoredEvaluations(state.evaluations);
    return;
  } catch {
    const next = readStoredEvaluations().filter((item) => item.id !== id);
    writeStoredEvaluations(next);
    state.evaluations = next;
  }
}

function saveEvaluationLocally(record) {
  const evaluations = readStoredEvaluations();
  const now = new Date().toISOString();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || now,
    updatedAt: now,
    theme: record.theme || "未命名评测",
    evaluationDate: record.evaluationDate || now.slice(0, 10),
    totalSampleSize: Number(record.totalSampleSize) || "",
    vlmPromptVersion: record.vlmPromptVersion || "",
    generationPromptVersion: record.generationPromptVersion || "",
    headers: Array.isArray(record.headers) ? record.headers : [],
    rows: Array.isArray(record.rows) ? record.rows : [],
    summary: record.summary || {},
  };
  const next = evaluations.filter((item) => item.id !== entry.id);
  next.push(entry);
  writeStoredEvaluations(next);
  return entry;
}

async function deleteExperimentRecord(id) {
  try {
    const data = await api("/api/experiments/delete", { id });
    state.experiments = data.experiments || [];
    writeStoredExperiments(state.experiments);
    return;
  } catch {
    const next = readStoredExperiments().filter((item) => item.id !== id);
    writeStoredExperiments(next);
    state.experiments = next;
  }
}

function saveExperimentLocally(record) {
  const experiments = readStoredExperiments();
  const now = new Date().toISOString();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || now,
    updatedAt: now,
    theme: record.theme || "未命名实验",
    totalSampleSize: Number(record.totalSampleSize) || "",
    headers: Array.isArray(record.headers) ? record.headers : ["user_image", "outfit_image", "ai_content"],
    rows: Array.isArray(record.rows) ? record.rows : [],
  };
  const next = experiments.filter((item) => item.id !== entry.id);
  next.push(entry);
  writeStoredExperiments(next);
  return entry;
}

function readStoredExperiments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPERIMENTS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredExperiments(experiments) {
  try {
    localStorage.setItem(EXPERIMENTS_STORAGE_KEY, JSON.stringify(experiments));
  } catch {
    // localStorage may be unavailable in restricted file:// contexts.
  }
}

function readStoredEvaluations() {
  try {
    const parsed = JSON.parse(localStorage.getItem("tryon_badcase_evaluation_rounds_v1") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredEvaluations(evaluations) {
  try {
    localStorage.setItem("tryon_badcase_evaluation_rounds_v1", JSON.stringify(evaluations));
  } catch {
    // localStorage may be unavailable in restricted file:// contexts.
  }
}

async function importTechReasons() {
  if (!state.rows.length) {
    setStatus("请先加载当前 CSV，再导入历史侦查表");
    return;
  }
  await busy("按 ai_content 匹配导入技术原因中...", async () => {
    const data = await api("/api/tech-reasons/import", {
      xlsxPath: el.techReasonPath.value.trim(),
      rows: state.rows,
    });
    state.notes = data.notes || state.notes;
    const first = data.imported?.[0];
    if (first?.category) {
      const clusters = investigationClusters();
      const matched = clusters.find((cluster) => cluster.sampleNote === first.techReason || cluster.title.includes(first.category));
      if (matched) state.selectedClusterKey = matched.key;
    }
    state.activeTab = "overview";
    render();
    setStatus(`已导入 ${data.importedCount} 条技术原因，未匹配 ${data.missingCount} 条。侦查记录池已按技术原因归因聚类。`);
  });
}

async function loadPrompts() {
  if (location.protocol === "file:") {
    setStatus("当前是 file:// 页面，无法稳定读取 Coze Prompt。请使用 http://127.0.0.1:5232/ 打开工作台。");
    return;
  }
  await busy("读取 Coze Prompt 中...", async () => {
    const data = await getApi("/api/coze/prompts");
    el.userSystemPrompt.value = data.prompts.userSystemPrompt || "";
    el.userPrompt.value = data.prompts.userPrompt || "";
    el.outfitSystemPrompt.value = data.prompts.outfitSystemPrompt || "";
    el.outfitPrompt.value = data.prompts.outfitPrompt || "";
    el.promptCode.value = data.prompts.promptCode || "";
    state.promptSnapshot = { ...data.prompts };
    state.activeTab = "optimize";
    persistUiState();
    renderTabs();
    refreshAutoAnalysisFields();
    setStatus("已读取 Coze 当前 prompt，并已切换到修改台");
  });
}

async function applyPrompts() {
  await busy("应用 Prompt 到 Coze 中...", async () => {
    await applyPromptsCore();
    setStatus("已发送 prompt 修改到 Coze");
  });
}

async function applyPromptsCore() {
  await saveCurrentNotes("", { silent: true });
  const prompts = currentPrompts();
  await api("/api/coze/apply-prompts", {
    prompts,
    log: {
      ...currentCaseContext(),
      notes: currentNoteValues(),
      promptsBefore: state.promptSnapshot,
    },
  });
  state.promptSnapshot = { ...prompts };
  refreshAutoAnalysisFields();
  return prompts;
}

async function runSelectedCase() {
  if (state.selectedIndex < 0) return;
  await runCaseIndexes([state.selectedIndex], runCount());
}

async function runCheckedCases() {
  const indexes = visibleCheckedIndexes();
  if (!indexes.length) {
    setStatus("当前筛选页面内没有已勾选的 case");
    return;
  }
  await runCaseIndexes(indexes, runCount());
}

async function runCaseIndexes(indexes, count, options = {}) {
  if (state.running) {
    setStatus("已有复跑任务进行中，请等待当前任务完成后再开始新的复跑");
    return;
  }
  const runLabel = options.label || `Coze 复跑 ${indexes.length} 个 case，每个 ${count} 次`;
  await runInBackground(`${runLabel} 中...`, async () => {
    await saveCurrentNotes("", { silent: true });
    const totalRuns = indexes.length * count;
    const startedAt = Date.now();
    const concurrency = runConcurrency(indexes.length, count);
    const timer = setInterval(() => {
      setStatus(`${runLabel}：共 ${totalRuns} 次，并发 ${concurrency}，已用 ${formatDuration(Date.now() - startedAt)}。`);
    }, 1000);
    let data;
    try {
      data = await api("/api/coze/run-cases-batch", {
        count,
        concurrency,
        timeoutMs: 180000,
        cases: indexes.map((index) => casePayload(index)),
      });
    } finally {
      clearInterval(timer);
    }
    applyBatchRunResults(state.rows, data.caseResults);
    for (const row of state.rows) mergeHeaders(Object.keys(row));
    await saveRunsToCsv();
    render();
    const failedCount = data.caseResults
      .flatMap((caseResult) => caseResult.results || [])
      .filter((result) => result.error).length;
    const totalCount = data.caseResults
      .reduce((sum, caseResult) => sum + (caseResult.results?.length || 0), 0);
    const duration = formatDuration(Date.now() - startedAt);
    const failureSummary = summarizeFailureReasons(data.caseResults);
    setStatus(failedCount
      ? `已完成 ${data.caseResults.length} 个 case 的批量复跑，共 ${totalCount} 次，用时 ${duration}，其中 ${failedCount} 次失败。${failureSummary}`
      : `已完成 ${data.caseResults.length} 个 case 的批量复跑，共 ${totalCount} 次，用时 ${duration}`);
  });
}

function summarizeFailureReasons(caseResults = []) {
  const errors = caseResults
    .flatMap((caseResult) => caseResult.results || [])
    .map((result) => result.error)
    .filter(Boolean)
    .map(normalizeFailureReason);
  if (!errors.length) return "";
  const counts = new Map();
  for (const error of errors) counts.set(error, (counts.get(error) || 0) + 1);
  const [reason, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return `主要原因：${reason}（${count} 次）。`;
}

function normalizeFailureReason(error) {
  const text = String(error || "");
  if (/内嵌页不可用|test run panel unavailable|buttons\":\[\]|bodyTail\":\"\"/.test(text)) {
    return "Coze 工作流试运行面板不可用，请刷新/重新登录 Coze 工作流页";
  }
  if (/input fill failed|输入未正确填写|JSON input fill failed/.test(text)) {
    return "试运行输入未成功填写，请确认工作流输入字段为 String 且字段名为 user_image/outfit_image";
  }
  if (/No Coze workflow page|没有找到/.test(text)) {
    return "没有找到已打开的 Coze 工作流页";
  }
  if (/fetch failed|Chrome 调试端口不可访问|ECONNREFUSED|Failed to fetch/i.test(text)) {
    return "线上服务无法连接 Chrome 调试端口。Coze 自动复跑需要在服务所在环境启动带 remote debugging 的 Chrome，或部署本地 runner";
  }
  return text.slice(0, 120);
}

async function rerunSelectedFailedRun() {
  const row = selectedRow();
  if (!row) return;
  const runIndex = selectedRunIndex(row);
  if (!runIndex || !runField(row, runIndex, "error")) {
    setStatus("当前选中的 Run 不是失败记录，无需重跑");
    return;
  }
  await runCaseIndexes([state.selectedIndex], 1);
}

async function clearSelectedRunRecords() {
  const indexes = resolveRunMaintenanceIndexes(el.clearRunsScope.value);
  const runnableIndexes = indexes.filter((index) => runIndexes(state.rows[index]).length);
  if (!runnableIndexes.length) {
    setStatus("当前范围内暂无复跑记录可清空");
    return;
  }
  const ok = window.confirm(`确认清空 ${runnableIndexes.length} 个 case 的复跑记录吗？原始输入图、原始 ai_content 和侦查备注都会保留。`);
  if (!ok) return;
  const result = clearRunRecordsForRows(state.rows, runnableIndexes);
  await saveRunsToCsv();
  persistUiState();
  render();
  setStatus(`已清空 ${result.cases} 个 case 的复跑记录（删除 ${result.fields} 个运行字段）`);
}

async function rerunFailedCheckedCases() {
  const indexes = filteredRows()
    .map((item) => item.index)
    .filter((index) => hasFailedRun(state.rows[index]));
  if (!indexes.length) {
    setStatus("当前筛选页面内没有可重跑的失败 case");
    return;
  }
  await runCaseIndexes(indexes, 1, { label: `重跑当前筛选失败 ${indexes.length} 个 case` });
}

function render() {
  const rows = filteredRows();
  renderTabs();
  renderOptimizationBoard();
  renderEvaluationDashboard();
  renderAdHocRunResults();
  el.caseCount.textContent = `${rows.length} / ${state.rows.length}，已选 ${state.checkedIndexes.size}`;
  el.caseList.innerHTML = "";
  if (!rows.some((item) => item.index === state.selectedIndex)) {
    state.selectedIndex = rows[0]?.index ?? -1;
  }
  renderCaseNavigator(rows);
  rows.forEach(({ row, index }) => {
    const item = document.createElement("article");
    item.className = `case-item${index === state.selectedIndex ? " active" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "case-check";
    checkbox.dataset.index = String(index);
    checkbox.setAttribute("onclick", "window.__tryonToggleCase?.(this)");
    checkbox.checked = state.checkedIndexes.has(index);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.checkedIndexes.add(index);
      } else {
        state.checkedIndexes.delete(index);
      }
      persistUiState();
      render();
    });
    const button = document.createElement("button");
    button.className = "case-open";
    button.type = "button";
    const issue = displayIssue(row);
    const note = state.notes[caseKey(row)];
    const position = rows.findIndex((item) => item.index === index) + 1;
    button.innerHTML = `
      <strong>${position}. #${index + 1}</strong>
      <span>${escapeHtml(note?.techReasonCategory || issue.title)}</span>
      <small>${escapeHtml(issue.note || note?.pmSpecificIssue || issue.dimensionLabel)}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedIndex = index;
      state.activeTab = "inspect";
      persistUiState();
      render();
    });
    item.append(checkbox, button);
    el.caseList.append(item);
  });
  keepActiveCaseVisible();
  renderSelected();
}

function renderAdHocRunResults() {
  if (!el.adHocRunResults) return;
  if (!state.adHocRuns.length) {
    el.adHocRunResults.innerHTML = "临时复跑结果会显示在这里。";
    return;
  }
  el.adHocRunResults.innerHTML = state.adHocRuns.map((group, groupIndex) => {
    const results = group.results || [];
    const failedCount = results.filter((result) => result.error).length;
    const pendingCount = results.filter((result) => result.pending).length;
    return `
      <article class="ad-hoc-run-group">
        <div class="ad-hoc-run-head">
          <strong>临时复跑 #${state.adHocRuns.length - groupIndex}</strong>
          <span>${escapeHtml(formatTime(group.createdAt))}</span>
          <small>${results.length} 次${pendingCount ? " / 运行中" : ""}${failedCount ? ` / ${failedCount} 失败` : ""}</small>
        </div>
        <div class="ad-hoc-inputs">
          <span>User: ${escapeHtml(group.user_image)}</span>
          <span>Outfit: ${escapeHtml(group.outfit_image)}</span>
        </div>
        <div class="ad-hoc-result-grid">
          ${results.map((result, index) => adHocRunResultCard(result, index + 1)).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function adHocRunResultCard(result, index) {
  if (result.pending) {
    return `
      <article class="ad-hoc-result-card">
        <h3>Run ${index}</h3>
        <p class="pending-text">运行中，等待 Coze 返回结果...</p>
      </article>
    `;
  }
  const content = result.error ? `ERROR:${result.error}` : result.content;
  return `
    <article class="ad-hoc-result-card">
      <h3>Run ${index}</h3>
      ${imageCardBody(content, `临时 Run ${index}`)}
      <details>
        <summary>查看 prompt / VLM</summary>
        <pre>${escapeHtml(result.prompt || result.rawOutput || result.raw || "暂无")}</pre>
      </details>
    </article>
  `;
}

function keepActiveCaseVisible() {
  const active = el.caseList.querySelector(".case-item.active");
  if (!active) return;
  const listRect = el.caseList.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const padding = 10;
  if (activeRect.top < listRect.top + padding) {
    el.caseList.scrollTop -= (listRect.top + padding) - activeRect.top;
  } else if (activeRect.bottom > listRect.bottom - padding) {
    el.caseList.scrollTop += activeRect.bottom - (listRect.bottom - padding);
  }
}

function renderCaseNavigator(rows) {
  const selectedPosition = rows.findIndex((item) => item.index === state.selectedIndex);
  const displayPosition = selectedPosition >= 0 ? selectedPosition + 1 : 0;
  el.casePosition.textContent = `${displayPosition} / ${rows.length}`;
  el.caseJumpInput.max = String(Math.max(rows.length, 1));
  el.caseJumpInput.value = String(displayPosition || 1);
  el.prevCaseBtn.disabled = selectedPosition <= 0;
  el.nextCaseBtn.disabled = selectedPosition < 0 || selectedPosition >= rows.length - 1;
}

function moveSelectedCase(delta) {
  const rows = filteredRows();
  const current = rows.findIndex((item) => item.index === state.selectedIndex);
  const next = Math.max(0, Math.min(rows.length - 1, (current < 0 ? 0 : current) + delta));
  if (!rows[next]) return;
  state.selectedIndex = rows[next].index;
  state.activeTab = "inspect";
  persistUiState();
  render();
}

function jumpToCasePosition() {
  const rows = filteredRows();
  const value = Math.max(1, Math.min(rows.length, Math.floor(Number(el.caseJumpInput.value) || 1)));
  const target = rows[value - 1];
  if (!target) return;
  state.selectedIndex = target.index;
  state.activeTab = "inspect";
  persistUiState();
  render();
}

function renderTabs() {
  if (!["overview", "evaluation", "inspect", "optimize"].includes(state.activeTab)) state.activeTab = "overview";
  el.app.classList.toggle("evaluation-tab", state.activeTab === "evaluation");
  el.workspace.classList.toggle("evaluation-mode", state.activeTab === "evaluation");
  for (const button of el.workflowTabs.querySelectorAll("[data-tab]")) {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-tab-panel]")) {
    panel.classList.toggle("active", panel.dataset.tabPanel === state.activeTab);
  }
  for (const node of document.querySelectorAll("[data-action-scope], [data-panel-scope]")) {
    const scopes = String(node.dataset.actionScope || node.dataset.panelScope || "").split(/\s+/);
    node.hidden = !scopes.includes(state.activeTab);
  }
}

function renderOptimizationBoard() {
  const sourceClusters = issueClusters();
  const investigations = investigationClusters();
  const clusters = allProblemClusters();
  if (!clusters.some((cluster) => cluster.key === state.selectedClusterKey)) state.selectedClusterKey = "all";
  el.clusterSelect.innerHTML = [
    `<option value="all">全部问题簇</option>`,
    ...clusters.map((cluster) => `<option value="${escapeHtml(cluster.key)}">${escapeHtml(cluster.title)}（${cluster.caseIndexes.length}）</option>`),
  ].join("");
  el.clusterSelect.value = state.selectedClusterKey;

  const selected = state.selectedClusterKey === "all"
    ? null
    : clusters.find((cluster) => cluster.key === state.selectedClusterKey);
  const zeroCaseCount = new Set(sourceClusters.flatMap((cluster) => cluster.caseIndexes)).size;
  const selectedCaseIndexes = selected?.caseIndexes || [...new Set(clusters.flatMap((cluster) => cluster.caseIndexes))];
  const improvedCount = selectedCaseIndexes.filter((index) => isMarkedImproved(state.rows[index])).length;
  const rerunCount = selectedCaseIndexes.filter((index) => runIndexes(state.rows[index]).length > 0).length;
  const stats = improvementStats(selectedCaseIndexes);
  const denominator = sampleDenominator({ fallback: state.rows.length });
  const beforeShare = denominator ? percent(selectedCaseIndexes.length, denominator) : "0%";
  const afterShare = denominator ? percent(Math.max(0, selectedCaseIndexes.length - improvedCount), denominator) : "0%";
  el.metricGrid.innerHTML = [
    metricCard("当前问题占比", beforeShare, `${selectedCaseIndexes.length} / ${denominator || state.rows.length} cases`),
    metricCard("预计优化后占比", afterShare, `${Math.max(0, selectedCaseIndexes.length - improvedCount)} / ${denominator || state.rows.length} cases`),
    metricCard("已复跑覆盖", percent(rerunCount, selectedCaseIndexes.length), `${rerunCount} / ${selectedCaseIndexes.length} cases`),
    metricCard("复跑改善率", percent(stats.improved, stats.total), `${stats.improved} 改善 / ${stats.failed} 未改善 / ${stats.pending} 待确认`),
  ].join("");
  renderReviewQuickFilters(selectedCaseIndexes);
  renderEvaluationDashboard();

  el.clusterList.innerHTML = sourceClusters.length
    ? sourceClusters.slice(0, 8).map((cluster) => clusterCard(cluster, denominator || zeroCaseCount)).join("")
    : "<p class=\"muted\">当前 CSV 没有读取到 0 分问题簇。</p>";
  for (const button of el.clusterList.querySelectorAll("[data-cluster-key]")) {
    button.addEventListener("click", () => {
      state.selectedClusterKey = button.dataset.clusterKey;
      el.pmApplyScope.value = "cluster";
      persistUiState();
      render();
    });
  }
  renderInvestigationBoard(investigations);
  renderPeChangeBoard();
}

function metricCard(label, value, subtext) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(subtext)}</small>
    </article>
  `;
}

function renderReviewQuickFilters(indexes) {
  const counts = improvementStats(indexes);
  const active = state.filters.improvement || "all";
  const chips = [
    ["needs-review", "待复查", counts.failed + counts.pending],
    ["未改善", "未改善", counts.failed],
    ["待确认", "待确认", counts.pending],
    ["all", "全部状态", indexes.length],
  ];
  el.reviewQuickFilters.innerHTML = `
    <div class="quick-filter-head">
      <strong>复跑验收快捷筛选</strong>
      <span>快速查看未改善和未确认 case</span>
    </div>
    <div class="quick-filter-actions">
      ${chips.map(([value, label, count]) => `<button class="${active === value ? "active" : ""}" type="button" data-improvement-filter="${escapeHtml(value)}">${escapeHtml(label)} <b>${count}</b></button>`).join("")}
    </div>
  `;
  for (const button of el.reviewQuickFilters.querySelectorAll("[data-improvement-filter]")) {
    button.addEventListener("click", () => {
      el.improvementFilter.value = button.dataset.improvementFilter;
      updateFilters();
      state.activeTab = "inspect";
      persistUiState();
      render();
    });
  }
}

function renderEvaluationDashboard() {
  const rows = state.evaluationRows.length ? state.evaluationRows : (state.activeTab === "evaluation" ? [] : state.rows);
  const summary = buildEvaluationSummary(rows);
  if (!summary.scored) {
    el.evaluationSummary.innerHTML = "<p class=\"muted\">上传包含四个评测维度分数的整体评测表后，这里会显示合格率、完美率和各维度指标。</p>";
    if (el.evaluationCompare) el.evaluationCompare.innerHTML = renderEvaluationHistory();
    el.evaluationClusterList.innerHTML = "";
    return;
  }
  const denominator = Number(el.evaluationSampleSize.value) || summary.scored;
  el.evaluationSummary.innerHTML = `
    <section class="evaluation-card">
      <div class="quick-filter-head">
        <strong>整体评测数据</strong>
        <span>${summary.scored} / ${summary.total} 个 case 有完整四维评分；占比分母 ${denominator}</span>
      </div>
      <div class="evaluation-metrics">
        ${metricMini("整体合格率", percent(summary.qualified, summary.scored), `${summary.qualified} / ${summary.scored}`)}
        ${metricMini("整体完美率", percent(summary.perfect, summary.scored), `${summary.perfect} / ${summary.scored}`)}
        ${summary.dimensions.map((item) => metricMini(`${item.label}合格/完美`, `${percent(item.pass, item.total)} / ${percent(item.perfect, item.total)}`, `${item.pass}/${item.total} · ${item.perfect}/${item.total}`)).join("")}
      </div>
    </section>
  `;
  if (el.evaluationCompare) el.evaluationCompare.innerHTML = renderEvaluationHistory();
  const failClusters = buildEvaluationClusters(rows, "fail").slice(0, 8);
  const imperfectClusters = buildEvaluationClusters(rows, "imperfect").slice(0, 8);
  el.evaluationClusterList.innerHTML = `
    <section class="evaluation-card">
      <div class="quick-filter-head">
        <strong>整体评测归因聚类</strong>
        <span>点击归因簇后，可直接筛选对应 case 开展实验</span>
      </div>
      <div class="evaluation-cluster-columns">
        ${evaluationClusterColumn("不合格归因", failClusters, summary.scored)}
        ${evaluationClusterColumn("不完美归因", imperfectClusters, summary.scored)}
      </div>
    </section>
  `;
  for (const button of el.evaluationClusterList.querySelectorAll("[data-evaluation-cluster-key]")) {
    button.addEventListener("click", () => {
      state.selectedEvaluationClusterKey = button.dataset.evaluationClusterKey;
      if (state.evaluationRows.length) {
        state.rows = state.evaluationRows;
        state.headers = state.evaluationHeaders;
        state.selectedIndex = state.rows.length ? 0 : -1;
      }
      state.selectedClusterKey = "all";
      state.activeTab = "inspect";
      persistUiState();
      render();
    });
  }
  for (const button of el.evaluationCompare?.querySelectorAll("[data-history-evaluation-id]") || []) {
    button.addEventListener("click", () => {
      const evaluation = state.evaluations.find((item) => item.id === button.dataset.historyEvaluationId);
      if (evaluation) loadEvaluationIntoWorkspace(evaluation);
    });
  }
}

function renderEvaluationHistory() {
  if (!state.evaluations.length) return "";
  const sorted = state.evaluations
    .slice()
    .sort((a, b) => String(b.evaluationDate || b.updatedAt || "").localeCompare(String(a.evaluationDate || a.updatedAt || "")));
  return `
    <section class="evaluation-card">
      <div class="quick-filter-head">
        <strong>多轮评测记录</strong>
        <span>用于对比 prompt 版本之间的整体效果</span>
      </div>
      <div class="evaluation-history">
        ${sorted.map((item) => evaluationHistoryRow(item)).join("")}
      </div>
    </section>
  `;
}

function evaluationHistoryRow(item) {
  const summary = item.summary?.scored ? item.summary : buildEvaluationSummary(item.rows || []);
  const active = item.id === state.currentEvaluationId ? " active" : "";
  return `
    <button class="evaluation-history-row${active}" type="button" data-history-evaluation-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.theme || "未命名评测")}</strong>
      <span>${escapeHtml(item.evaluationDate || "未填日期")} · 样本 ${escapeHtml(item.totalSampleSize || item.rows?.length || "")}</span>
      <span>合格 ${percent(summary.qualified || 0, summary.scored || 0)} · 完美 ${percent(summary.perfect || 0, summary.scored || 0)}</span>
      <small>VLM ${escapeHtml(item.vlmPromptVersion || "-")} / 生图 ${escapeHtml(item.generationPromptVersion || "-")}</small>
    </button>
  `;
}

function metricMini(label, value, subtext) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(subtext)}</small></article>`;
}

function evaluationClusterColumn(title, clusters, denominator) {
  return `
    <div>
      <h3>${escapeHtml(title)}</h3>
      <div class="evaluation-clusters">
        ${clusters.length ? clusters.map((cluster) => evaluationClusterButton(cluster, denominator)).join("") : "<p class=\"muted\">暂无归因簇</p>"}
      </div>
    </div>
  `;
}

function evaluationClusterButton(cluster, denominator) {
  const active = cluster.key === state.selectedEvaluationClusterKey ? " active" : "";
  return `
    <button class="evaluation-cluster${active}" type="button" data-evaluation-cluster-key="${escapeHtml(cluster.key)}">
      <strong>${escapeHtml(cluster.title)}</strong>
      <span>${cluster.caseIndexes.length} cases · ${percent(cluster.caseIndexes.length, denominator)}</span>
      <small>${escapeHtml(cluster.sampleNote || "暂无备注")}</small>
    </button>
  `;
}

function clusterCard(cluster, zeroCaseCount) {
  const active = cluster.key === state.selectedClusterKey ? " active" : "";
  return `
    <button class="cluster-card${active}" type="button" data-cluster-key="${escapeHtml(cluster.key)}">
      <strong>${escapeHtml(cluster.title)}</strong>
      <span>${cluster.caseIndexes.length} cases · ${percent(cluster.caseIndexes.length, zeroCaseCount)} of total samples</span>
      <small>${escapeHtml(cluster.sampleNote || "暂无备注")}</small>
    </button>
  `;
}

function renderInvestigationBoard(investigations) {
  el.investigationBoard.innerHTML = `
    <div class="pe-board-head">
      <strong>侦查记录池</strong>
      <span>${investigations.length} 个同质问题簇</span>
    </div>
    ${investigations.length ? `
      <div class="investigation-list">
        ${investigations.slice(0, 10).map((cluster) => investigationCard(cluster)).join("")}
      </div>
    ` : "<p class=\"muted\">完成 PM 技术定位并保存备注后，系统会在这里自动聚类你的侦查问题。</p>"}
  `;
  for (const button of el.investigationBoard.querySelectorAll("[data-investigation-key]")) {
    button.addEventListener("click", () => {
      state.selectedClusterKey = button.dataset.investigationKey;
      el.pmApplyScope.value = "cluster";
      persistUiState();
      render();
    });
  }
}

function investigationCard(cluster) {
  const active = cluster.key === state.selectedClusterKey ? " active" : "";
  return `
    <button class="investigation-card${active}" type="button" data-investigation-key="${escapeHtml(cluster.key)}">
      <strong>${escapeHtml(cluster.title)}</strong>
      <span>${cluster.caseIndexes.length} cases · ${escapeHtml(cluster.resolutionType || "未记录处理方式")}</span>
      <small>${escapeHtml(cluster.sampleNote || "暂无具体问题")}</small>
    </button>
  `;
}

function allProblemClusters() {
  const clusters = [...issueClusters(), ...investigationClusters()];
  if (!clusters.length && state.currentExperimentId && state.rows.length) {
    return [{
      key: "experiment:all",
      title: "当前实验全部 Case",
      sampleNote: "手动实验暂无人工评测维度，按实验全集统计复跑效果。",
      caseIndexes: state.rows.map((_, index) => index),
    }];
  }
  return clusters;
}

function issueClusters() {
  const map = new Map();
  state.rows.forEach((row, index) => {
    for (const issue of zeroScoreIssues(row)) {
      const phrase = normalizeClusterPhrase(issue.problemText || issue.noteText || "未分类");
      const key = `${issue.id}:${phrase}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: `${issue.label} · ${phrase}`,
          sampleNote: issue.noteText,
          caseIndexes: [],
        });
      }
      const cluster = map.get(key);
      if (!cluster.caseIndexes.includes(index)) cluster.caseIndexes.push(index);
      if (!cluster.sampleNote && issue.noteText) cluster.sampleNote = issue.noteText;
    }
  });
  return [...map.values()].sort((a, b) => b.caseIndexes.length - a.caseIndexes.length || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function investigationClusters() {
  const map = new Map();
  state.rows.forEach((row, index) => {
    const note = state.notes[caseKey(row)];
    const parts = investigationClusterParts(note);
    if (!parts) return;
    const { location, resolutionType, phrase, sampleNote } = parts;
    const key = `investigation:${location}:${resolutionType}:${phrase}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: `${location} · ${phrase}`,
        sampleNote,
        resolutionType,
        caseIndexes: [],
      });
    }
    map.get(key).caseIndexes.push(index);
  });
  return [...map.values()].sort((a, b) => b.caseIndexes.length - a.caseIndexes.length || a.title.localeCompare(b.title, "zh-Hans-CN"));
}


function normalizeClusterPhrase(text) {
  const value = String(text || "")
    .replace(/[，,。；;、/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "未分类";
  const rules = [
    [/长发|短发|发型|头发|刘海|发色/, "发型污染/发型不还原"],
    [/头肩|头身|头太大|比例|头大/, "头肩/头身比例异常"],
    [/肤色|妆容|脸|面部|五官|身份/, "面部身份/肤色妆容问题"],
    [/手|脚|肢体|姿势|动作|悬浮|重心/, "姿势肢体问题"],
    [/服装|衣服|款式|颜色|材质|图案|版型|包|鞋/, "服装特征问题"],
    [/背景|场景|水印|柱子|树|幻觉|物件/, "场景背景幻觉"],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] || value.slice(0, 24);
}

function selectCurrentClusterCases() {
  const clusters = allProblemClusters();
  const indexes = state.selectedClusterKey === "all"
    ? [...new Set(clusters.flatMap((cluster) => cluster.caseIndexes))]
    : clusters.find((cluster) => cluster.key === state.selectedClusterKey)?.caseIndexes || [];
  if (!indexes.length) {
    setStatus("当前没有可勾选的问题簇 case");
    return;
  }
  for (const index of indexes) state.checkedIndexes.add(index);
  setStatus(`已勾选问题簇内 ${indexes.length} 个 case`);
  render();
}

function renderPeChangeBoard() {
  const changes = state.peChanges.slice(-6).reverse();
  el.peChangeBoard.innerHTML = changes.length ? `
    <div class="pe-board-head">
      <strong>PE 修改记录</strong>
      <span>${state.peChanges.length} 条</span>
    </div>
    <div class="pe-change-list">
      ${changes.map((item) => `
        <article class="pe-change-item">
          <strong>${escapeHtml(item.issueLocation || "未定位")} · ${escapeHtml(item.resolutionType || "未记录处理方式")}</strong>
          <span>${escapeHtml(item.specificIssue || item.changeSummary || "暂无具体问题")}</span>
          <small>${escapeHtml(item.scopeLabel || "")} · ${escapeHtml(item.targetCount ?? 0)} cases · ${escapeHtml(item.effectConclusion || "待验证")}</small>
        </article>
      `).join("")}
    </div>
  ` : `
    <div class="pe-board-head">
      <strong>PE 修改记录</strong>
      <span>暂无</span>
    </div>
    <p class="muted">完成一次 PM 技术定位后，点击“记录 PE 修改”或“应用并复跑范围”，这里会沉淀每次修改和验证结果。</p>
  `;
}

function isMarkedImproved(row) {
  const runValues = runIndexes(row).map((index) => runField(row, index, "improvement"));
  if (runValues.some((value) => value === "改善" || value === "部分改善")) return true;
  const note = state.notes[caseKey(row)] || {};
  const text = `${note.effectConclusion || ""} ${note.optimizationDirection || ""}`;
  return /改善|通过|有效|下降/.test(text) && !/未改善|无改善|没有改善/.test(text);
}

function improvementStats(indexes) {
  const latestValues = indexes
    .map((index) => {
      const row = state.rows[index];
      const latest = runIndexes(row)[0];
      return latest ? runField(row, latest, "improvement") || "待确认" : "";
    })
    .filter(Boolean);
  const improved = latestValues.filter((value) => value === "改善" || value === "部分改善").length;
  const failed = latestValues.filter((value) => value === "未改善").length;
  const pending = latestValues.filter((value) => value === "待确认").length;
  return { total: latestValues.length, improved, failed, pending };
}

function percent(count, total) {
  if (!total) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function sampleDenominator(options = {}) {
  const fallback = Number(options.fallback) || state.rows.length || 0;
  const value = Math.floor(Number(el.totalSampleSize.value));
  return value > 0 ? value : fallback;
}

function renderSelected() {
  const row = selectedRow();
  if (!row) {
    el.imageGrid.className = "image-grid empty";
    el.imageGrid.innerHTML = "<p>选择一个 case 后展示图片对比</p>";
    el.currentPrompt.textContent = "";
    el.rawOutput.textContent = "";
    el.evidenceText.textContent = "";
    el.evidenceMeta.textContent = "原始证据";
    el.judgeResult.textContent = "AI 裁判结果会显示在这里。";
    el.runSelect.innerHTML = "";
    el.runTabs.innerHTML = "";
    el.rerunFailedBtn.hidden = true;
    el.clearRunsBtn.hidden = true;
    el.runImprovementControls.innerHTML = "";
    setNoteFields({});
    return;
  }

  fillAdHocImagesFromSelectedCase();
  const runIndex = selectedRunIndex(row);
  el.imageGrid.className = "image-grid";
  const runContent = runIndex ? runField(row, runIndex, "content") : latestContent(row);
  const runError = runIndex ? runField(row, runIndex, "error") : "";
  const runRawOutput = runIndex ? runField(row, runIndex, "raw_output") : latestField(row, "raw_output");
  const runPrompt = runIndex ? runField(row, runIndex, "prompt") : latestField(row, "prompt");
  const images = [
    ["User Image", row.user_image],
    ["Outfit Image", row.outfit_image],
    ["原始 ai_content", row.ai_content || row["输出"]],
    [runIndex ? `Run ${runIndex} content` : "最新 content", runContent || (runError ? `ERROR:${runError}` : "")],
  ];
  el.imageGrid.innerHTML = images.map(([title, src]) => imageCard(title, src)).join("");
  renderRunOptions(row, runIndex);
  el.rerunFailedBtn.hidden = !runIndex || !runError;
  el.clearRunsBtn.hidden = !runIndexes(row).length;
  renderRunImprovementControls(row, runIndex);
  el.currentPrompt.textContent = runPrompt || row.coze_run_1_prompt || "";
  el.rawOutput.textContent = runRawOutput || (runError ? `运行失败：${runError}` : "");
  const evidence = selectedEvidence(row, runIndex);
  el.evidenceMeta.textContent = evidence.meta;
  el.evidenceText.textContent = evidence.text;
  setNoteFields(state.notes[caseKey(row)] || {});
  el.judgeResult.textContent = state.notes[caseKey(row)]?.judgeResult || "AI 裁判结果会显示在这里。";
  refreshAutoAnalysisFields();
}

function fillAdHocImagesFromSelectedCase(options = {}) {
  const row = selectedRow();
  if (!row || !el.adHocUserImage || !el.adHocOutfitImage) return;
  const userImage = String(row.user_image || "").trim();
  const outfitImage = String(row.outfit_image || "").trim();
  const force = Boolean(options.force);

  if (userImage && shouldReplaceAdHocImageValue({
    currentValue: el.adHocUserImage.value,
    previousAutoValue: state.adHocAutoImages.user_image,
    force,
  })) {
    el.adHocUserImage.value = userImage;
    state.adHocAutoImages.user_image = userImage;
  }

  if (outfitImage && shouldReplaceAdHocImageValue({
    currentValue: el.adHocOutfitImage.value,
    previousAutoValue: state.adHocAutoImages.outfit_image,
    force,
  })) {
    el.adHocOutfitImage.value = outfitImage;
    state.adHocAutoImages.outfit_image = outfitImage;
  }

  if (force) {
    persistUiState();
    setStatus("已读取当前 case 的用户图和模特图 URL 到临时复跑输入框");
  }
}

function imageCard(title, src) {
  return `
    <article class="image-card">
      <h3>${escapeHtml(title)}</h3>
      ${imageCardBody(src, title)}
    </article>
  `;
}

function imageCardBody(src, title) {
  if (src?.startsWith?.("ERROR:")) {
    return `
      <p class="error-text">${escapeHtml(src.slice("ERROR:".length))}</p>
    `;
  }
  const safeSrc = src && /^https?:\/\//.test(src) ? src : "";
  return `
    ${safeSrc ? `
      <button class="image-preview-button" type="button" data-image-src="${escapeHtml(safeSrc)}" data-image-title="${escapeHtml(title)}">
        <img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(title)}">
      </button>
    ` : "<p>暂无</p>"}
  `;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function openImageLightbox(src, title) {
  if (!src) return;
  el.imageLightboxImg.src = src;
  el.imageLightboxImg.alt = title || "大图预览";
  el.imageLightboxTitle.textContent = title || "";
  el.imageLightbox.hidden = false;
  document.body.classList.add("lightbox-open");
}

function closeImageLightbox() {
  el.imageLightbox.hidden = true;
  el.imageLightboxImg.removeAttribute("src");
  el.imageLightboxTitle.textContent = "";
  document.body.classList.remove("lightbox-open");
}

function selectedRow() {
  return state.rows[state.selectedIndex];
}

function latestContent(row) {
  return latestField(row, "content");
}

function selectedRunIndex(row) {
  const indexes = runIndexes(row);
  if (!indexes.length) return null;
  const selected = Number(el.runSelect.value);
  return indexes.includes(selected) ? selected : indexes[0];
}

function renderRunOptions(row, selected) {
  const indexes = runIndexes(row);
  const displayIndexes = indexes.slice().reverse();
  el.runSelect.innerHTML = indexes.length
    ? displayIndexes.map((index) => {
        const label = row[`coze_run_${index}_error`] ? `Run ${index}（失败）` : `Run ${index}`;
        return `<option value="${index}">${escapeHtml(label)}</option>`;
      }).join("")
    : "<option value=\"\">暂无复跑记录</option>";
  if (selected) el.runSelect.value = String(selected);
  el.runTabs.innerHTML = indexes.length
    ? displayIndexes.map((index) => {
        const active = index === selected ? " active" : "";
        const failed = row[`coze_run_${index}_error`] ? " failed" : "";
        const title = row[`coze_run_${index}_error`] ? "运行失败" : "运行成功";
        const content = runField(row, index, "content");
        const improvement = runField(row, index, "improvement") || "待确认";
        return `
          <button class="run-tab${active}${failed}" type="button" data-run-index="${index}" title="${escapeHtml(title)}">
            <span class="run-tab-title">Run ${index}${active ? " · 当前查看" : ""}</span>
            ${content && /^https?:\/\//.test(content) ? `<img src="${escapeHtml(content)}" alt="Run ${index} content">` : `<span class="run-thumb-empty">${escapeHtml(failed ? "失败" : "暂无图片")}</span>`}
            <span class="run-tab-status">${escapeHtml(improvement)}</span>
          </button>
        `;
      }).join("")
    : "<span class=\"run-empty\">暂无复跑记录</span>";
  for (const button of el.runTabs.querySelectorAll(".run-tab")) {
    button.addEventListener("click", () => {
      el.runSelect.value = button.dataset.runIndex;
      renderSelected();
    });
  }
}

function renderRunImprovementControls(row, selected) {
  if (!selected) {
    el.runImprovementControls.innerHTML = "";
    return;
  }
  const current = runField(row, selected, "improvement") || "待确认";
  const options = ["改善", "部分改善", "未改善", "待确认"];
  el.runImprovementControls.innerHTML = `
    <span>是否改善</span>
    ${options.map((option) => {
      const active = option === current ? " active" : "";
      return `<button class="improvement-chip${active}" type="button" data-improvement="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
    }).join("")}
  `;
  for (const button of el.runImprovementControls.querySelectorAll(".improvement-chip")) {
    button.addEventListener("click", async () => {
      row[`coze_run_${selected}_improvement`] = button.dataset.improvement;
      mergeHeaders([`coze_run_${selected}_improvement`]);
      refreshAutoAnalysisFields();
      render();
      await saveRunsToCsv();
      renderOptimizationBoard();
      setStatus(`已标记 Run ${selected}：${button.dataset.improvement}，问题聚类看板已更新`);
    });
  }
}

function runField(row, index, suffix) {
  return row[`coze_run_${index}_${suffix}`] || "";
}

function originalEvidence(row, type) {
  const parsed = parseJsonField(row["输出"]);
  if (type === "prompt") return row.prompt || parsed?.prompt || "";
  if (type === "user_vlm") return prettyValue(row.user_vlm || parsed?.user_vlm || parsed?.vlm_result?.user_vlm || "");
  if (type === "outfit_vlm") return prettyValue(row.outfit_vlm || parsed?.outfit_vlm || parsed?.vlm_result?.outfit_vlm || "");
  return "";
}

function selectedEvidence(row, runIndex) {
  const type = el.evidenceSelect.value;
  const runLabel = runIndex ? `Run ${runIndex}` : "暂无 Run";
  if (type === "run_prompt") {
    return {
      meta: runIndex ? `${runLabel} · prompt` : "当前 case 还没有复跑 prompt",
      text: runIndex ? runField(row, runIndex, "prompt") || "暂无 prompt" : "暂无 Run，请先复跑或选择原始 prompt。",
    };
  }
  if (type === "run_raw_output") {
    return {
      meta: runIndex ? `${runLabel} · 原始输出` : "当前 case 还没有复跑输出",
      text: runIndex ? runField(row, runIndex, "raw_output") || "暂无原始输出" : "暂无 Run，请先复跑。",
    };
  }
  if (type === "run_error") {
    return {
      meta: runIndex ? `${runLabel} · 错误信息` : "当前 case 还没有复跑错误",
      text: runIndex ? runField(row, runIndex, "error") || "该 Run 无错误" : "暂无 Run，请先复跑。",
    };
  }
  return {
    meta: `原始证据 · ${evidenceLabel(type)}`,
    text: originalEvidence(row, type),
  };
}

function evidenceLabel(type) {
  return {
    prompt: "prompt",
    user_vlm: "user_vlm",
    outfit_vlm: "outfit_vlm",
  }[type] || type;
}

function originalContentUrl(row) {
  return row.ai_content || parseJsonField(row["输出"])?.content || row["输出"] || "";
}

function parseJsonField(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function prettyValue(value) {
  if (!value) return "";
  if (typeof value !== "string") return JSON.stringify(value, null, 2);
  const parsed = parseJsonField(value);
  return parsed ? JSON.stringify(parsed, null, 2) : value;
}

function updateFilters() {
  state.filters = {
    dimension: el.dimensionFilter.value,
    score: el.scoreFilter.value,
    keyword: el.keywordFilter.value.trim(),
    improvement: el.improvementFilter.value,
    sort: el.sortOrder.value,
  };
  persistUiState();
  render();
}

function selectFilteredCases() {
  const rows = filteredRows();
  for (const { index } of rows) state.checkedIndexes.add(index);
  persistUiState();
  setStatus(`已勾选当前筛选的 ${rows.length} 个 case`);
  render();
}

function visibleCheckedIndexes() {
  const visibleIndexes = new Set(filteredRows().map((item) => item.index));
  return [...state.checkedIndexes].filter((index) => visibleIndexes.has(index) && state.rows[index]);
}

function hasFailedRun(row) {
  return runIndexes(row).some((index) => Boolean(runField(row, index, "error")));
}

function clearCheckedCases() {
  state.checkedIndexes.clear();
  persistUiState();
  setStatus("已清空勾选");
  render();
}

function runCount() {
  const value = Number(el.runCount.value || 1);
  return Math.max(1, Math.min(20, Number.isFinite(value) ? Math.floor(value) : 1));
}

function adHocRunCount() {
  const value = Number(el.adHocRunCount.value || 1);
  return Math.max(1, Math.min(20, Number.isFinite(value) ? Math.floor(value) : 1));
}

function runConcurrency(selectedCount, count) {
  const totalRuns = selectedCount * count;
  return Math.max(1, Math.min(4, totalRuns));
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
}

function casePayload(index) {
  const row = state.rows[index];
  return {
    clientIndex: index,
    user_image: row.user_image,
    outfit_image: row.outfit_image,
    promptsUsed: currentPrompts(),
    log: {
      ...caseContext(row, index),
      notes: index === state.selectedIndex ? currentNoteValues() : state.notes[caseKey(row)] || {},
      promptsUsed: currentPrompts(),
    },
  };
}

async function judgeCurrentCase() {
  const row = selectedRow();
  if (!row) return;
  await busy("AI 裁判分析中...", async () => {
    await saveCurrentNotes("", { silent: true });
    const target = judgeTarget(row);
    if (!target.ok) {
      setStatus(target.reason);
      return;
    }
    const payload = judgePayload(row, target);
    const data = await api("/api/coze/judge-case", {
      payload,
      timeoutMs: 120000,
      log: {
        ...currentCaseContext(),
        runIndex: target.runIndex,
        judgeTarget: target.label,
        payloadSummary: {
          hasNewContent: Boolean(payload.new_content),
          hasOriginalContent: Boolean(payload.original_content),
          hasOriginalPrompt: Boolean(payload.original_prompt),
          hasRunPrompt: Boolean(payload.run_prompt),
          hasUserVlm: Boolean(payload.user_vlm),
          hasOutfitVlm: Boolean(payload.outfit_vlm),
          problemType: payload.problem_type,
        },
      },
    });
    const judge = data.result;
    const parsed = judge.parsed || {};
    const summary = formatJudgeSummary(judge);
    el.judgeResult.textContent = summary;
    const suggestion = parsed.optimization_suggestion || parsed.suggestion;
    const promptEdit = parsed.prompt_edit_suggestion || parsed.prompt_edit;
    if (!judge.cozeJudgeFailed && (suggestion || promptEdit)) {
      el.optimizationDirection.value = [suggestion, promptEdit].filter(Boolean).join("\n");
    }
    if (parsed.improved || parsed.remaining_issue || parsed.confidence !== undefined || parsed.overall_score !== undefined) {
      el.effectConclusion.value = [
        parsed.generated_type ? `裁判对象：${parsed.generated_type}` : "",
        parsed.overall_score !== undefined ? `总分：${parsed.overall_score}` : "",
        parsed.overall_pass !== undefined ? `是否合格：${parsed.overall_pass ? "是" : "否"}` : "",
        parsed.improved ? `改善判断：${parsed.improved}` : "",
        parsed.remaining_issue ? `遗留问题：${parsed.remaining_issue}` : "",
        parsed.confidence !== undefined ? `置信度：${parsed.confidence}` : "",
      ].filter(Boolean).join("\n");
    }
    await saveCurrentNotes("AI 裁判已完成并写入备注");
  });
}

async function savePeChangeOnly() {
  await busy("记录 PE 修改中...", async () => {
    await savePeChangeCore(resolveApplyScopeIndexes());
    setStatus("已记录本轮 PE 修改");
  });
}

async function applyPeChangeAndRun() {
  const indexes = resolveApplyScopeIndexes();
  if (!indexes.length) {
    setStatus("当前应用范围内没有 case");
    return;
  }
  await savePeChangeCore(indexes);
  await applyPromptsCore();
  await runCaseIndexes(indexes, runCount());
}

async function applyPromptsAndRunAdHocImages() {
  if (state.running) {
    setStatus("已有复跑任务进行中，请等待当前任务完成后再开始新的复跑");
    return;
  }
  let runCase;
  try {
    runCase = buildAdHocRunCase({
      user_image: el.adHocUserImage.value,
      outfit_image: el.adHocOutfitImage.value,
      promptsUsed: currentPrompts(),
    });
  } catch (error) {
    setStatus(error.message || String(error));
    return;
  }

  const count = adHocRunCount();
  await runInBackground(`临时图片复跑中：共 ${count} 次...`, async () => {
    const group = buildAdHocRunGroup({
      user_image: runCase.user_image,
      outfit_image: runCase.outfit_image,
      count,
      status: "running",
    });
    state.adHocRuns = [group, ...state.adHocRuns].slice(0, 8);
    persistUiState();
    renderAdHocRunResults();
    const startedAt = Date.now();
    const concurrency = runConcurrency(1, count);
    let timer;
    try {
      const prompts = await applyPromptsCore();
      runCase.promptsUsed = prompts;
      runCase.log.promptsUsed = prompts;
      timer = setInterval(() => {
        setStatus(`临时图片复跑中：共 ${count} 次，并发 ${concurrency}，已用 ${formatDuration(Date.now() - startedAt)}。`);
      }, 1000);
      const data = await api("/api/coze/run-cases-batch", {
        count,
        concurrency,
        timeoutMs: 180000,
        cases: [runCase],
      });
      const resultGroup = data.caseResults?.[0] || { results: [] };
      group.status = "done";
      group.results = resultGroup.results?.length ? resultGroup.results : buildAdHocRunGroup({
        user_image: runCase.user_image,
        outfit_image: runCase.outfit_image,
        count,
        status: "failed",
        error: "Coze 未返回任何复跑结果",
      }).results;
      group.updatedAt = new Date().toISOString();
      const failedCount = group.results.filter((result) => result.error).length;
      const duration = formatDuration(Date.now() - startedAt);
      setStatus(failedCount
        ? `临时图片复跑完成，共 ${group.results.length} 次，用时 ${duration}，其中 ${failedCount} 次失败。`
        : `临时图片复跑完成，共 ${group.results.length} 次，用时 ${duration}`);
    } catch (error) {
      const message = error.message || String(error);
      group.status = "failed";
      group.error = message;
      group.results = buildAdHocRunGroup({
        user_image: runCase.user_image,
        outfit_image: runCase.outfit_image,
        count,
        status: "failed",
        error: message,
      }).results;
      group.updatedAt = new Date().toISOString();
      setStatus(`临时图片复跑失败：${message}`);
    } finally {
      if (timer) clearInterval(timer);
      persistUiState();
      renderAdHocRunResults();
    }
  });
}

async function savePeChangeCore(indexes) {
  await saveCurrentNotes("", { silent: true });
  const record = peChangeRecord(indexes);
  const data = await api("/api/pe-change/save", { record });
  state.peChanges = data.peChanges || [];
  renderOptimizationBoard();
  return data.change;
}

function peChangeRecord(indexes) {
  const row = selectedRow();
  const cluster = allProblemClusters().find((item) => item.key === state.selectedClusterKey);
  return {
    ...currentCaseContext(),
    clusterKey: state.selectedClusterKey,
    clusterTitle: cluster?.title || "全部问题簇",
    issueLocation: el.pmIssueLocation.value,
    specificIssue: el.pmSpecificIssue.value.trim(),
    sourceField: el.pmSourceField.value.trim(),
    resolutionType: el.pmResolutionType.value,
    applyScope: el.pmApplyScope.value,
    scopeLabel: applyScopeLabel(),
    targetCount: indexes.length,
    targetCaseIndexes: indexes.map((index) => index + 1),
    manualNote: el.manualNote.value.trim(),
    optimizationDirection: el.optimizationDirection.value.trim(),
    changeSummary: autoPromptChangeSummary(),
    effectConclusion: autoEffectConclusion(indexes),
    promptsBefore: state.promptSnapshot,
    promptsAfter: currentPrompts(),
    sampleEvidence: row ? {
      userVlm: originalEvidence(row, "user_vlm"),
      outfitVlm: originalEvidence(row, "outfit_vlm"),
      prompt: originalEvidence(row, "prompt"),
    } : {},
  };
}

function resolveApplyScopeIndexes() {
  if (el.pmApplyScope.value === "experiment") return state.rows.map((_, index) => index);
  if (el.pmApplyScope.value === "current") return state.selectedIndex >= 0 ? [state.selectedIndex] : [];
  if (el.pmApplyScope.value === "checked") return [...state.checkedIndexes].filter((index) => state.rows[index]);
  if (el.pmApplyScope.value === "filtered") return filteredRows().map((item) => item.index);
  const clusters = allProblemClusters();
  if (state.selectedClusterKey === "all") return [...new Set(clusters.flatMap((cluster) => cluster.caseIndexes))];
  return clusters.find((cluster) => cluster.key === state.selectedClusterKey)?.caseIndexes || [];
}

function resolveImageOverrideIndexes() {
  const scope = el.imageOverrideScope.value;
  return resolveRunMaintenanceIndexes(scope);
}

function resolveRunMaintenanceIndexes(scope) {
  if (scope === "experiment") return state.rows.map((_, index) => index);
  if (scope === "current") return state.selectedIndex >= 0 ? [state.selectedIndex] : [];
  if (scope === "checked") return [...state.checkedIndexes].filter((index) => state.rows[index]);
  if (scope === "filtered") return filteredRows().map((item) => item.index);
  const clusters = allProblemClusters();
  if (state.selectedClusterKey === "all") return [...new Set(clusters.flatMap((cluster) => cluster.caseIndexes))];
  return clusters.find((cluster) => cluster.key === state.selectedClusterKey)?.caseIndexes || [];
}

async function applyImageOverridesToScope() {
  const indexes = resolveImageOverrideIndexes();
  if (!indexes.length) {
    setStatus("当前应用范围内没有可修改的 case");
    return;
  }
  const changed = applyImageUrlOverrides(state.rows, indexes, {
    user_image: el.overrideUserImage.value,
    outfit_image: el.overrideOutfitImage.value,
  });
  if (!changed.length) {
    setStatus("请至少填写一个新的 user_image 或 outfit_image URL");
    return;
  }
  mergeHeaders(["user_image", "outfit_image"]);
  await saveRunsToCsv();
  persistUiState();
  render();
  setStatus(`已修改 ${changed.length} 个 case 的输入图片 URL，后续复跑会使用新 URL。`);
}

function applyScopeLabel() {
  return {
    experiment: "当前实验全部 Case",
    current: "当前 Case",
    checked: "勾选 Case",
    filtered: "当前筛选",
    cluster: "当前问题簇",
  }[el.pmApplyScope.value] || el.pmApplyScope.value;
}

async function judgeSelectedCaseLocally() {
  if (state.selectedIndex < 0) return;
  await runLocalJudge([state.selectedIndex], "当前 Case");
}

async function judgeCheckedCasesLocally() {
  const indexes = [...state.checkedIndexes].filter((index) => state.rows[index]);
  if (!indexes.length) {
    setStatus("请先勾选要裁判的 case");
    return;
  }
  await runLocalJudge(indexes, "勾选 Case");
}

async function judgeFilteredCasesLocally() {
  const indexes = filteredRows().map((item) => item.index);
  if (!indexes.length) {
    setStatus("当前筛选没有 case");
    return;
  }
  await runLocalJudge(indexes, "当前筛选");
}

async function judgeCheckedCasesMultimodal() {
  const indexes = [...state.checkedIndexes].filter((index) => state.rows[index]);
  if (!indexes.length) {
    setStatus("请先勾选要做多模态裁判的 case");
    return;
  }
  await runMultimodalJudge(indexes, "勾选 Case");
}

async function judgeFilteredCasesMultimodal() {
  const indexes = filteredRows().map((item) => item.index);
  if (!indexes.length) {
    setStatus("当前筛选没有 case");
    return;
  }
  await runMultimodalJudge(indexes, "当前筛选");
}

async function runLocalJudge(indexes, label) {
  await busy(`本地 AI 裁判分析 ${label} 中...`, async () => {
    await saveCurrentNotes("", { silent: true });
    const reportData = await api("/api/local-judge/batch", {
      items: indexes.map((index) => localJudgePayload(state.rows[index], index)),
      log: {
        csvPath: state.csvPath,
        scope: label,
        count: indexes.length,
      },
    });
    const report = reportData.report;
    el.batchJudgeReport.textContent = formatBatchJudgeReport(report);
    if (indexes.includes(state.selectedIndex)) {
      const selectedResult = report.results.find((item) => item.caseId === String(state.selectedIndex));
      if (selectedResult) {
        el.judgeResult.textContent = formatLocalJudgeSummary(selectedResult);
        el.optimizationDirection.value = selectedResult.recommendation || el.optimizationDirection.value;
        el.effectConclusion.value = [
          selectedResult.improved ? `改善判断：${selectedResult.improved}` : "",
          selectedResult.rootCause ? `归因：${selectedResult.rootCause}` : "",
          selectedResult.confidence !== undefined ? `置信度：${selectedResult.confidence}` : "",
        ].filter(Boolean).join("\n");
        await saveCurrentNotes("", { silent: true });
      }
    }
    setStatus(`已完成 ${report.total} 个 case 的本地 AI 裁判`);
  });
}

async function runMultimodalJudge(indexes, label) {
  await busy(`多模态 AI 裁判分析 ${label} 中...`, async () => {
    await saveCurrentNotes("", { silent: true });
    const config = await getApi("/api/multimodal-judge/config");
    if (!config.configured) {
      el.batchJudgeReport.textContent = [
        "多模态裁判未配置。",
        `缺少：${config.missing.join("、")}`,
        "启动服务前请设置：",
        "JUDGE_API_KEY=你的模型APIKey",
        "JUDGE_MODEL=支持图片输入的模型名",
        "JUDGE_BASE_URL=OpenAI-compatible接口地址（可选）",
      ].join("\n");
      setStatus("多模态裁判未配置模型 API");
      return;
    }
    const data = await api("/api/multimodal-judge/batch", {
      items: indexes.map((index) => localJudgePayload(state.rows[index], index)),
      log: {
        csvPath: state.csvPath,
        scope: label,
        count: indexes.length,
        model: config.model,
        baseUrl: config.baseUrl,
      },
    });
    const report = data.report;
    el.batchJudgeReport.textContent = formatMultimodalJudgeReport(report);
    const selectedResult = report.results?.find((item) => item.caseId === String(state.selectedIndex));
    if (selectedResult) {
      el.judgeResult.textContent = formatMultimodalJudgeSummary(selectedResult);
      if (selectedResult.recommendation || selectedResult.promptEdit) {
        el.optimizationDirection.value = [selectedResult.recommendation, selectedResult.promptEdit].filter(Boolean).join("\n");
      }
      el.effectConclusion.value = [
        selectedResult.improved ? `改善判断：${selectedResult.improved}` : "",
        selectedResult.remainingIssue ? `遗留问题：${selectedResult.remainingIssue}` : "",
        selectedResult.rootCause ? `归因：${selectedResult.rootCause}` : "",
        selectedResult.confidence !== undefined ? `置信度：${selectedResult.confidence}` : "",
      ].filter(Boolean).join("\n");
      await saveCurrentNotes("", { silent: true });
    }
    setStatus(`已完成 ${report.total} 个 case 的多模态 AI 裁判`);
  });
}

function judgeTarget(row) {
  const indexes = runIndexes(row);
  const selected = selectedRunIndex(row);
  const target = el.judgeTarget.value;
  if (target === "original") {
    return {
      ok: true,
      runIndex: null,
      mode: "原始 case 校准",
      label: "original",
      expectation: "这是已经过人工标注的 badcase。请判断原始 ai_content 是否确实命中人工问题类型/归因备注，用来校准 AI 裁判准确性。",
    };
  }
  if (!indexes.length) {
    return { ok: false, reason: "当前 case 还没有复跑结果，请先复跑，或选择“原始 case 校准”。" };
  }
  const runIndex = target === "latest" ? indexes[0] : selected;
  return {
    ok: true,
    runIndex,
    mode: "复跑改善判断",
    label: `run_${runIndex}`,
    expectation: "请判断该 run 的 new_content 相比原始 ai_content 是否改善了人工标注问题。",
  };
}

function localJudgePayload(row, index) {
  const target = judgeTarget(row);
  const payload = judgePayload(row, target.ok ? target : {
    runIndex: null,
    mode: "原始 case 校准",
    label: "原始 case",
    expectation: "无复跑结果时，以人工标注做原始 case 校准。",
  });
  return {
    caseId: String(index),
    judgeMode: payload.judge_mode,
    problemType: payload.problem_type,
    attributionNote: payload.attribution_note,
    originalPrompt: payload.original_prompt,
    runPrompt: payload.run_prompt,
    userVlm: payload.user_vlm,
    outfitVlm: payload.outfit_vlm,
    originalContent: payload.original_content,
    newContent: payload.new_content,
  };
}

function judgePayload(row, target) {
  const originalContent = originalContentUrl(row);
  const originalPrompt = originalEvidence(row, "prompt");
  const runIndex = target.runIndex;
  const generatedImage = runIndex ? runField(row, runIndex, "content") : originalContent;
  return {
    user_image: row.user_image || "",
    outfit_image: row.outfit_image || "",
    generated_image: generatedImage,
    generated_type: target.label,
    prompt: runIndex ? runField(row, runIndex, "prompt") : originalPrompt,
    original_content: originalContent,
    new_content: generatedImage,
    problem_type: displayIssue(row).title || "",
    attribution_note: displayIssue(row).note || "",
    original_prompt: originalPrompt,
    run_prompt: runIndex ? runField(row, runIndex, "prompt") : originalPrompt,
    user_vlm: originalEvidence(row, "user_vlm"),
    outfit_vlm: originalEvidence(row, "outfit_vlm"),
    judge_mode: target.mode,
    judge_target: target.label,
    judge_expectation: target.expectation,
  };
}

function formatJudgeSummary(judge) {
  if (!judge?.ok) return `AI 裁判失败：${judge?.error || "未知错误"}\n${judge?.raw || ""}`;
  const parsed = judge.parsed || {};
  if (parsed.dimensions || parsed.user_vlm_check || parsed.outfit_vlm_check) {
    return formatNewCozeJudgeSummary(judge, parsed);
  }
  const lines = [
    judge.cozeJudgeFailed ? `裁判状态：Coze 裁判读取失败，已启用兜底判断` : "",
    judge.cozeFailureReason ? `失败原因：${judge.cozeFailureReason}` : "",
    parsed.improved ? `改善判断：${parsed.improved}` : "",
    parsed.remaining_issue ? `遗留问题：${parsed.remaining_issue}` : "",
    parsed.root_cause ? `归因：${parsed.root_cause}` : "",
    parsed.suggestion ? `优化建议：${parsed.suggestion}` : "",
    parsed.prompt_edit ? `Prompt 修改：${parsed.prompt_edit}` : "",
    parsed.confidence !== undefined ? `置信度：${parsed.confidence}` : "",
  ].filter(Boolean);
  if (Array.isArray(parsed.evidence) && parsed.evidence.length) {
    lines.push(`证据：${parsed.evidence.join("；")}`);
  }
  if (judge.cozeJudgeFailed && judge.cozeParsed?.suggestion) {
    lines.push(`Coze 无效返回：${judge.cozeParsed.suggestion}`);
  }
  if (judge.inputDebug) {
    lines.push(`输入摘要：${formatInputDebug(judge.inputDebug)}`);
  }
  return lines.length ? lines.join("\n") : judge.raw || judge.rawOutput || "AI 裁判未返回结构化结果";
}

function formatNewCozeJudgeSummary(judge, parsed) {
  if (judge.cozeJudgeFailed) {
    const lines = [
      "裁判来源：Coze 多模态裁判工作流",
      "裁判状态：无效输出",
      judge.cozeFailureReason ? `失败原因：${judge.cozeFailureReason}` : "",
      "处理建议：不要采纳本次归因和优化建议；请重新运行裁判或检查 Coze 大模型用户提示词是否已引用输入变量。",
    ].filter(Boolean);
    if (judge.inputDebug) lines.push(`输入摘要：${formatInputDebug(judge.inputDebug)}`);
    return lines.join("\n");
  }
  const dimensionLabels = {
    face_makeup_hair: "面部/妆造/发型",
    pose_limb: "姿势/肢体",
    clothing: "服装特征",
    scene_background: "场景/背景",
  };
  const lines = [
    "裁判来源：Coze 多模态裁判工作流",
    parsed.generated_type ? `裁判对象：${parsed.generated_type}` : "",
    parsed.overall_score !== undefined ? `总分：${parsed.overall_score}` : "",
    parsed.overall_pass !== undefined ? `是否合格：${parsed.overall_pass ? "是" : "否"}` : "",
    parsed.user_vlm_check ? `User VLM：${parsed.user_vlm_check.consistent ? "一致" : "不一致"} ${toIssueText(parsed.user_vlm_check.issues)}` : "",
    parsed.outfit_vlm_check ? `Outfit VLM：${parsed.outfit_vlm_check.consistent ? "一致" : "不一致"} ${toIssueText(parsed.outfit_vlm_check.issues)}` : "",
  ].filter(Boolean);
  for (const [key, label] of Object.entries(dimensionLabels)) {
    const dim = parsed.dimensions?.[key];
    if (!dim) continue;
    lines.push(`${label}：${dim.score ?? "-"} 分，${dim.pass ? "通过" : "不通过"}${toIssueText(dim.issues)}${dim.evidence ? `；证据：${dim.evidence}` : ""}`);
  }
  if (parsed.prompt_alignment) {
    lines.push(`Prompt 对齐：${parsed.prompt_alignment.aligned ? "对齐" : "不对齐"}`);
    if (parsed.prompt_alignment.missing_requirements?.length) lines.push(`缺失要求：${parsed.prompt_alignment.missing_requirements.join("；")}`);
    if (parsed.prompt_alignment.violated_requirements?.length) lines.push(`违背要求：${parsed.prompt_alignment.violated_requirements.join("；")}`);
  }
  if (parsed.root_cause) lines.push(`归因：${parsed.root_cause}`);
  if (parsed.optimization_suggestion) lines.push(`优化建议：${parsed.optimization_suggestion}`);
  if (parsed.prompt_edit_suggestion) lines.push(`Prompt 修改：${parsed.prompt_edit_suggestion}`);
  if (parsed.confidence !== undefined) lines.push(`置信度：${parsed.confidence}`);
  if (judge.inputDebug) lines.push(`输入摘要：${formatInputDebug(judge.inputDebug)}`);
  return lines.join("\n");
}

function toIssueText(issues) {
  return Array.isArray(issues) && issues.length ? `；问题：${issues.join("；")}` : "";
}

function formatLocalJudgeSummary(result) {
  return [
    "裁判来源：本地结构化 AI 裁判",
    `改善判断：${result.improved}`,
    `问题分类：${result.categoryLabel}`,
    `归因：${result.rootCause}`,
    `Prompt 可修复性：${result.promptFixability}`,
    `优化建议：${result.recommendation}`,
    `置信度：${result.confidence}`,
    result.evidence?.length ? `证据：${result.evidence.join("；")}` : "",
  ].filter(Boolean).join("\n");
}

function formatBatchJudgeReport(report) {
  if (!report?.total) return "暂无可分析 case。";
  const lines = [
    `总计：${report.total} 个 case`,
    "",
    "高频问题：",
    ...report.themes.map((theme, index) => {
      const causes = Object.entries(theme.rootCauses)
        .map(([cause, count]) => `${cause} ${count}`)
        .join("，");
      return `${index + 1}. ${theme.label}：${theme.count} 个；归因 ${causes}`;
    }),
    "",
    "下一步建议：",
    ...report.nextActions.map((action, index) => `${index + 1}. ${action}`),
  ];
  return lines.join("\n");
}

function formatMultimodalJudgeSummary(result) {
  return [
    "裁判来源：多模态视觉模型",
    `改善判断：${result.improved}`,
    result.remainingIssue ? `遗留问题：${result.remainingIssue}` : "",
    result.category ? `问题分类：${result.category}` : "",
    `归因：${result.rootCause}`,
    result.promptFixability ? `Prompt 可修复性：${result.promptFixability}` : "",
    result.recommendation ? `优化建议：${result.recommendation}` : "",
    result.promptEdit ? `Prompt 修改：${result.promptEdit}` : "",
    result.engineeringAction ? `工程建议：${result.engineeringAction}` : "",
    `置信度：${result.confidence}`,
    result.evidence?.length ? `证据：${result.evidence.join("；")}` : "",
    result.error ? `调用错误：${result.error}` : "",
  ].filter(Boolean).join("\n");
}

function formatMultimodalJudgeReport(report) {
  if (!report?.ok) {
    return `多模态裁判失败：${report?.error || "未知错误"}`;
  }
  const lines = [
    `多模态裁判完成：${report.total} 个 case`,
    "",
    "高频问题：",
    ...(report.themes || []).map((theme, index) => {
      const causes = Object.entries(theme.rootCauses || {})
        .map(([cause, count]) => `${cause} ${count}`)
        .join("，");
      return `${index + 1}. ${theme.category || "未分类"}：${theme.count} 个；归因 ${causes}`;
    }),
    "",
    "下一步建议：",
    ...(report.nextActions || []).map((action, index) => `${index + 1}. ${action}`),
  ];
  return lines.join("\n");
}

function formatInputDebug(debug) {
  const keys = ["user_image", "outfit_image", "generated_image", "generated_type", "prompt", "user_vlm", "outfit_vlm"];
  return keys.map((key) => `${key} ${debug[key] || 0}`).join(" / ");
}

function filteredRows() {
  const keyword = state.filters.keyword.toLowerCase();
  const rows = state.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const groups = groupsForFilter(row);
      if (state.filters.score !== "all" && !groups.some((group) => group.value === state.filters.score)) return false;
      if (!matchesImprovementFilter(row, state.filters.improvement)) return false;
      if (!keyword) return true;
      return groups.some((group) => [group.problemText, group.noteText].join(" ").toLowerCase().includes(keyword));
    })
    .filter(({ index }) => {
      if (state.selectedClusterKey === "all") return true;
      const cluster = allProblemClusters().find((item) => item.key === state.selectedClusterKey);
      return cluster ? cluster.caseIndexes.includes(index) : true;
    })
    .filter(({ index }) => {
      if (!state.selectedEvaluationClusterKey) return true;
      const clusters = [
        ...buildEvaluationClusters(state.rows, "fail"),
        ...buildEvaluationClusters(state.rows, "imperfect"),
      ];
      const cluster = clusters.find((item) => item.key === state.selectedEvaluationClusterKey);
      return cluster ? cluster.caseIndexes.includes(index) : true;
    });

  return rows.sort((a, b) => compareRows(a, b));
}

function compareRows(a, b) {
  if (state.filters.sort === "zero-first") {
    const aZero = groupsForFilter(a.row).some((group) => group.value === "0") ? 0 : 1;
    const bZero = groupsForFilter(b.row).some((group) => group.value === "0") ? 0 : 1;
    return aZero - bZero || a.index - b.index;
  }
  if (state.filters.sort === "updated") {
    const aTime = Date.parse(state.notes[caseKey(a.row)]?.updatedAt || 0);
    const bTime = Date.parse(state.notes[caseKey(b.row)]?.updatedAt || 0);
    return bTime - aTime || a.index - b.index;
  }
  if (state.filters.sort === "problem") {
    return displayIssue(a.row).title.localeCompare(displayIssue(b.row).title, "zh-Hans-CN") || a.index - b.index;
  }
  return a.index - b.index;
}

function groupsForFilter(row) {
  return issueGroups
    .filter((group) => state.filters.dimension === "all" || group.id === state.filters.dimension)
    .map((group) => groupIssue(row, group));
}

function displayIssue(row) {
  const scoped = state.filters.dimension === "all"
    ? zeroScoreIssues(row)
    : groupsForFilter(row).filter((group) => (
        state.filters.score === "all" ? group.problemText || group.noteText : group.value === state.filters.score
      ));
  const issues = scoped.length ? scoped : zeroScoreIssues(row);
  return {
    title: issues.map((item) => item.problemText || item.noteText).filter(Boolean).join(" / ") || "case",
    note: issues.map((item) => item.noteText).filter(Boolean).join(" / "),
    dimensionLabel: issues.map((item) => `${item.label}: ${item.value || "-"}`).join(" / "),
  };
}

function zeroScoreIssues(row) {
  return issueGroups
    .map((group) => groupIssue(row, group))
    .filter((item) => item.value === "0" && (item.problemText || item.noteText));
}

function groupIssue(row, group) {
  return {
    ...group,
    value: String(row[group.score] || "").trim(),
    problemText: String(row[group.problem] || "").trim(),
    noteText: String(row[group.note] || "").trim(),
  };
}

function zeroScoreIssue(row) {
  return displayIssue(row);
}

function latestField(row, suffix) {
  const keys = Object.keys(row)
    .map((key) => {
      const match = key.match(/^coze_run_(\d+)_(.+)$/);
      return match && match[2] === suffix ? { key, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.index - a.index);
  return keys.map(({ key }) => row[key]).find(Boolean) || "";
}

function mergeHeaders(keys) {
  for (const key of keys) {
    if (!state.headers.includes(key)) state.headers.push(key);
  }
}

function setNoteFields(note) {
  el.manualNote.value = note.manualNote || "";
  el.optimizationDirection.value = note.optimizationDirection || "";
  el.pmIssueLocation.value = note.pmIssueLocation || "生图 Prompt";
  el.pmSpecificIssue.value = note.pmSpecificIssue || "";
  el.pmSourceField.value = note.pmSourceField || "";
  el.pmResolutionType.value = note.pmResolutionType || "修改生图 Prompt";
  el.pmApplyScope.value = note.pmApplyScope || "cluster";
  if (state.currentExperimentId && (!note.pmApplyScope || note.pmApplyScope === "cluster")) {
    el.pmApplyScope.value = "experiment";
  }
  refreshAutoAnalysisFields();
}

function currentNoteValues() {
  return {
    manualNote: el.manualNote.value.trim(),
    optimizationDirection: el.optimizationDirection.value.trim(),
    changeSummary: autoPromptChangeSummary(),
    effectConclusion: autoEffectConclusion(resolveApplyScopeIndexes()),
    pmIssueLocation: el.pmIssueLocation.value,
    pmSpecificIssue: el.pmSpecificIssue.value.trim(),
    pmSourceField: el.pmSourceField.value.trim(),
    pmResolutionType: el.pmResolutionType.value,
    pmApplyScope: el.pmApplyScope.value,
    judgeResult: el.judgeResult.textContent.trim(),
  };
}

function refreshAutoAnalysisFields() {
  if (!el.changeSummary || !el.effectConclusion) return;
  el.changeSummary.value = autoPromptChangeSummary();
  el.effectConclusion.value = autoEffectConclusion(resolveApplyScopeIndexes());
}

function autoPromptChangeSummary() {
  const before = state.promptSnapshot;
  const after = currentPrompts();
  if (!before) return "尚未读取 Coze Prompt，无法自动识别改动。请先点击“读取 Coze Prompt”。";
  const labels = {
    userSystemPrompt: "User VLM 系统提示词",
    userPrompt: "User VLM 用户提示词",
    outfitSystemPrompt: "Outfit VLM 系统提示词",
    outfitPrompt: "Outfit VLM 用户提示词",
    promptCode: "生图 Prompt 拼接代码",
  };
  const changed = Object.keys(labels)
    .filter((key) => normalizeText(before[key]) !== normalizeText(after[key]))
    .map((key) => promptDiffLine(labels[key], before[key] || "", after[key] || ""));
  if (!changed.length) return "未检测到 Prompt / VLM 提示词改动。";
  const scopeText = applyScopeLabel();
  const issueText = el.pmSpecificIssue.value.trim();
  return [
    `检测到 ${changed.length} 处提示词改动，应用范围：${scopeText}。`,
    issueText ? `针对问题：${issueText}` : "",
    ...changed,
  ].filter(Boolean).join("\n");
}

function promptDiffLine(label, before, after) {
  const beforeText = normalizeText(before);
  const afterText = normalizeText(after);
  const beforeLength = beforeText.length;
  const afterLength = afterText.length;
  const delta = afterLength - beforeLength;
  const direction = delta > 0 ? `增加 ${delta} 字` : delta < 0 ? `减少 ${Math.abs(delta)} 字` : "内容有调整";
  return `- ${label}：${direction}`;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function autoEffectConclusion(indexes) {
  const validIndexes = indexes.filter((index) => state.rows[index]);
  if (!validIndexes.length) return "当前应用范围内没有 case。";
  const stats = improvementStats(validIndexes);
  if (!stats.total) return `当前范围 ${validIndexes.length} 个 case，尚无复跑改善标记。`;
  return [
    `当前范围 ${validIndexes.length} 个 case，已有 ${stats.total} 个 case 完成复跑标记。`,
    `改善率：${percent(stats.improved, stats.total)}（改善/部分改善 ${stats.improved}，未改善 ${stats.failed}，待确认 ${stats.pending}）。`,
  ].join("\n");
}

function currentPrompts() {
  return {
    userSystemPrompt: el.userSystemPrompt.value,
    userPrompt: el.userPrompt.value,
    outfitSystemPrompt: el.outfitSystemPrompt.value,
    outfitPrompt: el.outfitPrompt.value,
    promptCode: el.promptCode.value,
  };
}

function formatExportCsv(records, headers) {
  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvCell(record[header])).join(",")),
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileName(value) {
  return String(value || "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function currentCaseContext() {
  const row = selectedRow();
  return row ? caseContext(row, state.selectedIndex) : {
    caseIndex: 0,
    caseKey: "",
    csvPath: state.csvPath,
    issue: {},
    userImage: "",
    outfitImage: "",
    originalContent: "",
  };
}

function caseContext(row, index) {
  return {
    caseIndex: index + 1,
    caseKey: caseKey(row),
    csvPath: state.csvPath,
    issue: displayIssue(row),
    userImage: row.user_image || "",
    outfitImage: row.outfit_image || "",
    originalContent: row.ai_content || row["输出"] || "",
  };
}

async function saveCurrentNotes(message, options = {}) {
  const row = selectedRow();
  if (!row) return;
  const record = {
    ...currentCaseContext(),
    ...currentNoteValues(),
    timestamp: new Date().toISOString(),
  };
  const data = await api("/api/notes/save", { record });
  state.notes[record.caseKey] = data.note;
  await saveCurrentTableWorkspace();
  persistUiState();
  if (!options.silent) render();
  if (message && !options.silent) setStatus(message);
}

async function applyInvestigationToScope() {
  const indexes = resolveApplyScopeIndexes().filter((index) => state.rows[index]);
  if (!indexes.length) {
    setStatus("当前应用范围内没有可应用的 case");
    return;
  }
  const values = currentNoteValues();
  const timestamp = new Date().toISOString();
  let savedCount = 0;
  for (const index of indexes) {
    const row = state.rows[index];
    const record = {
      ...caseContext(row, index),
      ...values,
      timestamp,
    };
    const data = await api("/api/notes/save", { record });
    state.notes[record.caseKey] = data.note;
    savedCount += 1;
  }
  await saveCurrentTableWorkspace();
  persistUiState();
  render();
  setStatus(`已将当前侦查记录应用到 ${savedCount} 个 case，问题簇已更新`);
}

async function autoLoadLastCsv() {
  if (state.currentExperimentId || state.currentTableWorkspaceId) return;
  const path = state.csvPath || el.csvPath.value.trim();
  if (!path || state.rows.length) return;
  if (!shouldAutoLoadCsvPath(path, window.location.hostname)) {
    setStatus("线上环境不会自动读取本机表格路径。请上传 CSV/Excel/飞书导出文件，或填写服务器可访问的路径后点击“按路径加载”。");
    return;
  }
  try {
    const data = await loadCsvFromPath(path, { resetSelection: false });
    setStatus(`已恢复上次工作台：${data.rows.length} 个 case`);
  } catch (error) {
    setStatus(`自动恢复失败：${error.message || String(error)}。请上传表格文件，或确认路径在当前服务环境中可访问后手动加载。`);
  }
}

function restoreUiState() {
  const saved = readStoredState();
  if (!saved) return;
  state.csvPath = saved.csvPath || state.csvPath;
  state.currentTableWorkspaceId = saved.currentTableWorkspaceId || "";
  state.currentExperimentId = saved.currentExperimentId || "";
  state.selectedIndex = Number.isInteger(saved.selectedIndex) ? saved.selectedIndex : state.selectedIndex;
  state.selectedClusterKey = saved.selectedClusterKey || state.selectedClusterKey;
  state.activeTab = saved.activeTab === "runs" ? "optimize" : (saved.activeTab || state.activeTab);
  state.currentEvaluationId = saved.currentEvaluationId || "";
  state.checkedIndexes = new Set(Array.isArray(saved.checkedIndexes) ? saved.checkedIndexes : []);
  state.filters = { ...state.filters, ...(saved.filters || {}) };
  state.selectedEvaluationClusterKey = saved.selectedEvaluationClusterKey || "";
  state.adHocRuns = Array.isArray(saved.adHocRuns) ? saved.adHocRuns.slice(0, 8) : [];
  if (saved.csvPath) el.csvPath.value = saved.csvPath;
  if (saved.techReasonPath) el.techReasonPath.value = saved.techReasonPath;
  el.dimensionFilter.value = state.filters.dimension;
  el.scoreFilter.value = state.filters.score;
  el.keywordFilter.value = state.filters.keyword;
  el.improvementFilter.value = state.filters.improvement || "all";
  el.sortOrder.value = state.filters.sort;
  if (saved.evidenceSelect) el.evidenceSelect.value = saved.evidenceSelect;
  if (saved.runCount) el.runCount.value = saved.runCount;
  if (saved.adHocUserImage) el.adHocUserImage.value = saved.adHocUserImage;
  if (saved.adHocOutfitImage) el.adHocOutfitImage.value = saved.adHocOutfitImage;
  if (saved.adHocRunCount) el.adHocRunCount.value = saved.adHocRunCount;
  if (saved.adHocAutoImages) state.adHocAutoImages = saved.adHocAutoImages;
  if (saved.totalSampleSize) el.totalSampleSize.value = saved.totalSampleSize;
  renderTabs();
}

function persistUiState() {
  const snapshot = {
    csvPath: state.csvPath || el.csvPath.value.trim(),
    currentTableWorkspaceId: state.currentTableWorkspaceId,
    currentExperimentId: state.currentExperimentId,
    techReasonPath: el.techReasonPath.value.trim(),
    selectedIndex: state.selectedIndex,
    selectedClusterKey: state.selectedClusterKey,
    selectedEvaluationClusterKey: state.selectedEvaluationClusterKey,
    currentEvaluationId: state.currentEvaluationId,
    activeTab: state.activeTab,
    checkedIndexes: [...state.checkedIndexes],
    filters: state.filters,
    adHocRuns: state.adHocRuns.slice(0, 8),
    evidenceSelect: el.evidenceSelect.value,
    runCount: el.runCount.value,
    adHocUserImage: el.adHocUserImage.value,
    adHocOutfitImage: el.adHocOutfitImage.value,
    adHocRunCount: el.adHocRunCount.value,
    adHocAutoImages: state.adHocAutoImages,
    totalSampleSize: el.totalSampleSize.value,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage may be unavailable in restricted file:// contexts.
  }
}

function readStoredTableWorkspaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABLE_WORKSPACES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredTableWorkspaces(workspaces) {
  try {
    localStorage.setItem(TABLE_WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
  } catch {
    // localStorage may be unavailable or too small for large table sets.
  }
}

function saveTableWorkspaceLocally(record) {
  const workspaces = readStoredTableWorkspaces();
  const now = new Date().toISOString();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || now,
    updatedAt: now,
    title: record.title || record.path || "未命名表格",
    path: record.path || "",
    selectedIndex: Number.isInteger(record.selectedIndex) ? record.selectedIndex : 0,
    headers: Array.isArray(record.headers) ? record.headers : ["user_image", "outfit_image", "ai_content"],
    rows: Array.isArray(record.rows) ? record.rows : [],
    notes: record.notes || {},
    peChanges: Array.isArray(record.peChanges) ? record.peChanges : [],
  };
  const next = workspaces.filter((item) => item.id !== entry.id);
  next.push(entry);
  writeStoredTableWorkspaces(next);
  return entry;
}

function tableTitleFromPath(path = "") {
  const text = String(path || "").trim();
  if (!text) return "";
  return text.split(/[\\/]/).pop() || text;
}

function readStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function caseKey(row) {
  return [
    row.user_image || "",
    row.outfit_image || "",
    row.ai_content || row["输出"] || "",
  ].join("|");
}

async function busy(message, fn) {
  setBusyDisabled(true);
  setStatus(message);
  try {
    await fn();
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    setBusyDisabled(false);
  }
}

async function runInBackground(message, fn) {
  state.running = true;
  setRunDisabled(true);
  setStatus(message);
  try {
    await fn();
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    state.running = false;
    setRunDisabled(false);
    render();
  }
}

async function api(path, body) {
  const response = await fetch(apiPath(path, window.location.pathname), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonResponse(response);
  if (!data.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function getApi(path) {
  const response = await fetch(apiPath(path, window.location.pathname));
  const data = await readJsonResponse(response);
  if (!data.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）：${text.slice(0, 120)}`);
  }
  return JSON.parse(text || "{}");
}

function setStatus(message) {
  el.status.textContent = message;
}

function setBusyDisabled(disabled) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = disabled;
  }
}

function setRunDisabled(disabled) {
  for (const button of [el.runSelectedBtn, el.runCheckedBtn, el.rerunFailedCheckedBtn, el.applyPeChangeRunBtn, el.runAdHocBtn, el.rerunFailedBtn]) {
    if (button) button.disabled = disabled;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
