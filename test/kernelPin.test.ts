import { test } from "node:test";
import assert from "node:assert/strict";
import * as client from "../src/version.ts";
import * as server from "../server/kernel.mjs";

test("the launcher and the app pin the same kernel image, by digest", () => {
  assert.equal(server.KERNEL_REGISTRY, client.KERNEL_REGISTRY);
  assert.equal(server.KERNEL_TAG, client.KERNEL_VERSION);
  assert.equal(server.KERNEL_DIGEST, client.KERNEL_DIGEST);
  assert.match(client.KERNEL_DIGEST, /^sha256:[0-9a-f]{64}$/);
  assert.equal(server.KERNEL_PINNED_IMAGE, `${client.KERNEL_REGISTRY}@${client.KERNEL_DIGEST}`);
});

test("an image pulled by its index is known by the pin, whichever repo digest comes first", () => {
  const repo = server.KERNEL_REGISTRY;
  const other = "sha256:" + "7".repeat(64);
  assert.equal(server.pickDigest([`${repo}@${other}`, `${repo}@${client.KERNEL_DIGEST}`]), client.KERNEL_DIGEST);
  assert.equal(server.pickDigest([`${repo}@${other}`]), other, "not the pin: say which it is");
  assert.equal(server.pickDigest([], "sha256:abc"), "sha256:abc", "a local build: its id");
});

test("an image reads as its name and tag with a short digest, never the whole digest", () => {
  const pinned = `${client.KERNEL_REGISTRY}@${client.KERNEL_DIGEST}`;
  assert.equal(client.formatKernelImage(pinned, client.KERNEL_DIGEST), `${client.KERNEL_REGISTRY}:${client.KERNEL_VERSION} (sha256:${client.KERNEL_DIGEST.slice(7, 19)})`);
  const other = "sha256:" + "7".repeat(64);
  assert.equal(client.formatKernelImage(`${client.KERNEL_REGISTRY}@${other}`), `${client.KERNEL_REGISTRY} (sha256:777777777777)`);
  assert.equal(client.formatKernelImage("squero-julia-kernel:1.11.6-r3", "sha256:abcdef0123456789"), "squero-julia-kernel:1.11.6-r3 (sha256:abcdef012345)");
});
