import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TARGET = Number(process.env.TARGET_PORT || 8787)
const FRONT = Number(process.env.FRONT_PORT || 80)
const STATIC_DIR = process.env.STATIC_DIR || '/var/www/exelscci'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const data = fs.readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' })
  res.end(data)
}

function proxyApi(req, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: TARGET,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${TARGET}` },
  }
  const p = http.request(opts, (pr) => {
    res.writeHead(pr.statusCode || 502, pr.headers)
    pr.pipe(res)
  })
  p.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'api down', detail: String(e.message) }))
  })
  req.pipe(p)
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (u.pathname.startsWith('/api')) {
    proxyApi(req, res)
    return
  }

  // CORS preflight not needed for same-origin static
  let rel = decodeURIComponent(u.pathname)
  if (rel === '/') rel = '/index.html'
  const filePath = path.normalize(path.join(STATIC_DIR, rel))
  if (!filePath.startsWith(path.normalize(STATIC_DIR))) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath)
    return
  }
  // SPA fallback
  const index = path.join(STATIC_DIR, 'index.html')
  if (fs.existsSync(index)) {
    sendFile(res, index)
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Немає зібраного фронту в STATIC_DIR. Завантажте dist/ (версія з API) на сервер.')
})

server.listen(FRONT, '0.0.0.0', () => {
  console.log(`[exelscci-proxy] http://0.0.0.0:${FRONT} static=${STATIC_DIR} api→:${TARGET}`)
})
