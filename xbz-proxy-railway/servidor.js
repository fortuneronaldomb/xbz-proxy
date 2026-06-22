const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT     = process.env.PORT || 8080;
const TOKEN    = process.env.XBZ_TOKEN || '54238';
const CNPJ     = process.env.XBZ_CNPJ  || '17589437000105';
const XBZ_HOST = 'api.minhaxbz.com.br';
const XBZ_PORT = 5001;

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.path,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FortuneBrindes/3.0)',
        'Accept':     'application/json, */*',
      },
      rejectUnauthorized: false // aceita certificados self-signed
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.query;

  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health
  if (pathname === '/' || pathname === '/health') {
    return jsonResponse(res, 200, {
      status: 'online', service: 'XBZ Proxy — Fortune Brindes', version: '3.0',
      host: XBZ_HOST, port: XBZ_PORT, cnpj: CNPJ,
      endpoints: ['/v1/produto', '/v1/categoria', '/img', '/debug']
    });
  }

  // Debug
  if (pathname === '/debug') {
    const search = query.search || 'caneta';
    const results = {};
    const urls = [
      `https://${XBZ_HOST}:${XBZ_PORT}/api/clientes/GetListaDeProdutos?cnpj=${CNPJ}&token=${TOKEN}&search=${search}`,
      `https://${XBZ_HOST}:${XBZ_PORT}/api/clientes/GetListaDeProdutos?cnpj=${CNPJ}&token=${TOKEN}&busca=${search}`,
      `https://${XBZ_HOST}:${XBZ_PORT}/api/produtos?token=${TOKEN}&search=${search}`,
      `http://${XBZ_HOST}:${XBZ_PORT}/api/clientes/GetListaDeProdutos?cnpj=${CNPJ}&token=${TOKEN}&search=${search}`,
    ];
    for (const u of urls) {
      try {
        const r = await httpsGet(u);
        results[u] = { status: r.status, preview: r.body.toString('utf8').substring(0, 400) };
        if (r.status === 200 && !r.body.toString().includes('<!DOCTYPE')) break;
      } catch(e) {
        results[u] = { error: e.message };
      }
    }
    return jsonResponse(res, 200, { debug: true, token: TOKEN, cnpj: CNPJ, results });
  }

  // Busca produtos — endpoint real do estoque
  if (pathname === '/v1/produto') {
    try {
      const search = query.search || query.busca || '';
      const xbzUrl = `https://${XBZ_HOST}:${XBZ_PORT}/api/clientes/GetListaDeProdutos?cnpj=${CNPJ}&token=${TOKEN}${search ? '&search='+encodeURIComponent(search) : ''}`;
      console.log('XBZ URL:', xbzUrl);
      const r = await httpsGet(xbzUrl);
      console.log('Status:', r.status, '| Preview:', r.body.toString().substring(0, 100));
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch(e) {
      console.error('Erro:', e.message);
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // Categorias
  if (pathname === '/v1/categoria') {
    try {
      const r = await httpsGet(`https://${XBZ_HOST}:${XBZ_PORT}/api/clientes/GetCategorias?cnpj=${CNPJ}&token=${TOKEN}`);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch(e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // Proxy imagem
  if (pathname === '/img') {
    const imgUrl = query.url;
    if (!imgUrl) return jsonResponse(res, 400, { erro: 'url obrigatório' });
    try {
      const r = await httpsGet(imgUrl);
      const ct = r.headers['content-type'] || 'image/jpeg';
      res.writeHead(r.status, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' });
      res.end(r.body);
    } catch(e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  jsonResponse(res, 404, { erro: 'Rota não encontrada' });
});

server.listen(PORT, () => {
  console.log(`✅ XBZ Proxy v3.0 na porta ${PORT}`);
  console.log(`   Host XBZ: ${XBZ_HOST}:${XBZ_PORT}`);
  console.log(`   CNPJ: ${CNPJ} | Token: ${TOKEN}`);
});
