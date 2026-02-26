import { engFormat, parseEngValue } from './utils.js';

export class Sidebar {
  constructor(app) {
    this.app = app;
    this._initPanelToggles();
    this._initNodeForm();
    this._initSegForm();
    this._initGpForm();
    this._initExtForm();
    this._initEquivForm();
    this._initIO();
    this._initRun();
    this._initExamples();
    this._initDisplaySettings();
    this._initPropertiesPanel();
    this._initStepImport();
    this._initFreqInputs();
  }

  _initPanelToggles() {
    document.querySelectorAll('.panel-header[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.panel').classList.toggle('collapsed');
      });
    });
  }

  _initNodeForm() {
    document.getElementById('btn-add-node').addEventListener('click', () => {
      const x = parseFloat(document.getElementById('node-x').value);
      const y = parseFloat(document.getElementById('node-y').value);
      const z = parseFloat(document.getElementById('node-z').value);
      if (isNaN(x) || isNaN(y) || isNaN(z)) return;
      const name = document.getElementById('node-name').value.trim() || null;
      this.app.addNode(x, y, z, name);
      document.getElementById('node-x').value = '';
      document.getElementById('node-y').value = '';
      document.getElementById('node-name').value = '';
    });
  }

  _initSegForm() {
    document.getElementById('btn-add-seg').addEventListener('click', () => {
      const n1 = document.getElementById('seg-node1').value;
      const n2 = document.getElementById('seg-node2').value;
      if (!n1 || !n2 || n1 === n2) return;
      const w = parseFloat(document.getElementById('seg-w').value) || undefined;
      const h = parseFloat(document.getElementById('seg-h').value) || undefined;
      this.app.addSegment(n1, n2, w, h);
    });
  }

  _initGpForm() {
    document.getElementById('btn-add-gp').addEventListener('click', () => {
      const fields = ['gp-x1','gp-y1','gp-z1','gp-x2','gp-y2','gp-z2','gp-x3','gp-y3','gp-z3','gp-thick','gp-seg1','gp-seg2'];
      const vals = {};
      for (const f of fields) {
        vals[f.replace('gp-', '')] = parseFloat(document.getElementById(f).value);
      }
      if (isNaN(vals.x1) || isNaN(vals.y1) || isNaN(vals.x2) || isNaN(vals.y2) || isNaN(vals.x3) || isNaN(vals.y3)) return;
      if (isNaN(vals.thick) || isNaN(vals.seg1) || isNaN(vals.seg2)) return;
      this.app.addGroundPlane(vals);
    });
  }

  _initExtForm() {
    document.getElementById('btn-add-ext').addEventListener('click', () => {
      const n1 = document.getElementById('ext-node1').value;
      const n2 = document.getElementById('ext-node2').value;
      const name = document.getElementById('ext-name').value.trim();
      if (!n1 || !n2) return;
      this.app.addExternal(n1, n2, name);
      document.getElementById('ext-name').value = '';
    });
  }

  _initEquivForm() {
    document.getElementById('btn-add-equiv').addEventListener('click', () => {
      const text = document.getElementById('equiv-nodes').value.trim();
      if (!text) return;
      const nodes = text.split(/\s+/);
      if (nodes.length < 2) return;
      this.app.addEquiv(nodes);
      document.getElementById('equiv-nodes').value = '';
    });
  }

  _initIO() {
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.app.importInp(reader.result);
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    document.getElementById('btn-export').addEventListener('click', () => {
      this.app.exportInp();
    });
  }

  _initRun() {
    document.getElementById('btn-run').addEventListener('click', () => {
      this.app.runFastHenry();
    });
  }

  _initExamples() {
    fetch('/api/examples')
      .then(r => r.json())
      .then(examples => {
        const sel = document.getElementById('example-select');
        for (const name of examples) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          sel.appendChild(opt);
        }
      })
      .catch(() => {});

    document.getElementById('example-select').addEventListener('change', (e) => {
      const name = e.target.value;
      if (!name) return;
      fetch(`/api/example/${name}`)
        .then(r => r.text())
        .then(content => {
          this.app.importInp(content);
        });
      e.target.value = '';
    });
  }

  _initDisplaySettings() {
    const rangeIds = [
      ['disp-node-size', 'disp-node-size-val'],
      ['disp-label-size', 'disp-label-size-val'],
      ['disp-seg-opacity', 'disp-seg-opacity-val'],
      ['disp-gp-opacity', 'disp-gp-opacity-val'],
    ];

    for (const [inputId, valId] of rangeIds) {
      const input = document.getElementById(inputId);
      const valSpan = document.getElementById(valId);
      input.addEventListener('input', () => {
        valSpan.textContent = parseFloat(input.value).toFixed(2);
        this._emitDisplayChange();
      });
    }

    const otherIds = ['disp-node-color', 'disp-seg-color', 'disp-labels', 'disp-grid'];
    for (const id of otherIds) {
      document.getElementById(id).addEventListener('change', () => this._emitDisplayChange());
    }
  }

  _emitDisplayChange() {
    const settings = this.readDisplaySettings();
    this.app.onDisplaySettingsChanged(settings);
  }

  readDisplaySettings() {
    return {
      nodeSize: parseFloat(document.getElementById('disp-node-size').value),
      labelSize: parseFloat(document.getElementById('disp-label-size').value),
      showLabels: document.getElementById('disp-labels').checked,
      nodeColor: document.getElementById('disp-node-color').value,
      segColor: document.getElementById('disp-seg-color').value,
      segOpacity: parseFloat(document.getElementById('disp-seg-opacity').value),
      gpOpacity: parseFloat(document.getElementById('disp-gp-opacity').value),
      showGrid: document.getElementById('disp-grid').checked,
    };
  }

  _initPropertiesPanel() {
    document.getElementById('btn-deselect').addEventListener('click', () => {
      this.hideProperties();
      this.app.deselectAll();
    });
  }

  _initStepImport() {
    const btn = document.getElementById('btn-import-step');
    const fileInput = document.getElementById('step-input');

    fetch('/api/step-available')
      .then(r => r.json())
      .then(data => {
        if (!data.available) {
          btn.title = 'STEP import requires cadquery or gmsh. pip install cadquery';
          btn.style.opacity = '0.5';
        } else {
          btn.title = `STEP import via ${data.backend}`;
        }
      })
      .catch(() => {
        btn.title = 'Server not reachable';
      });

    btn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';

      this.app.setStatus(`Importing STEP file: ${file.name}...`);
      btn.disabled = true;

      try {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch('/api/import-step', { method: 'POST', body: form });
        const data = await resp.json();

        if (data.error) {
          this.app.setStatus(`STEP error: ${data.error}`);
          return;
        }

        this.app.importStepData(data);
      } catch (err) {
        this.app.setStatus(`STEP import failed: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  _initFreqInputs() {
    for (const id of ['freq-fmin', 'freq-fmax']) {
      const input = document.getElementById(id);
      const hint = document.getElementById(id + '-hint');

      input.addEventListener('input', () => {
        const hz = parseEngValue(input.value);
        if (!isNaN(hz) && hz > 0) {
          hint.textContent = '= ' + engFormat(hz, 'Hz');
          hint.style.color = '';
        } else {
          hint.textContent = 'invalid';
          hint.style.color = 'var(--danger)';
        }
      });

      input.addEventListener('blur', () => {
        const hz = parseEngValue(input.value);
        if (!isNaN(hz) && hz > 0) {
          input.value = engFormat(hz, 'Hz');
          hint.textContent = '';
        }
      });
    }
  }

  showNodeProperties(node) {
    const panel = document.getElementById('properties-panel');
    const body = document.getElementById('properties-body');
    panel.style.display = '';

    body.innerHTML = `
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">NODE</div>
      <div class="prop-row">
        <label>Name</label>
        <input type="text" id="prop-node-name" value="${node.name}">
      </div>
      <div class="prop-row">
        <label>X</label>
        <input type="number" id="prop-node-x" value="${node.x}" step="any">
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input type="number" id="prop-node-y" value="${node.y}" step="any">
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input type="number" id="prop-node-z" value="${node.z}" step="any">
      </div>
      <div class="prop-actions">
        <button class="btn btn-sm btn-success" id="prop-save">Save</button>
        <button class="btn btn-sm btn-danger" id="prop-delete">Delete</button>
      </div>`;

    document.getElementById('prop-save').addEventListener('click', () => {
      const newName = document.getElementById('prop-node-name').value.trim().toLowerCase();
      const x = parseFloat(document.getElementById('prop-node-x').value);
      const y = parseFloat(document.getElementById('prop-node-y').value);
      const z = parseFloat(document.getElementById('prop-node-z').value);
      if (isNaN(x) || isNaN(y) || isNaN(z) || !newName) return;
      this.app.updateNode(node.name, { name: newName, x, y, z });
    });

    document.getElementById('prop-delete').addEventListener('click', () => {
      this.app.removeNode(node.name);
      this.hideProperties();
    });
  }

  showSegmentProperties(seg) {
    const panel = document.getElementById('properties-panel');
    const body = document.getElementById('properties-body');
    panel.style.display = '';

    const d = this.app.model.defaults;
    const nodeOptions = this.app.model.nodes.map(n =>
      `<option value="${n.name}">${n.name}</option>`
    ).join('');

    body.innerHTML = `
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">SEGMENT</div>
      <div class="prop-row">
        <label>Name</label>
        <input type="text" id="prop-seg-name" value="${seg.name}" readonly style="opacity:0.6">
      </div>
      <div class="prop-row">
        <label>Node 1</label>
        <select id="prop-seg-n1">${nodeOptions}</select>
      </div>
      <div class="prop-row">
        <label>Node 2</label>
        <select id="prop-seg-n2">${nodeOptions}</select>
      </div>
      <div class="prop-row">
        <label>w</label>
        <input type="number" id="prop-seg-w" value="${seg.w ?? ''}" step="any" placeholder="${d.w ?? 1}">
      </div>
      <div class="prop-row">
        <label>h</label>
        <input type="number" id="prop-seg-h" value="${seg.h ?? ''}" step="any" placeholder="${d.h ?? 0.5}">
      </div>
      <div class="prop-row">
        <label>sigma</label>
        <input type="number" id="prop-seg-sigma" value="${seg.sigma ?? ''}" step="any" placeholder="${d.sigma ?? '5.8e4'}">
      </div>
      <div class="prop-row">
        <label>nhinc</label>
        <input type="number" id="prop-seg-nhinc" value="${seg.nhinc ?? ''}" step="1" min="1" placeholder="${d.nhinc ?? 1}">
      </div>
      <div class="prop-row">
        <label>nwinc</label>
        <input type="number" id="prop-seg-nwinc" value="${seg.nwinc ?? ''}" step="1" min="1" placeholder="${d.nwinc ?? 1}">
      </div>
      <div class="prop-row">
        <label>rh</label>
        <input type="number" id="prop-seg-rh" value="${seg.rh ?? ''}" step="any" placeholder="${d.rh ?? 2}">
      </div>
      <div class="prop-row">
        <label>rw</label>
        <input type="number" id="prop-seg-rw" value="${seg.rw ?? ''}" step="any" placeholder="${d.rw ?? 2}">
      </div>
      <div class="prop-actions">
        <button class="btn btn-sm btn-success" id="prop-save">Save</button>
        <button class="btn btn-sm btn-danger" id="prop-delete">Delete</button>
      </div>`;

    document.getElementById('prop-seg-n1').value = seg.node1;
    document.getElementById('prop-seg-n2').value = seg.node2;

    document.getElementById('prop-save').addEventListener('click', () => {
      const updates = {
        node1: document.getElementById('prop-seg-n1').value,
        node2: document.getElementById('prop-seg-n2').value,
      };
      const fields = ['w', 'h', 'sigma', 'nhinc', 'nwinc', 'rh', 'rw'];
      for (const f of fields) {
        const val = document.getElementById(`prop-seg-${f}`).value;
        updates[f] = val !== '' ? parseFloat(val) : undefined;
      }
      this.app.updateSegment(seg.name, updates);
    });

    document.getElementById('prop-delete').addEventListener('click', () => {
      this.app.removeSegment(seg.name);
      this.hideProperties();
    });
  }

  hideProperties() {
    document.getElementById('properties-panel').style.display = 'none';
  }

  refreshAll(model) {
    this._refreshNodeList(model);
    this._refreshSegList(model);
    this._refreshGpList(model);
    this._refreshExtList(model);
    this._refreshEquivList(model);
    this._refreshNodeSelects(model);
    this._refreshConfigFromModel(model);
  }

  _refreshConfigFromModel(model) {
    document.getElementById('inp-units').value = model.units;
    if (model.defaults.w) document.getElementById('def-w').value = model.defaults.w;
    if (model.defaults.h) document.getElementById('def-h').value = model.defaults.h;
    if (model.defaults.sigma) document.getElementById('def-sigma').value = model.defaults.sigma;
    if (model.defaults.nwinc) document.getElementById('def-nwinc').value = model.defaults.nwinc;
    if (model.defaults.nhinc) document.getElementById('def-nhinc').value = model.defaults.nhinc;
    document.getElementById('freq-fmin').value = engFormat(model.freq.fmin, 'Hz');
    document.getElementById('freq-fmax').value = engFormat(model.freq.fmax, 'Hz');
    document.getElementById('freq-ndec').value = model.freq.ndec;
  }

  _refreshNodeList(model) {
    const list = document.getElementById('node-list');
    list.innerHTML = '';
    document.getElementById('node-count').textContent = model.nodes.length;
    for (const node of model.nodes) {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <span class="node-dot" style="background:var(--node-color)"></span>
        <span class="item-label">${node.name} (${node.x}, ${node.y}, ${node.z})</span>
        <span class="item-actions">
          <button class="btn-danger" data-edit-node="${node.name}">edit</button>
          <button class="btn-danger" data-del-node="${node.name}">&times;</button>
        </span>`;
      item.addEventListener('click', (e) => {
        if (!e.target.dataset.delNode && !e.target.dataset.editNode) {
          this.app.selectNode(node.name);
        }
      });
      list.appendChild(item);
    }
    list.querySelectorAll('[data-edit-node]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const n = model.nodes.find(n => n.name === btn.dataset.editNode);
        if (n) this.showNodeProperties(n);
      });
    });
    list.querySelectorAll('[data-del-node]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.removeNode(btn.dataset.delNode);
      });
    });
  }

  _refreshSegList(model) {
    const list = document.getElementById('seg-list');
    list.innerHTML = '';
    document.getElementById('seg-count').textContent = model.segments.length;
    for (const seg of model.segments) {
      const item = document.createElement('div');
      item.className = 'list-item';
      const ew = seg.w ?? model.defaults.w ?? '?';
      const eh = seg.h ?? model.defaults.h ?? '?';
      const wh = `w=${ew} h=${eh}`;
      item.innerHTML = `
        <span class="node-dot" style="background:var(--seg-color)"></span>
        <span class="item-label">${seg.name}: ${seg.node1} → ${seg.node2} (${wh})</span>
        <span class="item-actions">
          <button class="btn-danger" data-edit-seg="${seg.name}">edit</button>
          <button class="btn-danger" data-del-seg="${seg.name}">&times;</button>
        </span>`;
      item.addEventListener('click', (e) => {
        if (!e.target.dataset.delSeg && !e.target.dataset.editSeg) {
          this.app.selectSegment(seg.name);
        }
      });
      list.appendChild(item);
    }
    list.querySelectorAll('[data-edit-seg]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = model.segments.find(s => s.name === btn.dataset.editSeg);
        if (s) this.showSegmentProperties(s);
      });
    });
    list.querySelectorAll('[data-del-seg]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.removeSegment(btn.dataset.delSeg);
      });
    });
  }

  _refreshGpList(model) {
    const list = document.getElementById('gp-list');
    list.innerHTML = '';
    document.getElementById('gp-count').textContent = model.groundPlanes.length;
    for (const gp of model.groundPlanes) {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <span class="node-dot" style="background:var(--gp-color)"></span>
        <span class="item-label">${gp.name}: seg ${gp.seg1}x${gp.seg2}, thick=${gp.thick}</span>
        <span class="item-actions">
          <button class="btn-danger" data-del-gp="${gp.name}">&times;</button>
        </span>`;
      list.appendChild(item);
    }
    list.querySelectorAll('[data-del-gp]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.removeGroundPlane(btn.dataset.delGp);
      });
    });
  }

  _refreshExtList(model) {
    const list = document.getElementById('ext-list');
    list.innerHTML = '';
    document.getElementById('ext-count').textContent = model.externals.length;
    for (let i = 0; i < model.externals.length; i++) {
      const ext = model.externals[i];
      const item = document.createElement('div');
      item.className = 'list-item';
      const label = ext.portname ? `${ext.portname}: ` : '';
      item.innerHTML = `
        <span class="node-dot" style="background:var(--ext-color)"></span>
        <span class="item-label">${label}${ext.node1} → ${ext.node2}</span>
        <span class="item-actions">
          <button class="btn-danger" data-del-ext="${i}">&times;</button>
        </span>`;
      list.appendChild(item);
    }
    list.querySelectorAll('[data-del-ext]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.removeExternal(parseInt(btn.dataset.delExt));
      });
    });
  }

  _refreshEquivList(model) {
    const list = document.getElementById('equiv-list');
    list.innerHTML = '';
    document.getElementById('equiv-count').textContent = model.equivs.length;
    for (let i = 0; i < model.equivs.length; i++) {
      const eq = model.equivs[i];
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <span class="item-label">${eq.nodes.join(' = ')}</span>
        <span class="item-actions">
          <button class="btn-danger" data-del-equiv="${i}">&times;</button>
        </span>`;
      list.appendChild(item);
    }
    list.querySelectorAll('[data-del-equiv]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.removeEquiv(parseInt(btn.dataset.delEquiv));
      });
    });
  }

  _refreshNodeSelects(model) {
    const selects = ['seg-node1', 'seg-node2', 'ext-node1', 'ext-node2'];
    const placeholders = ['Node 1', 'Node 2', '+ Node', '- Node'];
    for (let i = 0; i < selects.length; i++) {
      const sel = document.getElementById(selects[i]);
      const current = sel.value;
      sel.innerHTML = `<option value="">${placeholders[i]}</option>`;
      for (const node of model.nodes) {
        const opt = document.createElement('option');
        opt.value = node.name;
        opt.textContent = node.name;
        sel.appendChild(opt);
      }
      sel.value = current;
    }
  }
}
