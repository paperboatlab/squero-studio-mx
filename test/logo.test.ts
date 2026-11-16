import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("favicon: public/favicon.svg exists and index.html links to it", () => {
  const faviconPath = path.resolve(import.meta.dirname, "../public/favicon.svg");
  assert.ok(fs.existsSync(faviconPath), "public/favicon.svg exists");

  const svgContent = fs.readFileSync(faviconPath, "utf-8");
  assert.ok(svgContent.includes("<svg"), "favicon is an SVG file");
  assert.ok(svgContent.includes('rx="13"'), "favicon tile uses 1m radius (13px)");
  assert.ok(svgContent.includes("path"), "favicon contains vector paths for [mx] code");

  const indexPath = path.resolve(import.meta.dirname, "../index.html");
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  assert.ok(indexContent.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg"'), "index.html links to favicon.svg");
  assert.ok(indexContent.includes("<title>Squero Studio</title>"), "index.html uses clean fallback title without badge text");
});
