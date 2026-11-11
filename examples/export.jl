# export.jl — write the surface and the workspace
savefig("surface.png")
writematrix(A, "data/run-07.csv")
save("data/run-07.mat")
