import { Editor3D } from './editor3d.js';
import { Sidebar } from './sidebar.js';
import { Results } from './results.js';
import { parseEngValue } from './utils.js';

class Model {
  constructor() {
    this.title = 'FastHenry Model';
    this.units = 'mm';
    this.defaults = { w: 1, h: 0.5, sigma: 5.8e4, nhinc: 1, nwinc: 1, rh: 2, rw: 2 };
    this.nodes = [];
    this.segments = [];
    this.groundPlanes = [];
    this.externals = [];
    this.equivs = [];
    this.freq = { fmin: 1e4, fmax: 1e8, ndec: 1 };
    this._nodeCounter = 0;
    this._segCounter = 0;
    this._gpCounter = 0;
  }

  nextNodeName() {
    this._nodeCounter++;
    while (this.nodes.find(n => n.name === `n${this._nodeCounter}`)) {
      this._nodeCounter++;
    }
    return `n${this._nodeCounter}`;
  }

  nextSegName() {
    this._segCounter++;
    while (this.segments.find(s => s.name === `e${this._segCounter}`)) {
      this._segCounter++;
    }
    return `e${this._segCounter}`;
  }

  nextGpName() {
    this._gpCounter++;
    while (this.groundPlanes.find(g => g.name === `g${this._gpCounter}`)) {
      this._gpCounter++;
    }
    return `g${this._gpCounter}`;
  }
}

class App {
  constructor() {
    this.model = new Model();
    this.results = new Results();
    this._splitSidebarWidthPx = 340;
    this._panelMaxWidthPx = 800;
    this.editor = new Editor3D(document.getElementById('viewport'), this);
    this.sidebar = new Sidebar(this);
    this._initModeButtons();
    this._initViewButtons();
    this._initConfigListeners();
    this._initResizer();
    this._initPanelWidthControls();
    this._initLayoutButtons();
  }

  _initModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.editor.setMode(btn.dataset.mode);
      });
    });
  }

  _initViewButtons() {
    document.getElementById('btn-fit').addEventListener('click', () => this.editor.fitView(this.model));
    document.getElementById('btn-top').addEventListener('click', () => this.editor.setViewTop());
    document.getElementById('btn-front').addEventListener('click', () => this.editor.setViewFront());
    document.getElementById('btn-right').addEventListener('click', () => this.editor.setViewRight());
    document.getElementById('btn-iso').addEventListener('click', () => this.editor.setViewIso());
  }

  _initConfigListeners() {
    document.getElementById('inp-units').addEventListener('change', (e) => {
      this.model.units = e.target.value;
    });
    for (const [id, key] of [['def-w','w'],['def-h','h'],['def-sigma','sigma'],['def-nwinc','nwinc'],['def-nhinc','nhinc']]) {
      document.getElementById(id).addEventListener('change', (e) => {
        this.model.defaults[key] = parseFloat(e.target.value);
      });
    }
    for (const [id, key] of [['freq-fmin','fmin'],['freq-fmax','fmax']]) {
      document.getElementById(id).addEventListener('change', (e) => {
        this.model.freq[key] = parseEngValue(e.target.value) || (key === 'fmin' ? 1e4 : 1e8);
      });
    }
    document.getElementById('freq-ndec').addEventListener('change', (e) => {
      this.model.freq.ndec = parseFloat(e.target.value) || 1;
    });
  }

  _initResizer() {
    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('sidebar');
    if (!resizer || !sidebar) return;

    let startX, startWidth;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (e) => {
        const w = Math.max(220, Math.min(900, startWidth + (startX - e.clientX)));
        sidebar.style.width = w + 'px';
        this._splitSidebarWidthPx = w;
        this.editor._onResize();
      };

      const onUp = () => {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _initLayoutButtons() {
    const layout = document.getElementById('app-layout');
    const sidebar = document.getElementById('sidebar');

    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        layout.classList.remove('full3d', 'fullpanel');
        const mode = btn.dataset.layout;
        if (mode === 'split') {
          sidebar.style.width = `${this._splitSidebarWidthPx}px`;
        } else {
          layout.classList.add(mode);
          // Full layouts should consume full available width.
          sidebar.style.width = '';
        }
        this._setPanelWidthControlsVisible(mode === 'fullpanel');

        setTimeout(() => this.editor._onResize(), 50);
      });
    });
  }

  _initPanelWidthControls() {
    const controls = document.getElementById('panel-width-controls');
    const range = document.getElementById('panel-width-range');
    const value = document.getElementById('panel-width-value');
    const layout = document.getElementById('app-layout');
    if (!controls || !range || !value || !layout) return;

    const applyPanelWidth = (widthPx) => {
      this._panelMaxWidthPx = widthPx;
      layout.style.setProperty('--panel-max-width', `${widthPx}px`);
      value.textContent = `${widthPx}px`;
    };

    applyPanelWidth(this._panelMaxWidthPx);
    range.value = String(this._panelMaxWidthPx);
    range.addEventListener('input', (e) => {
      const widthPx = parseInt(e.target.value, 10) || 800;
      applyPanelWidth(widthPx);
    });
  }

  _setPanelWidthControlsVisible(show) {
    const controls = document.getElementById('panel-width-controls');
    if (!controls) return;
    controls.style.display = show ? 'flex' : 'none';
  }

  setStatus(text) {
    document.getElementById('status-text').textContent = text;
  }

  _refresh() {
    const ds = this.sidebar.readDisplaySettings();
    this.editor.rebuild(this.model, ds);
    this.sidebar.refreshAll(this.model);
  }

  onDisplaySettingsChanged(settings) {
    this.editor.updateDisplay(settings);
  }

  deselectAll() {
    this.editor.deselectAll?.();
    document.querySelectorAll('#node-list .list-item, #seg-list .list-item').forEach(el => el.classList.remove('selected'));
  }

  // --- Node CRUD ---

  addNode(x, y, z, name) {
    if (!name) name = this.model.nextNodeName();
    name = name.toLowerCase();
    if (!name.startsWith('n')) name = 'n' + name;
    if (this.model.nodes.find(n => n.name === name)) {
      this.setStatus(`Node ${name} already exists`);
      return;
    }
    this.model.nodes.push({ name, x, y, z });
    this._refresh();
    this.editor.fitView(this.model);
    this.setStatus(`Added node ${name} at (${x}, ${y}, ${z})`);
  }

  removeNode(name) {
    this.model.nodes = this.model.nodes.filter(n => n.name !== name);
    this.model.segments = this.model.segments.filter(s => s.node1 !== name && s.node2 !== name);
    this.model.externals = this.model.externals.filter(e => e.node1 !== name && e.node2 !== name);
    this._refresh();
  }

  updateNode(oldName, updates) {
    const node = this.model.nodes.find(n => n.name === oldName);
    if (!node) return;

    const newName = updates.name || oldName;
    if (newName !== oldName && this.model.nodes.find(n => n.name === newName)) {
      this.setStatus(`Node ${newName} already exists`);
      return;
    }

    if (newName !== oldName) {
      for (const seg of this.model.segments) {
        if (seg.node1 === oldName) seg.node1 = newName;
        if (seg.node2 === oldName) seg.node2 = newName;
      }
      for (const ext of this.model.externals) {
        if (ext.node1 === oldName) ext.node1 = newName;
        if (ext.node2 === oldName) ext.node2 = newName;
      }
      for (const eq of this.model.equivs) {
        eq.nodes = eq.nodes.map(n => n === oldName ? newName : n);
      }
    }

    node.name = newName;
    if (updates.x !== undefined) node.x = updates.x;
    if (updates.y !== undefined) node.y = updates.y;
    if (updates.z !== undefined) node.z = updates.z;

    this._refresh();
    this.sidebar.showNodeProperties(node);
    this.setStatus(`Updated node ${newName}`);
  }

  selectNode(name) {
    document.querySelectorAll('#node-list .list-item').forEach(el => el.classList.remove('selected'));
    const items = document.querySelectorAll('#node-list .list-item');
    const idx = this.model.nodes.findIndex(n => n.name === name);
    if (idx >= 0 && items[idx]) items[idx].classList.add('selected');

    const node = this.model.nodes.find(n => n.name === name);
    if (node) this.sidebar.showNodeProperties(node);
  }

  // --- Segment CRUD ---

  addSegment(node1, node2, w, h) {
    const name = this.model.nextSegName();
    node1 = node1.toLowerCase();
    node2 = node2.toLowerCase();
    const seg = { name, node1, node2 };
    if (w !== undefined) seg.w = w;
    if (h !== undefined) seg.h = h;
    this.model.segments.push(seg);
    this._refresh();
    this.setStatus(`Added segment ${name}: ${node1} → ${node2}`);
  }

  removeSegment(name) {
    this.model.segments = this.model.segments.filter(s => s.name !== name);
    this._refresh();
  }

  updateSegment(name, updates) {
    const seg = this.model.segments.find(s => s.name === name);
    if (!seg) return;

    if (updates.node1) seg.node1 = updates.node1;
    if (updates.node2) seg.node2 = updates.node2;

    for (const key of ['w', 'h', 'sigma', 'nhinc', 'nwinc', 'rh', 'rw']) {
      if (updates[key] !== undefined) {
        seg[key] = updates[key];
      } else {
        delete seg[key];
      }
    }

    this._refresh();
    this.sidebar.showSegmentProperties(seg);
    this.setStatus(`Updated segment ${name}`);
  }

  selectSegment(name) {
    document.querySelectorAll('#seg-list .list-item').forEach(el => el.classList.remove('selected'));
    const items = document.querySelectorAll('#seg-list .list-item');
    const idx = this.model.segments.findIndex(s => s.name === name);
    if (idx >= 0 && items[idx]) items[idx].classList.add('selected');

    const seg = this.model.segments.find(s => s.name === name);
    if (seg) this.sidebar.showSegmentProperties(seg);
  }

  // --- Ground Planes ---

  addGroundPlane(vals) {
    const name = this.model.nextGpName();
    this.model.groundPlanes.push({
      name,
      x1: vals.x1, y1: vals.y1, z1: vals.z1 || 0,
      x2: vals.x2, y2: vals.y2, z2: vals.z2 || 0,
      x3: vals.x3, y3: vals.y3, z3: vals.z3 || 0,
      thick: vals.thick,
      seg1: Math.round(vals.seg1),
      seg2: Math.round(vals.seg2),
    });
    this._refresh();
    this.editor.fitView(this.model);
    this.setStatus(`Added ground plane ${name}`);
  }

  removeGroundPlane(name) {
    this.model.groundPlanes = this.model.groundPlanes.filter(g => g.name !== name);
    this._refresh();
  }

  // --- Externals / Equivs ---

  addExternal(node1, node2, portname) {
    node1 = node1.toLowerCase();
    node2 = node2.toLowerCase();
    this.model.externals.push({ node1, node2, portname: portname || undefined });
    this._refresh();
    this.setStatus(`Added external port: ${node1} → ${node2}`);
  }

  removeExternal(idx) {
    this.model.externals.splice(idx, 1);
    this._refresh();
  }

  addEquiv(nodes) {
    this.model.equivs.push({ nodes: nodes.map(n => n.toLowerCase()) });
    this._refresh();
  }

  removeEquiv(idx) {
    this.model.equivs.splice(idx, 1);
    this._refresh();
  }

  // --- STEP import ---

  importStepData(data) {
    const model = new Model();
    model.units = 'mm';

    for (const n of data.nodes) {
      model.nodes.push({ name: n.name.toLowerCase(), x: n.x, y: n.y, z: n.z });
    }
    for (const s of data.segments) {
      const seg = { name: s.name.toLowerCase(), node1: s.node1.toLowerCase(), node2: s.node2.toLowerCase() };
      if (s.w) seg.w = s.w;
      if (s.h) seg.h = s.h;
      model.segments.push(seg);
    }

    model._nodeCounter = model.nodes.length;
    model._segCounter = model.segments.length;

    this.model = model;
    this._refresh();
    this.editor.fitView(this.model);
    this.setStatus(`STEP imported: ${data.info || `${model.nodes.length} nodes, ${model.segments.length} segments`}`);
  }

  // --- .inp generation ---
  generateInp() {
    this._readConfig();
    const lines = [];
    lines.push(`* ${this.model.title}`);
    lines.push('');
    lines.push(`.units ${this.model.units}`);
    lines.push('');

    const d = this.model.defaults;
    const defParts = [];
    if (d.w) defParts.push(`w=${d.w}`);
    if (d.h) defParts.push(`h=${d.h}`);
    if (d.sigma) defParts.push(`sigma=${d.sigma}`);
    if (d.nhinc) defParts.push(`nhinc=${d.nhinc}`);
    if (d.nwinc) defParts.push(`nwinc=${d.nwinc}`);
    if (d.rh) defParts.push(`rh=${d.rh}`);
    if (d.rw) defParts.push(`rw=${d.rw}`);
    if (defParts.length) {
      lines.push(`.default ${defParts.join(' ')}`);
      lines.push('');
    }

    for (const gp of this.model.groundPlanes) {
      lines.push(`${gp.name} x1=${gp.x1} y1=${gp.y1} z1=${gp.z1} x2=${gp.x2} y2=${gp.y2} z2=${gp.z2}`);
      lines.push(`+  x3=${gp.x3} y3=${gp.y3} z3=${gp.z3}`);
      lines.push(`+  thick=${gp.thick}`);
      lines.push(`+  seg1=${gp.seg1} seg2=${gp.seg2}`);
      if (gp.gpNodes) {
        for (const gn of gp.gpNodes) {
          lines.push(`+  ${gn.name}  (${gn.x},${gn.y},${gn.z})`);
        }
      }
      if (gp.holes) {
        for (const hole of gp.holes) {
          lines.push(`+  ${hole}`);
        }
      }
      lines.push('');
    }

    const gpNodeNames = new Set();
    for (const gp of this.model.groundPlanes) {
      if (gp.gpNodes) {
        for (const gn of gp.gpNodes) gpNodeNames.add(gn.name);
      }
    }
    for (const node of this.model.nodes) {
      if (!gpNodeNames.has(node.name)) {
        lines.push(`${node.name} x=${node.x} y=${node.y} z=${node.z}`);
      }
    }
    if (this.model.nodes.length) lines.push('');

    for (const seg of this.model.segments) {
      let line = `${seg.name} ${seg.node1} ${seg.node2}`;
      if (seg.w !== undefined) line += ` w=${seg.w}`;
      if (seg.h !== undefined) line += ` h=${seg.h}`;
      if (seg.sigma !== undefined) line += ` sigma=${seg.sigma}`;
      if (seg.nhinc !== undefined) line += ` nhinc=${seg.nhinc}`;
      if (seg.nwinc !== undefined) line += ` nwinc=${seg.nwinc}`;
      if (seg.rh !== undefined) line += ` rh=${seg.rh}`;
      if (seg.rw !== undefined) line += ` rw=${seg.rw}`;
      lines.push(line);
    }
    if (this.model.segments.length) lines.push('');

    for (const eq of this.model.equivs) {
      lines.push(`.equiv ${eq.nodes.join(' ')}`);
    }
    if (this.model.equivs.length) lines.push('');

    for (const ext of this.model.externals) {
      let line = `.external ${ext.node1} ${ext.node2}`;
      if (ext.portname) line += ` ${ext.portname}`;
      lines.push(line);
    }
    if (this.model.externals.length) lines.push('');

    const f = this.model.freq;
    lines.push(`.freq fmin=${f.fmin} fmax=${f.fmax} ndec=${f.ndec}`);
    lines.push('');
    lines.push('.end');
    lines.push('');

    return lines.join('\n');
  }

  _readConfig() {
    this.model.units = document.getElementById('inp-units').value;
    this.model.defaults.w = parseFloat(document.getElementById('def-w').value) || undefined;
    this.model.defaults.h = parseFloat(document.getElementById('def-h').value) || undefined;
    this.model.defaults.sigma = parseFloat(document.getElementById('def-sigma').value) || undefined;
    this.model.defaults.nwinc = parseInt(document.getElementById('def-nwinc').value) || undefined;
    this.model.defaults.nhinc = parseInt(document.getElementById('def-nhinc').value) || undefined;
    this.model.freq.fmin = parseEngValue(document.getElementById('freq-fmin').value) || 1e4;
    this.model.freq.fmax = parseEngValue(document.getElementById('freq-fmax').value) || 1e8;
    this.model.freq.ndec = parseFloat(document.getElementById('freq-ndec').value) || 1;
  }

  exportInp() {
    const text = this.generateInp();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.inp';
    a.click();
    URL.revokeObjectURL(url);
    this.setStatus('Exported model.inp');
  }

  // --- .inp parsing ---
  importInp(text) {
    const model = new Model();
    const rawLines = text.split('\n');

    const joined = [];
    let lastContentIdx = -1;
    for (const raw of rawLines) {
      const trimmed = raw.trimStart();
      if (trimmed.startsWith('+')) {
        if (lastContentIdx >= 0) {
          joined[lastContentIdx] += ' ' + trimmed.substring(1).trim();
        }
      } else if (trimmed.startsWith('*') || trimmed === '') {
        joined.push(raw);
      } else {
        joined.push(raw);
        lastContentIdx = joined.length - 1;
      }
    }

    let titleRead = false;
    for (const line of joined) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('*')) {
        if (!titleRead && trimmed.startsWith('*')) {
          model.title = trimmed.substring(1).trim();
        }
        titleRead = true;
        continue;
      }
      titleRead = true;

      const lower = trimmed.toLowerCase();

      if (lower.startsWith('.end')) break;

      if (lower.startsWith('.units')) {
        model.units = trimmed.split(/\s+/)[1]?.toLowerCase() || 'mm';
      } else if (lower.startsWith('.default')) {
        this._parseDefaults(trimmed, model);
      } else if (lower.startsWith('.freq')) {
        this._parseFreq(trimmed, model);
      } else if (lower.startsWith('.external') || lower.startsWith('.extern ')) {
        this._parseExternal(trimmed, model);
      } else if (lower.startsWith('.equiv')) {
        this._parseEquiv(trimmed, model);
      } else if (lower.match(/^g\S*/i) && !lower.startsWith('.')) {
        this._parseGroundPlane(trimmed, model);
      } else if (lower.match(/^n\S*/i) && !lower.startsWith('.')) {
        this._parseNode(trimmed, model);
      } else if (lower.match(/^e\S*/i) && !lower.startsWith('.')) {
        this._parseSegment(trimmed, model);
      }
    }

    this.model = model;
    this._refresh();
    this.editor.fitView(this.model);
    this.setStatus(`Imported: ${model.nodes.length} nodes, ${model.segments.length} segments, ${model.groundPlanes.length} ground planes`);
  }

  _parseKV(text) {
    const kv = {};
    const re = /(\w+)\s*=\s*([^\s,]+)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      kv[m[1].toLowerCase()] = m[2];
    }
    return kv;
  }

  _parseNode(line, model) {
    const parts = line.split(/\s+/);
    const name = parts[0].toLowerCase();
    const kv = this._parseKV(line);
    const x = parseFloat(kv.x ?? model.defaults.x ?? 0);
    const y = parseFloat(kv.y ?? model.defaults.y ?? 0);
    const z = parseFloat(kv.z ?? model.defaults.z ?? 0);
    if (!model.nodes.find(n => n.name === name)) {
      model.nodes.push({ name, x, y, z });
    }
  }

  _parseSegment(line, model) {
    const parts = line.split(/\s+/);
    const name = parts[0].toLowerCase();
    let node1 = '', node2 = '';
    let idx = 1;
    while (idx < parts.length && !parts[idx].includes('=')) {
      if (!node1) node1 = parts[idx].toLowerCase();
      else if (!node2) node2 = parts[idx].toLowerCase();
      idx++;
    }
    if (!node1 || !node2) return;

    const kv = this._parseKV(line);
    const seg = { name, node1, node2 };
    if (kv.w !== undefined) seg.w = parseFloat(kv.w);
    if (kv.h !== undefined) seg.h = parseFloat(kv.h);
    if (kv.sigma !== undefined) seg.sigma = parseFloat(kv.sigma);
    if (kv.rho !== undefined) seg.rho = parseFloat(kv.rho);
    if (kv.nhinc !== undefined) seg.nhinc = parseInt(kv.nhinc);
    if (kv.nwinc !== undefined) seg.nwinc = parseInt(kv.nwinc);
    if (kv.rh !== undefined) seg.rh = parseFloat(kv.rh);
    if (kv.rw !== undefined) seg.rw = parseFloat(kv.rw);
    model.segments.push(seg);
  }

  _parseGroundPlane(line, model) {
    const firstWord = line.split(/\s+/)[0];
    const name = firstWord.toLowerCase();
    const kv = this._parseKV(line);

    const gp = {
      name,
      x1: parseFloat(kv.x1 || 0), y1: parseFloat(kv.y1 || 0), z1: parseFloat(kv.z1 || 0),
      x2: parseFloat(kv.x2 || 0), y2: parseFloat(kv.y2 || 0), z2: parseFloat(kv.z2 || 0),
      x3: parseFloat(kv.x3 || 0), y3: parseFloat(kv.y3 || 0), z3: parseFloat(kv.z3 || 0),
      thick: parseFloat(kv.thick || 1),
      seg1: parseInt(kv.seg1 || 10),
      seg2: parseInt(kv.seg2 || 10),
    };
    if (kv.sigma) gp.sigma = parseFloat(kv.sigma);
    if (kv.rho) gp.rho = parseFloat(kv.rho);
    if (kv.nhinc) gp.nhinc = parseInt(kv.nhinc);

    const nodeRe = /\b(n\w+)\s*\(\s*([\d.eE+\-]+)\s*,\s*([\d.eE+\-]+)\s*,\s*([\d.eE+\-]+)\s*\)/gi;
    let nm;
    gp.gpNodes = [];
    while ((nm = nodeRe.exec(line)) !== null) {
      gp.gpNodes.push({
        name: nm[1].toLowerCase(),
        x: parseFloat(nm[2]),
        y: parseFloat(nm[3]),
        z: parseFloat(nm[4]),
      });
    }

    gp.holes = [];
    const holeRe = /hole\s+(\w+)\s*\(([^)]+)\)/gi;
    let hm;
    while ((hm = holeRe.exec(line)) !== null) {
      gp.holes.push(`hole ${hm[1]} (${hm[2]})`);
    }

    model.groundPlanes.push(gp);

    for (const gn of gp.gpNodes) {
      if (!model.nodes.find(n => n.name === gn.name)) {
        model.nodes.push({ name: gn.name, x: gn.x, y: gn.y, z: gn.z });
      }
    }
  }

  _parseDefaults(line, model) {
    const kv = this._parseKV(line);
    if (kv.w !== undefined) model.defaults.w = parseFloat(kv.w);
    if (kv.h !== undefined) model.defaults.h = parseFloat(kv.h);
    if (kv.sigma !== undefined) model.defaults.sigma = parseFloat(kv.sigma);
    if (kv.nhinc !== undefined) model.defaults.nhinc = parseInt(kv.nhinc);
    if (kv.nwinc !== undefined) model.defaults.nwinc = parseInt(kv.nwinc);
    if (kv.rh !== undefined) model.defaults.rh = parseFloat(kv.rh);
    if (kv.rw !== undefined) model.defaults.rw = parseFloat(kv.rw);
    if (kv.z !== undefined) model.defaults.z = parseFloat(kv.z);
    if (kv.x !== undefined) model.defaults.x = parseFloat(kv.x);
    if (kv.y !== undefined) model.defaults.y = parseFloat(kv.y);
  }

  _parseFreq(line, model) {
    const kv = this._parseKV(line);
    if (kv.fmin !== undefined) model.freq.fmin = parseFloat(kv.fmin);
    if (kv.fmax !== undefined) model.freq.fmax = parseFloat(kv.fmax);
    if (kv.ndec !== undefined) model.freq.ndec = parseFloat(kv.ndec);
  }

  _parseExternal(line, model) {
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const ext = { node1: parts[1].toLowerCase(), node2: parts[2].toLowerCase() };
      if (parts.length >= 4) ext.portname = parts[3];
      model.externals.push(ext);
    }
  }

  _parseEquiv(line, model) {
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      model.equivs.push({ nodes: parts.slice(1).map(n => n.toLowerCase()) });
    }
  }

  // --- Run FastHenry ---
  async runFastHenry() {
    const inp = this.generateInp();
    const btn = document.getElementById('btn-run');
    btn.disabled = true;
    btn.textContent = 'Running...';
    this.setStatus('Running FastHenry...');

    const options = {};
    const solver = document.getElementById('opt-solver').value;
    if (solver) options.solver = solver;
    const matvec = document.getElementById('opt-matvec').value;
    if (matvec) options.matvec = matvec;
    const tol = document.getElementById('opt-tol').value;
    if (tol) options.tol = parseFloat(tol);
    const maxiters = document.getElementById('opt-maxiters').value;
    if (maxiters) options.maxiters = parseInt(maxiters);

    try {
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inp, options }),
      });
      const data = await resp.json();

      document.getElementById('console-panel').style.display = '';
      document.getElementById('console-output').textContent = data.stdout + (data.stderr || '');

      if (data.returncode !== 0) {
        this.setStatus(`FastHenry exited with code ${data.returncode}`);
      } else {
        this.setStatus('FastHenry completed successfully');
        if (data.zc_mat) {
          this.results.show(data.zc_mat);
        }
      }
    } catch (e) {
      this.setStatus(`Error: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run FastHenry';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
