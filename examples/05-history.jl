# 05-history.jl — how the Figures tab keeps history. Run it cell by cell (Ctrl/Cmd+Enter).
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] session (see 01-signals.jl)
#
# After each run the kernel snapshots every figure whose drawing changed (PNG, SVG, PDF, EPS) and
# the app adds one history entry per new version. Old entries never change and still export.

#%% 1. a first version
x = range(0, 4π; length = 200)             # [Julia]
fig = Figure(; title = "Damped waves")     # [SqueroPlot] the title the history list shows
ax = Axis(fig[1, 1]; xlabel = "t")         # [SqueroPlot]
lines!(ax, x, exp.(-x ./ 6) .* sin.(x); label = "ζ = 0.17")   # [SqueroPlot]

#%% 2. run this cell twice: the first run adds a version, the second changes nothing
damping = 3                                # [Julia]
lines!(ax, x, exp.(-x ./ damping) .* sin.(x); label = "ζ = 0.33")   # [SqueroPlot]
axislegend(ax)

#%% 3. a second figure from the same script, then clear() and clc()
fig2 = Figure()                            # [SqueroPlot]
scatter(fig2[1, 1], randn(200), randn(200); color = :purple, markersize = 5)   # [SqueroPlot] makes its own Axis; randn is [Julia]
clear()                                    # [SqueroBase] resets the session — the history stays
clc()                                      # [SqueroBase] clears the console — the history stays

#%% 4. the session is new, but every entry above still shows and exports
y = 1 + 1                                  # [Julia]
