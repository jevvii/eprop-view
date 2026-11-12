import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_WORKSPACE_FILTERS,
  filterSchema,
  filterSearch,
  parseFilterSearch,
} from "./workspace-filters";
import { scoreToRiskLevel } from "./damage-score";
test("shared filters preserve every dimension in a URL and retain unrelated state", () => {
  const value = filterSchema.parse({
    ...EMPTY_WORKSPACE_FILTERS,
    q: "Column A & roof",
    risk: "critical",
    severity: "high",
    damage: "crack",
    crack: "wide",
    verification: "verified",
    building: "11111111-1111-4111-8111-111111111111",
    from: "2026-11-01",
    to: "2026-11-12",
  });
  const search = filterSearch(value, "inspectionId=saved-entry");
  assert.deepEqual(parseFilterSearch(search), value);
  assert.equal(new URLSearchParams(search).get("inspectionId"), "saved-entry");
  assert.equal(scoreToRiskLevel(8.5), value.risk);
});
test("invalid filter enum, dates and foreign ids fail at the server boundary", () => {
  for (const input of [
    { damage: "execute" },
    { building: "not-an-id" },
    { from: "2026-02-30" },
    { from: "2026-12-01", to: "2026-11-01" },
  ])
    assert.equal(filterSchema.safeParse(input).success, false);
});
