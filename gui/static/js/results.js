import { engFormat } from './utils.js';

export class Results {
  constructor() {
    this.rChart = null;
    this.lChart = null;
  }

  parseZcMat(text) {
    if (!text || !text.trim()) return null;
    const lines = text.split('\n');
    const ports = [];
    const freqData = [];
    let i = 0;

    while (i < lines.length && lines[i].startsWith('Row')) {
      const m = lines[i].match(/Row\s+(\d+):\s+(\S+)\s+to\s+(\S+)(?:,\s+port\s+name:\s+(\S+))?/i);
      if (m) {
        ports.push({
          row: parseInt(m[1]),
          node1: m[2],
          node2: m[3],
          portname: m[4] || `port${m[1]}`,
        });
      }
      i++;
    }

    while (i < lines.length) {
      const fMatch = lines[i].match(/Impedance matrix for frequency\s*=\s*([\d.eE+\-]+)\s+(\d+)\s*x\s*(\d+)/i);
      if (fMatch) {
        const freq = parseFloat(fMatch[1]);
        const rows = parseInt(fMatch[2]);
        const cols = parseInt(fMatch[3]);
        const matrix = [];
        i++;

        for (let r = 0; r < rows && i < lines.length; r++, i++) {
          const entries = [];
          const re = /([-+]?[\d.]+[eE][-+]?\d+|[-+]?[\d.]+)\s+([-+][\d.]+[eE][-+]?\d+|[-+][\d.]+)j/g;
          let match;
          while ((match = re.exec(lines[i])) !== null) {
            entries.push({ real: parseFloat(match[1]), imag: parseFloat(match[2]) });
          }
          matrix.push(entries);
        }

        freqData.push({ freq, rows, cols, matrix });
      } else {
        i++;
      }
    }

    return { ports, freqData };
  }

  show(zcText) {
    const data = this.parseZcMat(zcText);
    if (!data || data.freqData.length === 0) {
      document.getElementById('results-info').textContent = 'No results to display.';
      document.getElementById('results-panel').style.display = '';
      return;
    }

    document.getElementById('results-panel').style.display = '';

    const n = data.freqData[0].rows;
    document.getElementById('results-info').textContent =
      `${data.freqData.length} frequency points, ${n}x${n} impedance matrix, ` +
      `${data.ports.map(p => p.portname).join(', ')}`;

    this._plotResistance(data);
    this._plotInductance(data);
    this._showTables(data);
  }

  _plotResistance(data) {
    const ctx = document.getElementById('chart-resistance');
    if (this.rChart) this.rChart.destroy();

    const n = data.freqData[0].rows;
    const datasets = [];
    const colors = ['#4493f8', '#f85149', '#3fb950', '#d29922', '#a371f7', '#f778ba'];

    for (let r = 0; r < n; r++) {
      for (let c = r; c < n; c++) {
        const label = r === c
          ? `R${r + 1}${r + 1} (${data.ports[r]?.portname || '?'})`
          : `R${r + 1}${c + 1}`;
        datasets.push({
          label,
          data: data.freqData.map(fd => ({
            x: fd.freq,
            y: fd.matrix[r]?.[c]?.real ?? 0,
          })),
          borderColor: colors[(r * n + c) % colors.length],
          backgroundColor: 'transparent',
          showLine: true,
          tension: 0.3,
          pointRadius: 1.5,
          borderWidth: 1.5,
        });
      }
    }

    this.rChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: this._chartOptions('Resistance vs Frequency', 'Frequency', 'R (Ω)', 'Ω', 'Hz'),
    });
  }

  _plotInductance(data) {
    const ctx = document.getElementById('chart-inductance');
    if (this.lChart) this.lChart.destroy();

    const n = data.freqData[0].rows;
    const datasets = [];
    const colors = ['#4493f8', '#f85149', '#3fb950', '#d29922', '#a371f7', '#f778ba'];

    for (let r = 0; r < n; r++) {
      for (let c = r; c < n; c++) {
        const label = r === c
          ? `L${r + 1}${r + 1} (${data.ports[r]?.portname || '?'})`
          : `L${r + 1}${c + 1}`;
        datasets.push({
          label,
          data: data.freqData.map(fd => {
            const omega = 2 * Math.PI * fd.freq;
            const imagPart = fd.matrix[r]?.[c]?.imag ?? 0;
            return { x: fd.freq, y: omega > 0 ? imagPart / omega : 0 };
          }),
          borderColor: colors[(r * n + c) % colors.length],
          backgroundColor: 'transparent',
          showLine: true,
          tension: 0.3,
          pointRadius: 1.5,
          borderWidth: 1.5,
        });
      }
    }

    this.lChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: this._chartOptions('Inductance vs Frequency', 'Frequency', 'L (H)', 'H', 'Hz'),
    });
  }

  _chartOptions(title, xLabel, yLabel, yUnit, xUnit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title, color: '#e6edf3', font: { size: 12 } },
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#8b949e', font: { size: 10 }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const ds = ctx.dataset.label || '';
              const xVal = engFormat(ctx.parsed.x, xUnit);
              const yVal = engFormat(ctx.parsed.y, yUnit);
              return `${ds}: ${yVal} @ ${xVal}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: xLabel, color: '#8b949e', font: { size: 10 } },
          ticks: {
            color: '#8b949e',
            font: { size: 9 },
            callback(value) { return engFormat(value, xUnit); },
          },
          grid: { color: '#1c2128' },
        },
        y: {
          title: { display: true, text: yLabel, color: '#8b949e', font: { size: 10 } },
          ticks: {
            color: '#8b949e',
            font: { size: 9 },
            callback(value) { return engFormat(value, yUnit); },
          },
          grid: { color: '#1c2128' },
        },
      },
    };
  }

  _showTables(data) {
    const container = document.getElementById('impedance-tables');
    container.innerHTML = '';

    const maxTables = Math.min(data.freqData.length, 5);
    const step = data.freqData.length <= maxTables ? 1 : Math.floor(data.freqData.length / maxTables);

    for (let fi = 0; fi < data.freqData.length; fi += step) {
      const fd = data.freqData[fi];
      const table = document.createElement('table');
      table.className = 'z-table';

      const caption = document.createElement('caption');
      caption.textContent = `f = ${engFormat(fd.freq, 'Hz')}`;
      table.appendChild(caption);

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.innerHTML = '<th></th>';
      for (let c = 0; c < fd.cols; c++) {
        headRow.innerHTML += `<th>${data.ports[c]?.portname || `Col${c + 1}`}</th>`;
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let r = 0; r < fd.rows; r++) {
        const row = document.createElement('tr');
        row.innerHTML = `<th>${data.ports[r]?.portname || `Row${r + 1}`}</th>`;
        for (let c = 0; c < fd.cols; c++) {
          const entry = fd.matrix[r]?.[c];
          if (entry) {
            const omega = 2 * Math.PI * fd.freq;
            const L = omega > 0 ? entry.imag / omega : 0;
            const rStr = engFormat(entry.real, 'Ω');
            const lStr = engFormat(L, 'H');
            row.innerHTML += `<td>${entry.real.toExponential(3)} + j${entry.imag.toExponential(3)}<br><small>R=${rStr}, L=${lStr}</small></td>`;
          } else {
            row.innerHTML += '<td>-</td>';
          }
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      container.appendChild(table);
    }
  }
}
