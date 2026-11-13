# 06-export.jl — write a figure to files from a script, and keep a snapshot in a variable.
#   [Julia] Base Julia · [SqueroPlot] plotting (see 01-signals.jl)
# The Figures tab exports any history entry too (PNG, SVG, PDF, EPS, HTML; several → a zip).

fig = Figure(; size = (520, 520))          # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "Regular polygons", aspect = DataAspect())   # [SqueroPlot]
for (k, n) in zip(5:-1:1, 7:-1:3)          # [Julia] largest first, so the small ones stay on top
    θ = range(0, 2π; length = n + 1)
    poly!(ax, [(k * cos(a), k * sin(a)) for a in θ[1:end-1]]; strokewidth = 1.5, strokecolor = :black)  # [SqueroPlot] palette fills
end
hidedecorations!(ax)                       # [SqueroPlot]

mkpath("figures")                          # [Julia] a folder in the workspace
save("figures/polygons.svg", fig)          # [SqueroPlot] vector SVG
save("figures/polygons.pdf", fig)          # [SqueroPlot] vector PDF
save("figures/polygons.png", fig; px_per_unit = 3)   # [SqueroPlot] a 1560 × 1560 PNG
save("figures/polygons.html", fig)         # [SqueroPlot] a standalone page with the SVG inline

snap = snapshot(fig; formats = (:png, :svg, :pdf))   # [SqueroPlot] an immutable copy
hidespines!(ax)                            # [SqueroPlot] change the live figure…
save("figures/before.pdf", snap)           # [SqueroPlot] …the snapshot still exports the old drawing
readdir("figures")                         # [Julia]
