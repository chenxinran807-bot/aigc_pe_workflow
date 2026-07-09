const fieldNames = process.argv.slice(2);
const names = fieldNames.length ? fieldNames : ["outfit_image", "user_image"];

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

const results = [];
for (const fieldName of names) {
  const expression = `(() => {
    const fieldName = ${JSON.stringify(fieldName)};
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const fields = Array.from(document.querySelectorAll(".field-item--E1HRs6Ya6Ok1N9Sx")).filter(visible);
    const field = fields.find((el) => (el.innerText || "").includes(fieldName));
    if (!field) return { ok: false, fieldName, reason: "field not found" };
    const select = Array.from(field.querySelectorAll('[role="combobox"], .semi-select')).find(visible);
    if (!select) return { ok: false, fieldName, reason: "select not found" };
    const r = select.getBoundingClientRect();
    select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    select.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    select.click();
    const findOption = () => Array.from(document.querySelectorAll(".coz-select-option-item, [role=option], .semi-select-option"))
      .filter(visible)
      .find((el) => (el.innerText || el.textContent || "").trim() === "输入URL");
    const option = findOption();
    if (!option) {
      return { ok: false, fieldName, reason: "输入URL option not found", selectText: select.innerText };
    }
    const or = option.getBoundingClientRect();
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
    option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
    option.click();
    return { ok: true, fieldName, optionText: option.innerText };
  })()`;
  const result = await cdp.send("Runtime.evaluate", {
    contextId: cozeContext.id,
    expression,
    returnByValue: true,
  });
  results.push(result.result.value);
  await new Promise((resolve) => setTimeout(resolve, 600));
}

console.log(JSON.stringify(results, null, 2));
cdp.ws.close();
