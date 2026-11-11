import { useEffect, useMemo, useRef, useState } from "react";
import { Scope, Sparkline } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import type { Variable } from "@paperboat/shared/protocol";
import { chartView, surfaceEntity } from "./chart/surface.ts";
import { demoVariables, sampled, sampled2, times } from "./chart/samples.ts";
import { Script } from "./editor/Script.tsx";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";
import type { Solver } from "./sim/stateSpace.ts";

type Tab = "3d" | "2d" | "table";
type RightTab = "workspace" | "shared";
type Line = { level: "info" | "ok" | "warn"; text: string; cmd?: boolean };

const solver: Solver = "rk45";

const INITIAL_FILES: Record<string, string> = {
  "surface.jl": `# surface.jl — a matrix, a selection, a chart
n = 512
X, Y = meshgrid(range(-3, 3, length=n))
R = @. hypot(X, Y) + eps()
A = @. sin(R * 3.4) / (R * 3.4)
sel = A[A .> 0.42]

surf(X, Y, A)
colormap(:viridis)
view(-37.5, 30)

# state_space(A, B, C, D) → Paperboat
`,
  "lorenz.jl": `# lorenz.jl — scaffold
# the kernel opens this file and its workspace
`,
  "state_space.jl": `# state_space.jl — A, B, C, D → Paperboat
# A, B, C, D and x0 are handed to a state_space block.
`,
  "export.jl": `# export.jl — scaffold
savefig("surface.png")
writematrix(A, "data/run-07.csv")
`,
};

export function App() {
  const [tab, setTab] = useState<Tab>("3d");
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_FILES);
  const [selectedFile, setSelectedFile] = useState("surface.jl");
  const [selectedVar, setSelectedVar] = useState("A");
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [paperboat, setPaperboat] = useState<Variable[]>([]);
  const [shared, setShared] = useState<Set<string>>(() => new Set(["k"]));
  const [url, setUrl] = useState("ws://localhost:8780");
  const [lines, setLines] = useState<Line[]>([
    { level: "info", text: "julia 1.11.5 · kernel 1.11.5-r3 · frontend 0.1.0" },
    { level: "info", text: "paperboat: attach to share scalars; matrices travel to state_space" },
    { level: "ok", text: "3d: Station renderer · mesh A · 4 225 vertices" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);
  const link = useRef<PaperboatLink | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const say = (text: string, level: Line["level"] = "info", cmd = false) => setLines((l) => [...l, { level, text, cmd }]);
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "nearest" }); }, [lines]);

  const entities = useMemo(() => ({ surface: surfaceEntity(64) }), []);
  const rows = useMemo(() => mergeShared(demoVariables, paperboat, shared), [paperboat, shared]);
  const channels = useMemo(
    () => [
      { id: "y", label: "y", unit: "–", buf: { times, values: sampled } },
      { id: "y2", label: "y₂", unit: "–", buf: { times, values: sampled2 } },
    ],
    [],
  );

  const attach = () => {
    const l = new PaperboatLink();
    l.onStatus = (s, detail) => {
      setStatus(s);
      if (s === "attached") say(`paperboat: attached to ${url}`, "ok");
      if (s === "failed") say(`paperboat: ${detail ?? "attach failed"}`, "warn");
      if (s === "idle") say("paperboat: detached");
    };
    l.onVariables = (vars) => {
      setPaperboat(vars);
      say(`paperboat: ${vars.length} variables loaded`);
    };
    link.current = l;
    l.connect(url);
  };

  const share = (name: string, on: boolean) => {
    const next = new Set(shared);
    if (on) next.add(name); else next.delete(name);
    setShared(next);
    const sent = link.current?.send(setMessage(demoVariables, paperboat, next)) ?? false;
    say(`${on ? "share" : "unshare"} ${name} → ${sent ? "variables.set" : "local only (not attached)"}`, sent ? "ok" : "warn");
  };
  const toggle = (name: string) => share(name, !shared.has(name));

  const simulate = () => {
    say(
      status === "attached"
        ? `state_space → paperboat · ${solver} · rk4/rk45/cvode from hello.run.solvers`
        : "state_space → attach a backend to run the Paperboat solver",
      status === "attached" ? "ok" : "warn",
    );
  };

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    say(cmd, "info", true);
    const [head, ...rest] = cmd.split(/\s+/);
    if (head === "clear" || head === "clc") { setLines([]); return; }
    if (head === "help") {
      say("commands: help · whos · clear · attach · detach · share <name> · unshare <name> · simulate · version");
      say("variables: type a name (A, k) to inspect it");
      say("anything else is queued for the Julia kernel once squero-kernel/0 is attached");
      return;
    }
    if (head === "whos") {
      for (const r of rows) say(`${r.name.padEnd(6)} ${r.shape.padEnd(10)} ${r.type}${r.shared ? "  · shared" : ""}`);
      return;
    }
    if (head === "attach") { attach(); return; }
    if (head === "detach") { link.current?.close(); setStatus("idle"); say("paperboat: detached", "warn"); return; }
    if (head === "share") { if (rest[0]) share(rest[0], true); else say("usage: share k", "warn"); return; }
    if (head === "unshare") { if (rest[0]) share(rest[0], false); else say("usage: unshare k", "warn"); return; }
    if (head === "simulate" || head === "run") { simulate(); return; }
    if (head === "version") { say("julia 1.11.5 · frontend 0.1.0 · kernel 1.11.5-r3"); return; }
    const v = rows.find((r) => r.name === head);
    if (v) { say(`${v.name} = ${v.shape} ${v.type}${v.value !== undefined ? ` · ${Array.isArray(v.value) ? v.value.join(", ") : v.value}` : ""}`); return; }
    say(`kernel not attached · "${cmd}" queued for squero-kernel/0`, "warn");
  };

  const submit = () => {
    const cmd = input;
    if (!cmd.trim()) return;
    setHistory((h) => [...h, cmd]);
    setHistAt(-1);
    setInput("");
    run(cmd);
  };

  const recall = (delta: 1 | -1) => {
    if (history.length === 0) return;
    const next = histAt < 0 ? (delta < 0 ? history.length - 1 : -1) : Math.max(0, Math.min(history.length - 1, histAt + delta));
    if (next < 0) { setInput(""); setHistAt(-1); return; }
    setHistAt(next);
    setInput(history[next]);
  };

  const pickVar = (name: string) => {
    setSelectedVar(name);
    if (name === "A") setTab("3d");
    else if (name === "x" || name === "t") setTab("2d");
  };

  const picked = rows.find((r) => r.name === selectedVar) ?? rows[0];
  const active = rows.filter((r) => r.shared).length;

  return (
    <div className="app split">
      <header className="topbar">
        <div className="brand">squero <span className="studio">studio</span><span className="wave"><i /><i /><i /><i /><i /></span><span className="badge">MX</span></div>
        <div className="proj"><span className="dot" />surface.jl</div>
        <div className={`status ${status}`}><span className="pip" />{status === "attached" ? "paperboat · attached" : "julia · ready"}</div>
        <div className="keys">
          <button className="key run" onClick={simulate}>▶ Simulate</button>
          <button className="key">Console <span className="tag">{lines.length}</span></button>
          <button className="key small">☾</button>
        </div>
      </header>

      <aside className="panel files">
        <div className="head"><b>files</b><span className="sp" /><span className="tag">.jl</span></div>
        {Object.keys(files).map((f) => (
          <button key={f} className={`file ${selectedFile === f ? "on" : ""}`} onClick={() => setSelectedFile(f)}>{f}</button>
        ))}
        <div className="foot">{Object.keys(files).length} files · 1 open</div>
      </aside>

      <Script
        file={selectedFile}
        code={files[selectedFile]}
        onChange={(code) => setFiles((prev) => ({ ...prev, [selectedFile]: code }))}
      />

      <main className="stage">
        <div className="tabs">
          {(["3d", "2d", "table"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "3d" ? "3d" : t === "2d" ? "2d graph" : "table"}</button>
          ))}
          <span className="sp" />
          <span className="tag">{picked.name} · {picked.shape} · {picked.type}</span>
        </div>

        <div className="stage-body">
          {tab === "3d" && (
            <>
              <div className="scene-wrap"><SceneView entities={entities} view={chartView} grid={false} /></div>
              <div className="overlay">
                <div className="chip"><span className="sig" />A · surface</div>
                <div className="chip">Station renderer · same SceneView</div>
              </div>
            </>
          )}
          {tab === "2d" && (
            <div className="scope-wrap">
              <Scope name="y(t)" channels={channels} version={1} live={false} settings={{ window: 5, grid: true }} />
            </div>
          )}
          {tab === "table" && (
            <div className="table-wrap">
              <div className="stats">
                <div><b>−0.184</b><span>min</span></div>
                <div><b>1.000</b><span>max</span></div>
                <div><b>0.227</b><span>mean</span></div>
                <div><b>0.201</b><span>std</span></div>
              </div>
              <div className="matrix">
                {Array.from({ length: 48 }, (_, i) => (
                  <span key={i} style={{ opacity: 0.35 + ((Math.sin(i * 1.7) + 1) / 2) * 0.65 }}>{(Math.sin(i * 0.7) * 0.4 + 0.4).toFixed(3)}</span>
                ))}
              </div>
              <p className="hint">The matrix lens (heatmap, profiles, histogram, cell edit) is pb#312 work; this scaffold proves the shared renderer and entries.</p>
            </div>
          )}
        </div>
      </main>

      <aside className="panel rightpane">
        <div className="head">
          <div className="rtabs">
            <button className={rightTab === "workspace" ? "on" : ""} onClick={() => setRightTab("workspace")}>workspace</button>
            <button className={rightTab === "shared" ? "on" : ""} onClick={() => setRightTab("shared")}>shared</button>
          </div>
          <span className="sp" />
          <span className="tag">{active} shared</span>
        </div>

        {rightTab === "workspace" ? (
          <div className="tabbody">
            <div className="vars">
              {rows.filter((r) => r.source === "mx").map((v) => (
                <div
                  className={`varc ${selectedVar === v.name ? "on" : ""}`}
                  key={v.name}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedVar === v.name}
                  onClick={() => pickVar(v.name)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickVar(v.name); } }}
                >
                  <div className="vmeta">
                    <div className="nm">{v.name}</div>
                    <div className="sh">{v.shape} · {v.type}</div>
                  </div>
                  <div className="glyph">
                    {v.preview ? <Sparkline values={v.preview} width={50} height={26} fill label={`${v.name} preview`} /> : <span className="scalar">{String(v.value ?? "—")}</span>}
                  </div>
                  <button
                    className={`tie ${v.shared ? "on" : ""}`}
                    disabled={!v.shareable}
                    title={v.shareable ? "Share with Paperboat" : "Matrices travel to a block, not a variable"}
                    onClick={(e) => { e.stopPropagation(); toggle(v.name); }}
                  />
                </div>
              ))}
            </div>
            <div className="scratch">
              <div className="lbl">scratch</div>
              <div className="box"><span className="prompt">julia&gt;</span><span>A[128, 64] / maximum(A)</span><span className="caret" /></div>
              <div className="preview"><span className="val">0.871</span><span className="tag">Float64</span><span className="k">↵ show</span></div>
            </div>
          </div>
        ) : (
          <div className="tabbody">
            <div className="lbl">paperboat</div>
            <div className="attach">
              <input value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="key small" onClick={attach}>{status === "attached" ? "Reattach" : "Attach"}</button>
            </div>
            <div className={`linkrow ${status}`}><span className="pip" />{status === "attached" ? "variables.load received" : status === "connecting" ? "connecting…" : "not attached"}</div>

            <div className="rule" />
            <div className="lbl">workspace → project</div>
            <div className="shared-list">
              {rows.map((v) => (
                <div className="shared-row" key={v.name} role="button" tabIndex={0} onClick={() => pickVar(v.name)}>
                  <span className="nm">{v.name}</span>
                  <span className="shape">{v.shape}</span>
                  <span className={`src ${v.source}`}>{v.source === "mx" ? "MX" : "PB"}</span>
                  <span className={`state ${v.shared ? "on" : ""}`}>{v.shared ? "shared" : v.source === "paperboat" ? "project" : v.shareable ? "off" : "block"}</span>
                </div>
              ))}
            </div>
            <p className="hint">Scalars share by name (<span className="mono">k</span> → Paperboat <span className="mono">k</span>). Matrices and vectors are not project variables: they go to <span className="mono">state_space</span>/matrix blocks. If MX is not running, Paperboat runs unchanged.</p>

            <div className="rule" />
            <div className="lbl">simulation</div>
            <div className="simrow"><span className="mono">solver</span><b>{solver}</b><span className="tag">hello.run.solvers</span></div>
            <div className="simrow"><span className="mono">state_space</span><b>A B C D · x0</b><span className="tag">Paperboat</span></div>
            <button className="key" onClick={simulate}>Simulate on Paperboat</button>
            <p className="hint">The kernel never integrates. Paperboat's <span className="mono">solve::Solver</span> advances the state; MX replays the run.</p>
          </div>
        )}
      </aside>

      <section className="console">
        <div className="chead"><span className="on">console</span><span>messages</span><span className="sp" /><span className="tag">julia 1.11.5 · frontend 0.1.0</span></div>
        <div className="lines">
          {lines.map((l, i) => (
            <div key={i} className={l.level}>{l.cmd || (l.level === "info" && l.text.startsWith("julia")) ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
          <div ref={consoleEnd} />
        </div>
        <form className="cin" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <span className="prompt">julia&gt;</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
            }}
            placeholder="type help"
            autoComplete="off"
            spellCheck={false}
            aria-label="console command"
          />
        </form>
      </section>
    </div>
  );
}
