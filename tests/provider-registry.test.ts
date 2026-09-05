import assert from "node:assert/strict";
import test from "node:test";
import { getEnabledLiveProvider, providerRegistry } from "../src/providers/registry.js";

test("does not enable a live provider before legal approval and live capability", () => {
  assert.equal(getEnabledLiveProvider(), undefined);
  assert.equal(providerRegistry[0]?.id, "fixture");
});