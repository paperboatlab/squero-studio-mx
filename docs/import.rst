Import data
===========

File › Import data… or drop a file on the workspace. A preview shows what will come in.

- ``.csv`` ``.tsv`` ``.txt`` ``.dat``: comma, tab, semicolon or spaces, found by themselves. A first row of names is a header.
- ``.xlsx``: every sheet; formulas come in as their last computed values.
- ``.mat``: MATLAB v4, v6 and v7 (compressed). v7.3 files are HDF5: save them with ``-v7`` to import.
- ``.json``: numbers, arrays, arrays of rows, or records like ``[{"t": 0, "y": 1}, …]``.

A table with a header comes in as one vector per column, or as one matrix. Text columns are left out and named in the preview.
