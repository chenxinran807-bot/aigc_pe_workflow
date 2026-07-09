# AIGC PE Workflow

AI try-on prompt optimization workbench for badcase review, prompt/VLM iteration, Coze reruns, and evaluation tracking.

## What It Does

- Import CSV, TSV, Excel, or Feishu-exported evaluation tables.
- Normalize changing table schemas into stable case fields.
- Review user image, outfit image, original generated image, prompt, user VLM, and outfit VLM side by side.
- Cluster badcases by issue type, attribution, PM technical diagnosis, and technical reason.
- Record investigation notes and PE prompt/VLM changes.
- Apply prompt and VLM changes to an opened Coze workflow through Chrome DevTools Protocol.
- Batch rerun selected cases and persist each run result.
- Track overall evaluation rounds, pass rate, perfect rate, and dimension-level issue distribution.

## Local Start

```bash
npm install
npm run dev
```

The default dev command starts the service on `127.0.0.1:5246`.

For LAN access:

```bash
HOST=0.0.0.0 PORT=5241 node server.mjs
```

## Important Notes

- The app requires the Node backend. Opening only `public/index.html` will not support uploads, saved records, Coze automation, or exports.
- Excel import depends on Python `openpyxl`. CSV and TSV do not need Python.
- Coze automation requires an already logged-in Chrome instance with remote debugging enabled. See `DEPLOY.md` for deployment notes.

## Project Structure

- `public/`: frontend workbench.
- `server.mjs`: Node HTTP server and API routes.
- `src/`: table parsing, normalization, persistence, judging, Coze automation, and rerun scheduling.
- `tests/`: Node test coverage for core data and workflow behavior.
