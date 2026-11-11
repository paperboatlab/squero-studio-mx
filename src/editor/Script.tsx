// The script surface. Read-only in the scaffold; the kernel's `eval` and the run ribbon land
// next. The line numbers and token colours are the same ones the editor will keep.
type Line = { no: number; html: string; on?: boolean };

const LINES: Line[] = [
  { no: 1, html: '<span class="tok-c"># surface.jl — a matrix, a selection, a chart</span>' },
  { no: 2, html: 'n = <span class="tok-n">512</span>' },
  { no: 3, html: 'X, Y = <span class="tok-f">meshgrid</span>(<span class="tok-f">range</span>(-<span class="tok-n">3</span>, <span class="tok-n">3</span>, length=n))' },
  { no: 4, html: 'R = <span class="tok-p">@.</span> <span class="tok-f">hypot</span>(X, Y) + <span class="tok-f">eps</span>()' },
  { no: 5, html: 'A = <span class="tok-p">@.</span> <span class="tok-f">sin</span>(R * <span class="tok-n">3.4</span>) / (R * <span class="tok-n">3.4</span>)' },
  { no: 6, html: 'sel = A[A <span class="tok-o">.&gt;</span> <span class="tok-n">0.42</span>]', on: true },
  { no: 7, html: ' ' },
  { no: 8, html: '<span class="tok-f">surf</span>(X, Y, A)' },
  { no: 9, html: '<span class="tok-f">colormap</span>(<span class="tok-p">:viridis</span>)' },
  { no: 10, html: '<span class="tok-f">view</span>(-<span class="tok-n">37.5</span>, <span class="tok-n">30</span>)' },
  { no: 11, html: ' ' },
  { no: 12, html: '<span class="tok-c"># state_space(A, B, C, D) → Paperboat</span>' },
];

export function Script() {
  return (
    <section className="panel editor">
      <div className="head">
        <b>surface.jl</b>
        <span className="tag">Ln 6, Col 14</span>
        <span className="sp" />
        <span className="tag">changed 0</span>
        <button className="key small">Run cell</button>
        <button className="key small">▶</button>
      </div>
      <div className="code">
        {LINES.map((l) => (
          <div className={`ln ${l.on ? "on" : ""}`} key={l.no}>
            <span className="no">{l.no}</span>
            <span className="src" dangerouslySetInnerHTML={{ __html: l.html }} />
          </div>
        ))}
      </div>
      <div className="runstrip">
        <span>run-07</span>
        <span className="track"><span className="f" /><span className="k" /></span>
        <span>2.40 s</span>
        <span>step 120 / 500</span>
        <span style={{ marginLeft: "auto" }}>← → step</span>
      </div>
    </section>
  );
}
