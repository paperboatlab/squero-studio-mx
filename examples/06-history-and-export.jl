# 06-history-and-export.jl — Cells (`#%%`), snapshots, and multi-format export (`save`, `render`, `to_html`).
#   [Julia] Base Julia · [SqueroPlot] plotting (see 01-signals.jl)
# Run cell-by-cell (`Ctrl/Cmd+Enter`) to watch the Figures tab keep every snapshot version,
# or run the whole script to export PNG, SVG, PDF and interactive HTML into a temp folder.

#%% 1. build a figure (first snapshot version)
fig = Figure(; size = (560, 520), title = "Regular polygons & export")   # [SqueroPlot] title shown in Figures history
ax = Axis(fig[1, 1]; title = "Regular polygons", aspect = DataAspect())  # [SqueroPlot]
for (k, n) in zip(5:-1:1, 7:-1:3)          # [Julia] draw outer polygons first so inner ones stay visible
    θ = range(0, 2π; length = n + 1)
    poly!(ax, [(k * cos(a), k * sin(a)) for a in θ[1:end-1]]; strokewidth = 1.5, strokecolor = :black)
end
hidedecorations!(ax)                       # [SqueroPlot]

#%% 2. freeze an immutable snapshot before modifying the live figure
snap = snapshot(fig; formats = (:png, :svg, :pdf))   # [SqueroPlot] captures current state as an immutable Snapshot
hidespines!(ax)                            # [SqueroPlot] mutate the live figure afterwards
scatter!(ax, [0.0], [0.0]; color = :black, markersize = 10)

#%% 3. export both the immutable snapshot and interactive HTML in memory / temp dir
out = mktempdir()                          # [Julia] writable temp directory safe even for read-only examples
save(joinpath(out, "polygons.svg"), fig)   # [SqueroPlot] format inferred from extension
save(joinpath(out, "polygons.png"), fig; px_per_unit = 2)
save(joinpath(out, "before.pdf"), snap)    # [SqueroPlot] exports the pre-mutation Snapshot!
write(joinpath(out, "interactive.html"), to_html(fig; interactive = true))   # [SqueroPlot] zoom/pan HTML

pdf_bytes = render(fig; format = :pdf)     # [SqueroPlot] render in-memory without writing disk
println("rendered ", length(pdf_bytes), " PDF bytes; exported ", join(readdir(out), ", "))
fig
