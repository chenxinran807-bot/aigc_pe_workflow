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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(handler) {
    this.handlers.push(handler);
  }
}

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find(
  (target) =>
    target.type === "page" &&
    target.url.includes("workflow_id=7626601513428156454"),
);
if (!page) throw new Error("No Coze workflow page found.");

const cdp = new CDPClient(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Runtime.enable");

const contexts = [];
cdp.on((msg) => {
  if (msg.method === "Runtime.executionContextCreated") {
    contexts.push(msg.params.context);
  }
});
await cdp.send("Runtime.disable");
await cdp.send("Runtime.enable");
await new Promise((resolve) => setTimeout(resolve, 1000));

const cozeContext = contexts.find(
  (ctx) => ctx.origin === "https://cloud-coze.bytedance.net",
);
if (!cozeContext) {
  console.error(JSON.stringify(contexts, null, 2));
  throw new Error("No cloud-coze execution context found.");
}

const result = await cdp.send("Runtime.evaluate", {
  contextId: cozeContext.id,
  returnByValue: true,
  expression: `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const summarize = (el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().slice(0, 200),
        aria: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        role: el.getAttribute("role"),
        cls: el.className ? String(el.className).slice(0, 180) : "",
        id: el.id || "",
        rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}
      };
    };
    return {
      title: document.title,
      href: location.href,
      bodyText: (document.body?.innerText || "").slice(0, 8000),
      buttons: Array.from(document.querySelectorAll("button,[role=button],input,textarea,[contenteditable=true]")).filter(visible).slice(0, 120).map(summarize),
      possibleRun: Array.from(document.querySelectorAll("*")).filter(el => visible(el) && /运行|试运行|调试|执行|Run|Debug|开始/.test((el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim())).slice(0, 80).map(summarize)
    };
  })()`,
});

console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
