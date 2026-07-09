const wantedText = process.argv[2];
if (!wantedText) {
  console.error("Usage: node tools/coze_cdp_click_frame_text.mjs <text>");
  process.exit(1);
}

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
if (!cozeContext) throw new Error("No cloud-coze execution context found.");

const expression = `(() => {
  const wanted = ${JSON.stringify(wantedText)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const candidates = Array.from(document.querySelectorAll("button,[role=button]"))
    .filter(visible)
    .map((el) => ({ el, text: (el.innerText || el.textContent || "").trim() }))
    .filter((item) => item.text === wanted);
  if (candidates.length !== 1) {
    return {
      ok: false,
      reason: "expected exactly one candidate",
      count: candidates.length,
      candidates: candidates.map(({el, text}) => {
        const r = el.getBoundingClientRect();
        return { text, rect: { x:r.x, y:r.y, w:r.width, h:r.height }, className: el.className };
      }),
    };
  }
  const button = candidates[0].el;
  button.scrollIntoView({ block: "center", inline: "center" });
  button.click();
  return { ok: true, text: wanted };
})()`;

const result = await cdp.send("Runtime.evaluate", {
  contextId: cozeContext.id,
  expression,
  returnByValue: true,
});
console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
