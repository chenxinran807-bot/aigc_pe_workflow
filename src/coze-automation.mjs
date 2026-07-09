import { closeWorkflowPage, delay, evaluateInCoze, js, openWorkflowPage, withCozePage } from "./coze-cdp.mjs";
import { extractRunResult } from "./result-extract.mjs";

export const DEFAULT_NODE_IDS = {
  userVlm: "1082797",
  outfitVlm: "1790511",
  promptCode: "1686472",
};

export async function getPromptSnapshot(nodeIds = DEFAULT_NODE_IDS) {
  await selectNodeByName("用户形象特征VLM_2");
  const userPrompts = await evaluateInCoze(`(() => {
    const textOf = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return "";
      const doc = el.cmView?.view?.state?.doc;
      return doc?.toString?.() || doc?.sliceString?.(0) || el.innerText || el.value || "";
    };
    return {
      userSystemPrompt: textOf('[data-testid="playground.node.${nodeIds.userVlm}.$$prompt_decorator$$.systemPrompt"]'),
      userPrompt: textOf('[data-testid="playground.node.${nodeIds.userVlm}.$$prompt_decorator$$.prompt"]'),
    };
  })()`);

  await selectNodeByName("搭配图信息VLM_2");
  const outfitPrompts = await evaluateInCoze(`(() => {
    const textOf = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return "";
      const doc = el.cmView?.view?.state?.doc;
      return doc?.toString?.() || doc?.sliceString?.(0) || el.innerText || el.value || "";
    };
    return {
      outfitSystemPrompt: textOf('[data-testid="playground.node.${nodeIds.outfitVlm}.$$prompt_decorator$$.systemPrompt"]'),
      outfitPrompt: textOf('[data-testid="playground.node.${nodeIds.outfitVlm}.$$prompt_decorator$$.prompt"]'),
    };
  })()`);

  await selectNodeByName("Prompt拼接_2");
  const promptCode = await evaluateInCoze(`(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    const editorText = (el) => {
      const doc = el.cmView?.view?.state?.doc;
      const fullText = doc?.toString?.() || doc?.sliceString?.(0);
      return fullText || el.innerText || "";
    };
    return {
      promptCode: Array.from(document.querySelectorAll('[role="textbox"], .cm-content'))
        .filter(visible)
        .map((el) => editorText(el))
        .find((text) => text.includes("async function main") && text.includes("const positive")) || "",
    };
  })()`);

  return { ...userPrompts, ...outfitPrompts, ...promptCode };
}

export async function selectNodeByName(nodeName) {
  const result = await withCozePage(async ({ cdp, contextId }) => {
    const nodeResult = await cdp.send("Runtime.evaluate", {
      contextId,
      returnByValue: true,
      expression: `((nodeName) => {
        const node = Array.from(document.querySelectorAll('[data-testid="sdk.workflow.canvas.node"]'))
          .find((el) => (el.innerText || "").includes(nodeName));
        if (!node) return { ok: false, reason: "missing node " + nodeName };
        const r = node.getBoundingClientRect();
        return { ok: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      })(${js(nodeName)})`,
    });
    const node = nodeResult.result.value;
    if (!node?.ok) return node;

    const frameResult = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const frame = Array.from(document.querySelectorAll("iframe"))
          .find((item) => item.src.includes("cloud-coze.bytedance.net"));
        if (!frame) return { ok: false, reason: "missing cloud-coze iframe" };
        const r = frame.getBoundingClientRect();
        return { ok: true, rect: { x: r.x, y: r.y } };
      })()`,
    });
    const frame = frameResult.result.value;
    if (!frame?.ok) return frame;

    const dx = Math.min(50, node.rect.width / 2);
    const dy = Math.min(55, Math.max(24, node.rect.height - 24));
    const attempts = [
      { label: "frame-low-left", x: frame.rect.x + node.rect.x + dx, y: frame.rect.y + node.rect.y + dy },
      { label: "frame-center", x: frame.rect.x + node.rect.x + node.rect.width / 2, y: frame.rect.y + node.rect.y + node.rect.height / 2 },
      { label: "local-low-left", x: node.rect.x + dx, y: node.rect.y + dy },
      { label: "local-center", x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 },
    ];

    const checkSelected = async () => {
      const checkResult = await cdp.send("Runtime.evaluate", {
        contextId,
        returnByValue: true,
        expression: `((nodeName) => {
          const body = document.body.innerText || "";
          const selectedText = Array.from(document.querySelectorAll('[class*="selected"], [class*="activated"]'))
            .map((el) => el.innerText || "")
            .filter(Boolean)
            .join("\\n");
          return selectedText.includes(nodeName) || body.includes(nodeName + "\\n\\n");
        })(${js(nodeName)})`,
      });
      return Boolean(checkResult.result?.value);
    };

    const tried = [];
    for (const attempt of attempts) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: attempt.x, y: attempt.y, button: "none" });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: attempt.x, y: attempt.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: attempt.x, y: attempt.y, button: "left", clickCount: 1 });
      await delay(500);
      tried.push(attempt);
      if (await checkSelected()) return { ok: true, ...attempt, tried };
    }

    return { ok: false, reason: `click did not select ${nodeName}`, tried };
  });
  await delay(500);
  if (!result?.ok) throw new Error(result?.reason || `无法选中节点：${nodeName}`);
  return result;
}

export async function applyPromptEdits(edits, nodeIds = DEFAULT_NODE_IDS) {
  const results = {};

  await selectNodeByName("用户形象特征VLM_2");
  results.user = await evaluateInCoze(`(() => {
    const edits = ${js(edits)};
    const setEditorText = (selector, value) => {
      if (value === undefined || value === null) return { skipped: true };
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: "missing " + selector };
      const view = el.cmView?.view;
      if (view?.dispatch && view.state?.doc) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(value) } });
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, length: String(value).length, mode: "codemirror" };
      }
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, String(value));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, length: String(value).length };
    };
    return {
      userSystemPrompt: setEditorText('[data-testid="playground.node.${nodeIds.userVlm}.$$prompt_decorator$$.systemPrompt"]', edits.userSystemPrompt),
      userPrompt: setEditorText('[data-testid="playground.node.${nodeIds.userVlm}.$$prompt_decorator$$.prompt"]', edits.userPrompt),
    };
  })()`);

  await selectNodeByName("搭配图信息VLM_2");
  results.outfit = await evaluateInCoze(`(() => {
    const edits = ${js(edits)};
    const setEditorText = (selector, value) => {
      if (value === undefined || value === null) return { skipped: true };
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: "missing " + selector };
      const view = el.cmView?.view;
      if (view?.dispatch && view.state?.doc) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(value) } });
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, length: String(value).length, mode: "codemirror" };
      }
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, String(value));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, length: String(value).length };
    };
    return {
      outfitSystemPrompt: setEditorText('[data-testid="playground.node.${nodeIds.outfitVlm}.$$prompt_decorator$$.systemPrompt"]', edits.outfitSystemPrompt),
      outfitPrompt: setEditorText('[data-testid="playground.node.${nodeIds.outfitVlm}.$$prompt_decorator$$.prompt"]', edits.outfitPrompt),
    };
  })()`);

  if (edits.promptCode) {
    await selectNodeByName("Prompt拼接_2");
    results.promptCode = await evaluateInCoze(`(() => {
      const value = ${js(edits.promptCode)};
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
      };
      const editor = Array.from(document.querySelectorAll('[role="textbox"], .cm-content'))
        .filter(visible)
        .find((el) => (el.innerText || "").includes("async function main") || (el.innerText || "").includes("const positive"));
      if (!editor) return { ok: false, reason: "missing prompt code editor" };
      editor.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, String(value));
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, length: String(value).length };
    })()`);
  }

  return results;
}

export async function runCaseAndWait({ userImage, outfitImage, timeoutMs = 180000, page }) {
  const fillResult = await fillAndRunCaseViaJson(userImage, outfitImage, { page });
  if (!fillResult?.ok) {
    throw new Error(`试运行输入未正确填写：${JSON.stringify(fillResult)}`);
  }
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(5000);
    latest = await scrapeRun({ page });
    if (!isRunning(latest)) {
      const result = extractRunResult(latest);
      if (result.content || result.prompt || result.rawOutput.includes("运行结果")) return result;
    }
  }
  const partial = latest ? extractRunResult(latest) : null;
  throw new Error(`运行超时${partial?.content ? `，已抓到部分结果：${partial.content}` : ""}`);
}

export async function fillAndRunCaseViaJson(userImage, outfitImage, options = {}) {
  return withCozePage(async ({ cdp, contextId }) => {
    const evalInCoze = async (expression) => {
      const result = await cdp.send("Runtime.evaluate", {
        contextId,
        returnByValue: true,
        awaitPromise: true,
        expression,
      });
      return result.result?.value;
    };

    const frameOffset = async () => {
      const result = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const frame = Array.from(document.querySelectorAll("iframe"))
            .find((item) => item.src.includes("cloud-coze.bytedance.net") || item.src.includes("sso.bytedance.com"));
          if (!frame) return { x: 0, y: 0 };
          const rect = frame.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        })()`,
      });
      return result.result?.value || { x: 0, y: 0 };
    };

    const clickRect = async (rect) => {
      if (!rect) return false;
      const offset = await frameOffset();
      const x = offset.x + rect.x + rect.width / 2;
      const y = offset.y + rect.y + rect.height / 2;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      return true;
    };

    const panelState = async () => evalInCoze(`(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const rectOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const buttons = Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .map((button) => ({
          text: (button.innerText || button.textContent || "").trim(),
          rect: rectOf(button),
        }))
        .filter((button) => button.text === "试运行");
      return {
        ok: (document.body.innerText || "").includes("试运行输入"),
        buttons,
        bodyTail: (document.body.innerText || "").slice(-900),
      };
    })()`);

    let openResult = await panelState();
    for (let readyAttempt = 0; readyAttempt < 80 && !openResult?.buttons?.length && !openResult?.ok; readyAttempt += 1) {
      await delay(500);
      openResult = await panelState();
    }
    for (let attempt = 0; attempt < 6 && !openResult?.ok; attempt += 1) {
      const button = openResult?.buttons?.[openResult.buttons.length - 1 - attempt] || openResult?.buttons?.[openResult.buttons.length - 1];
      if (button?.rect) await clickRect(button.rect);
      for (let waitAttempt = 0; waitAttempt < 20; waitAttempt += 1) {
        await delay(250);
        openResult = await panelState();
        if (openResult?.ok) break;
        if (!button?.rect && openResult?.buttons?.length) break;
      }
    }
    if (!openResult?.ok) {
      await evalInCoze(`(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const buttons = Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
        const button = buttons[buttons.length - 1];
        if (!button) return false;
        const r = button.getBoundingClientRect();
        const init = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        button.dispatchEvent(new PointerEvent("pointerdown", init));
        button.dispatchEvent(new MouseEvent("mousedown", init));
        button.dispatchEvent(new PointerEvent("pointerup", init));
        button.dispatchEvent(new MouseEvent("mouseup", init));
        button.click();
        return true;
      })()`);
      for (let waitAttempt = 0; waitAttempt < 40; waitAttempt += 1) {
        await delay(250);
        openResult = await panelState();
        if (openResult?.ok) break;
      }
    }
    if (!openResult?.ok) return { ok: false, reason: "test run panel unavailable", openResult };

    const directFillResult = await evalInCoze(`(() => {
      const values = {
        user_image: ${js(userImage)},
        outfit_image: ${js(outfitImage)},
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const setNativeValue = (el, value) => {
        if (!el) return false;
        if (el.isContentEditable || el.getAttribute("role") === "textbox") {
          el.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, String(value));
        } else {
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
          if (!setter) return false;
          setter.call(el, String(value));
        }
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
        return true;
      };
      const results = {};
      for (const [fieldName, value] of Object.entries(values)) {
        const testId = "workflow.testrun.form.component._node._input." + fieldName;
        let input = document.querySelector('[data-testid="' + testId + '"]');
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && !(input?.isContentEditable || input?.getAttribute?.("role") === "textbox")) {
          const field = Array.from(document.querySelectorAll('[class*="field-item"], [class*="form-item"]'))
            .filter(visible)
            .find((item) => (item.innerText || "").includes(fieldName));
          input = field ? Array.from(field.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
        }
        results[fieldName] = {
          ok: setNativeValue(input, value),
          tag: input?.tagName || "",
          value: input?.value || input?.innerText || "",
        };
      }
      return {
        ok: Boolean(results.user_image?.ok && results.outfit_image?.ok),
        results,
        bodyTail: (document.body.innerText || "").slice(-800),
      };
    })()`);

    if (directFillResult?.ok) {
      const runResult = await evalInCoze(`(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const buttons = Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
        const runButton = buttons[buttons.length - 1];
        if (!runButton) return { ok: false, reason: "run button not found" };
        runButton.click();
        return { ok: true };
      })()`);
      if (!runResult?.ok) return { ok: false, reason: "run button click failed", runResult, directFillResult };
      return { ok: true, mode: "direct-string", openResult, fillResult: directFillResult };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const switchState = await evalInCoze(`(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const input = Array.from(document.querySelectorAll(".mode-switch--B2QlyU4PMaUuV_tp input[role=switch], input[role=switch]"))
          .filter(visible)
          .find((el) => el.closest?.(".mode-switch--B2QlyU4PMaUuV_tp") || (el.closest?.("div")?.innerText || "").includes("JSON模式"));
        const rect = input?.getBoundingClientRect();
        return {
          checked: Boolean(input?.checked),
          rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          bodyTail: (document.body.innerText || "").slice(-600),
        };
      })()`);
      if (switchState?.checked) break;
      if (!switchState?.rect) return { ok: false, reason: "JSON mode switch not found", switchState };
      await clickRect(switchState.rect);
      await delay(800);
    }

    const jsonText = JSON.stringify({
      _input: {
        outfit_image: outfitImage,
        user_image: userImage,
      },
    }, null, 2);

    const fillResult = await evalInCoze(`(() => {
      const value = ${js(jsonText)};
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const editor = Array.from(document.querySelectorAll(".cm-content, [role=textbox], textarea"))
        .filter(visible)
        .find((el) => (el.innerText || el.value || "").includes("_input") || (el.closest?.(".test-form-v2--TFcZS9zOnUsHzWC4") && el.className?.toString?.().includes("cm-content")));
      if (!editor) return { ok: false, reason: "JSON editor not found", bodyTail: (document.body.innerText || "").slice(-800) };
      const view = editor.cmView?.view;
      if (view?.dispatch && view.state?.doc) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      } else if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), "value")?.set;
        setter?.call(editor, value);
      } else {
        editor.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, value);
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value };
    })()`);
    if (!fillResult?.ok) return { ok: false, reason: "JSON input fill failed", fillResult };

    const runResult = await evalInCoze(`(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const buttons = Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
      const runButton = buttons[buttons.length - 1];
      if (!runButton) return { ok: false, reason: "run button not found" };
      runButton.click();
      return { ok: true };
    })()`);
    if (!runResult?.ok) return { ok: false, reason: "run button click failed", runResult };

    return { ok: true, mode: "json", openResult, fillResult };
  }, options);
}

export async function forceOutfitUrlMode(options = {}) {
  return withCozePage(async ({ cdp, contextId }) => {
    const evalInCoze = async (expression) => {
      const result = await cdp.send("Runtime.evaluate", {
        contextId,
        returnByValue: true,
        awaitPromise: true,
        expression,
      });
      return result.result?.value;
    };

    const frameOffset = async () => {
      const result = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const frame = Array.from(document.querySelectorAll("iframe"))
            .find((item) => item.src.includes("cloud-coze.bytedance.net"));
          if (!frame) return { x: 0, y: 0 };
          const rect = frame.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        })()`,
      });
      return result.result?.value || { x: 0, y: 0 };
    };

    const clickRect = async (rect) => {
      if (!rect) return false;
      const offset = await frameOffset();
      const x = offset.x + rect.x + rect.width / 2;
      const y = offset.y + rect.y + rect.height / 2;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      return true;
    };

    const stateExpression = `(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const fieldByName = (fieldName) => {
        const testInput = document.querySelector('[data-testid="workflow.testrun.form.component._node._input.' + fieldName + '"]');
        const fromTestInput = testInput?.closest?.('[class*="field-item"], [class*="form-item"], [class*="Form"]');
        if (fromTestInput && visible(fromTestInput)) return fromTestInput;
        return Array.from(document.querySelectorAll('[class*="field-item"], [class*="form-item"]'))
          .filter(visible)
          .find((field) => (field.innerText || "").includes(fieldName));
      };
      const rectOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const field = fieldByName("outfit_image");
      const select = field ? Array.from(field.querySelectorAll('[role="combobox"], .semi-select')).find(visible) : null;
      const input = field ? Array.from(field.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
      const option = Array.from(document.querySelectorAll(".coz-select-option-item, [role=option], .semi-select-option, .option-text, .option-text-wrapper"))
        .filter(visible)
        .find((el) => (el.innerText || el.textContent || "").trim() === "输入URL");
      return {
        fieldText: field?.innerText || "",
        selectedText: (select?.innerText || select?.textContent || "").trim(),
        selectRect: rectOf(select),
        optionRect: rectOf(option?.closest?.(".coz-select-option-item, [role=option], .semi-select-option") || option),
        hasInput: Boolean(input),
        bodyTail: (document.body.innerText || "").slice(-800),
      };
    })()`;

    await evalInCoze(`(async () => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const hasFields = () => document.querySelector('[data-testid="workflow.testrun.form.component._node._input.outfit_image"]')
        && document.querySelector('[data-testid="workflow.testrun.form.component._node._input.user_image"]');
      if (!hasFields()) {
        const buttons = Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
        buttons[buttons.length - 1]?.click();
      }
      for (let attempt = 0; attempt < 40 && !hasFields(); attempt += 1) await wait(250);
      return Boolean(hasFields());
    })()`);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let state = await evalInCoze(stateExpression);
      if (state?.selectedText.includes("输入URL") && state?.hasInput) return { ok: true, state };
      if (!state?.selectRect) return { ok: false, reason: "missing outfit image select", state };
      await clickRect(state.selectRect);
      await delay(400);
      state = await evalInCoze(stateExpression);
      if (!state?.optionRect) continue;
      await clickRect(state.optionRect);
      await delay(900);
      state = await evalInCoze(stateExpression);
      if (state?.selectedText.includes("输入URL") && state?.hasInput) return { ok: true, state };
    }

    return { ok: false, reason: "cannot switch outfit_image to 输入URL", state: await evalInCoze(stateExpression) };
  }, options);
}

export async function runCaseInNewWorkflowPage({ userImage, outfitImage, timeoutMs = 180000 }) {
  const page = await openWorkflowPage();
  try {
    return await runCaseAndWait({ userImage, outfitImage, timeoutMs, page });
  } finally {
    await closeWorkflowPage(page);
  }
}

export async function fillAndRunCase(userImage, outfitImage, options = {}) {
  return evaluateInCoze(`(async () => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fieldByName = (fieldName) => {
      const testInput = document.querySelector('[data-testid="workflow.testrun.form.component._node._input.' + fieldName + '"]');
      const fromTestInput = testInput?.closest?.('[class*="field-item"], [class*="form-item"], [class*="Form"]');
      if (fromTestInput && visible(fromTestInput)) return fromTestInput;
      return Array.from(document.querySelectorAll('[class*="field-item"], [class*="form-item"]'))
        .filter(visible)
        .find((field) => (field.innerText || "").includes(fieldName));
    };

    const panelSnapshot = () => ({
      fieldNames: Array.from(document.querySelectorAll('[data-testid*="workflow.testrun.form.component._node._input."]'))
        .map((el) => el.getAttribute("data-testid")),
      buttons: Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .map((button) => (button.innerText || button.textContent || "").trim())
        .filter(Boolean),
      bodyTail: (document.body.innerText || "").slice(-1200),
    });

    const openTestRunPanel = async () => {
      if (fieldByName("user_image") && fieldByName("outfit_image")) return { ok: true, skipped: true };
      let buttons = [];
      for (let ready = 0; ready < 60 && !buttons.length; ready += 1) {
        buttons = Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
        if (!buttons.length) await wait(500);
      }
      if (!buttons.length) return { ok: false, reason: "test run button not found", snapshot: panelSnapshot() };
      buttons[buttons.length - 1].click();
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await wait(200);
        if (fieldByName("user_image") && fieldByName("outfit_image")) {
          return { ok: true, clicked: true, attempts: attempt + 1 };
        }
      }
      return { ok: false, reason: "test run panel did not expose input fields", snapshot: panelSnapshot() };
    };

    const ensureUrlMode = async (fieldName) => {
      const field = fieldByName(fieldName);
      if (!field) return { ok: false, reason: "missing field " + fieldName };
      const select = Array.from(field.querySelectorAll('[role="combobox"], .semi-select')).find(visible);
      if (!select) return { ok: true, skipped: true, reason: "no type selector" };
      const selectedText = (select.innerText || select.textContent || "").trim();
      if (selectedText.includes("输入URL")) return { ok: true, skipped: true, selectedText };
      const r = select.getBoundingClientRect();
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      select.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      select.click();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(150);
        const optionText = Array.from(document.querySelectorAll(".coz-select-option-item, [role=option], .semi-select-option, .option-text, .option-text-wrapper"))
          .filter(visible)
          .find((el) => (el.innerText || el.textContent || "").trim() === "输入URL");
        if (optionText) {
          const option = optionText.closest?.(".coz-select-option-item, [role=option], .semi-select-option") || optionText;
          const or = option.getBoundingClientRect();
          option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
          option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
          option.click();
          for (let settle = 0; settle < 20; settle += 1) {
            await wait(150);
            const currentField = fieldByName(fieldName);
            const currentSelect = currentField ? Array.from(currentField.querySelectorAll('[role="combobox"], .semi-select')).find(visible) : null;
            const currentText = (currentSelect?.innerText || currentSelect?.textContent || "").trim();
            const input = currentField ? Array.from(currentField.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
            if (currentText.includes("输入URL") && input) {
              return { ok: true, selected: "输入URL", selectedText: currentText };
            }
          }
          return { ok: false, reason: "输入URL selected but editable input did not appear", selected: "输入URL" };
        }
      }
      return { ok: false, reason: "输入URL option not found", selectText: selectedText };
    };

    const setNativeValue = (el, value) => {
      if (el.isContentEditable || el.getAttribute("role") === "textbox") {
        el.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, String(value));
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) return false;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
      return true;
    };

    const setValue = async (fieldName, value) => {
      const testId = "workflow.testrun.form.component._node._input." + fieldName;
      let lastFieldText = "";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        let el = document.querySelector('[data-testid="' + testId + '"]');
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !(el?.isContentEditable || el?.getAttribute?.("role") === "textbox")) {
          const field = fieldByName(fieldName);
          lastFieldText = field?.innerText || "";
          el = field ? Array.from(field.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
        }
        if (el) {
          if (!setNativeValue(el, value)) return { ok: false, reason: "cannot set " + fieldName, tag: el.tagName, role: el.getAttribute("role") };
          return { ok: true, value: el.value || el.innerText || "" };
        }
        await wait(200);
      }
      return { ok: false, reason: "missing editable input for " + fieldName, fieldText: lastFieldText };
    };

    const openResult = await openTestRunPanel();
    if (!openResult.ok) return { ok: false, openResult, reason: "test run panel unavailable" };

    const modeResults = {
      outfit_image: await ensureUrlMode("outfit_image"),
    };

    const fillResults = {
      user_image: await setValue("user_image", ${js(userImage)}),
      outfit_image: await setValue("outfit_image", ${js(outfitImage)}),
    };
    if (!modeResults.outfit_image.ok || !fillResults.user_image.ok || !fillResults.outfit_image.ok) {
      return { ok: false, openResult, modeResults, fillResults, snapshot: panelSnapshot(), reason: "input fill failed" };
    }
    const buttons = Array.from(document.querySelectorAll("button"))
      .filter(visible)
      .filter((el) => (el.innerText || el.textContent || "").trim() === "试运行");
    const runButton = buttons[buttons.length - 1];
    if (!runButton) return { ok: false, openResult, fillResults, snapshot: panelSnapshot(), reason: "run button not found" };
    runButton.click();
    return { ok: true, openResult, modeResults, fillResults };
  })()`, options);
}

export async function scrapeRun(options = {}) {
  return evaluateInCoze(`(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const text = document.body?.innerText || "";
    const urls = Array.from(new Set(text.match(/https?:\\/\\/[^\\s"'<>，。)）]+/g) || []));
    const imgSrcs = Array.from(document.querySelectorAll("img")).filter(visible).map((img) => img.src).filter(Boolean);
    const isNoiseImage = (url) => /FileBizType\\.BIZ_BOT_ICON|appstore-sign|bot_icon|avatar/i.test(url);
    const images = Array.from(new Set([...urls, ...imgSrcs]))
      .filter((u) => (/\\.(png|jpe?g|webp|gif)(\\?|$)/i.test(u) || /image/.test(u)) && !isNoiseImage(u));
    return {
      text: text.slice(0, 20000),
      urls,
      images,
      buttonTexts: Array.from(document.querySelectorAll("button")).filter(visible).map((b) => (b.innerText || b.textContent || "").trim()).filter(Boolean),
      timestamp: new Date().toISOString(),
    };
  })()`, options);
}

function isRunning(scrape) {
  const text = scrape?.text || "";
  const buttons = scrape?.buttonTexts || [];
  return text.includes("运行中") || text.includes("排队中") || buttons.includes("停止");
}
