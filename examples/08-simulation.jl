# 08-simulation.jl — State-space analysis in Julia & backend simulation via `SqueroBase.simulate`.
#   [Julia] Base Julia and LinearAlgebra · [SqueroPlot] plotting · [SqueroBase] `simulate` bridge · [Paperboat] solver
#
# MX never integrates a Paperboat model itself: `simulate` sends a `graph.run` request to every
# attached Paperboat backend, whose `control/state_space` block integrates with the chosen solver.
# Start a backend (`paperboat start`) to watch the live run there.

using LinearAlgebra                         # [Julia] eigvals, rank (preloaded by the kernel)

m, c, k = 1.0, 0.6, 4.0                     # [Julia] mass, damping, stiffness
A = [0.0 1.0; -k/m -c/m]                    # [Julia] ẋ = A x + B u
B = [0.0; 1/m;;]                            # [Julia] 2 × 1 input matrix
C = [1.0 0.0]                               # [Julia] y = position
D = [0.0;;]
x0 = [1.0, 0.0]

poles = eigvals(A)                          # [Julia] eigenvalues of A
controllable = rank([B A*B]) == 2           # [Julia] Kalman controllability check
ζ = c / (2 * sqrt(k * m))                   # [Julia] damping ratio
ωn = sqrt(k / m)                            # [Julia] natural frequency

# Analytical free-decay trajectory for comparison, plus the pole map in the complex plane.
t = range(0, 10; length = 300)
ωd = ωn * sqrt(1 - ζ^2)
free_decay = [exp(-ζ * ωn * τ) * (cos(ωd * τ) + (ζ / sqrt(1 - ζ^2)) * sin(ωd * τ)) for τ in t]

fig = Figure(; size = (860, 420), title = "State-space dynamics")   # [SqueroPlot]
ax1 = Axis(fig[1, 1]; title = "poles (ζ = $(round(ζ; digits = 2)))", xlabel = "Re", ylabel = "Im", aspect = DataAspect())
θ = range(0, 2π; length = 120)
lines!(ax1, ωn .* cos.(θ), ωn .* sin.(θ); color = :gray, linestyle = :dot, label = "|s| = ωₙ")
vlines!(ax1, [0.0]; color = :black, linewidth = 0.6)
scatter!(ax1, real.(poles), imag.(poles); marker = :xcross, markersize = 16, color = :crimson, label = "poles")
axislegend(ax1; position = :lt)

ax2 = Axis(fig[1, 2]; title = "initial-condition decay (x₀ = [1, 0])", xlabel = "time [s]", ylabel = "position y(t)")
lines!(ax2, t, free_decay; color = :steelblue, linewidth = 2, label = "y(t)")
hlines!(ax2, [0.0]; color = :gray60, linewidth = 0.7)
axislegend(ax2; position = :rt)

# Queue the `graph.run` message for any attached Paperboat backend (rk45 solver for 10 s).
matrix(M) = join([join(M[i, :], " ") for i in axes(M, 1)], "; ")   # [Julia] "a b; c d" block text format
graph = (
    nodes = [(id = "plant", type = "control/state_space",           # [Paperboat] state-space block
              params = (A = matrix(A), B = matrix(B), C = matrix(C), D = matrix(D), domain = "s"))],
    edges = [],
)
run = simulate(graph; duration = 10, dt = 0.01, solver = :rk45, variables = (x0 = x0,))   # [SqueroBase] → graph.run
fig
