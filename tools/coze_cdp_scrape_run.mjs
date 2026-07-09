class CDPClient {
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
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        return;
      }
      for (const handler of this.handlers) handler(msg);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(handler) { this.handlers.push(handler); }
}

async function getContextId(cdp) {
  const contexts = [];
  cdp.on((msg) => {
    if (msg.method === "Runtime.executionContextCreated") contexts.push(msg.params.context);
  });
  await cdp.send("Runtime.disable");
  await cdp.send("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const ctx = contexts.find((item) => item.origin === "https://cloud-coze.bytedance.net");
  if (!ctx) throw new Error("No cloud-coze execution context found.");
  return ctx.id;
}

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page" && target.url.includes("workflow_id=7626601513428156454"));
if (!page) throw new Error("No Coze workflow page found.");
const cdp = new CDPClient(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Runtime.enable");
const contextId = await getContextId(cdp);
const result = await cdp.send("Runtime.evaluate", {
  contextId,
  returnByValue: true,
  expression: `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const text = document.body?.innerText || "";
    const urls = Array.from(new Set(text.match(/https?:\\/\\/[^\\s"'<>，。)）]+/g) || []));
    const images = urls.filter((u) => /\\.(png|jpe?g|webp|gif)(\\?|$)/i.test(u) || /image/.test(u));
    const rightPanels = Array.from(document.querySelectorAll('*')).filter((el) =>
      visible(el) && (el.innerText || '').includes('试运行') && ((el.innerText || '').includes('输出') || (el.innerText || '').includes('content') || (el.innerText || '').includes('运行'))
    );
    const panelTexts = rightPanels.slice(-5).map((el) => (el.innerText || '').slice(0, 8000));
    return {
      text: text.slice(0, 12000),
      urls,
      images,
      panelTexts,
      buttonTexts: Array.from(document.querySelectorAll('button')).filter(visible).map((b) => (b.innerText || b.textContent || '').trim()).filter(Boolean),
      timestamp: new Date().toISOString()
    };
  })()`,
});
console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
