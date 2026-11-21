import { test } from "node:test";
import assert from "node:assert/strict";
import { kernelUnavailableMessage, parseJuliaVersion, validateKernelHello } from "../src/kernel/probe.ts";

test("parseJuliaVersion extracts major, minor, patch and rejects invalid strings", () => {
  assert.deepEqual(parseJuliaVersion("1.11.6"), { major: 1, minor: 11, patch: 6 });
  assert.deepEqual(parseJuliaVersion("v1.11.7-rc1"), { major: 1, minor: 11, patch: 7 });
  assert.equal(parseJuliaVersion("not-a-version"), null);
  assert.equal(parseJuliaVersion(""), null);
});

test("validateKernelHello accepts same major/minor with different patch", () => {
  const res = validateKernelHello(
    { op: "hello", julia: "1.11.7", image: "squero-julia-kernel:1.11.6-r3", protocol: 0, packages: [] },
    "1.11.6",
    0,
  );
  assert.equal(res.ok, true);
});

test("validateKernelHello rejects different Julia minor or major versions", () => {
  const minor = validateKernelHello(
    { op: "hello", julia: "1.12.0", image: "native", protocol: 0, packages: [] },
    "1.11.6",
    0,
  );
  assert.equal(minor.ok, false);
  if (!minor.ok) {
    assert.equal(minor.mismatch.reason, "julia-mismatch");
    assert.match(minor.mismatch.message, /1\.11/);
    assert.match(minor.mismatch.message, /1\.12\.0/);
  }

  const major = validateKernelHello(
    { op: "hello", julia: "2.0.0", image: "native", protocol: 0, packages: [] },
    "1.11.6",
    0,
  );
  assert.equal(major.ok, false);
  if (!major.ok) assert.equal(major.mismatch.reason, "julia-mismatch");
});

test("validateKernelHello rejects protocol mismatch and malformed hello", () => {
  const proto = validateKernelHello(
    { op: "hello", julia: "1.11.6", image: "native", protocol: 2, packages: [] },
    "1.11.6",
    0,
  );
  assert.equal(proto.ok, false);
  if (!proto.ok) {
    assert.equal(proto.mismatch.reason, "protocol-mismatch");
    assert.match(proto.mismatch.message, /squero-kernel\/2/);
  }

  const malformed = validateKernelHello({ op: "eval", julia: "1.11.6", protocol: 0 }, "1.11.6", 0);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.mismatch.reason, "malformed");
});

test("an unavailable kernel says why instead of blaming a missing Julia", () => {
  assert.match(kernelUnavailableMessage("kernel: timed out"), /downloading/);
  assert.match(kernelUnavailableMessage("kernel: closed"), /podman info/);
  assert.match(kernelUnavailableMessage("No Julia runtime found."), /No Julia runtime found/);
});
