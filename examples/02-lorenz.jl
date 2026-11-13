# 02-lorenz.jl — the Lorenz attractor: a plain-Julia RK4 loop, drawn in 3D and as time series.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] session (see 01-signals.jl)
# The integration here is a few lines of Base Julia on purpose; a model you want to run against
# Paperboat's solvers goes through `simulate` (see simulation/state-space.jl).

σ, ρ, β = 10.0, 28.0, 8 / 3                # [Julia] Unicode names, a tuple assignment
dt = 0.01
steps = 4000
lorenz(s) = [σ * (s[2] - s[1]), s[1] * (ρ - s[3]) - s[2], s[1] * s[2] - β * s[3]]   # [Julia]
X = zeros(3, steps)                        # [Julia] a 3 × steps matrix
X[:, 1] = [1.0, 1.0, 1.0]
for k in 2:steps                           # [Julia] the RK4 step
    s = X[:, k - 1]
    k1 = lorenz(s)
    k2 = lorenz(s + dt / 2 * k1)
    k3 = lorenz(s + dt / 2 * k2)
    k4 = lorenz(s + dt * k3)
    X[:, k] = s + dt / 6 * (k1 + 2k2 + 2k3 + k4)
end
t = (0:(steps - 1)) .* dt                  # [Julia]

fig = Figure(; size = (900, 480))          # [SqueroPlot]
ax3 = Axis3(fig[1:2, 1]; title = "Lorenz attractor", azimuth = 0.15π, elevation = 0.12π)   # [SqueroPlot] a 3D axis spanning two rows
lines!(ax3, X[1, :], X[2, :], X[3, :]; color = t, colormap = :plasma, linewidth = 0.8)    # [SqueroPlot] a 3D line coloured by time
scatter!(ax3, [X[1, 1]], [X[2, 1]], [X[3, 1]]; color = :black, markersize = 8)            # [SqueroPlot] the start
ax_x = Axis(fig[1, 2]; ylabel = "x")      # [SqueroPlot]
ax_z = Axis(fig[2, 2]; ylabel = "z", xlabel = "t")
lines!(ax_x, t, X[1, :])                   # [SqueroPlot]
lines!(ax_z, t, X[3, :]; color = :orange)
linkxaxes!(ax_x, ax_z)                     # [SqueroPlot] shared x limits
hidexdecorations!(ax_x; grid = false)      # [SqueroPlot] no x ticks on the upper panel
colsize!(fig.layout, 1, Relative(0.55))    # [SqueroPlot] the 3D view gets 55 % of the width
fig
