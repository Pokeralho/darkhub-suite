

export function createSensor(value, unit, source, optsOrStatus = {}) {

  let opts = typeof optsOrStatus === 'string'
    ? { status: optsOrStatus }
    : (optsOrStatus ?? {});

  const isNull = value === null || value === undefined || (typeof value === 'number' && isNaN(value));
  const availability = opts.availability ?? (isNull ? 'unsupported' : 'available');
  const quality = opts.quality ?? (isNull ? 'unavailable' : 'high');
  const status = opts.status ?? (isNull ? 'Unavailable' : 'OK');

  return {
    value: isNull ? null : value,
    unit: unit ?? '',
    source: source ?? 'unknown',
    timestamp: Date.now(),
    quality,
    availability,
    status
  };
}

export function createUnavailableSensor(unit, source, reason = 'Unsupported') {
  return createSensor(null, unit, source, {
    quality: 'unavailable',
    availability: 'unsupported',
    status: reason
  });
}

export function classifyTemperature(value, component = 'cpu') {
  if (value === null || value === undefined) return 'Unavailable';
  const limits = {
    cpu:     { hot: 75, critical: 90 },
    gpu:     { hot: 80, critical: 95 },
    storage: { hot: 50, critical: 65 },
    system:  { hot: 60, critical: 80 }
  };
  const l = limits[component] ?? limits.cpu;
  if (value >= l.critical) return 'Critical';
  if (value >= l.hot) return 'Hot';
  return 'OK';
}

/** Daemon values: null/undefined/non-numeric stay null ("unavailable"), never become a measured 0. */
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Loose GPU name match across providers (DXGI, nvidia-smi, WMI/systeminformation, LHM). */
export function sameGpu(a, b) {
  const n = (s) => String(s || '').toLowerCase().replace(/\(r\)|\(tm\)|graphics|corporation|nvidia|amd|ati|intel|radeon|geforce|[^a-z0-9]/g, '');
  const x = n(a), y = n(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}
