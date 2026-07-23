import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design', 'mockups');
const port = Number(process.env.DIRECTIVE_MOCKUP_PORT || 55835);

createServer((request, response) => {
  const requested = request.url === '/' ? '/directive-expanded-interface.html' : String(request.url || '').split('?')[0];
  const absolutePath = path.resolve(root, `.${requested}`);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const stream = createReadStream(absolutePath);
  stream.on('error', () => response.writeHead(404).end('Not found'));
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': absolutePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'
  });
  stream.pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Directive expanded interface preview: http://127.0.0.1:${port}/`);
});
