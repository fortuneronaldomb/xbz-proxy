const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT     = process.env.PORT || 8080;
const TOKEN    = process.env.XBZ_TOKEN || '54238';
const XBZ_HOST = 'api.xbz.com.br';

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
        'User-Agent':  'Mozilla/5.0 (compatible; FortuneBrindes/2.0)',
        'Accept':      'application/json, image/*, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
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

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.query;

  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (pathname === '/' || pathname === '/health') {
    return jsonResponse(res, 200, {
      status: 'online',
      service: 'XBZ Proxy — Fortune Brindes',
      version: '2.1',
      token: TOKEN ? TOKEN.substring(0,3)+'****' : 'não definido',
      endpoints: ['/v1/produto', '/v1/categoria', '/v1/produto/:codigo', '/img', '/debug']
    });
  }

  // DEBUG — testa a API XBZ e retorna resposta bruta
  if (pathname === '/debug') {
    const termo = query.search || 'caneta';
    const results = {};
    
    // Testa vários formatos de URL possíveis
    const urls = [
      `https://${XBZ_HOST}/v1/produto?token=${TOKEN}&search=${termo}`,
      `https://${XBZ_HOST}/v1/produto?token=${TOKEN}&busca=${termo}`,
      `https://${XBZ_HOST}/v1/produtos?token=${TOKEN}&search=${termo}`,
      `https://${XBZ_HOST}/produtos?token=${TOKEN}&search=${termo}`,
      `https://${XBZ_HOST}/v1/produto?token=${TOKEN}`,
    ];
    
    for (const u of urls) {
      try {
        const r = await httpsGet(u);
        results[u] = {
          status: r.status,
          body_preview: r.body.toString('utf8').substring(0, 200)
        };
        if (r.status === 200) break; // parar no primeiro que funcionar
      } catch(e) {
        results[u] = { error: e.message };
      }
    }
    return jsonResponse(res, 200, { debug: true, token: TOKEN, results });
  }

  // Busca produtos
  if (pathname === '/v1/produto') {
    try {
      const params = new URLSearchParams();
      params.set('token', TOKEN);
      if (query.search)    params.set('search', query.search);
      if (query.busca)     params.set('busca', query.busca);
      if (query.categoria) params.set('categoria', query.categoria);
      if (query.limit)     params.set('limit', query.limit);
      if (query.page)      params.set('page', query.page);

      const targetUrl = `https://${XBZ_HOST}/v1/produto?${params.toString()}`;
      console.log('Buscando:', targetUrl);
      
      const r = await httpsGet(targetUrl);
      console.log('Status XBZ:', r.status);
      console.log('Body preview:', r.body.toString('utf8').substring(0, 200));
      
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch (e) {
      console.error('Erro busca produto:', e.message);
      jsonResponse(res, 500, { erro: e.message, stack: e.stack });
    }
    return;
  }

  // Categorias
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

  // Detalhe produto
  const matchProduto = pathname.match(/^\/v1\/produto\/([^/]+)$/);
  if (matchProduto) {
    try {
      const r = await httpsGet(`https://${XBZ_HOST}/v1/produto/${matchProduto[1]}?token=${TOKEN}`);
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  // Proxy imagem
  if (pathname === '/img') {
    const imgUrl = query.url;
    if (!imgUrl) return jsonResponse(res, 400, { erro: 'Parâmetro url obrigatório' });
    try {
      const r = await httpsGet(imgUrl);
      const ct = r.headers['content-type'] || 'image/jpeg';
      res.writeHead(r.status, {
        'Content-Type':  ct,
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': r.body.length
      });
      res.end(r.body);
    } catch (e) {
      jsonResponse(res, 500, { erro: e.message });
    }
    return;
  }

  jsonResponse(res, 404, { erro: 'Rota não encontrada' });
});

server.listen(PORT, () => {
  console.log(`✅ XBZ Proxy rodando na porta ${PORT}`);
  console.log(`   Token XBZ: ${TOKEN}`);
  console.log(`   Endpoints: /v1/produto | /v1/categoria | /img | /debug`);
});
