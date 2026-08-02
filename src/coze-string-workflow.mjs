import { closeWorkflowPage, delay, findWorkflowPageByUrl, js, openWorkflowPage, withCozePage } from "./coze-cdp.mjs";

export async function runStringWorkflow({
  url,
  inputs,
  timeoutMs = 120000,
  reuseOpenPage = false,
  inputSettleMs = 3500,
}) {
  const page = reuseOpenPage ? await findWorkflowPageByUrl(url) : await openWorkflowPage(undefined, url);
  try {
    return await withCozePage(async ({ cdp, contextId }) => {
      const evalInCoze = async (expression) => {
        const result = await cdp.send("Runtime.evaluate", {
          contextId,
          returnByValue: true,
          awaitPromise: true,
          expression,
        });
        return result.result?.value;
      };

      const openResult = await openTestRunPanel(cdp, contextId, evalInCoze);
      if (!openResult?.ok) return { ok: false, error: "test run panel unavailable", scrape: openResult };

      const fillResult = await evalInCoze(`(async () => {
        const inputs = ${js(inputs)};
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const setNativeValue = (el, value) => {
          if (!el) return false;
          const text = String(value ?? "");
          el.focus();
          document.execCommand("selectAll", false, null);
          const inserted = document.execCommand("insertText", false, text);
          if (!inserted && !(el.isContentEditable || el.getAttribute("role") === "textbox")) {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
            if (!setter) return false;
            setter.call(el, text);
          }
          el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.blur?.();
          return true;
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
        const ensureUrlMode = async (fieldName) => {
          const field = fieldByName(fieldName);
          if (!field) return { ok: false, reason: "missing field " + fieldName };
          const fieldText = field.innerText || "";
          const editable = Array.from(field.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible);
          if (editable && !/上传|拖拽文件上传|Image/.test(fieldText)) return { ok: true, skipped: true, reason: "already editable" };
          const select = Array.from(field.querySelectorAll('[role="combobox"], .semi-select')).find(visible);
          if (!select) return { ok: false, reason: "image field has no URL selector", fieldText: fieldText.slice(0, 200) };
          const selectedText = (select.innerText || select.textContent || "").trim();
          if (selectedText.includes("输入URL")) return { ok: true, skipped: true, selectedText };
          const r = select.getBoundingClientRect();
          select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
          select.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
          select.click();
          for (let attempt = 0; attempt < 12; attempt += 1) {
            await wait(150);
            const optionText = Array.from(document.querySelectorAll(".coz-select-option-item, [role=option], .semi-select-option, .option-text, .option-text-wrapper"))
              .filter(visible)
              .find((el) => (el.innerText || el.textContent || "").trim() === "输入URL");
            if (!optionText) continue;
            const option = optionText.closest?.(".coz-select-option-item, [role=option], .semi-select-option") || optionText;
            const or = option.getBoundingClientRect();
            option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
            option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: or.x + or.width / 2, clientY: or.y + or.height / 2 }));
            option.click();
            for (let settle = 0; settle < 20; settle += 1) {
              await wait(150);
              const currentField = fieldByName(fieldName);
              const input = currentField ? Array.from(currentField.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
              if (input) return { ok: true, selected: "输入URL" };
            }
            return { ok: false, reason: "输入URL selected but editable input did not appear" };
          }
          return { ok: false, reason: "输入URL option not found", selectedText };
        };
        const setFieldValue = async (fieldName, value) => {
          const testId = "workflow.testrun.form.component._node._input." + fieldName;
          for (let attempt = 0; attempt < 20; attempt += 1) {
            let input = document.querySelector('[data-testid="' + testId + '"]');
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && !(input?.isContentEditable || input?.getAttribute?.("role") === "textbox")) {
              const field = fieldByName(fieldName);
              input = field ? Array.from(field.querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible) : null;
              if (!input && field && /上传|拖拽文件上传|Image/.test(field.innerText || "")) {
                const mode = await ensureUrlMode(fieldName);
                if (!mode.ok) return { ok: false, mode, tag: "", reason: "cannot switch image field to URL mode" };
                input = Array.from((fieldByName(fieldName) || document).querySelectorAll("input, textarea, [contenteditable=true], [role=textbox]")).find(visible);
              }
            }
            if (input) return { ok: setNativeValue(input, value), tag: input.tagName };
            await wait(200);
          }
          return { ok: false, tag: "", reason: "missing editable input" };
        };
        const results = {};
        for (const [fieldName, value] of Object.entries(inputs)) {
          results[fieldName] = await setFieldValue(fieldName, value);
        }
        return {
          ok: Object.values(results).every((item) => item.ok),
          results,
          bodyTail: (document.body.innerText || "").slice(-1000),
        };
      })()`);
      const finalFillResult = fillResult?.ok ? fillResult : await fillInputsViaJsonMode(cdp, evalInCoze, inputs, fillResult);
      if (!finalFillResult?.ok) return { ok: false, error: "input fill failed", scrape: finalFillResult };

      // URL image inputs can be accepted by the form before Coze finishes
      // fetching them. Running immediately can make the model see no images.
      if (inputSettleMs > 0) await delay(inputSettleMs);

      const beforeRun = await scrapeVisible(evalInCoze);
      const runClick = await evalInCoze(`(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const buttons = Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
        const button = buttons[buttons.length - 1];
        if (!button) return { ok: false, reason: "missing run button" };
        button.click();
        return { ok: true };
      })()`);
      if (!runClick?.ok) return { ok: false, error: "run click failed", scrape: runClick };

      const startedAt = Date.now();
      let latest = null;
      let sawProgress = false;
      const beforeResult = resultSignature(beforeRun?.text || "");
      while (Date.now() - startedAt < timeoutMs) {
        await delay(2500);
        latest = await scrapeVisible(evalInCoze);
        const text = latest?.text || "";
        if (!text.includes("运行成功") && (text.includes("运行中") || text.includes("排队中") || text.includes("试运行进行中"))) {
          sawProgress = true;
          continue;
        }
        const latestResult = resultSignature(text);
        const resultChanged = latestResult && latestResult !== beforeResult;
        if ((text.includes("运行结果") || text.includes("运行成功")) && resultChanged) {
          return { ok: true, scrape: latest, fillResult: finalFillResult };
        }
        if (sawProgress && text.includes("运行成功") && latestResult && !beforeResult) {
          return { ok: true, scrape: latest, fillResult: finalFillResult };
        }
      }
      return { ok: false, error: "judge workflow timeout", scrape: { latest, beforeRun, fillResult: finalFillResult } };
    }, { page });
  } finally {
    if (!reuseOpenPage) await closeWorkflowPage(page);
  }
}

async function fillInputsViaJsonMode(cdp, evalInCoze, inputs, directFillResult) {
  const switchResult = await evalInCoze(`(async () => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isJsonMode = () => {
      const body = document.body.innerText || "";
      return body.includes("_input") || Array.from(document.querySelectorAll(".cm-content, [role=textbox], textarea"))
        .filter(visible)
        .some((el) => (el.innerText || el.value || "").includes("_input"));
    };
    if (isJsonMode()) return { ok: true, already: true };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidates = Array.from(document.querySelectorAll("label, button, span, div, input[role=switch], input[type=checkbox]"))
        .filter(visible)
        .filter((el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || "").includes("JSON模式") || el.getAttribute("role") === "switch");
      const target = candidates.find((el) => (el.innerText || el.textContent || "").includes("JSON模式"))
        || candidates.find((el) => el.getAttribute("role") === "switch")
        || null;
      if (!target) return { ok: false, reason: "JSON mode switch not found", bodyTail: (document.body.innerText || "").slice(-1000) };
      const clickable = target.closest?.("label, button") || target;
      clickable.click();
      await wait(700);
      if (isJsonMode()) return { ok: true };
    }
    return { ok: false, reason: "JSON mode did not open", bodyTail: (document.body.innerText || "").slice(-1000) };
  })()`);
  if (!switchResult?.ok) {
    return { ok: false, mode: "direct-then-json", directFillResult, jsonSwitchResult: switchResult };
  }

  const jsonText = JSON.stringify({ _input: inputs }, null, 2);
  const fillResult = await evalInCoze(`(() => {
    const value = ${js(jsonText)};
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const setNativeValue = (el, text) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
    };
    const editors = Array.from(document.querySelectorAll(".cm-content, [role=textbox], textarea, input"))
      .filter(visible);
    const editor = editors.find((el) => {
      const text = el.innerText || el.value || "";
      const cls = el.className?.toString?.() || "";
      return text.includes("_input") || cls.includes("cm-content") || el.tagName === "TEXTAREA";
    });
    if (!editor) return { ok: false, reason: "JSON editor not found", bodyTail: (document.body.innerText || "").slice(-1200) };
    const view = editor.cmView?.view;
    if (view?.dispatch && view.state?.doc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    } else if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, value);
    } else {
      editor.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, value);
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      ok: true,
      tag: editor.tagName,
      mode: "json",
      valueLength: value.length,
      visibleText: (editor.innerText || editor.value || "").slice(0, 200),
    };
  })()`);

  return {
    ok: Boolean(fillResult?.ok),
    mode: "direct-then-json",
    directFillResult,
    jsonSwitchResult: switchResult,
    jsonFillResult: fillResult,
  };
}

export async function inspectStringWorkflowInputs({ url }) {
  const page = await openWorkflowPage(undefined, url);
  try {
    return await withCozePage(async ({ cdp, contextId }) => {
      const evalInCoze = async (expression) => {
        const result = await cdp.send("Runtime.evaluate", {
          contextId,
          returnByValue: true,
          awaitPromise: true,
          expression,
        });
        return result.result?.value;
      };
      const openResult = await openTestRunPanel(cdp, contextId, evalInCoze);
      if (!openResult?.ok) return { ok: false, openResult };
      return evalInCoze(`(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const fields = Array.from(document.querySelectorAll('[data-testid*="workflow.testrun.form.component._node._input."]'))
          .filter(visible)
          .map((el) => {
            const testid = el.getAttribute("data-testid") || "";
            return {
              name: testid.split(".").pop(),
              testid,
              tag: el.tagName,
              text: (el.value || el.innerText || el.textContent || "").slice(0, 120),
            };
          });
        return {
          ok: true,
          fields,
          jsonControls: Array.from(document.querySelectorAll("label, button, span, div, input[role=switch], input[type=checkbox]"))
            .filter(visible)
            .filter((el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || "").includes("JSON模式") || el.getAttribute("role") === "switch")
            .slice(0, 20)
            .map((el) => ({
              tag: el.tagName,
              role: el.getAttribute("role") || "",
              type: el.getAttribute("type") || "",
              checked: Boolean(el.checked),
              text: (el.innerText || el.textContent || el.getAttribute("aria-label") || "").slice(0, 120),
              className: el.className?.toString?.().slice(0, 120) || "",
            })),
          bodyTail: (document.body.innerText || "").slice(-2000),
        };
      })()`);
    }, { page });
  } finally {
    await closeWorkflowPage(page);
  }
}

async function openTestRunPanel(cdp, contextId, evalInCoze) {
  const clickRect = async (rect) => {
    if (!rect) return false;
    const offsetResult = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const frame = Array.from(document.querySelectorAll("iframe"))
          .find((item) => item.src.includes("cloud-coze.bytedance.net") || item.src.includes("sso.bytedance.com"));
        if (!frame) return { x: 0, y: 0 };
        const rect = frame.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      })()`,
    });
    const offset = offsetResult.result?.value || { x: 0, y: 0 };
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
      .map((button) => ({ text: (button.innerText || button.textContent || "").trim(), rect: rectOf(button) }))
      .filter((button) => button.text === "试运行");
    return { ok: (document.body.innerText || "").includes("试运行输入"), buttons, bodyTail: (document.body.innerText || "").slice(-900) };
  })()`);

  let state = await panelState();
  for (let ready = 0; ready < 80 && !state?.buttons?.length && !state?.ok; ready += 1) {
    await delay(500);
    state = await panelState();
  }
  for (let attempt = 0; attempt < 6 && !state?.ok; attempt += 1) {
    const jsClick = await evalInCoze(`(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const buttons = Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .filter((button) => (button.innerText || button.textContent || "").trim() === "试运行");
      const button = buttons[buttons.length - 1];
      if (!button) return { ok: false, reason: "missing button" };
      button.click();
      return { ok: true };
    })()`);
    if (jsClick?.ok) {
      for (let wait = 0; wait < 30; wait += 1) {
        await delay(250);
        state = await panelState();
        if (state?.ok) return state;
      }
    }
    const button = state?.buttons?.[state.buttons.length - 1 - attempt] || state?.buttons?.[state.buttons.length - 1];
    if (button?.rect) await clickRect(button.rect);
    for (let wait = 0; wait < 30; wait += 1) {
      await delay(250);
      state = await panelState();
      if (state?.ok) return state;
    }
  }
  return state;
}

async function scrapeVisible(evalInCoze) {
  return evalInCoze(`(() => ({
    text: (document.body.innerText || "").slice(0, 24000),
    timestamp: new Date().toISOString(),
  }))()`);
}

function resultSignature(text) {
  if (!text) return "";
  const markers = ["judge_json :", "judge_result :"];
  const marker = markers.find((item) => text.lastIndexOf(item) >= 0);
  const index = marker ? text.lastIndexOf(marker) : -1;
  if (index >= 0) {
    const tail = text.slice(index + marker.length);
    const end = tail.search(/\n(?:试运行|预览|可用测试集|测试集)/);
    return (end >= 0 ? tail.slice(0, end) : tail).trim();
  }
  const start = text.lastIndexOf("运行结果");
  if (start < 0) return "";
  return text.slice(start).trim();
}
