# XBZ Proxy — Fortune Brindes

Proxy server-side para a API XBZ. Resolve CORS e serve imagens.

## Deploy no Railway

1. Faça upload desta pasta para um repositório GitHub (ex: `xbz-proxy`)
2. No Railway: New Project → Deploy from GitHub → selecionar o repo
3. Adicionar variável de ambiente: `XBZ_TOKEN=54238`
4. Copiar a URL gerada (ex: `xbz-proxy-production.up.railway.app`)

## Endpoints

| Rota | Descrição |
|------|-----------|
| `GET /` | Health check |
| `GET /v1/categoria` | Lista todas as categorias |
| `GET /v1/produto?search=caneta` | Busca produtos |
| `GET /v1/produto?categoria=ID` | Filtra por categoria |
| `GET /v1/produto/CODIGO` | Detalhe de um produto |
| `GET /img?url=URL_IMAGEM` | Proxy de imagem XBZ |

## Variáveis de ambiente

| Variável | Valor |
|----------|-------|
| `PORT` | (Railway define automaticamente) |
| `XBZ_TOKEN` | `54238` |
