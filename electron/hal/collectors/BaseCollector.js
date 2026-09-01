

export const DEFAULT_STALE_MS = 15000;

export class BaseCollector {
  constructor() {
    this._memoKey = null;
    this._memoValue = null;
  }

  _memo(key, build) {
    if (this._memoKey === key && this._memoValue !== null) return this._memoValue;
    const value = build();
    this._memoKey = key;
    this._memoValue = value;
    return value;
  }

  _freshness(lastUpdate, staleMs = DEFAULT_STALE_MS) {
    if (!lastUpdate) return 'disconnected';
    if (Date.now() - lastUpdate > staleMs) return 'dead';
    return 'ok';
  }
}

export default BaseCollector;
