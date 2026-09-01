

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

export function createErrorSensor(source = 'unknown', unit = '') {
  return createSensor(null, unit, source, {
    quality: 'unavailable',
    availability: 'error',
    status: 'Error'
  });
}

export function createLoadingSensor(unit, source) {
  return createSensor(null, unit, source, {
    quality: 'unavailable',
    availability: 'loading',
    status: 'Loading'
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
