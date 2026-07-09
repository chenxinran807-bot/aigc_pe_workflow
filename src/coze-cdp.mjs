const DEFAULT_DEBUG_HOST = process.env.COZE_DEBUG_HOST || "127.0.0.1";
const DEFAULT_DEBUG_PORT = Number(process.env.COZE_DEBUG_PORT || 9222);
export const WORKFLOW_ID = "7626601513428156454";
export const WORKFLOW_URL = "https://cloud.bytedance.net/coze/organization/space/detail/work_flow?workflow_id=7626601513428156454&space_id=7616637259453857843&x-resource-account=public&x-bc-region-id=bytedance&cozeAccountId=2109274892&cozeOrgId=7616637684514619402&cozeSpaceId=7616637259453857843";
const COZE_ORIGIN = "https://cloud-coze.bytedance.net";

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
        return;
      }
      for (const handler of this.handlers) handler(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(handler) {
    this.handlers.push(handler);
  }

  close() {
    this.ws?.close();
  }
}

export async function withCozePage(callback, options = {}) {
  const page = options.page || await findWorkflowPage(options.debugPort);
  const cdp = new CDPClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Runtime.enable");
  try {
    const contextId = await getCozeContextId(cdp);
    return await callback({ cdp, contextId, page });
  } finally {
    cdp.close();
  }
}

export async function evaluateInCoze(expression, options = {}) {
  return withCozePage(async ({ cdp, contextId }) => {
    const result = await cdp.send("Runtime.evaluate", {
      contextId,
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result?.value;
  }, options);
}

export async function openWorkflowPage(debugPort = DEFAULT_DEBUG_PORT, targetUrl = "") {
  const sourcePage = targetUrl ? null : await findWorkflowPage(debugPort);
  const browserInfo = await cdpJson(debugPort, "/json/version");
  const browser = new CDPClient(browserInfo.webSocketDebuggerUrl);
  await browser.connect();
  try {
    const created = await browser.send("Target.createTarget", {
      url: targetUrl || sourcePage.url,
      newWindow: false,
    });
    return await waitForTarget(debugPort, created.targetId);
  } finally {
    browser.close();
  }
}

export async function closeWorkflowPage(page, debugPort = DEFAULT_DEBUG_PORT) {
  if (!page?.id) return;
  const browserInfo = await cdpJson(debugPort, "/json/version");
  const browser = new CDPClient(browserInfo.webSocketDebuggerUrl);
  await browser.connect();
  try {
    await browser.send("Target.closeTarget", { targetId: page.id });
  } finally {
    browser.close();
  }
}

export async function findWorkflowPage(debugPort = DEFAULT_DEBUG_PORT, options = {}) {
  const listTargets = options.listTargets || (() => cdpJson(debugPort, "/json/list"));
  const openPage = options.openPage || ((port, targetUrl) => openWorkflowPage(port, targetUrl));
  const targets = await listTargets();
  const page = targets.find((target) => (
    target.type === "page" &&
    target.url.includes(`workflow_id=${WORKFLOW_ID}`)
  ));
  return page || await openPage(debugPort, WORKFLOW_URL);
}

export async function findWorkflowPageByUrl(targetUrl, debugPort = DEFAULT_DEBUG_PORT) {
  const workflowId = new URL(targetUrl).searchParams.get("workflow_id");
  const targets = await cdpJson(debugPort, "/json/list");
  const page = targets.find((target) => (
    target.type === "page" &&
    target.webSocketDebuggerUrl &&
    (workflowId ? target.url.includes(`workflow_id=${workflowId}`) : target.url === targetUrl)
  ));
  if (!page) {
    throw new Error("没有找到已打开的 Coze 裁判工作流 Chrome 页面。");
  }
  return page;
}

async function waitForTarget(debugPort, targetId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const targets = await cdpJson(debugPort, "/json/list");
    const page = targets.find((target) => target.id === targetId);
    if (page?.webSocketDebuggerUrl) return page;
    await delay(200);
  }
  throw new Error("新开的 Coze 工作流标签页不可用。");
}

async function getCozeContextId(cdp) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const contexts = [];
    cdp.on((message) => {
      if (message.method === "Runtime.executionContextCreated") {
        contexts.push(message.params.context);
      }
    });
    await cdp.send("Runtime.disable");
    await cdp.send("Runtime.enable");
    await delay(800);
    const context = contexts.find((item) => item.origin === COZE_ORIGIN);
    if (context) return context.id;
  }
  throw new Error("Coze 工作流内嵌页不可用，可能需要刷新或重新登录。");
}

async function cdpJson(debugPort, path) {
  const endpoint = `http://${DEFAULT_DEBUG_HOST}:${debugPort}${path}`;
  let response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    throw new Error(`Chrome 调试端口不可访问：${endpoint}。线上部署需要在同一服务环境启动 Chrome remote debugging，或把 COZE_DEBUG_HOST/COZE_DEBUG_PORT 指向可访问的本地 runner；原始错误：${error.message || String(error)}`);
  }
  if (!response.ok) throw new Error(`Chrome 调试端口不可用：${endpoint} 返回 ${response.status}`);
  return rewriteDebuggerUrls(await response.json(), DEFAULT_DEBUG_HOST);
}

export function rewriteDebuggerUrls(value, debugHost = DEFAULT_DEBUG_HOST) {
  if (Array.isArray(value)) return value.map((item) => rewriteDebuggerUrls(item, debugHost));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = key === "webSocketDebuggerUrl" ? rewriteDebuggerUrl(item, debugHost) : rewriteDebuggerUrls(item, debugHost);
  }
  return copy;
}

function rewriteDebuggerUrl(value, debugHost) {
  const text = String(value || "");
  if (!debugHost || debugHost === "127.0.0.1" || debugHost === "localhost") return text;
  return text.replace(/^ws:\/\/(?:127\.0\.0\.1|localhost)(:\d+\/)/, `ws://${debugHost}$1`);
}

export function js(value) {
  return JSON.stringify(value);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
