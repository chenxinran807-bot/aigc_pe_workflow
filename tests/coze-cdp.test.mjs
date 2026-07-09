import assert from "node:assert/strict";
import test from "node:test";

import { findWorkflowPage, rewriteDebuggerUrls, WORKFLOW_ID, WORKFLOW_URL } from "../src/coze-cdp.mjs";

test("rewrites localhost websocket debugger URLs for a remote Chrome runner", () => {
  const payload = {
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
    nested: [
      { webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/def" },
      { webSocketDebuggerUrl: "ws://10.0.0.8:9222/devtools/page/ghi" },
    ],
  };

  const rewritten = rewriteDebuggerUrls(payload, "runner.internal");

  assert.equal(rewritten.webSocketDebuggerUrl, "ws://runner.internal:9222/devtools/browser/abc");
  assert.equal(rewritten.nested[0].webSocketDebuggerUrl, "ws://runner.internal:9222/devtools/page/def");
  assert.equal(rewritten.nested[1].webSocketDebuggerUrl, "ws://10.0.0.8:9222/devtools/page/ghi");
});

test("opens the default Coze workflow when the runner has no matching page", async () => {
  const opened = [];
  const page = await findWorkflowPage(9222, {
    listTargets: async () => [],
    openPage: async (debugPort, targetUrl) => {
      opened.push({ debugPort, targetUrl });
      return {
        type: "page",
        url: targetUrl,
        webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/new",
      };
    },
  });

  assert.equal(page.url, WORKFLOW_URL);
  assert.deepEqual(opened, [{ debugPort: 9222, targetUrl: WORKFLOW_URL }]);
  assert.match(WORKFLOW_URL, new RegExp(`workflow_id=${WORKFLOW_ID}`));
});
