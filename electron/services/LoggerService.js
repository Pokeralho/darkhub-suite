import fs from 'fs';
import path from 'path';


const AUDIT_FIELD_MAX_CHARS = 4000;

const AUDIT_MAX_BYTES = 10 * 1024 * 1024;
const AUDIT_KEEP_LINES_ON_ROTATE = 5000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;

// Masks credentials that may end up in messages (URLs with tokens, auth headers, key=value pairs).
const SECRET_PATTERNS = [
  [/\b(authorization|proxy-authorization)\s*[:=]\s*(bearer|basic|token)?\s*[^\s,;"']+/gi, '$1: [REDACTED]'],
  [/\b(bearer)\s+[a-z0-9._~+/=-]{8,}/gi, '$1 [REDACTED]'],
  [/([?&](?:access_token|token|api[_-]?key|apikey|key|secret|password|passwd|pwd|sig|signature|auth)=)[^&\s"']+/gi, '$1[REDACTED]'],
  [/\b((?:password|passwd|pwd|secret|token|api[_-]?key|masterPassword|recoveryWords)["']?\s*[:=]\s*["']?)[^\s,;"'&}]+/gi, '$1[REDACTED]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_GH_TOKEN]'],
  [/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[REDACTED]@']
];

export function redactSecrets(value) {
  let str = String(value ?? '');
  for (const [re, replacement] of SECRET_PATTERNS) str = str.replace(re, replacement);
  return str;
}

class LoggerService {
  constructor() {
    this.logs = [];
    this.maxLogs = 5000;
  }

  init(app) {
    this.logPath = path.join(app.getPath('userData'), 'darkhub_elite.log');

    this.auditPath = path.join(app.getPath('userData'), 'optimizer_audit.jsonl');
    this._rotateLogIfNeeded();
    this.info('LoggerService', 'Initialized local logging.');
  }

  _rotateLogIfNeeded() {
    try {
      if (this.logPath && fs.existsSync(this.logPath) && fs.statSync(this.logPath).size > LOG_MAX_BYTES) {
        fs.renameSync(this.logPath, this.logPath + '.old');
      }
    } catch {
      // rotation is best effort
    }
  }

  _truncate(value, max = AUDIT_FIELD_MAX_CHARS) {
    const str = redactSecrets(value);
    if (str.length <= max) return str;
    return str.slice(0, max) + `… [truncado, ${str.length - max} chars omitidos]`;
  }

  
  auditOptimizer(entry = {}) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
      command: entry.command != null ? this._truncate(entry.command) : undefined,
      script: entry.script != null ? this._truncate(entry.script) : undefined,
      stdout: entry.stdout != null ? this._truncate(entry.stdout) : undefined,
      stderr: entry.stderr != null ? this._truncate(entry.stderr) : undefined
    });

    if (!this.auditPath) return;

    try {
      const stat = fs.existsSync(this.auditPath) ? fs.statSync(this.auditPath) : null;
      if (stat && stat.size > AUDIT_MAX_BYTES) {

        const content = fs.readFileSync(this.auditPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const kept = lines.slice(-AUDIT_KEEP_LINES_ON_ROTATE);
        fs.writeFileSync(this.auditPath, kept.join('\n') + '\n', 'utf8');
      }
    } catch {

    }

    fs.appendFile(this.auditPath, line + '\n', () => {});
  }

  
  getOptimizerAuditLog(limit = 200) {
    if (!this.auditPath || !fs.existsSync(this.auditPath)) return [];
    try {
      const content = fs.readFileSync(this.auditPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const tail = lines.slice(-limit);
      const parsed = [];
      for (const line of tail) {
        try { parsed.push(JSON.parse(line)); } catch {  }
      }
      return parsed.reverse();
    } catch {
      return [];
    }
  }

  _format(level, moduleName, message, durationMs = null) {
    const timestamp = new Date().toISOString();
    const durStr = durationMs !== null ? ` [${durationMs}ms]` : '';
    return `[${timestamp}] [${level}] [${moduleName}]${durStr} ${redactSecrets(message)}`;
  }

  _write(line) {
    this.logs.unshift(line);
    if (this.logs.length > this.maxLogs) this.logs.pop();
    
    if (this.logPath) {

      fs.appendFile(this.logPath, line + '\n', () => {});
    }
    

    if (process.env.NODE_ENV === 'development') {
      console.log(line);
    }
  }

  info(moduleName, message, durationMs = null) {
    this._write(this._format('INFO', moduleName, message, durationMs));
  }

  warn(moduleName, message, durationMs = null) {
    this._write(this._format('WARN', moduleName, message, durationMs));
  }

  error(moduleName, message, err = null, durationMs = null) {
    const errMsg = err ? `${message} | Error: ${err.message || String(err)}` : message;
    this._write(this._format('ERROR', moduleName, errMsg, durationMs));
  }

  async track(moduleName, taskName, asyncFn) {
    const start = process.hrtime.bigint();
    try {
      const result = await asyncFn();
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1000000;
      this.info(moduleName, `[Task: ${taskName}] concluida com sucesso.`, durationMs.toFixed(2));
      return result;
    } catch (err) {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1000000;
      this.error(moduleName, `[Task: ${taskName}] Falhou.`, err, durationMs.toFixed(2));
      throw err;
    }
  }
}

export default new LoggerService();
