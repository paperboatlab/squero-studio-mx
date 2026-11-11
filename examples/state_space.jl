# state_space.jl — a second-order system as A, B, C, D
A = [0.0 1.0; -2.0 -3.0]
B = [0.0; 1.0]
C = [1.0 0.0]
D = [0.0]
x0 = [1.0, 0.0]

# Paperboat's state_space block integrates this with the run's solver.
