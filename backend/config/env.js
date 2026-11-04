/**
 * Centralização de variáveis de ambiente e configurações protegidas do sistema.
 * Gera um segredo criptográfico aleatório seguro caso SESSION_SECRET não esteja definido.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ENV_FILE_PATH = path.join(ROOT_DIR, '.env');

function loadDotEnv() {
  if (!fs.existsSync(ENV_FILE_PATH)) return;
  const content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

const DEFAULT_ADMIN_EMAILS = [
  'admin1@email.com',
  'admin2@email.com',
  'lucas@igreja.org',
  'admin@louvorapp.org',
  'kleluca75@gmail.com'
];

function getAdminEmails() {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set([
    ...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()),
    ...fromEnv
  ]);
  return Array.from(merged);
}

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');

const config = {
  rootDir: ROOT_DIR,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  sessionSecret:
    process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'louvorapp-super-secret-production-key-2025-change-me'
      ? process.env.SESSION_SECRET
      : runtimeFallbackSecret,
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '168', 10),
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './database/louvorapp.sqlite'),
  migrationsDir: path.join(ROOT_DIR, 'database', 'migrations'),
  seedsDir: path.join(ROOT_DIR, 'database', 'seeds'),
  frontendDir: path.join(ROOT_DIR, 'frontend'),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || '',
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production',
  ADMIN_EMAILS: getAdminEmails(),
  isEmailAuthorizedAdmin(email) {
    if (!email) return false;
    return this.ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
  },
  addAuthorizedAdminEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (clean && !this.ADMIN_EMAILS.includes(clean)) {
      this.ADMIN_EMAILS.push(clean);
    }
    return this.ADMIN_EMAILS;
  },
  removeAuthorizedAdminEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    this.ADMIN_EMAILS = this.ADMIN_EMAILS.filter((e) => e !== clean);
    return this.ADMIN_EMAILS;
  }
};

module.exports = config;
