import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

// Epic #312: MX is an ecosystem client, never a generator. It must not grow a
// descriptor.toml, backend.toml or domain/ folder.
test("no generator descriptors in the MX app", () => {
  const root = new URL("../", import.meta.url);
  for (const path of ["descriptor.toml", "backend.toml", "src/domain"]) {
    assert.equal(existsSync(new URL(path, root)), false, `${path} belongs to a generator, not MX`);
  }
});
