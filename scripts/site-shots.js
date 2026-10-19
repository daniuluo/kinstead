// Pictures for the landing page (img/), taken in the game itself.
//
//   node scripts/site-shots.js [port]      (default 8121)
//
// then open http://localhost:<port>/shots in a browser (the app's browser
// pane will do, hidden or not). The page is the game (play/) with
// scripts/site-shots-page.js added: it sets up each shot in a real town
// (the starter towns, a merged valley), draws it with the game's renderer,
// and posts the picture back here, which writes img/<name>.png. Pixel-art
// shots are saved at the art's own resolution (one pixel per art pixel), so
// they stay tiny and the page scales them up crisply.
//
// Retake them when the game's look changes; the site check
// (scripts/site-check.js) only checks they exist.
//
// It also serves the whole site like serve.ps1, so the landing page and the
// wiki can be looked at from the same address.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8121;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'POST' && url.pathname === '/shot') {
    const name = url.searchParams.get('name') || '';
    if (!/^[a-z0-9-]+\.(png|webp|jpg)$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; if (body.length > 40e6) req.destroy(); });
    req.on('end', () => {
      const m = body.match(/^data:image\/(?:png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) { res.writeHead(400).end('not a picture'); return; }
      const buf = Buffer.from(m[1], 'base64');
      fs.mkdirSync(path.join(ROOT, 'img'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'img', name), buf);
      console.log(`img/${name}  ${(buf.length / 1024).toFixed(1)} KB`);
      res.writeHead(200).end('ok');
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/log') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { console.log('page:', body.slice(0, 2000)); res.writeHead(200).end('ok'); });
    return;
  }
  if (url.pathname === '/shots') {
    // the game, with the shot-taking script added
    const html = fs.readFileSync(path.join(ROOT, 'play/index.html'), 'utf8')
      .replace('<head>', '<head>\n  <base href="/play/">')
      .replace('</body>', '  <script type="module" src="/scripts/site-shots-page.js"></script>\n</body>');
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }).end(html);
    return;
  }
  let p = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }).end(); return; }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Kinstead shots: open http://localhost:${PORT}/shots  (the site itself is at http://localhost:${PORT}/)`));
