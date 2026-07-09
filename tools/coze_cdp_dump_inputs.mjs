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
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
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

  on(handler) {
    this.handlers.push(handler);
  }
}

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page" && target.url.includes("workflow_id=7626601513428156454"));
if (!page) throw new Error("No Coze workflow page found.");

const cdp = new CDPClient(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Runtime.enable");

const contexts = [];
cdp.on((msg) => {
  if (msg.method === "Runtime.executionContextCreated") contexts.push(msg.params.context);
});
await cdp.send("Runtime.disable");
await cdp.send("Runtime.enable");
await new Promise((resolve) => setTimeout(resolve, 1000));

const cozeContext = contexts.find((ctx) => ctx.origin === "https://cloud-coze.bytedance.net");
if (!cozeContext) throw new Error("No cloud-coze execution context found.");

const result = await cdp.send("Runtime.evaluate", {
  contextId: cozeContext.id,
  returnByValue: true,
  expression: `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const info = (el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || el.placeholder || "").trim().slice(0, 300),
        aria: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        placeholder: el.getAttribute("placeholder"),
        type: el.getAttribute("type"),
        value: el.value || "",
        role: el.getAttribute("role"),
        id: el.id || "",
        className: el.className ? String(el.className).slice(0, 220) : "",
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const right = Array.from(document.querySelectorAll("*")).find((el) =>
      visible(el) && (el.innerText || "").includes("试运行输入") && (el.innerText || "").includes("outfit_image")
    );
    const scope = right || document;
    return {
      scope: right ? info(right) : null,
      clickable: Array.from(scope.querySelectorAll("button,[role=button],input,textarea,[contenteditable=true],.semi-select,.semi-select-selection,.semi-input-wrapper"))
        .filter(visible)
        .map(info),
      interesting: Array.from(scope.querySelectorAll("*"))
        .filter((el) => visible(el) && /上传|URL|url|链接|Image|未知类型|outfit_image|user_image|JSON|AI 补全/.test((el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim()))
        .slice(0, 180)
        .map(info),
    };
  })()`,
});

console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
