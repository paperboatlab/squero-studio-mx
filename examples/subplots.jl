# subplots.jl — a 2 × 2 page
#%% setup
x = 0:0.1:10
#%% lines
subplot(2, 2, 1)
plot(x, sin.(x))
subplot(2, 2, 2)
plot(x, cos.(x))
#%% surface and heat
subplot(2, 2, 3)
surf(peaks(64))
subplot(2, 2, 4)
imagesc(peaks(64))
