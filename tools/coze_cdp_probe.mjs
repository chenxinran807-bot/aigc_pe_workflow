const base = "http://127.0.0.1:9222";

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

const targets = await (await fetch(`${base}/json/list`)).json();
const page = targets.find(
  (target) =>
    target.type === "page" &&
    target.url.includes("workflow_id=7626601513428156454"),
);

if (!page) {
  console.error("No Coze workflow page found.");
  console.error(JSON.stringify(targets, null, 2));
  process.exit(1);
}

const cdp = new CDPClient(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("DOM.enable");

const screenshot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
});
await (await import("node:fs/promises")).writeFile(
  "/private/tmp/coze-workflow.png",
  Buffer.from(screenshot.data, "base64"),
);

const frameTree = await cdp.send("Page.getFrameTree");
const contexts = [];
cdp.on((msg) => {
  if (msg.method === "Runtime.executionContextCreated") {
    contexts.push(msg.params.context);
  }
});
await cdp.send("Runtime.disable");
await cdp.send("Runtime.enable");
await new Promise((resolve) => setTimeout(resolve, 1000));

const evalResult = await cdp.send("Runtime.evaluate", {
  expression: `({
    title: document.title,
    url: location.href,
    text: document.body ? document.body.innerText.slice(0, 4000) : "",
    iframes: Array.from(document.querySelectorAll("iframe")).map((f) => ({
      src: f.src,
      rect: (() => { const r = f.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()
    }))
  })`,
  returnByValue: true,
});

console.log(
  JSON.stringify(
    {
      page: { title: page.title, url: page.url },
      screenshot: "/private/tmp/coze-workflow.png",
      frameTree,
      contexts: contexts.map((ctx) => ({
        id: ctx.id,
        origin: ctx.origin,
        name: ctx.name,
        auxData: ctx.auxData,
      })),
      document: evalResult.result.value,
    },
    null,
    2,
  ),
);

cdp.ws.close();
