# subplot-scatter.jl — two lines, a scatter and a surface
#%% setup
x = 0:0.1:10
#%% page
subplot(2, 2, 1); plot(x, sin.(x))
subplot(2, 2, 2); scatter(x, cos.(x))
subplot(2, 2, 3); surf(peaks(64))
subplot(2, 2, 4); imagesc(peaks(64))
