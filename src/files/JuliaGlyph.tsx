// The Julia dots (julia-logo-graphics): red bottom-left, green top, purple bottom-right.
// Sizes are the official 350-unit geometry scaled to a 16 unit box, so it reads at 13 px.
const DOTS = [
  { cx: 4.04, cy: 11.43, fill: "#CB3C33" },
  { cx: 8, cy: 4.57, fill: "#389826" },
  { cx: 11.96, cy: 11.43, fill: "#9558B2" },
];

export function JuliaGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg className="jl-dots" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {DOTS.map((dot) => (
        <circle key={dot.fill} cx={dot.cx} cy={dot.cy} r={3.43} style={{ fill: dot.fill, stroke: "none" }} />
      ))}
    </svg>
  );
}
