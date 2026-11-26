import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 1420);
const reloadClients = new Set();
let reloadTimer;

// Watch the frontend files only; Rust changes are handled by Tauri itself.
fs.watch(rootDir, (event, filename) => {
  if (!filename || !/\.(html|js|css)$/i.test(filename.toString())) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of reloadClients) client.write('data: reload\n\n');
  }, 100);
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
  if (reqUrl.pathname === '/__dev_reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    reloadClients.add(res);
    req.on('close', () => reloadClients.delete(res));
    return;
  }
  let relPath = decodeURIComponent(reqUrl.pathname);
  if (relPath === '/') relPath = '/index.html';

  const safePath = path.normalize(path.join(rootDir, relPath));
  if (!safePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    if (ext === '.html') {
      const reloadScript = '<script>new EventSource("/__dev_reload").onmessage = () => location.reload();</script>';
      res.end(data.toString().replace(/<\/body>/i, `${reloadScript}</body>`));
    } else {
      res.end(data);
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Peng-Dog dev server listening on http://127.0.0.1:${port}`);
});
