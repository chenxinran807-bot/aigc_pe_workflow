import test from "node:test";
import assert from "node:assert/strict";

import { splitDatasetByGroup } from "../src/audit-split.mjs";

test("keeps user and outfit groups in exactly one frozen partition", () => {
  const cases = Array.from({ length: 30 }, (_, index) => ({
    caseId: `c${index}`,
    groupId: `g${Math.floor(index / 2)}`,
    dimensions: { face: { issues: index % 3 ? [] : ["x"] } },
  }));
  const split = splitDatasetByGroup(cases, { seed: "fixed" });
  const seen = new Map();
  for (const [partition, items] of Object.entries(split.partitions)) {
    for (const item of items) {
      assert.equal(seen.has(item.groupId) ? seen.get(item.groupId) : partition, partition);
      seen.set(item.groupId, partition);
    }
  }
  assert.equal(Object.values(split.partitions).flat().length, cases.length);
  assert.deepEqual(
    splitDatasetByGroup(cases, { seed: "fixed" }).partitions,
    split.partitions,
  );
});
