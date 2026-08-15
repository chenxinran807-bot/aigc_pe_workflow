import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIT_SOURCE_CATALOG } from "../src/audit-source-catalog.mjs";
import { readAuditSources } from "../src/lark-audit-reader.mjs";

const output = resolve(process.argv[2] || "work/audit-dataset.json");
const result = await readAuditSources(AUDIT_SOURCE_CATALOG);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  output,
  cases: result.cases.length,
  sources: result.sources,
}, null, 2));
