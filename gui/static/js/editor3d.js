import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const NODE_RADIUS_FACTOR = 0.015;
const MIN_NODE_RADIUS = 0.5;
const ANIMATE_DURATION = 400;
const MAX_LABEL_COUNT = 300;

const UNIT_CORNERS = [
  [-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5], [ 0.5,  0.5, -0.5], [-0.5,  0.5, -0.5],
  [-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5,  0.5], [-0.5,  0.5,  0.5],
];
const BOX_EDGES = [
  [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],
];

export class Editor3D {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.mode = 'select';
    this.displaySettings = {
      nodeSize: 1, labelSize: 1, showLabels: true,
      nodeColor: '#3fb950', segColor: '#4493f8',
      segOpacity: 0.75, gpOpacity: 0.3, showGrid: true,
    };

    this._sphereGeo = new THREE.IcosahedronGeometry(1, 2);
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);

    this._nodeInst = null;
    this._segInst = null;
    this._edgeLines = null;
    this._extLines = null;
    this._gpGroup = new THREE.Group();
    this._gpMeshes = [];
    this._labelGroup = new THREE.Group();

    this._nodeNames = [];
    this._segNames = [];
    this._selectedNodeId = -1;
    this._selectedSegId = -1;
    this._selectedGp = null;
    this._pendingNodeId = -1;

    this._labelCanvas = document.createElement('canvas');
    this._labelCanvas.width = 128;
    this._labelCanvas.height = 32;
    this._labelCtx = this._labelCanvas.getContext('2d', { willReadFrequently: true });

    this._animating = null;
    this._prevDS = null;

    this._initScene();
    this._initGrid();
    this._initLights();
    this._initControls();
    this._initRaycaster();
    this._bindEvents();
    this._animate();
  }

  /* ------------------------------------------------------------------ */
  /*  Initialisation                                                     */
  /* ------------------------------------------------------------------ */

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1419);
    this.scene.add(this._gpGroup);
    this.scene.add(this._labelGroup);

    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.01, 100000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(20, -20, 15);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height);
  }

  _initGrid() {
    this.gridHelper = new THREE.GridHelper(100, 100, 0x30363d, 0x1c2128);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(this.gridHelper);
    this.scene.add(new THREE.AxesHelper(5));
    this.gridPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  _initLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.7);
    d1.position.set(10, -10, 20);
    this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.3);
    d2.position.set(-10, 5, -10);
    this.scene.add(d2);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }

  _initRaycaster() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /* ------------------------------------------------------------------ */
  /*  Events                                                             */
  /* ------------------------------------------------------------------ */

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    this.canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onResize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  }

  _updateMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onClick(e) {
    this._updateMouse(e);
    if (this.mode === 'addNode') this._placeNode();
    else if (this.mode === 'addSegment') this._pickNodeForSegment();
    else this._selectObject();
  }

  _onDblClick(e) {
    this._updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = [];
    if (this._nodeInst) targets.push(this._nodeInst);
    if (this._segInst) targets.push(this._segInst);
    targets.push(...this._gpMeshes);
    if (this.raycaster.intersectObjects(targets).length === 0) {
      this.fitView();
    }
  }

  _onMouseMove(e) {
    this._updateMouse(e);
    if (this.mode === 'addNode') {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.gridPlane, hit)) {
        const snap = this._snapToGrid(hit);
        const el = document.getElementById('coord-display');
        if (el) el.textContent = `(${snap.x.toFixed(2)}, ${snap.y.toFixed(2)}, ${snap.z.toFixed(2)})`;
      }
    }
  }

  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'f' || e.key === 'F') this.fitView();
    else if (e.key === 'Escape') {
      this._deselect();
      this._clearPendingSegment();
      if (this.mode !== 'select') this.setMode('select');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Snap / grid helpers                                                */
  /* ------------------------------------------------------------------ */

  _snapToGrid(point) {
    const gs = this._getGridSize();
    return new THREE.Vector3(
      Math.round(point.x / gs) * gs,
      Math.round(point.y / gs) * gs,
      Math.round(point.z / gs) * gs,
    );
  }

  _getGridSize() {
    const bbox = this._getBoundingBox();
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 10);
    return Math.pow(10, Math.floor(Math.log10(maxDim / 10))) || 1;
  }

  /* ------------------------------------------------------------------ */
  /*  Interaction: place node, pick segment, select                      */
  /* ------------------------------------------------------------------ */

  _placeNode() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.gridPlane, hit)) {
      const snap = this._snapToGrid(hit);
      this.app.addNode(snap.x, snap.y, snap.z);
    }
  }

  _pickNodeForSegment() {
    if (!this._nodeInst) return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this._nodeInst);
    if (hits.length === 0) return;

    const instanceId = hits[0].instanceId;
    const name = this._nodeNames[instanceId];

    if (this._pendingNodeId < 0) {
      this._pendingNodeId = instanceId;
      this._nodeInst.setColorAt(instanceId, new THREE.Color(0x4493f8));
      this._nodeInst.instanceColor.needsUpdate = true;
      this.app.setStatus(`Segment: first node = ${name}. Click second node.`);
    } else {
      const firstName = this._nodeNames[this._pendingNodeId];
      if (name !== firstName) this.app.addSegment(firstName, name);
      this._clearPendingSegment();
      this.app.setStatus('Segment created.');
    }
  }

  _clearPendingSegment() {
    if (this._pendingNodeId >= 0 && this._nodeInst) {
      this._nodeInst.setColorAt(this._pendingNodeId, new THREE.Color(this.displaySettings.nodeColor));
      this._nodeInst.instanceColor.needsUpdate = true;
      this._pendingNodeId = -1;
    }
  }

  _selectObject() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = [];
    if (this._nodeInst) targets.push(this._nodeInst);
    if (this._segInst) targets.push(this._segInst);
    targets.push(...this._gpMeshes);
    const hits = this.raycaster.intersectObjects(targets);

    this._deselect();
    if (hits.length === 0) return;

    const hit = hits[0];
    if (hit.object === this._nodeInst) {
      this._selectedNodeId = hit.instanceId;
      this._nodeInst.setColorAt(hit.instanceId, new THREE.Color(0xffffff));
      this._nodeInst.instanceColor.needsUpdate = true;
      this.app.selectNode(this._nodeNames[hit.instanceId]);
    } else if (hit.object === this._segInst) {
      this._selectedSegId = hit.instanceId;
      this._segInst.setColorAt(hit.instanceId, new THREE.Color(0xffffff));
      this._segInst.instanceColor.needsUpdate = true;
      this.app.selectSegment(this._segNames[hit.instanceId]);
    } else if (hit.object.userData?.type === 'gp') {
      this._selectedGp = hit.object;
      hit.object.material.emissive.setHex(0x333333);
    }
  }

  _deselect() {
    if (this._selectedNodeId >= 0 && this._nodeInst) {
      this._nodeInst.setColorAt(this._selectedNodeId, new THREE.Color(this.displaySettings.nodeColor));
      this._nodeInst.instanceColor.needsUpdate = true;
      this._selectedNodeId = -1;
    }
    if (this._selectedSegId >= 0 && this._segInst) {
      this._segInst.setColorAt(this._selectedSegId, new THREE.Color(this.displaySettings.segColor));
      this._segInst.instanceColor.needsUpdate = true;
      this._selectedSegId = -1;
    }
    if (this._selectedGp) {
      this._selectedGp.material.emissive.setHex(0x000000);
      this._selectedGp = null;
    }
  }

  deselectAll() {
    this._deselect();
    this._clearPendingSegment();
  }

  /* ------------------------------------------------------------------ */
  /*  Public: mode                                                       */
  /* ------------------------------------------------------------------ */

  setMode(mode) {
    this.mode = mode;
    this._clearPendingSegment();
    this.controls.enabled = true;
    if (mode === 'addNode') this.app.setStatus('Click on the grid to place a node');
    else if (mode === 'addSegment') this.app.setStatus('Click the first node for the segment');
    else this.app.setStatus('Ready');
  }

  /* ------------------------------------------------------------------ */
  /*  Full rebuild (GPU-instanced)                                       */
  /* ------------------------------------------------------------------ */

  rebuild(model, displaySettings) {
    if (displaySettings) Object.assign(this.displaySettings, displaySettings);
    this._clearScene();

    const ds = this.displaySettings;
    const nodeRadius = this._computeNodeRadius(model) * ds.nodeSize;
    const nodeMap = new Map();
    for (const n of model.nodes) nodeMap.set(n.name, n);

    this._buildNodes(model, ds, nodeRadius);
    this._buildSegments(model, ds, nodeMap);
    this._buildGroundPlanes(model, ds);
    this._buildExternals(model, nodeMap);
    this._buildLabels(model, ds, nodeRadius);

    if (this.gridHelper) this.gridHelper.visible = ds.showGrid;
    this._prevDS = { ...ds };
  }

  _buildNodes(model, ds, nodeRadius) {
    const count = model.nodes.length;
    if (count === 0) return;

    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    this._nodeInst = new THREE.InstancedMesh(this._sphereGeo, mat, count);
    this._nodeInst.userData = { type: 'nodeInst' };

    const dummy = new THREE.Object3D();
    const color = new THREE.Color(ds.nodeColor);

    for (let i = 0; i < count; i++) {
      const n = model.nodes[i];
      dummy.position.set(n.x, n.y, n.z);
      dummy.scale.setScalar(nodeRadius);
      dummy.updateMatrix();
      this._nodeInst.setMatrixAt(i, dummy.matrix);
      this._nodeInst.setColorAt(i, color);
      this._nodeNames.push(n.name);
    }

    this._nodeInst.instanceMatrix.needsUpdate = true;
    this._nodeInst.instanceColor.needsUpdate = true;
    this.scene.add(this._nodeInst);
  }

  _buildSegments(model, ds, nodeMap) {
    if (model.segments.length === 0) return;

    const segMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: ds.segOpacity,
    });
    const segInst = new THREE.InstancedMesh(this._boxGeo, segMat, model.segments.length);
    segInst.userData = { type: 'segInst' };

    const segColor = new THREE.Color(ds.segColor);
    const edgeVerts = [];
    const _v = new THREE.Vector3();
    const _m4 = new THREE.Matrix4();
    let idx = 0;

    for (const seg of model.segments) {
      const n1 = nodeMap.get(seg.node1);
      const n2 = nodeMap.get(seg.node2);
      if (!n1 || !n2) continue;

      const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-12) continue;

      const w = seg.w || model.defaults.w || 1;
      const h = seg.h || model.defaults.h || 0.5;
      const dnx = dx / len, dny = dy / len, dnz = dz / len;

      let wx, wy, wz;
      if (Math.abs(dnz) > 0.999) {
        wx = 1; wy = 0; wz = 0;
      } else {
        const cl = Math.sqrt(dny * dny + dnx * dnx);
        wx = -dny / cl; wy = dnx / cl; wz = 0;
      }
      const hx = dny * wz - dnz * wy;
      const hy = dnz * wx - dnx * wz;
      const hz = dnx * wy - dny * wx;

      _m4.set(
        wx * w, hx * h, dx, (n1.x + n2.x) * 0.5,
        wy * w, hy * h, dy, (n1.y + n2.y) * 0.5,
        wz * w, hz * h, dz, (n1.z + n2.z) * 0.5,
        0,      0,      0,  1,
      );

      segInst.setMatrixAt(idx, _m4);
      segInst.setColorAt(idx, segColor);
      this._segNames.push(seg.name);

      for (const [a, b] of BOX_EDGES) {
        _v.set(UNIT_CORNERS[a][0], UNIT_CORNERS[a][1], UNIT_CORNERS[a][2]).applyMatrix4(_m4);
        edgeVerts.push(_v.x, _v.y, _v.z);
        _v.set(UNIT_CORNERS[b][0], UNIT_CORNERS[b][1], UNIT_CORNERS[b][2]).applyMatrix4(_m4);
        edgeVerts.push(_v.x, _v.y, _v.z);
      }
      idx++;
    }

    if (idx > 0) {
      segInst.count = idx;
      segInst.instanceMatrix.needsUpdate = true;
      segInst.instanceColor.needsUpdate = true;
      this._segInst = segInst;
      this.scene.add(segInst);

      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
      this._edgeLines = new THREE.LineSegments(
        edgeGeo, new THREE.LineBasicMaterial({ color: 0x58a6ff }),
      );
      this.scene.add(this._edgeLines);
    } else {
      segMat.dispose();
    }
  }

  _buildGroundPlanes(model, ds) {
    for (const gp of model.groundPlanes) {
      const p1 = new THREE.Vector3(gp.x1, gp.y1, gp.z1);
      const p2 = new THREE.Vector3(gp.x2, gp.y2, gp.z2);
      const p3 = new THREE.Vector3(gp.x3, gp.y3, gp.z3);
      const p4 = new THREE.Vector3().addVectors(p3, new THREE.Vector3().subVectors(p1, p2));

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
        p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z,
      ]), 3));
      geo.computeVertexNormals();

      const mat = new THREE.MeshPhongMaterial({
        color: 0xd29922, transparent: true, opacity: ds.gpOpacity, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { type: 'gp', gpName: gp.name };
      this._gpGroup.add(mesh);
      this._gpMeshes.push(mesh);

      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
        p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
        p3.x, p3.y, p3.z, p4.x, p4.y, p4.z,
        p4.x, p4.y, p4.z, p1.x, p1.y, p1.z,
      ]), 3));
      this._gpGroup.add(new THREE.LineSegments(
        edgeGeo, new THREE.LineBasicMaterial({ color: 0xd29922 }),
      ));
    }
  }

  _buildExternals(model, nodeMap) {
    const verts = [];
    for (const ext of model.externals) {
      const n1 = nodeMap.get(ext.node1), n2 = nodeMap.get(ext.node2);
      if (!n1 || !n2) continue;
      verts.push(n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
    }
    if (verts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      this._extLines = new THREE.LineSegments(
        geo, new THREE.LineBasicMaterial({ color: 0xf85149, linewidth: 2 }),
      );
      this.scene.add(this._extLines);
    }
  }

  _buildLabels(model, ds, nodeRadius) {
    if (!ds.showLabels) { this._labelGroup.visible = false; return; }
    const total = model.nodes.length + model.groundPlanes.length;
    if (total > MAX_LABEL_COUNT) { this._labelGroup.visible = false; return; }
    this._labelGroup.visible = true;

    const ctx = this._labelCtx;
    const cw = 128, ch = 32;
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labelScale = nodeRadius * 2.5 * ds.labelSize;
    for (const node of model.nodes) {
      const sprite = this._makeLabel(ctx, cw, ch, node.name, labelScale);
      sprite.position.set(node.x, node.y, node.z + nodeRadius * 2.5);
      this._labelGroup.add(sprite);
    }
    for (const gp of model.groundPlanes) {
      const gpScale = 2 * ds.labelSize;
      const sprite = this._makeLabel(ctx, cw, ch, gp.name, gpScale);
      sprite.position.set((gp.x1 + gp.x3) / 2, (gp.y1 + gp.y3) / 2, (gp.z1 + gp.z3) / 2);
      this._labelGroup.add(sprite);
    }
  }

  _makeLabel(ctx, cw, ch, text, scale) {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(text, cw / 2, ch / 2);

    const data = new Uint8Array(ctx.getImageData(0, 0, cw, ch).data);
    const tex = new THREE.DataTexture(data, cw, ch, THREE.RGBAFormat);
    tex.flipY = true;
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scale * 4, scale, 1);
    return sprite;
  }

  /* ------------------------------------------------------------------ */
  /*  Fast display update (no geometry rebuild)                          */
  /* ------------------------------------------------------------------ */

  updateDisplay(ds) {
    const prev = this._prevDS;
    Object.assign(this.displaySettings, ds);

    if (!prev || ds.nodeSize !== prev.nodeSize || ds.labelSize !== prev.labelSize) {
      this.rebuild(this.app.model, ds);
      return;
    }

    if (this._nodeInst && ds.nodeColor !== prev.nodeColor) {
      const color = new THREE.Color(ds.nodeColor);
      for (let i = 0; i < this._nodeNames.length; i++) {
        if (i === this._selectedNodeId || i === this._pendingNodeId) continue;
        this._nodeInst.setColorAt(i, color);
      }
      this._nodeInst.instanceColor.needsUpdate = true;
    }

    if (this._segInst) {
      if (ds.segColor !== prev.segColor) {
        const color = new THREE.Color(ds.segColor);
        for (let i = 0; i < this._segNames.length; i++) {
          if (i === this._selectedSegId) continue;
          this._segInst.setColorAt(i, color);
        }
        this._segInst.instanceColor.needsUpdate = true;
      }
      this._segInst.material.opacity = ds.segOpacity;
    }

    for (const child of this._gpGroup.children) {
      if (child.isMesh) child.material.opacity = ds.gpOpacity;
    }

    this._labelGroup.visible = ds.showLabels;
    if (this.gridHelper) this.gridHelper.visible = ds.showGrid;
    this._prevDS = { ...ds };
  }

  /* ------------------------------------------------------------------ */
  /*  Scene teardown (with proper GPU memory cleanup)                    */
  /* ------------------------------------------------------------------ */

  _clearScene() {
    if (this._nodeInst) {
      this.scene.remove(this._nodeInst);
      this._nodeInst.material.dispose();
      this._nodeInst = null;
    }
    if (this._segInst) {
      this.scene.remove(this._segInst);
      this._segInst.material.dispose();
      this._segInst = null;
    }
    if (this._edgeLines) {
      this.scene.remove(this._edgeLines);
      this._edgeLines.geometry.dispose();
      this._edgeLines.material.dispose();
      this._edgeLines = null;
    }
    if (this._extLines) {
      this.scene.remove(this._extLines);
      this._extLines.geometry.dispose();
      this._extLines.material.dispose();
      this._extLines = null;
    }

    while (this._gpGroup.children.length > 0) {
      const child = this._gpGroup.children[0];
      this._gpGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this._gpMeshes = [];

    while (this._labelGroup.children.length > 0) {
      const child = this._labelGroup.children[0];
      this._labelGroup.remove(child);
      if (child.material?.map) child.material.map.dispose();
      if (child.material) child.material.dispose();
    }

    this._nodeNames = [];
    this._segNames = [];
    this._selectedNodeId = -1;
    this._selectedSegId = -1;
    this._selectedGp = null;
    this._pendingNodeId = -1;
  }

  /* ------------------------------------------------------------------ */
  /*  Bounding box                                                       */
  /* ------------------------------------------------------------------ */

  _computeNodeRadius(model) {
    if (model.nodes.length === 0) return MIN_NODE_RADIUS;
    const bbox = this._getBoundingBoxFromModel(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    return Math.max(maxDim * NODE_RADIUS_FACTOR, MIN_NODE_RADIUS * 0.01);
  }

  _getBoundingBoxFromModel(model) {
    const bbox = new THREE.Box3();
    for (const n of model.nodes) {
      bbox.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
    }
    for (const gp of model.groundPlanes) {
      bbox.expandByPoint(new THREE.Vector3(gp.x1, gp.y1, gp.z1));
      bbox.expandByPoint(new THREE.Vector3(gp.x2, gp.y2, gp.z2));
      bbox.expandByPoint(new THREE.Vector3(gp.x3, gp.y3, gp.z3));
    }
    if (bbox.isEmpty()) {
      bbox.expandByPoint(new THREE.Vector3(-5, -5, -5));
      bbox.expandByPoint(new THREE.Vector3(5, 5, 5));
    }
    return bbox;
  }

  _getBoundingBox() {
    return this._getBoundingBoxFromModel(this.app.model);
  }

  /* ------------------------------------------------------------------ */
  /*  View: fit                                                          */
  /* ------------------------------------------------------------------ */

  fitView(model) {
    if (!model) model = this.app.model;
    const bbox = this._getBoundingBoxFromModel(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim * 2;

    this._animateCamera(
      new THREE.Vector3(center.x + dist * 0.6, center.y - dist * 0.6, center.z + dist * 0.5),
      center,
    );

    this.camera.near = maxDim * 0.0001;
    this.camera.far = maxDim * 100;
    this.camera.updateProjectionMatrix();
    this._updateGrid(maxDim, center);
  }

  /* ------------------------------------------------------------------ */
  /*  Views: standard orthographic-like views (Z-up)                     */
  /* ------------------------------------------------------------------ */

  setViewTop() {
    const { center, dist } = this._viewParams();
    this._animateCamera(new THREE.Vector3(center.x, center.y, center.z + dist), center);
  }

  setViewFront() {
    const { center, dist } = this._viewParams();
    this._animateCamera(new THREE.Vector3(center.x, center.y - dist, center.z), center);
  }

  setViewRight() {
    const { center, dist } = this._viewParams();
    this._animateCamera(new THREE.Vector3(center.x + dist, center.y, center.z), center);
  }

  setViewIso() {
    const { center, dist } = this._viewParams();
    const d = dist / Math.sqrt(3);
    this._animateCamera(new THREE.Vector3(center.x + d, center.y - d, center.z + d), center);
  }

  _viewParams() {
    const bbox = this._getBoundingBoxFromModel(this.app.model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);
    return { center, dist: Math.max(size.x, size.y, size.z, 1) * 2 };
  }

  /* ------------------------------------------------------------------ */
  /*  Camera animation                                                   */
  /* ------------------------------------------------------------------ */

  _animateCamera(targetPos, targetLookAt) {
    if (this._animating) cancelAnimationFrame(this._animating);

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();

    const step = () => {
      const t = Math.min((performance.now() - startTime) / ANIMATE_DURATION, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();

      this._animating = t < 1 ? requestAnimationFrame(step) : null;
    };

    this._animating = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /*  Grid                                                               */
  /* ------------------------------------------------------------------ */

  _updateGrid(maxDim, center) {
    this.scene.remove(this.gridHelper);
    const gridSize = Math.ceil(maxDim * 3);
    const divisions = Math.min(100, Math.max(10, Math.ceil(gridSize)));
    this.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x30363d, 0x1c2128);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.set(center.x, center.y, 0);
    this.gridHelper.visible = this.displaySettings.showGrid;
    this.scene.add(this.gridHelper);

    this.gridPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -center.z);
  }

  /* ------------------------------------------------------------------ */
  /*  Render loop                                                        */
  /* ------------------------------------------------------------------ */

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
