const SI_PREFIXES = [
  { exp: -15, prefix: 'f' },
  { exp: -12, prefix: 'p' },
  { exp:  -9, prefix: 'n' },
  { exp:  -6, prefix: 'µ' },
  { exp:  -3, prefix: 'm' },
  { exp:   0, prefix: ''  },
  { exp:   3, prefix: 'k' },
  { exp:   6, prefix: 'M' },
  { exp:   9, prefix: 'G' },
  { exp:  12, prefix: 'T' },
];

export function engFormat(value, unit = '') {
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const engExp = Math.floor(Math.log10(abs) / 3) * 3;
  const clamped = Math.max(-15, Math.min(12, engExp));
  const entry = SI_PREFIXES.find(p => p.exp === clamped);
  if (!entry) return `${value.toPrecision(3)} ${unit}`.trim();
  const scaled = abs / Math.pow(10, clamped);
  const digits = scaled >= 100 ? 1 : scaled >= 10 ? 2 : 3;
  return `${sign}${scaled.toFixed(digits)} ${entry.prefix}${unit}`.trim();
}

const PREFIX_MAP = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };

export function parseEngValue(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim();
  const plain = parseFloat(str);
  if (!isNaN(plain) && /^[-+]?[\d.]+([eE][-+]?\d+)?$/.test(str)) return plain;
  const match = str.match(/^([-+]?[\d.]+)\s*([fpnuµmkMGT])\s*\w*$/);
  if (match) {
    const num = parseFloat(match[1]);
    const mult = PREFIX_MAP[match[2]];
    if (mult !== undefined && !isNaN(num)) return num * mult;
  }
  return plain;
}
