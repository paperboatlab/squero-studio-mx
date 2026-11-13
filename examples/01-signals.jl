# 01-signals.jl — a sampled signal: the continuous wave, its samples, and a held output.
#
# Tags say where each call comes from:
#   [Julia]      Base Julia or a standard library (LinearAlgebra, Statistics)
#   [SqueroPlot] the plotting library (Figure, Axis, lines!, stem!, …)
#   [SqueroBase] the session layer (clear, clc, optimize, simulate)
# The kernel loads SqueroPlot and SqueroBase for you; a standalone script adds `using SqueroPlot`.

fs = 8.0                                   # [Julia] sample rate, Hz
t = range(0, 1; length = 400)              # [Julia] a fine time grid
n = 0:Int(fs)                              # [Julia] sample indices
ts = n ./ fs                               # [Julia] sample times
signal(t) = sin(2π * 1.5 * t) + 0.4 * sin(2π * 4 * t)   # [Julia] an ordinary function

fig = Figure(; size = (720, 420))          # [SqueroPlot] a 720 × 420 figure
ax = Axis(fig[1, 1];                       # [SqueroPlot] a 2D axis in cell (1, 1)
    title = "Sampling at $(Int(fs)) Hz",   # [Julia] string interpolation
    xlabel = "time [s]", ylabel = "amplitude")
lines!(ax, t, signal.(t); label = "x(t)", color = :gray, linewidth = 2)       # [SqueroPlot] a line; signal.(t) is [Julia] broadcasting
stem!(ax, ts, signal.(ts); label = "x[n]")                                    # [SqueroPlot] stems (Makie's recipe)
stairs!(ax, ts, signal.(ts); step = :post, label = "zero-order hold", linestyle = :dash)  # [SqueroPlot] a step function
hlines!(ax, [0.0]; color = :black, linewidth = 0.5)                           # [SqueroPlot] a reference line
axislegend(ax; position = :rt)             # [SqueroPlot] a legend inside the axis

fig                                        # the kernel captures every Figure the script reaches
