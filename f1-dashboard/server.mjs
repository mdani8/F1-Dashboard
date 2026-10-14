import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createResultsService } from './results-service.mjs';

const defaultRoot = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
export function createServer({service = createResultsService(), staticRoot = defaultRoot} = {}) {
const root = path.resolve(staticRoot);
return http.createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {'Allow':'GET, HEAD'}).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) {
      const refresh = url.searchParams.get('refresh') === '1';
      const proxy = /^\/api\/jolpica\/(current\/races\/|20\d{2}\/(?:driverstandings|constructorstandings)\/)$/.exec(pathname);
      let result;
      let headers = {};
      if (proxy) {
        const upstream = await service.getJolpica(proxy[1],refresh);
        result = upstream.data;
        headers = {'X-Data-At':String(upstream.at),'X-Data-Stale':String(upstream.stale)};
      } else {
        const track = /^\/api\/weekends\/(20\d{2})\/([1-9]\d?)\/track$/.exec(pathname);
        const match = /^\/api\/weekends\/(20\d{2})\/([1-9]\d?)(?:\/sessions\/(practice-[123]|qualifying|sprint-qualifying|sprint|race)(\/laps)?)?$/.exec(pathname);
        if (!match && !track) { res.writeHead(404, {'Content-Type':'application/json'}).end(JSON.stringify({message:'Unknown API endpoint.'})); return; }
        if (track) result = await service.getTrack(track[1],track[2],refresh);
        else if (match[4]) {
          const driver = url.searchParams.get('driver');
          if (!/^[1-9]\d{0,2}$/.test(driver || '')) { res.writeHead(400, {'Content-Type':'application/json'}).end(JSON.stringify({message:'Select a valid session driver number.'})); return; }
          result = await service.getLaps(match[1],match[2],match[3],Number(driver),refresh);
        } else result = match[3] ? await service.getSession(match[1],match[2],match[3],refresh) : await service.getWeekend(match[1],match[2],refresh);
      }
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store',...headers});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(result));
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (req.url.startsWith('/api/')) {
      const status = error.status === 404 ? 404 : error.status === 429 ? 429 : 502;
      res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store',...(error.retryAt ? {'Retry-After':String(Math.max(1,Math.ceil((error.retryAt - Date.now()) / 1000)))} : {})}).end(JSON.stringify({message:error.message || 'The data is unavailable.'}));
    } else res.writeHead(404).end('Not found');
  }
});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(5173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5173'));
}
