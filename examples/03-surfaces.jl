# 03-surfaces.jl — 2D fields & 3D scenes: `surface!`, `wireframe!`, `mesh!`, `heatmap!`, and contours.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] session (see 01-signals.jl)
# SqueroPlot has no `meshgrid` or `peaks`: grids are comprehensions, and the function is yours.

peaks(x, y) = 3 * (1 - x)^2 * exp(-x^2 - (y + 1)^2) -
              10 * (x / 5 - x^3 - y^5) * exp(-x^2 - y^2) -
              exp(-(x + 1)^2 - y^2) / 3     # [Julia] classic test surface
xs = range(-3, 3; length = 60)             # [Julia]
ys = range(-3, 3; length = 60)
Z = [peaks(x, y) for x in xs, y in ys]     # [Julia] Z[i, j] is height at (xs[i], ys[j])
zmin, at = findmin(Z)                      # [Julia] lowest point and its CartesianIndex

fig = Figure(; size = (960, 720))          # [SqueroPlot]
ax1 = Axis3(fig[1, 1:2]; title = "surface + wireframe", zlabel = "height")     # [SqueroPlot]
surface!(ax1, xs, ys, Z; colormap = :viridis)                                  # [SqueroPlot] lit surface
wireframe!(ax1, xs[1:4:end], ys[1:4:end], Z[1:4:end, 1:4:end]; color = (:white, 0.25))  # [SqueroPlot]
scatter!(ax1, [xs[at[1]]], [ys[at[2]]], [zmin]; color = :red, markersize = 10)  # [SqueroPlot] global minimum

ax2 = Axis3(fig[1, 3:4]; title = "3D mesh + base grid", aspect = :equal, azimuth = 0.25π)
V = [1 1 1; 1 -1 -1; -1 1 -1; -1 -1 1.0]   # [Julia] tetrahedron vertices (4 × 3)
F = [1 2 3; 1 2 4; 1 3 4; 2 3 4]           # [Julia] triangle vertex indices (4 × 3)
mesh!(ax2, V, F; color = [0.0, 1.0, 2.0, 3.0], colormap = :plasma)             # [SqueroPlot] shaded vertex-coloured mesh
wireframe!(ax2, range(-1.2, 1.2; length = 7), range(-1.2, 1.2; length = 7), fill(-1.1, 7, 7); color = :gray70)

ax3 = Axis(fig[2, 1]; title = "heatmap", aspect = DataAspect())              # [SqueroPlot]
hm = heatmap!(ax3, xs, ys, Z; colormap = :magma)                             # [SqueroPlot]
Colorbar(fig[2, 2], hm)                                                      # [SqueroPlot] colour bar

ax4 = Axis(fig[2, 3]; title = "contourf + contour", aspect = DataAspect())   # [SqueroPlot]
cf = contourf!(ax4, xs, ys, Z; levels = 12, colormap = :RdBu)                # [SqueroPlot] filled bands
contour!(ax4, xs, ys, Z; levels = 12, color = :black, linewidth = 0.5)       # [SqueroPlot] iso-lines
Colorbar(fig[2, 4], cf; label = "height")                                    # [SqueroPlot]
Label(fig[0, 1:4], "Fields, surfaces & meshes"; fontsize = 20, font = :bold)   # [SqueroPlot] title row (added last)
fig
