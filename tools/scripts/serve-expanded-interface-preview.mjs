import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mockupRoot = path.join(repoRoot, 'docs', 'design', 'mockups');
const port = Number(process.env.DIRECTIVE_MOCKUP_PORT || 55835);
const referenceAssets = new Map([
  ['uss-breckenridge.hero.webp', path.join(repoRoot, 'assets', 'packages', 'breckenridge', 'images', 'ship', 'uss-breckenridge.hero.webp')],
  ...['mara-whitaker', 'hadrik-bronn', 'imani-cross', 'miriam-sato', 'rowan-saye', 'priya-nayar', 'kieran-vale']
    .map((id) => [`${id}.card.webp`, path.join(repoRoot, 'assets', 'packages', 'breckenridge', 'images', 'crew', `${id}.card.webp`)]),
  ...['campaign', 'mission', 'crew', 'ship', 'settings']
    .map((id) => [`route-${id}.svg`, path.join(repoRoot, 'assets', 'icons', 'directive-vector-glyphs-v1', 'icons', `route-${id}.svg`)])
]);

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

createServer((request, response) => {
  const pathname = String(request.url || '/').split('?')[0];
  let absolutePath;
  if (pathname === '/' || pathname === '/reference') {
    absolutePath = path.join(mockupRoot, 'directive-expanded-interface.html');
  } else if (pathname === '/production') {
    absolutePath = path.join(repoRoot, 'tools', 'fixtures', 'expanded-interface-runtime.html');
  } else if (pathname === '/runtime-shell') {
    absolutePath = path.join(repoRoot, 'tools', 'fixtures', 'expanded-interface-runtime-shell.html');
  } else if (pathname.startsWith('/files/')) {
    absolutePath = referenceAssets.get(path.basename(pathname));
  } else {
    absolutePath = path.resolve(repoRoot, `.${pathname}`);
  }
  if (!absolutePath || !existsSync(absolutePath)) {
    response.writeHead(404).end('Not found');
    return;
  }
  if (absolutePath !== repoRoot && !absolutePath.startsWith(`${repoRoot}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const stream = createReadStream(absolutePath);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType(absolutePath)
  });
  stream.pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Directive expanded interface preview: http://127.0.0.1:${port}/`);
});
