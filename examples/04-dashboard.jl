# 04-dashboard.jl — Statistical plots, bands, areas, twin y axes, and log scales.
#   [Julia] Base Julia and stdlibs · [SqueroPlot] plotting (see 01-signals.jl)

using Statistics                           # [Julia] mean, std (preloaded by the kernel)

hours = 0:23                               # [Julia]
temperature = [18 + 6 * sin((h - 8) / 24 * 2π) for h in hours]       # [Julia] comprehension
humidity = [70 - 20 * sin((h - 8) / 24 * 2π) for h in hours]
noise(k) = 0.6 * sin(12.9898k) * cos(78.233k)                         # [Julia] deterministic pseudo-noise
samples = [temperature[mod1(k, 24)] + 4noise(k) for k in 1:2000]
days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
daily = [mean(samples[(d - 1) * 400 + 1:d * 400]) for d in 1:5]     # [Julia] Statistics.mean
spread = [std(samples[(d - 1) * 400 + 1:d * 400]) for d in 1:5]     # [Julia] Statistics.std

fig = Figure(; size = (960, 640))          # [SqueroPlot]
ax1 = Axis(fig[1, 1]; title = "daily mean ± σ", xticks = (1:5, days), ylabel = "°C")   # [SqueroPlot] text tick labels
barplot!(ax1, 1:5, daily; color = :steelblue)                         # [SqueroPlot]
errorbars!(ax1, 1:5, daily, spread; whiskerwidth = 10)                # [SqueroPlot]

ax2 = Axis(fig[1, 2]; title = "distribution", xlabel = "°C", ylabel = "density")       # [SqueroPlot]
hist!(ax2, samples; bins = 30, normalization = :pdf, color = (:orange, 0.7))           # [SqueroPlot] (colour, alpha)
vlines!(ax2, [mean(samples)]; color = :black, linestyle = :dash, label = "mean")       # [SqueroPlot]
axislegend(ax2)

ax3 = Axis(fig[2, 1]; title = "temperature & humidity", xlabel = "hour", ylabel = "temperature [°C]")
band!(ax3, hours, temperature .- 1.5, temperature .+ 1.5; color = (:tomato, 0.25))     # [SqueroPlot] uncertainty band
area!(ax3, hours, temperature .- 3.0; baseline = 9.0, color = :steelblue, fillalpha = 0.14)  # [SqueroPlot] filled region
lines!(ax3, hours, temperature; color = :tomato, label = "temperature")
ax3b = twinx(ax3; ylabel = "humidity [%]")                            # [SqueroPlot] secondary y axis on the right
scatterlines!(ax3b, hours, humidity; color = :teal, markersize = 6)

ax4 = Axis(fig[2, 2]; title = "power spectrum (log)", yscale = log10, xlabel = "cycles / day")  # [SqueroPlot] log axis
seg = samples[1:96] .- mean(samples[1:96])  # [Julia] 96 hourly samples, mean removed
freqs = 1:48
power = [abs2(sum(seg[k] * cis(-2π * f * (k - 1) / 96) for k in 1:96)) for f in freqs]   # [Julia] DFT by hand
stem!(ax4, freqs ./ 4, power; offset = minimum(power))   # [SqueroPlot] stems anchored at the floor
fig
