function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || 'Erro interno no servidor.';
  if (status >= 500) {
    console.error('[Server Error]:', err);
  }
  sendJson(res, status, {
    ok: false,
    error: message
  });
}

module.exports = {
  sendJson,
  handleError
};
