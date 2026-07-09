const optionText = process.argv[2] || "输入URL";

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

const expression = `(() => {
  const optionText = ${JSON.stringify(optionText)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const options = Array.from(document.querySelectorAll(".coz-select-option-item, [role=option], .semi-select-option"))
    .filter(visible)
    .filter((el) => (el.innerText || el.textContent || "").trim() === optionText);
  if (options.length < 1) return { ok: false, reason: "option not found", count: options.length };
  const option = options[options.length - 1];
  const r = option.getBoundingClientRect();
  option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  option.click();
  return { ok: true, text: option.innerText, rect: {x:r.x,y:r.y,w:r.width,h:r.height}, candidates: options.length };
})()`;

const result = await cdp.send("Runtime.evaluate", {
  contextId: cozeContext.id,
  expression,
  returnByValue: true,
});
console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
