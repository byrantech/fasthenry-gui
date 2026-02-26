# FastHenry 3.0wr — 3D Inductance Extraction with Web GUI

FastHenry is a three-dimensional inductance extraction program developed at the Massachusetts Institute of Technology. It computes the frequency-dependent self and mutual inductances and resistances between conductors of complex geometry using a multipole-accelerated algorithm.

This repository contains the 3.0wr branch maintained by Stephen R. Whiteley (Whiteley Research Inc.), which extends the original MIT release with superconductor support, performance improvements, modern platform compatibility, and a ***vibe-coded*** web-based 3D graphical editor for building and running FastHenry models interactively.

---

## Web-Based 3D GUI

- GPU-instanced rendering
- Visual model building
- STEP/CAD import (experimental)
- Results visualization

---

## Quick Start

### Prerequisites

- **C compiler** (GCC recommended)
- **Make**
- **Python 3.8+** (for the web GUI)

### Build FastHenry

```bash
# Configure for your platform (default works for most Linux/macOS systems)
./config default

# Build the solver
make all

# The binary is placed in bin/
bin/fasthenry --version
```

Platform-specific configurations: `default`, `mingw` (Windows), `solaris`, `sgi`, `dec`, `alpha`, `sysV`.

For alternative linear algebra backends:

```bash
# KLU (requires SuiteSparse installed)
make SOLVER=KLU_SOLVER all

# Intel MKL/DSS
make SOLVER=DSS_SOLVER all
```

### Run the Web GUI

```bash
cd gui

# Install Python dependencies
pip install -r requirements.txt

# Optional: install CadQuery for STEP import support
# pip install cadquery

# Start the server
python server.py
```

Open **http://127.0.0.1:5000** in your browser.

### Command-Line Usage

```bash
# Run a simulation directly
bin/fasthenry examples/input/pin-con7.inp

# Output is written to Zc.mat in the working directory
cat Zc.mat
```

Common options:

| Flag | Description |
|------|-------------|
| `-s` `ludecomp` | Use LU decomposition (direct solver) |
| `-s` `iterative` | Use GMRES (iterative solver, default) |
| `-m` `direct` | Direct matrix-vector products |
| `-m` `multi` | Multipole-accelerated mat-vec (default) |
| `-p` `<tol>` | GMRES convergence tolerance |
| `-o` `<iters>` | Maximum GMRES iterations |

## GUI Usage Guide

### Viewport Controls

| Action | Control |
|--------|---------|
| Orbit | Right-click drag |
| Pan | Middle-click drag |
| Zoom | Scroll wheel |
| Fit all | Press **F** or click **Fit** |
| Deselect | Press **Escape** |

### Building a Model

1. **Add Nodes** — Click the **+ Node** toolbar button, then click on the grid to place nodes. Or enter coordinates in the sidebar.
2. **Add Segments** — Click **+ Segment**, then click two nodes to connect them.
3. **Configure** — Set units, default cross-section dimensions (`w`, `h`), conductivity, and discretization in the Configuration panel.
4. **Ground Planes** — Define 3 corners, thickness, and segmentation counts.
5. **External Ports** — Select node pairs to define measurement ports.
6. **Frequency** — Enter sweep range using engineering notation (e.g., `10 kHz` to `100 MHz`).
7. **Run** — Click **Run FastHenry** to execute the simulation.

### Importing Files

- **Import .inp** — Load existing FastHenry input files
- **Import STEP** — Import 3D CAD files (requires `cadquery` or `gmsh` Python packages)
- **Examples** — Select from 24 built-in examples via the dropdown

## Credits & Acknowledgments

FastHenry was created at the Research Laboratory of Electronics, Department of Electrical Engineering and Computer Science, Massachusetts Institute of Technology, Cambridge, MA. This branch was created and maintained by Stephen R. Whiteley of Whiteley Research Inc. with further features as listed in `CHANGELOG`.

MIT License
