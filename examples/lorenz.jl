# lorenz.jl — the Lorenz attractor with a small RK4 loop
σ, ρ, β = 10.0, 28.0, 8 / 3
dt = 0.01
t = 0:dt:20
x = zeros(3, length(t))
x[:, 1] = [1.0, 1.0, 1.0]
f(s) = [σ * (s[2] - s[1]), s[1] * (ρ - s[3]) - s[2], s[1] * s[2] - β * s[3]]
for k in 2:length(t)
    s = x[:, k - 1]
    k1 = f(s)
    k2 = f(s + dt / 2 * k1)
    k3 = f(s + dt / 2 * k2)
    k4 = f(s + dt * k3)
    x[:, k] = s + dt / 6 * (k1 + 2k2 + 2k3 + k4)
end
plot(t, x[1, :])
