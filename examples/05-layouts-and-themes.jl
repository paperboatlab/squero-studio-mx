# 05-layouts-and-themes.jl — Nested `GridLayout`, themes, external `Legend`, `series!`, and `rich` text.
#   [Julia] Base Julia · [SqueroPlot] plotting (see 01-signals.jl)

t = range(0, 12; length = 240)             # [Julia]
ζs = [0.15, 0.35, 0.7, 1.0]                # [Julia] damping ratios
responses = [1 .- exp.(-ζ .* t) .* (cos.(sqrt(max(1 - ζ^2, 1e-6)) .* t) .+
             (ζ / sqrt(max(1 - ζ^2, 1e-6))) .* sin.(sqrt(max(1 - ζ^2, 1e-6)) .* t))
             for ζ in ζs]                  # [Julia] 2nd-order step responses
Y = reduce(vcat, transpose.(responses))    # [Julia] 4 × 240 matrix: one row per series

fig = with_theme(theme_dark()) do          # [SqueroPlot] apply dark theme cleanly inside block
    fig = Figure(; size = (920, 620))
    top = Axis(fig[1, 1:2];
        title = rich("Second-order step response ", subscript("(natural frequency ω₀ = 1)")),
        xlabel = "t [s]", ylabel = "y(t)")
    series!(top, t, Y; color = :viridis, labels = ["ζ = $ζ" for ζ in ζs])   # [SqueroPlot] plot every row of Y
    hlines!(top, [1.0]; color = :gray70, linestyle = :dash)
    text!(top, 6.5, 1.38; text = rich("overshoot scales with ", superscript("−πζ")), color = :gold)

    # External legend block in fig[1, 3] using explicit legend elements.
    elems = [LineElement(; color = :dodgerblue, linewidth = 2),
             MarkerElement(; marker = :circle, color = :crimson, markersize = 10),
             PolyElement(; color = (:seagreen, 0.45), strokecolor = :seagreen, strokewidth = 1.5)]
    Legend(fig[1, 3], elems, ["trajectory", "setpoint", "tolerance band"], "Components")

    # Nested GridLayout in the bottom row.
    sub = GridLayout(fig[2, 1:2])          # [SqueroPlot] a sub-grid inside the main layout
    ax_p = Axis(sub[1, 1]; title = "pole pairs (linesegments!)", xlabel = "Re(s)", ylabel = "Im(s)", aspect = DataAspect())
    re = [-ζ for ζ in ζs[1:3]]
    im = [sqrt(1 - ζ^2) for ζ in ζs[1:3]]
    xs_seg = reduce(vcat, [[0.0, r, 0.0, r] for r in re])
    ys_seg = reduce(vcat, [[0.0, i, 0.0, -i] for i in im])
    linesegments!(ax_p, xs_seg, ys_seg; color = :gray65, linestyle = :dot)    # [SqueroPlot] rays from the origin
    scatter!(ax_p, vcat(re, re), vcat(im, -im); color = :cyan, markersize = 10)
    scatter!(ax_p, [-1.0], [0.0]; color = :gold, marker = :star5, markersize = 13)

    ax_m = Axis(sub[1, 2]; title = "overshoot vs ζ", xlabel = "ζ", ylabel = "peak y")
    peaks = [maximum(row) for row in responses]
    scatterlines!(ax_m, ζs, peaks; color = :orange, marker = :diamond, markersize = 10)
    colsize!(fig.layout, 3, Fixed(170))
    Label(fig[0, 1:3], "Layouts, themes & rich annotations"; fontsize = 20, font = :bold)
    fig
end
fig
