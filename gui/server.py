#!/usr/bin/env python3
"""Flask backend for the FastHenry 3D Editor GUI."""

import json
import math
import os
import subprocess
import sys
import tempfile

from flask import Flask, render_template, request, jsonify, send_from_directory

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FASTHENRY_BIN = os.path.join(BASE_DIR, "bin", "fasthenry")
EXAMPLES_DIR = os.path.join(BASE_DIR, "examples", "input")

app = Flask(__name__)


def _detect_step_backend():
    """Return ("cadquery", module) or ("gmsh", module) or (None, None)."""
    try:
        import cadquery as cq
        return "cadquery", cq
    except Exception:
        pass
    try:
        import gmsh
        return "gmsh", gmsh
    except Exception:
        pass
    return None, None


def _merge_nodes(nodes, tol=1e-6):
    """Merge coincident nodes within *tol*.  Returns (merged_nodes, index_map)
    where index_map[old_index] = new_index."""
    merged = []
    index_map = {}
    for i, n in enumerate(nodes):
        for j, m in enumerate(merged):
            if math.dist((n["x"], n["y"], n["z"]), (m["x"], m["y"], m["z"])) < tol:
                index_map[i] = j
                break
        else:
            index_map[i] = len(merged)
            merged.append(n)
    for idx, m in enumerate(merged):
        m["name"] = f"N{idx}"
    return merged, index_map


def _import_step_cadquery(file_bytes):
    import cadquery as cq

    result = cq.importers.importStep(rawBytes=file_bytes)

    raw_nodes = []
    segments = []
    node_idx = 0
    seg_idx = 0

    solids = result.solids().vals()
    for solid in solids:
        bb = solid.BoundingBox()
        dims = [
            ("x", bb.xmax - bb.xmin),
            ("y", bb.ymax - bb.ymin),
            ("z", bb.zmax - bb.zmin),
        ]
        dims.sort(key=lambda d: d[1], reverse=True)
        longest_axis = dims[0][0]
        w = dims[1][1]
        h = dims[2][1]
        cx = (bb.xmin + bb.xmax) / 2
        cy = (bb.ymin + bb.ymax) / 2
        cz = (bb.zmin + bb.zmax) / 2
        half = dims[0][1] / 2

        if longest_axis == "x":
            p1 = {"name": f"N{node_idx}", "x": bb.xmin, "y": cy, "z": cz}
            p2 = {"name": f"N{node_idx+1}", "x": bb.xmax, "y": cy, "z": cz}
        elif longest_axis == "y":
            p1 = {"name": f"N{node_idx}", "x": cx, "y": bb.ymin, "z": cz}
            p2 = {"name": f"N{node_idx+1}", "x": cx, "y": bb.ymax, "z": cz}
        else:
            p1 = {"name": f"N{node_idx}", "x": cx, "y": cy, "z": bb.zmin}
            p2 = {"name": f"N{node_idx+1}", "x": cx, "y": cy, "z": bb.zmax}

        n1_idx = len(raw_nodes)
        raw_nodes.append(p1)
        raw_nodes.append(p2)
        node_idx += 2

        segments.append({
            "name": f"E{seg_idx}",
            "node1_idx": n1_idx,
            "node2_idx": n1_idx + 1,
            "w": max(w, 1e-6),
            "h": max(h, 1e-6),
        })
        seg_idx += 1

    edges = result.edges().vals()
    solid_edge_hashes = set()
    for solid in solids:
        for e in cq.Workplane().add(solid).edges().vals():
            solid_edge_hashes.add(e.HashCode(2**31 - 1))

    for edge in edges:
        if edge.HashCode(2**31 - 1) in solid_edge_hashes:
            continue
        verts = edge.Vertices()
        if len(verts) < 2:
            continue
        v0 = verts[0]
        v1 = verts[-1]
        p1 = {"name": f"N{node_idx}", "x": v0.X, "y": v0.Y, "z": v0.Z}
        p2 = {"name": f"N{node_idx+1}", "x": v1.X, "y": v1.Y, "z": v1.Z}
        n1_idx = len(raw_nodes)
        raw_nodes.append(p1)
        raw_nodes.append(p2)
        node_idx += 2

        length = math.dist((v0.X, v0.Y, v0.Z), (v1.X, v1.Y, v1.Z))
        default_wh = max(length * 0.05, 1e-6)
        segments.append({
            "name": f"E{seg_idx}",
            "node1_idx": n1_idx,
            "node2_idx": n1_idx + 1,
            "w": default_wh,
            "h": default_wh,
        })
        seg_idx += 1

    merged_nodes, idx_map = _merge_nodes(raw_nodes)

    final_segments = []
    for s in segments:
        final_segments.append({
            "name": s["name"],
            "node1": merged_nodes[idx_map[s["node1_idx"]]]["name"],
            "node2": merged_nodes[idx_map[s["node2_idx"]]]["name"],
            "w": round(s["w"], 8),
            "h": round(s["h"], 8),
        })

    standalone_edges = len(edges) - len(solid_edge_hashes & {e.HashCode(2**31 - 1) for e in edges})
    info = (
        f"Imported {len(solids)} solid(s) and {standalone_edges} standalone edge(s) "
        f"→ {len(merged_nodes)} node(s), {len(final_segments)} segment(s) [cadquery]"
    )
    return merged_nodes, final_segments, info


def _import_step_gmsh(file_bytes):
    import gmsh

    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)

    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        gmsh.open(tmp_path)

        raw_nodes = []
        segments = []
        node_idx = 0
        seg_idx = 0
        solid_count = 0
        edge_count = 0

        volumes = gmsh.model.getEntities(dim=3)
        for dim, tag in volumes:
            bb = gmsh.model.getBoundingBox(dim, tag)
            xmin, ymin, zmin, xmax, ymax, zmax = bb
            dims = [
                ("x", xmax - xmin),
                ("y", ymax - ymin),
                ("z", zmax - zmin),
            ]
            dims.sort(key=lambda d: d[1], reverse=True)
            longest_axis = dims[0][0]
            w = dims[1][1]
            h = dims[2][1]
            cx = (xmin + xmax) / 2
            cy = (ymin + ymax) / 2
            cz = (zmin + zmax) / 2

            if longest_axis == "x":
                p1 = {"name": f"N{node_idx}", "x": xmin, "y": cy, "z": cz}
                p2 = {"name": f"N{node_idx+1}", "x": xmax, "y": cy, "z": cz}
            elif longest_axis == "y":
                p1 = {"name": f"N{node_idx}", "x": cx, "y": ymin, "z": cz}
                p2 = {"name": f"N{node_idx+1}", "x": cx, "y": ymax, "z": cz}
            else:
                p1 = {"name": f"N{node_idx}", "x": cx, "y": cy, "z": zmin}
                p2 = {"name": f"N{node_idx+1}", "x": cx, "y": cy, "z": zmax}

            n1_idx = len(raw_nodes)
            raw_nodes.append(p1)
            raw_nodes.append(p2)
            node_idx += 2

            segments.append({
                "name": f"E{seg_idx}",
                "node1_idx": n1_idx,
                "node2_idx": n1_idx + 1,
                "w": max(w, 1e-6),
                "h": max(h, 1e-6),
            })
            seg_idx += 1
            solid_count += 1

        solid_edge_tags = set()
        for dim, tag in volumes:
            bounds = gmsh.model.getBoundary([(dim, tag)], combined=False, recursive=True)
            for bdim, btag in bounds:
                if bdim == 1:
                    solid_edge_tags.add(btag)

        all_edges = gmsh.model.getEntities(dim=1)
        for dim, tag in all_edges:
            if tag in solid_edge_tags:
                continue
            bb = gmsh.model.getBoundingBox(dim, tag)
            xmin, ymin, zmin, xmax, ymax, zmax = bb
            p1 = {"name": f"N{node_idx}", "x": xmin, "y": ymin, "z": zmin}
            p2 = {"name": f"N{node_idx+1}", "x": xmax, "y": ymax, "z": zmax}
            n1_idx = len(raw_nodes)
            raw_nodes.append(p1)
            raw_nodes.append(p2)
            node_idx += 2

            length = math.dist((xmin, ymin, zmin), (xmax, ymax, zmax))
            default_wh = max(length * 0.05, 1e-6)
            segments.append({
                "name": f"E{seg_idx}",
                "node1_idx": n1_idx,
                "node2_idx": n1_idx + 1,
                "w": default_wh,
                "h": default_wh,
            })
            seg_idx += 1
            edge_count += 1

        gmsh.finalize()
    finally:
        os.unlink(tmp_path)

    merged_nodes, idx_map = _merge_nodes(raw_nodes)

    final_segments = []
    for s in segments:
        final_segments.append({
            "name": s["name"],
            "node1": merged_nodes[idx_map[s["node1_idx"]]]["name"],
            "node2": merged_nodes[idx_map[s["node2_idx"]]]["name"],
            "w": round(s["w"], 8),
            "h": round(s["h"], 8),
        })

    info = (
        f"Imported {solid_count} solid(s) and {edge_count} standalone edge(s) "
        f"→ {len(merged_nodes)} node(s), {len(final_segments)} segment(s) [gmsh]"
    )
    return merged_nodes, final_segments, info


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/run", methods=["POST"])
def run_fasthenry():
    data = request.get_json()
    inp_content = data.get("inp", "")
    options = data.get("options", {})

    with tempfile.TemporaryDirectory() as tmpdir:
        inp_path = os.path.join(tmpdir, "input.inp")
        with open(inp_path, "w") as f:
            f.write(inp_content)

        cmd = [FASTHENRY_BIN]

        solver = options.get("solver")
        if solver:
            cmd.extend(["-s", solver])

        matvec = options.get("matvec")
        if matvec:
            cmd.extend(["-m", matvec])

        precond = options.get("precond")
        if precond:
            cmd.extend(["-p", precond])

        order = options.get("order")
        if order:
            cmd.extend(["-o", str(order)])

        tol = options.get("tol")
        if tol:
            cmd.extend(["-t", str(tol)])

        maxiters = options.get("maxiters")
        if maxiters:
            cmd.extend(["-c", str(maxiters)])

        cmd.append(inp_path)

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, cwd=tmpdir, timeout=300
            )
        except subprocess.TimeoutExpired:
            return jsonify({"error": "FastHenry timed out after 300 seconds"}), 500

        zc_content = ""
        zc_path = os.path.join(tmpdir, "Zc.mat")
        if os.path.exists(zc_path):
            with open(zc_path) as f:
                zc_content = f.read()

        return jsonify(
            {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
                "zc_mat": zc_content,
            }
        )


@app.route("/api/examples")
def list_examples():
    files = sorted(
        f for f in os.listdir(EXAMPLES_DIR) if f.endswith(".inp") and os.path.getsize(os.path.join(EXAMPLES_DIR, f)) < 500_000
    )
    return jsonify(files)


@app.route("/api/example/<name>")
def get_example(name):
    if ".." in name or "/" in name:
        return "Invalid filename", 400
    path = os.path.join(EXAMPLES_DIR, name)
    if not os.path.exists(path):
        return "Not found", 404
    with open(path) as f:
        return f.read(), 200, {"Content-Type": "text/plain"}


@app.route("/api/step-available")
def step_available():
    backend, _ = _detect_step_backend()
    return jsonify({"available": backend is not None, "backend": backend})


@app.route("/api/import-step", methods=["POST"])
def import_step():
    backend, _ = _detect_step_backend()
    if backend is None:
        return jsonify({
            "error": (
                "No STEP import backend available. Install one of:\n"
                "  pip install cadquery\n"
                "  pip install gmsh\n"
                "cadquery is recommended for best fidelity."
            )
        }), 500

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Use multipart field name 'file'."}), 400

    uploaded = request.files["file"]
    file_bytes = uploaded.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400

    step_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
            tmp.write(file_bytes)
            step_path = tmp.name

        result = subprocess.run(
            [sys.executable, os.path.abspath(__file__),
             "--import-step", step_path, backend],
            capture_output=True, text=True, timeout=120,
        )

        if result.returncode != 0:
            err = result.stderr.strip().split("\n")[-1] if result.stderr.strip() else "unknown error"
            return jsonify({"error": f"STEP import failed: {err}"}), 400

        data = json.loads(result.stdout)
        return jsonify(data)

    except subprocess.TimeoutExpired:
        return jsonify({"error": "STEP import timed out (120 s)"}), 500
    except json.JSONDecodeError:
        stderr = result.stderr.strip() if result.stderr else ""
        return jsonify({"error": f"STEP import failed: {stderr or 'invalid output'}"}), 400
    except Exception as exc:
        return jsonify({"error": f"STEP import failed: {exc}"}), 400
    finally:
        if step_path:
            try:
                os.unlink(step_path)
            except OSError:
                pass


def _step_worker(step_path, backend):
    """Subprocess entry point for STEP import.

    Runs in its own process so that libraries like CadQuery/gmsh can
    use signal handlers (which require the main thread of the main
    interpreter — incompatible with Flask's reloader thread).
    """
    with open(step_path, "rb") as f:
        file_bytes = f.read()

    if backend == "cadquery":
        nodes, segments, info = _import_step_cadquery(file_bytes)
    else:
        nodes, segments, info = _import_step_gmsh(file_bytes)

    print(json.dumps({"nodes": nodes, "segments": segments, "info": info}))


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--import-step":
        try:
            _step_worker(sys.argv[2], sys.argv[3])
        except Exception as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)
    else:
        print(f"FastHenry binary: {FASTHENRY_BIN}")
        print(f"Examples dir: {EXAMPLES_DIR}")
        app.run(debug=True, port=5000)
