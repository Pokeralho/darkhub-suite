

class ManagedProcessRegistry {
  constructor() {
    this._managed = new Map()
  }

  claim(pid, owner) {
    const n = Number(pid)
    if (!Number.isFinite(n) || n <= 0) return
    this._managed.set(n, owner)
  }

  release(pid) {
    const n = Number(pid)
    if (!Number.isFinite(n)) return
    this._managed.delete(n)
  }

  releaseAllBy(owner) {
    for (const [pid, o] of this._managed.entries()) {
      if (o === owner) this._managed.delete(pid)
    }
  }

  isManaged(pid) {
    return this._managed.has(Number(pid))
  }
}

export default new ManagedProcessRegistry()
