// Drives DarkHub.SysOps.exe (native_sysops/, Rust): the Optimizer's registry reads and writes as one JSON request on
// stdin and one JSON response on stdout, instead of a PowerShell script built as text. ~7 ms per call against ~180 ms
// (or seconds on slow PCs) for powershell.exe, and no script string to escape.
//
// Every function returns null when the helper cannot be used (not Windows, missing, failed integrity check, disabled,
// crashed or bad output): the caller then falls back to the PowerShell path, so a broken helper never breaks the
// Optimizer. Set DARKHUB_OPTIMIZER_ENGINE=powershell (or call setEngine('powershell')) to force the old path.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { integrityError } from '../binaryIntegrity.js';
import Logger from '../LoggerService.js';
import { parseRegistryReadOutput, validateChange } from './OptimizerUtils.js';

const PROTOCOL = 1;

function defaultExe() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), '..', 'DarkHub.SysOps.exe');
}

let exePath = defaultExe();
let engine = String(process.env.DARKHUB_OPTIMIZER_ENGINE || 'native').toLowerCase() === 'powershell' ? 'powershell' : 'native';
let execFileImpl = execFile;
let checkIntegrity = () => integrityError(['DarkHub.SysOps.exe'], { log: (m) => Logger.warn('SysOps', m) });
let warned = false;
let announced = false;

/** 'native' (default) or 'powershell'. */
export function setEngine(name) {
  engine = name === 'powershell' ? 'powershell' : 'native';
}
export function getEngine() {
  return engine;
}

/** Tests only. */
export function _configure({ exe, exec, integrity } = {}) {
  if (exe !== undefined) exePath = exe;
  if (exec !== undefined) execFileImpl = exec;
  if (integrity !== undefined) checkIntegrity = integrity;
}

// The integrity verdict is cached per file state (path, size, mtime): hashing on every call would add work to each
// registry read, and a replaced file changes size or mtime, which runs the check again.
let integrityCache = { stamp: '', fn: null, error: null };
function integrityVerdict() {
  let st;
  try { st = fs.statSync(exePath); } catch { return 'missing'; }
  const stamp = `${exePath}|${st.size}|${st.mtimeMs}`;
  if (integrityCache.stamp !== stamp || integrityCache.fn !== checkIntegrity) {
    integrityCache = { stamp, fn: checkIntegrity, error: checkIntegrity?.() || null };
  }
  return integrityCache.error;
}

export function available() {
  if (engine !== 'native' || process.platform !== 'win32') return false;
  const tampered = integrityVerdict();
  if (tampered === 'missing') return false;
  if (tampered) {
    if (!warned) { warned = true; Logger.warn('SysOps', `helper refused, using PowerShell: ${tampered}`); }
    return false;
  }
  return true;
}

/** Sends one request; resolves the parsed response or null. */
function request(body, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFileImpl(exePath, [], { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 << 20 }, (err, stdout) => {
        const line = String(stdout || '').trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
        let res = null;
        try { res = line ? JSON.parse(line) : null; } catch { res = null; }
        if (!res || res.v !== PROTOCOL || res.ok !== true || !Array.isArray(res.results)) {
          Logger.warn('SysOps', `helper failed: ${err?.message || res?.error || 'no output'}`);
          resolve(null);
          return;
        }
        if (!announced) { announced = true; Logger.info('SysOps', `native registry engine active (${exePath})`); }
        resolve(res);
      });
    } catch (e) {
      Logger.warn('SysOps', `cannot start helper: ${e?.message || e}`);
      resolve(null);
      return;
    }
    child?.stdin?.on?.('error', () => {});
    child?.stdin?.end?.(JSON.stringify({ v: PROTOCOL, ...body }));
  });
}

/** Turns an Optimizer change ({ key, name, type, data, deleteValue, deleteKey, deleteKeyIfEmpty }) into a helper op. */
export function changeToOp(c) {
  if (c.deleteKeyIfEmpty) return { op: 'reg.deleteKeyIfEmpty', key: c.key };
  if (c.deleteKey) return { op: 'reg.deleteKey', key: c.key };
  if (c.deleteValue) return { op: 'reg.deleteValue', key: c.key, name: c.name || '' };
  return { op: 'reg.set', key: c.key, name: c.name || '', type: c.type || 'REG_SZ', data: c.data ?? '' };
}

/**
 * Reads many values. Resolves Map<regEntryId, entry> (same shape as parseRegistryReadOutput) or null.
 */
export async function readRegistry(entries, opts = {}) {
  if (!available()) return null;
  const ops = entries.map((e) => ({ op: 'reg.read', key: String(e.key || ''), name: String(e.name || '') }));
  if (!ops.length) return new Map();
  const res = await request({ ops }, opts);
  if (!res || res.results.length !== ops.length) return null;
  return parseRegistryReadOutput(JSON.stringify(res.results));
}

/**
 * Applies changes in order. Resolves an array of { ok, message } aligned with `changes`, or null.
 * Invalid definitions are rejected here (same message as the PowerShell path) and never reach the helper.
 * `dryRun` only validates (nothing is written).
 */
export async function writeRegistry(changes, { dryRun = false, audit = true, ...opts } = {}) {
  if (!available()) return null;
  const results = new Array(changes.length).fill(null);
  const send = [];
  changes.forEach((c, i) => {
    if (!validateChange(c)) results[i] = { ok: false, message: 'definição inválida' };
    else send.push(i);
  });
  if (send.length) {
    const res = await request({ dryRun, ops: send.map((i) => changeToOp(changes[i])) }, opts);
    if (!res || res.results.length !== send.length) return null;
    send.forEach((orig, j) => {
      const r = res.results[j] || {};
      results[orig] = { ok: r.ok === true, message: String(r.message || '') };
    });
  }
  if (audit && !dryRun) {
    const failed = results.filter((r) => !r.ok).length;
    Logger.auditOptimizer?.({ type: 'sysops-registry', ops: changes.length, failed, keys: [...new Set(changes.map((c) => c.key))].slice(0, 50) });
  }
  return results;
}

export default { available, readRegistry, writeRegistry, changeToOp, setEngine, getEngine };
