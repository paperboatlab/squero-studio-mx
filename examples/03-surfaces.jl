# 03-surfaces.jl — one height field four ways: surface, wireframe, heatmap and filled contours.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] session (see 01-signals.jl)
# SqueroPlot has no `meshgrid` or `peaks`: grids are a comprehension, and the function is yours.

peaks(x, y) = 3 * (1 - x)^2 * exp(-x^2 - (y + 1)^2) -
              10 * (x / 5 - x^3 - y^5) * exp(-x^2 - y^2) -
              exp(-(x + 1)^2 - y^2) / 3     # [Julia] the classic test surface, as a plain function
xs = range(-3, 3; length = 60)             # [Julia]
ys = range(-3, 3; length = 60)
Z = [peaks(x, y) for x in xs, y in ys]     # [Julia] Z[i, j] is the height at (xs[i], ys[j])
zmin, at = findmin(Z)                      # [Julia] the lowest point and its CartesianIndex

fig = Figure(; size = (900, 720))          # [SqueroPlot]
ax1 = Axis3(fig[1, 1:2]; title = "surface", zlabel = "height")               # [SqueroPlot]
s = surface!(ax1, xs, ys, Z; colormap = :viridis)                            # [SqueroPlot] a lit surface
scatter!(ax1, [xs[at[1]]], [ys[at[2]]], [zmin]; color = :red, markersize = 10)  # [SqueroPlot] mark the minimum
ax2 = Axis3(fig[1, 3:4]; title = "wireframe", azimuth = 0.2π)                # [SqueroPlot]
wireframe!(ax2, xs[1:3:end], ys[1:3:end], Z[1:3:end, 1:3:end]; color = :gray40)  # [SqueroPlot]; Z[1:3:end, …] is [Julia] slicing
ax3 = Axis(fig[2, 1]; title = "heatmap", aspect = DataAspect())              # [SqueroPlot]
hm = heatmap!(ax3, xs, ys, Z; colormap = :magma)                             # [SqueroPlot]
Colorbar(fig[2, 2], hm)                    # [SqueroPlot] a colour bar for the heatmap
ax4 = Axis(fig[2, 3]; title = "contourf + contour", aspect = DataAspect())    # [SqueroPlot]
cf = contourf!(ax4, xs, ys, Z; levels = 12, colormap = :RdBu)                 # [SqueroPlot] filled bands
contour!(ax4, xs, ys, Z; levels = 12, color = :black, linewidth = 0.5)        # [SqueroPlot] iso-lines on top
Colorbar(fig[2, 4], cf; label = "height")  # [SqueroPlot]
Label(fig[0, 1:4], "peaks(x, y)"; fontsize = 20, font = :bold)   # [SqueroPlot] a title row above the others (add it last)
fig
