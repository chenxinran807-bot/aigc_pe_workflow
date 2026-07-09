const [xArg, yArg] = process.argv.slice(2);
if (!xArg || !yArg) {
  console.error("Usage: node tools/coze_cdp_click.mjs <x> <y>");
  process.exit(1);
}

const x = Number(xArg);
const y = Number(yArg);

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
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
await cdp.send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x,
  y,
  button: "none",
});
await cdp.send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x,
  y,
  button: "left",
  clickCount: 1,
});
await cdp.send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x,
  y,
  button: "left",
  clickCount: 1,
});
cdp.ws.close();
