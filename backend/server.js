/**
 * LOUVORAPP - SERVIDOR WEB INTEGRADO (BACKEND API + FRONTEND ESTÁTICO)
 * Otimizado para 500+ usuários simultâneos:
 * - Rate Limiting em memória por IP
 * - I/O de arquivos estáticos 100% assíncrono (fs.promises.stat)
 * - Pool de Workers SQLite em modo WAL
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('./config/env');
const db = require('./config/database');
const apiRouter = require('./routes/apiRouter');
const { sendJson, handleError } = require('./middlewares/errorMiddleware');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Rate Limiter em memória por IP
const rateLimitMap = new Map();
function checkRateLimit(ip, bucket, maxReq, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(key, entry);
  }
  entry.count++;
  return entry.count <= maxReq;
}

function resetRateLimiter() {
  rateLimitMap.clear();
}

function getClientIp(req) {
  if (config.trustProxy) {
    const realIp = req.headers['x-real-ip'];
    if (realIp) return String(realIp).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return resolve({});
    }
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(Object.assign(new Error('Payload excede o limite permitido (2MB).'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(Object.assign(new Error('JSON inválido no corpo da requisição.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheHeader =
    ext === '.svg' || ext === '.png' || ext === '.woff2'
      ? 'public, max-age=86400'
      : 'no-cache';
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheHeader,
      'X-Content-Type-Options': 'nosniff'
    });
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado.');
  });
}

async function requestListener(req, res) {
  const allowedOrigin = config.corsOrigin || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Rotas da API REST com Rate Limiting
    if (pathname.startsWith('/api/')) {
      const ip = getClientIp(req);
      const isSensitiveAuth =
        pathname === '/api/auth/login' ||
        pathname === '/api/auth/register' ||
        pathname === '/api/auth/forgot-password' ||
        pathname === '/api/auth/reset-password';

      const authLimit = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '25', 10);
      const apiLimit = parseInt(process.env.RATE_LIMIT_API_MAX || '600', 10);

      if (isSensitiveAuth && !checkRateLimit(ip, 'auth', authLimit, 60 * 1000)) {
        sendJson(res, 429, {
          ok: false,
          error: 'Muitas tentativas seguidas. Aguarde 1 minuto antes de tentar novamente.'
        });
        return;
      }
      if (!checkRateLimit(ip, 'api', apiLimit, 60 * 1000)) {
        sendJson(res, 429, {
          ok: false,
          error: 'Limite de requisições excedido. Aguarde alguns segundos.'
        });
        return;
      }

      req.body = await parseRequestBody(req);
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      await apiRouter.handle(req, res, pathname, query);
      return;
    }

    // Redirecionamento HTTP 302 direto para /dashboard
    if (pathname === '/dashboard' || pathname === '/pages/dashboard' || pathname === '/pages/dashboard/') {
      res.writeHead(302, { Location: '/pages/calendario-escalas/index.html' });
      res.end();
      return;
    }

    // Aliases amigáveis para as páginas do Frontend
    const routeAliases = {
      '/': '/index.html',
      '/login': '/index.html',
      '/onboarding': '/pages/onboarding/index.html',
      '/cadastro': '/pages/onboarding/index.html',
      '/calendario': '/pages/calendario-escalas/index.html',
      '/calendario-escalas': '/pages/calendario-escalas/index.html',
      '/minhas-escalas': '/pages/minhas-escalas-trocas/index.html',
      '/minhas-escalas-trocas': '/pages/minhas-escalas-trocas/index.html',
      '/enquetes': '/pages/enquetes-disponibilidade/index.html',
      '/enquetes-disponibilidade': '/pages/enquetes-disponibilidade/index.html',
      '/aprovacao-trocas': '/pages/aprovacao-trocas/index.html',
      '/gestao-de-trocas': '/pages/aprovacao-trocas/index.html',
      '/perfil': '/pages/perfil-configuracoes/index.html',
      '/perfil-configuracoes': '/pages/perfil-configuracoes/index.html',
      '/usuarios': '/pages/usuarios/index.html',
      '/configuracoes': '/pages/configuracoes/index.html'
    };

    if (routeAliases[pathname]) {
      pathname = routeAliases[pathname];
    }

    let safePath = path.normalize(path.join(config.frontendDir, pathname));
    if (!safePath.startsWith(config.frontendDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso negado.');
      return;
    }

    try {
      let stat = await fs.promises.stat(safePath);
      if (stat.isDirectory()) {
        safePath = path.join(safePath, 'index.html');
        stat = await fs.promises.stat(safePath);
      }
      if (stat.isFile()) {
        serveStaticFile(res, safePath);
        return;
      }
    } catch (statErr) {
      // Fallback para index.html se não for um asset estático com extensão
      const ext = path.extname(safePath);
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Recurso não encontrado.');
        return;
      }
    }

    serveStaticFile(res, path.join(config.frontendDir, 'index.html'));
  } catch (err) {
    handleError(res, err);
  }
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const resetDb = args.includes('--reset-db');
  const migrateOnly = args.includes('--migrate-only');
  const seedOnly = args.includes('--seed-only');

  await db.initialize({ reset: resetDb });

  const savedAdmins = await db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_emails_override'");
  if (savedAdmins && savedAdmins.setting_value) {
    const list = savedAdmins.setting_value
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (list.length > 0) {
      config.ADMIN_EMAILS = Array.from(new Set([...config.ADMIN_EMAILS, ...list]));
    }
  }

  if (migrateOnly || seedOnly || resetDb) {
    console.log('[LouvorApp] Banco de dados inicializado/migrado com sucesso em:', config.dbPath);
    await db.close();
    process.exit(0);
  }

  const server = http.createServer(requestListener);
  server.listen(config.port, config.host, () => {
    console.log(`====================================================================`);
    console.log(`  LouvorApp v2.4.1 - Servidor Web em Execução (Pool WAL + Rate Limit)`);
    console.log(`  URL Local / VPS : http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`  Banco SQLite    : ${config.dbPath}`);
    console.log(`  ADMIN_EMAILS    : ${config.ADMIN_EMAILS.join(', ')}`);
    console.log(`====================================================================`);
  });

  const shutdown = async () => {
    console.log('\n[LouvorApp] Encerrando servidor e conexões SQLite...');
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[Fatal Bootstrap Error]:', err);
    process.exit(1);
  });
}

module.exports = { bootstrap, requestListener, resetRateLimiter };
