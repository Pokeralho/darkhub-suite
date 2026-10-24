// Token-bucket rate limiter keyed by an arbitrary string (client id, connection id, "global"...).
// Clock is injectable for tests.

export class RateLimiter {
  /**
   * @param {{ capacity: number, perMs: number, now?: () => number, maxKeys?: number }} opts
   *   capacity tokens, refilled linearly so that `capacity` tokens come back every `perMs` milliseconds.
   */
  constructor({ capacity, perMs, now = Date.now, maxKeys = 1000 }) {
    if (!(capacity > 0) || !(perMs > 0)) throw new Error('Invalid rate limit')
    this.capacity = capacity
    this.ratePerMs = capacity / perMs
    this.now = now
    this.maxKeys = maxKeys
    this.buckets = new Map()
  }

  /** Consumes one token for `key`. Returns true when allowed. */
  take(key = 'global', cost = 1) {
    const t = this.now()
    let b = this.buckets.get(key)
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value)
      b = { tokens: this.capacity, at: t }
      this.buckets.set(key, b)
    } else {
      b.tokens = Math.min(this.capacity, b.tokens + (t - b.at) * this.ratePerMs)
      b.at = t
    }
    if (b.tokens < cost) return false
    b.tokens -= cost
    return true
  }

  /** Milliseconds until one token is available for `key` (0 when available now). */
  retryAfter(key = 'global') {
    const b = this.buckets.get(key)
    if (!b) return 0
    const tokens = Math.min(this.capacity, b.tokens + (this.now() - b.at) * this.ratePerMs)
    return tokens >= 1 ? 0 : Math.ceil((1 - tokens) / this.ratePerMs)
  }

  reset(key) {
    if (key == null) this.buckets.clear()
    else this.buckets.delete(key)
  }
}

/** The limits the bridge applies (per paired client unless noted). */
export function createBridgeLimiters(now = Date.now) {
  return {
    query: new RateLimiter({ capacity: 60, perMs: 60_000, now }),
    fill: new RateLimiter({ capacity: 20, perMs: 60_000, now }),
    check: new RateLimiter({ capacity: 20, perMs: 60_000, now }),
    save: new RateLimiter({ capacity: 6, perMs: 60_000, now }),
    // pairing prompts, per connection and globally
    pair: new RateLimiter({ capacity: 3, perMs: 10 * 60_000, now }),
    // failed handshakes / auth attempts, global: protects the secret and the tokens from brute force
    authFail: new RateLimiter({ capacity: 10, perMs: 10 * 60_000, now }),
    // any frame, per connection
    frames: new RateLimiter({ capacity: 120, perMs: 60_000, now })
  }
}
