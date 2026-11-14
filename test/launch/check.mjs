// A running squero-mx, as `paperboat start squero-studio-mx` leaves it: the page is served, and the
// kernel bridge answers hello and evaluates a matrix product. CI's launch job runs it.
//   node test/launch/check.mjs [port]      (59202 by default)
import WebSocket from "ws";

const port = Number(process.argv[2] ?? 59202);
const fail = (why) => { console.error(`FAIL ${why}`); process.exit(1); };
setTimeout(() => fail("timed out"), 300000).unref();

const page = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text()).catch((e) => fail(`no page: ${e.message}`));
if (!page.includes('id="root"')) fail("the page is not the app");
console.log("page served");

const ws = new WebSocket(`ws://127.0.0.1:${port}/__mx/kernel`);
const replies = [];
await new Promise((resolve, reject) => {
  ws.on("open", () => ws.send(JSON.stringify({ op: "hello" })));
  ws.on("message", (data, binary) => {
    if (binary) return;
    replies.push(JSON.parse(data.toString()));
    if (replies.length === 1) ws.send(JSON.stringify({ op: "eval", id: 1, code: "A = [1 2; 3 4]; A * A" }));
    else resolve();
  });
  ws.on("close", (code, reason) => reject(new Error(`kernel closed ${code} ${reason}`)));
  ws.on("error", reject);
}).catch((e) => fail(e.message));
ws.close();

const [hello, product] = replies;
if (!hello?.ok) fail(`hello: ${JSON.stringify(hello)}`);
console.log(`kernel: julia ${hello.julia}`);
const shown = String(product?.text ?? "");
if (!product?.ok || !/7\s+10/.test(shown) || !/15\s+22/.test(shown)) fail(`A * A: ${JSON.stringify(product)}`);
console.log("A * A evaluated");
process.exit(0);
