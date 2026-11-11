import { useMemo, useRef, useState } from "react";
import { Scope, Sparkline } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import type { Variable } from "@paperboat/shared/protocol";
import { chartView, surfaceEntity } from "./chart/surface.ts";
import { demoVariables, sampled, sampled2, times } from "./chart/samples.ts";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";
import type { Solver } from "./sim/stateSpace.ts";

type Tab = "3d" | "2d" | "table";
type Line = { level: "info" | "ok" | "warn"; text: string };

const solver: Solver = "rk45";

export function App() {
  const [tab, setTab] = useState<Tab>("3d");
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [paperboat, setPaperboat] = useState<Variable[]>([]);
  const [shared, setShared] = useState<Set<string>>(() => new Set(["k"]));
  const [url, setUrl] = useState("ws://localhost:8780");
  const [lines, setLines] = useState<Line[]>([
    { level: "info", text: "julia 1.11.5 · kernel 1.11.5-r3 · frontend 0.1.0" },
    { level: "info", text: "paperboat: attach to share scalars; matrices travel to state_space" },
    { level: "ok", text: "3d: Station renderer · mesh A · 4 225 vertices" },
  ]);
  const link = useRef<PaperboatLink | null>(null);
  const say = (text: string, level: Line["level"] = "info") => setLines((l) => [...l, { level, text }]);

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

  const toggle = (name: string) => {
    const next = new Set(shared);
    if (next.has(name)) next.delete(name); else next.add(name);
    setShared(next);
    const msg = setMessage(demoVariables, paperboat, next);
    const sent = link.current?.send(msg) ?? false;
    say(`share ${name} → ${sent ? "variables.set" : "local only (not attached)"}`, sent ? "ok" : "warn");
  };

  const simulate = () => {
    say(
      status === "attached"
        ? `state_space → paperboat · ${solver} · rk4/rk45/cvode from hello.run.solvers`
        : "state_space → attach a backend to run the Paperboat solver",
      status === "attached" ? "ok" : "warn",
    );
  };

  const active = rows.filter((r) => r.shared).length;

  return (
    <div className="app">
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

      <div className="left">
        <section className="panel">
          <div className="head"><b>files</b><span className="sp" /><span className="tag">.jl</span></div>
          <div className="files">
            <div className="file on">surface.jl</div>
            <div className="file">lorenz.jl</div>
            <div className="file">state_space.jl</div>
          </div>
          <div className="foot">3 files · 1 open</div>
        </section>

        <section className="panel grow">
          <div className="head"><b>workspace</b><span className="sp" /><span className="tag">whos</span></div>
          <div className="vars">
            {rows.filter((r) => r.source === "mx").map((v) => (
              <div className={`varc ${v.shared ? "on" : ""}`} key={v.name}>
                <div className="vmeta">
                  <div className="nm">{v.name}</div>
                  <div className="sh">{v.shape} · {v.type}</div>
                </div>
                <div className="glyph">
                  {v.preview ? <Sparkline values={v.preview} width={54} height={28} fill label={`${v.name} preview`} /> : <span className="scalar">{String(v.value ?? "—")}</span>}
                </div>
                <button className={`tie ${v.shared ? "on" : ""}`} disabled={!v.shareable} title={v.shareable ? "Share with Paperboat" : "Matrices travel to a block, not a variable"} onClick={() => toggle(v.name)} />
              </div>
            ))}
          </div>
          <div className="scratch">
            <div className="lbl">scratch</div>
            <div className="box"><span className="prompt">julia&gt;</span><span>A[128, 64] / maximum(A)</span><span className="caret" /></div>
            <div className="preview"><span className="val">0.871</span><span className="tag">Float64</span><span className="k">↵ show</span></div>
          </div>
        </section>
      </div>

      <main className="stage">
        <div className="tabs">
          {(["3d", "2d", "table"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "3d" ? "3d" : t === "2d" ? "2d graph" : "table"}</button>
          ))}
          <span className="sp" />
          <span className="tag">A · 512 × 512 · {"Matrix{Float64}"}</span>
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

      <aside className="panel side">
        <div className="head"><b>shared variables</b><span className="sp" /><span className="tag">{active} shared</span></div>
        <div className="side-body">
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
              <div className="shared-row" key={v.name}>
                <span className="nm">{v.name}</span>
                <span className="shape">{v.shape}</span>
                <span className={`src ${v.source}`}>{v.source === "mx" ? "MX" : "PB"}</span>
                <span className={`state ${v.shared ? "on" : ""}`}>{v.shared ? "shared" : v.shareable ? "off" : "block"}</span>
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
      </aside>

      <section className="console">
        <div className="chead"><span className="on">console</span><span>messages</span><span className="sp" /><span className="tag">julia 1.11.5 · frontend 0.1.0</span></div>
        <div className="lines">
          {lines.slice(-7).map((l, i) => (
            <div key={i} className={l.level}>{l.level === "info" && l.text.startsWith("julia") ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
