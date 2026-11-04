/**
 * Pool de Workers SQLite (1 Writer + 4 Readers paralelos em modo WAL) com suporte a
 * Transações Atômicas (BEGIN IMMEDIATE / COMMIT / ROLLBACK) para 500+ usuários simultâneos.
 * Compatível 100% com Windows (PowerShell/CMD cp1252) e Linux/VPS (UTF-8) via transporte JSON ASCII-safe (\uXXXX)
 * e configuração explícita de UTF-8 no Python (python3 / python).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const config = require('./env');

const PYTHON_UTF8_ENV = {
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8'
};

let cachedPythonBin = null;
function resolvePythonExecutable() {
  if (cachedPythonBin) return cachedPythonBin;
  const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const bin of candidates) {
    try {
      const check = spawnSync(bin, ['-c', 'import sqlite3; print("OK")'], {
        env: PYTHON_UTF8_ENV,
        encoding: 'utf8',
        windowsHide: true
      });
      if (check.status === 0 && String(check.stdout || '').includes('OK')) {
        cachedPythonBin = bin;
        return bin;
      }
    } catch (e) {
      // Tenta próximo candidato
    }
  }
  cachedPythonBin = 'python3';
  return cachedPythonBin;
}

/**
 * Converte qualquer caractere fora do ASCII básico (0x00-0x7F) em escape \uXXXX no JSON.
 * Isso garante que nenhum byte > 127 trafegue pelos pipes do Windows (cp1252/cp850),
 * eliminando definitivamente erros de surrogate (\udc8d) no Python em máquinas Windows.
 */
function toAsciiSafeJson(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (ch) => {
    return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

function resolveEffectiveDbPath(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const pyBin = resolvePythonExecutable();
  const probe = spawnSync(
    pyBin,
    [
      '-c',
      `import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[1], timeout=5.0, isolation_level=None)
    c.execute("PRAGMA journal_mode = WAL;")
    c.execute("CREATE TABLE IF NOT EXISTS _wal_probe (id INT);")
    c.execute("DROP TABLE IF EXISTS _wal_probe;")
    c.close()
    sys.exit(0)
except Exception:
    sys.exit(1)`,
      targetPath
    ],
    { env: PYTHON_UTF8_ENV, windowsHide: true }
  );
  if (probe.status === 0) {
    return { activePath: targetPath, isFuseFallback: false };
  }
  const tmpActive = path.join(os.tmpdir(), 'louvorapp_wal_pool.sqlite');
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0 && !fs.existsSync(tmpActive)) {
    fs.copyFileSync(targetPath, tmpActive);
  }
  return { activePath: tmpActive, isFuseFallback: true };
}

const PYTHON_SQLITE_WORKER = `
import sys, json, sqlite3, os

try:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8", errors="surrogatepass")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
except Exception:
    pass

target_db_path = os.path.abspath(sys.argv[1])
os.makedirs(os.path.dirname(target_db_path), exist_ok=True)

conn = sqlite3.connect(target_db_path, timeout=15.0, isolation_level=None)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA journal_mode = WAL;")
conn.execute("PRAGMA synchronous = NORMAL;")
conn.execute("PRAGMA foreign_keys = ON;")
conn.execute("PRAGMA busy_timeout = 15000;")
conn.execute("PRAGMA cache_size = -64000;")
conn.execute("PRAGMA temp_store = MEMORY;")

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        action = req.get("action")
        sql = req.get("sql", "")
        params = req.get("params", [])

        cur = conn.cursor()
        if action == "exec":
            cur.executescript(sql)
            conn.commit()
            res = {"id": req_id, "ok": True, "result": True}
        elif action == "run":
            cur.execute(sql, params)
            res = {
                "id": req_id,
                "ok": True,
                "result": {
                    "lastID": cur.lastrowid,
                    "changes": cur.rowcount
                }
            }
        elif action == "get":
            cur.execute(sql, params)
            row = cur.fetchone()
            res = {"id": req_id, "ok": True, "result": dict(row) if row else None}
        elif action == "all":
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            res = {"id": req_id, "ok": True, "result": rows}
        elif action == "batch_tx":
            statements = req.get("statements", [])
            cur.execute("BEGIN IMMEDIATE;")
            try:
                results = []
                for st in statements:
                    cur.execute(st.get("sql", ""), st.get("params", []))
                    results.append({"lastID": cur.lastrowid, "changes": cur.rowcount})
                cur.execute("COMMIT;")
                res = {"id": req_id, "ok": True, "result": results}
            except Exception as tx_err:
                cur.execute("ROLLBACK;")
                raise tx_err
        else:
            res = {"id": req_id, "ok": False, "error": f"Unknown action: {action}"}
    except Exception as e:
        res = {"id": req_id, "ok": False, "error": str(e)}

    sys.stdout.write(json.dumps(res, ensure_ascii=True) + "\\n")
    sys.stdout.flush()
`;

class SqliteWorkerInstance {
  constructor(getActivePathFn) {
    this.getActivePath = getActivePathFn;
    this.worker = null;
    this.reqSeq = 0;
    this.pending = new Map();
    this.buffer = '';
  }

  ensure() {
    if (this.worker && !this.worker.killed) return;
    const activePath = this.getActivePath();
    const pyBin = resolvePythonExecutable();

    this.worker = spawn(pyBin, ['-u', '-c', PYTHON_SQLITE_WORKER, activePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: PYTHON_UTF8_ENV,
      windowsHide: true
    });
    this.worker.stdout.setEncoding('utf8');
    this.worker.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            if (msg.ok) handler.resolve(msg.result);
            else handler.reject(new Error(msg.error || 'Erro SQLite'));
          }
        } catch (err) {
          console.error('[Database] Erro ao processar resposta:', err);
        }
      }
    });
    this.worker.stderr.setEncoding('utf8');
    this.worker.stderr.on('data', (errText) => {
      console.error('[Database Worker Stderr]:', errText.trim());
    });
    this.worker.on('exit', () => {
      for (const [, handler] of this.pending.entries()) {
        handler.reject(new Error('Worker SQLite encerrado inesperadamente'));
      }
      this.pending.clear();
      this.worker = null;
    });
  }

  send(payloadObj) {
    this.ensure();
    return new Promise((resolve, reject) => {
      const id = ++this.reqSeq;
      this.pending.set(id, { resolve, reject });
      this.worker.stdin.write(toAsciiSafeJson({ ...payloadObj, id }) + '\n', 'utf8');
    });
  }

  async close() {
    if (this.worker && !this.worker.killed) {
      const w = this.worker;
      this.worker = null;
      await new Promise((resolve) => {
        w.once('exit', resolve);
        w.stdin.end();
        setTimeout(() => {
          if (!w.killed) w.kill();
          resolve();
        }, 250);
      });
    }
  }
}

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.activePath = null;
    this.isFuseFallback = false;

    const getPath = () => {
      if (!this.activePath) {
        const resolved = resolveEffectiveDbPath(this.dbPath);
        this.activePath = resolved.activePath;
        this.isFuseFallback = resolved.isFuseFallback;
      }
      return this.activePath;
    };

    this.writer = new SqliteWorkerInstance(getPath);
    const readerCount = Math.min(Math.max(os.cpus().length, 2), 4);
    this.readers = Array.from({ length: readerCount }, () => new SqliteWorkerInstance(getPath));
    this.rrIndex = 0;
    this.initialized = false;
  }

  getReader() {
    const r = this.readers[this.rrIndex % this.readers.length];
    this.rrIndex = (this.rrIndex + 1) % this.readers.length;
    return r;
  }

  async exec(sqlScript) {
    return this.writer.send({ action: 'exec', sql: sqlScript });
  }

  async run(sql, params = []) {
    return this.writer.send({ action: 'run', sql, params });
  }

  async transaction(statements = []) {
    return this.writer.send({ action: 'batch_tx', statements });
  }

  async get(sql, params = []) {
    return this.getReader().send({ action: 'get', sql, params });
  }

  async all(sql, params = []) {
    return this.getReader().send({ action: 'all', sql, params });
  }

  async runMigrations() {
    let files = [];
    if (fs.existsSync(config.migrationsDir)) {
      files = fs
        .readdirSync(config.migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    }
    if (files.length === 0) {
      for (const fallback of [
        '001_initial_schema.sql',
        '002_performance_indexes.sql',
        '003_unavailabilities_and_theme.sql'
      ]) {
        if (fs.existsSync(path.join(config.migrationsDir, fallback))) {
          files.push(fallback);
        }
      }
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
      await this.exec(sql);
    }

    // Garante compatibilidade com bancos existentes criados em versões anteriores
    const userCols = await this.writer.send({ action: 'all', sql: 'PRAGMA table_info(users);', params: [] });
    if (!userCols.some((c) => c.name === 'theme_preference')) {
      await this.run("ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'");
    }
    const voteCols = await this.writer.send({ action: 'all', sql: 'PRAGMA table_info(poll_votes);', params: [] });
    if (!voteCols.some((c) => c.name === 'role_key')) {
      await this.run("ALTER TABLE poll_votes ADD COLUMN role_key TEXT NOT NULL DEFAULT 'vocal'");
    }
  }

  async runSeeds(force = false) {
    const countRow = await this.writer.send({
      action: 'get',
      sql: 'SELECT COUNT(*) as total FROM role_permissions',
      params: []
    });
    if (countRow && countRow.total > 0 && !force) return;

    let files = [];
    if (fs.existsSync(config.seedsDir)) {
      files = fs
        .readdirSync(config.seedsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    }
    if (files.length === 0) {
      const defaultSeed = path.join(config.seedsDir, '001_initial_seed.sql');
      if (fs.existsSync(defaultSeed)) files = ['001_initial_seed.sql'];
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(config.seedsDir, file), 'utf8');
      await this.exec(sql);
    }
  }

  async initialize({ reset = false } = {}) {
    if (reset) {
      await this.close({ skipSync: true });
      const pathsToClean = [this.dbPath, path.join(os.tmpdir(), 'louvorapp_wal_pool.sqlite')];
      for (const baseP of pathsToClean) {
        if (!baseP) continue;
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
          const p = baseP + suffix;
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      }
      this.activePath = null;
    }
    await this.runMigrations();
    await this.runSeeds(reset);
    // Limpa sessões expiradas no boot
    await this.run("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')");
    if (this.isFuseFallback && this.activePath && fs.existsSync(this.activePath)) {
      await this.writer.send({ action: 'exec', sql: 'PRAGMA wal_checkpoint(TRUNCATE);' });
      fs.copyFileSync(this.activePath, this.dbPath);
    }
    this.initialized = true;
  }

  async close({ skipSync = false } = {}) {
    if (!skipSync && this.isFuseFallback && this.activePath && fs.existsSync(this.activePath) && this.writer.worker) {
      try {
        await this.writer.send({ action: 'exec', sql: 'PRAGMA wal_checkpoint(TRUNCATE);' });
        fs.copyFileSync(this.activePath, this.dbPath);
      } catch (e) {}
    }
    await Promise.all(this.readers.map((r) => r.close()));
    await this.writer.close();
  }
}

module.exports = new DatabaseManager(config.dbPath);
