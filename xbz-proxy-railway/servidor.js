const http  = require('http');
const https = require('https');
const http2 = require('http');
const url   = require('url');

const PORT  = process.env.PORT || 8080;
const TOKEN = process.env.XBZ_TOKEN || '54238';

// Tenta múltiplos hosts/endpoints da XBZ
const XBZ_HOSTS = [
  { host: 'api.xbz.com.br',       port: 443,  ssl: true  },
  { host: 'www.xbzbrindes.com.br', port: 443,  ssl: true  },
  { host: 'xbzbrindes.com.br',     port: 443,  ssl: true  },
];

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function httpsGet(targetUrl, useSsl) {
  return new Promise((resolve, reject) => {
    const parsed  = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (useSsl ? 443 : 80),
      path:     parsed.path,
      method:   'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer':         'https://www.fortunebrindes.com.br/',
      }
    };
    const lib = useSsl ? https : require('http');
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

// Tenta encontrar qual endpoint XBZ funciona
async function xbzRequest(path, params) {
  const qs = new URLSearchParams({ token: TOKEN, ...params }).toString();
  
  const urlsToTry = [
    `https://api.xbz.com.br${path}?${qs}`,
    `https://api.xbz.com.br/api${path}?${qs}`,
    `https://www.xbzbrindes.net${path}?${qs}`,
  ];

  let lastError = null;
  for (const u of urlsToTry) {
    try {
      console.log('Tentando:', u);
      const r = await httpsGet(u, true);
      console.log('Status:', r.status, 'Body:', r.body.toString().substring(0, 100));
      if (r.status < 500) return r;
    } catch(e) {
      console.log('Erro em', u, ':', e.message);
      lastError = e;
    }
  }
  throw lastError || new Error('Todos os endpoints falharam');
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
      status: 'online', service: 'XBZ Proxy — Fortune Brindes', version: '2.2',
      token: TOKEN ? TOKEN.substring(0,3)+'****' : 'não definido',
      endpoints: ['/v1/produto', '/v1/categoria', '/img', '/debug']
    });
  }

  // Debug completo
  if (pathname === '/debug') {
    const termo = query.search || 'caneta';
    const qs = new URLSearchParams({ token: TOKEN, search: termo }).toString();
    const results = {};
    const urls = [
      `https://api.xbz.com.br/v1/produto?${qs}`,
      `https://api.xbz.com.br/v1/produtos?${qs}`,
      `https://api.xbz.com.br/produtos?${qs}`,
      `https://api.xbz.com.br/api/v1/produto?${qs}`,
      `https://www.xbzbrindes.net/v1/produto?${qs}`,
      `https://xbzbrindes.com.br/v1/produto?${qs}`,
    ];
    for (const u of urls) {
      try {
        const r = await httpsGet(u, true);
        results[u] = { status: r.status, preview: r.body.toString('utf8').substring(0, 300) };
      } catch(e) {
        results[u] = { error: e.message };
      }
    }
    return jsonResponse(res, 200, { debug: true, token: TOKEN, results });
  }

  // Busca produtos
  if (pathname === '/v1/produto') {
    try {
      const params = {};
      if (query.search)    params.search    = query.search;
      if (query.busca)     params.busca     = query.busca;
      if (query.categoria) params.categoria = query.categoria;
      if (query.limit)     params.limit     = query.limit;
      const r = await xbzRequest('/v1/produto', params);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch(e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // Categorias
  if (pathname === '/v1/categoria') {
    try {
      const r = await xbzRequest('/v1/categoria', {});
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
      const r = await httpsGet(imgUrl, true);
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
  console.log(`✅ XBZ Proxy v2.2 rodando na porta ${PORT}`);
  console.log(`   Token: ${TOKEN}`);
});
