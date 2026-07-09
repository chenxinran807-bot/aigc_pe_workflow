const [userImage, outfitImage] = process.argv.slice(2);
if (!userImage || !outfitImage) {
  console.error("Usage: node tools/coze_cdp_run_case.mjs <user_image_url> <outfit_image_url>");
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

async function cozeContext(cdp) {
  const contexts = [];
  cdp.on((msg) => {
    if (msg.method === "Runtime.executionContextCreated") contexts.push(msg.params.context);
  });
  await cdp.send("Runtime.disable");
  await cdp.send("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 1000));
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
const contextId = await cozeContext(cdp);

const expression = `(() => {
  const values = {
    user_image: ${JSON.stringify(userImage)},
    outfit_image: ${JSON.stringify(outfitImage)}
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const setValue = (testId, value) => {
    const el = document.querySelector('[data-testid="' + testId + '"]');
    if (!el) return { ok: false, reason: "missing " + testId };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    return { ok: true, value: el.value };
  };
  const fillResults = {
    user_image: setValue("workflow.testrun.form.component._node._input.user_image", values.user_image),
    outfit_image: setValue("workflow.testrun.form.component._node._input.outfit_image", values.outfit_image),
  };
  const buttons = Array.from(document.querySelectorAll("button"))
    .filter(visible)
    .filter((el) => (el.innerText || el.textContent || "").trim() === "试运行");
  const runButton = buttons[buttons.length - 1];
  if (!runButton) return { ok: false, fillResults, reason: "run button not found" };
  const rect = runButton.getBoundingClientRect();
  runButton.click();
  return { ok: true, fillResults, clicked: { text: runButton.innerText, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } } };
})()`;

const result = await cdp.send("Runtime.evaluate", { contextId, expression, returnByValue: true });
console.log(JSON.stringify(result.result.value, null, 2));
cdp.ws.close();
