# 07-session-and-workspace.jl — Controlling the MX session and workspace with `SqueroBase`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] session events (`clear`, `clc`, `open_example`)
#
# In the console you can switch between shipped examples read-only at any time:
#   open_example(1)           # open by 1-based tutorial index
#   open_example("lorenz")    # open by slug, filename, or symbol (:lorenz)
#
# Below, run cell-by-cell (`Ctrl/Cmd+Enter`) or Run all to see `clear(:name)` drop temporary
# bindings while keeping the variables and figures you intend to inspect or broadcast to Paperboat.

#%% 1. compute frequency data plus two temporary scratch variables
scratch_gain = 100.0                       # [Julia] scalar in the workspace
scratch_matrix = randn(4, 4)               # [Julia] temporary array

ω = 10 .^ range(-1, 2; length = 240)       # [Julia] frequency grid [rad/s]
ζ_plant = 0.25                             # [Julia] damping ratio (shared to Paperboat)
ωn_plant = 4.0                             # [Julia] natural frequency [rad/s]
mag_db = [20 * log10(1 / abs((im * w / ωn_plant)^2 + 2 * ζ_plant * (im * w / ωn_plant) + 1)) for w in ω]

#%% 2. selectively remove only the temporary bindings (`clear` runs between statements)
clear(:scratch_gain, :scratch_matrix)      # [SqueroBase] ω, ζ_plant, ωn_plant and mag_db remain!
# Call `clc()` in the console to clear printed lines, or `clear()` to reset the entire session.

#%% 3. plot what remains in the workspace
fig = Figure(; size = (720, 400), title = "Bode magnitude")   # [SqueroPlot]
ax = Axis(fig[1, 1];
    title = "Second-order plant (ωₙ = $(ωn_plant) rad/s, ζ = $(ζ_plant))",
    xlabel = "ω [rad/s]", ylabel = "|G(jω)| [dB]", xscale = log10)
lines!(ax, ω, mag_db; color = :steelblue, linewidth = 2, label = "|G(jω)|")
vlines!(ax, [ωn_plant]; color = :crimson, linestyle = :dash, label = "ωₙ")
hlines!(ax, [0.0]; color = :gray60, linewidth = 0.7)
axislegend(ax; position = :lb)
fig
