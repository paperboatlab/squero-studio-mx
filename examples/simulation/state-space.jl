# state-space.jl — a mass–spring–damper as A, B, C, D: analysed in Julia, simulated by Paperboat.
#   [Julia] Base Julia and LinearAlgebra · [SqueroPlot] plotting · [SqueroBase] session and bridges
#   [Paperboat] what runs in a Paperboat backend (the block and its solver), not in Julia
#
# MX never integrates a model itself: `simulate` sends a `graph.run` to every attached Paperboat
# backend, whose `control/state_space` block integrates with the run's solver. Start a backend
# (`paperboat start`) to see the run there.

using LinearAlgebra                         # [Julia] eigvals, rank (already loaded by the kernel)

m, c, k = 1.0, 0.6, 4.0                     # [Julia] mass, damping, stiffness
A = [0.0 1.0; -k/m -c/m]                    # [Julia] ẋ = A x + B u
B = [0.0; 1/m;;]                            # [Julia] a 2 × 1 matrix
C = [1.0 0.0]                               # [Julia] y = position
D = [0.0;;]
x0 = [1.0, 0.0]

poles = eigvals(A)                          # [Julia] LinearAlgebra
controllable = rank([B A*B]) == 2           # [Julia]
ζ = c / (2 * sqrt(k * m))                   # [Julia] damping ratio
ωn = sqrt(k / m)

# The poles in the complex plane, with the natural-frequency circle.
fig = Figure(; size = (520, 460))           # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "poles (ζ = $(round(ζ; digits = 2)))", xlabel = "Re", ylabel = "Im", aspect = DataAspect())
θ = range(0, 2π; length = 120)              # [Julia]
lines!(ax, ωn .* cos.(θ), ωn .* sin.(θ); color = :gray, linestyle = :dot, label = "|s| = ωₙ")   # [SqueroPlot]
vlines!(ax, [0.0]; color = :black, linewidth = 0.6)                                            # [SqueroPlot]
scatter!(ax, real.(poles), imag.(poles); marker = :xcross, markersize = 16, color = :red, label = "poles")  # [SqueroPlot]
axislegend(ax; position = :lt)

# The run: one state-space block; Paperboat integrates it (rk45) for 10 s.
matrix(M) = join([join(M[i, :], " ") for i in axes(M, 1)], "; ")   # [Julia] "a b; c d", the block's text form
graph = (
    nodes = [(id = "plant", type = "control/state_space",                      # [Paperboat] the block
              params = (A = matrix(A), B = matrix(B), C = matrix(C), D = matrix(D), domain = "s"))],
    edges = [],
)
run = simulate(graph; duration = 10, dt = 0.01, solver = :rk45, variables = (x0 = x0,))   # [SqueroBase] → graph.run
fig
