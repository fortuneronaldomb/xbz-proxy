// ============================================================
// PROXY XBZ — Fortune Brindes
// Deploy no Railway como serviço separado
// Node.js puro (sem Express) — igual ao padrão do estoque
// ============================================================

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT  = process.env.PORT || 3099;
const TOKEN = process.env.XBZ_TOKEN || '54238';
const XBZ_HOST = 'api.xbz.com.br';

// ── CORS helper ──────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Faz requisição HTTPS e retorna Buffer ────────────────────
function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.path,
      method:   'GET',
      headers: {
        'User-Agent': 'FortuneBrindes-Proxy/2.0',
        'Accept':     'application/json, image/*, */*'
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:      res.statusCode,
        headers:     res.headers,
        body:        Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── JSON helper ──────────────────────────────────────────────
function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

// ============================================================
// SERVIDOR PRINCIPAL
// ============================================================
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.query;

  setCORS(res);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // ── GET / — health check ─────────────────────────────────
  if (pathname === '/' || pathname === '/health') {
    return jsonResponse(res, 200, {
      status: 'online',
      service: 'XBZ Proxy — Fortune Brindes',
      version: '2.0',
      endpoints: ['/v1/produto', '/v1/categoria', '/v1/produto/:codigo', '/img']
    });
  }

  // ── GET /v1/categoria — lista categorias ──────────────────
  if (pathname === '/v1/categoria') {
    try {
      const r = await httpsGet(`https://${XBZ_HOST}/v1/categoria?token=${TOKEN}`);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // ── GET /v1/produto — busca produtos ─────────────────────
  // Params: search=TERMO, categoria=ID, limit=30, page=1
  if (pathname === '/v1/produto') {
    try {
      const params = new URLSearchParams();
      params.set('token', TOKEN);
      if (query.search)    params.set('search', query.search);
      if (query.categoria) params.set('categoria', query.categoria);
      if (query.limit)     params.set('limit', query.limit);
      if (query.page)      params.set('page', query.page);

      const r = await httpsGet(`https://${XBZ_HOST}/v1/produto?${params.toString()}`);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // ── GET /v1/produto/:codigo — detalhe do produto ─────────
  const matchProduto = pathname.match(/^\/v1\/produto\/([^/]+)$/);
  if (matchProduto) {
    const codigo = matchProduto[1];
    try {
      const r = await httpsGet(`https://${XBZ_HOST}/v1/produto/${codigo}?token=${TOKEN}`);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // ── GET /img — proxy de imagens XBZ ──────────────────────
  // Uso: /img?url=https://api.xbz.com.br/...
  if (pathname === '/img') {
    const imgUrl = query.url;
    if (!imgUrl) {
      return jsonResponse(res, 400, { erro: 'Parâmetro url obrigatório' });
    }
    // Segurança: só aceita URLs do domínio XBZ
    if (!imgUrl.includes('xbz.com.br') && !imgUrl.includes('xbzbrindes')) {
      return jsonResponse(res, 403, { erro: 'Domínio não autorizado' });
    }
    try {
      const r = await httpsGet(imgUrl);
      const ct = r.headers['content-type'] || 'image/jpeg';
      res.writeHead(r.status, {
        'Content-Type':   ct,
        'Cache-Control':  'public, max-age=86400',
        'Content-Length': r.body.length
      });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // ── 404 ───────────────────────────────────────────────────
  jsonResponse(res, 404, { erro: 'Rota não encontrada' });
});

server.listen(PORT, () => {
  console.log(`✅ XBZ Proxy rodando na porta ${PORT}`);
  console.log(`   Token XBZ: ${TOKEN}`);
  console.log(`   Endpoints: /v1/produto | /v1/categoria | /img`);
});
