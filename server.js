import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const routes = new Map([
  ['/', ['public/index.html', 'text/html']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/app.js', ['public/app.js', 'text/javascript']],
  ['/lib/quiz.js', ['lib/quiz.js', 'text/javascript']],
  ['/lib/scheduler.js', ['lib/scheduler.js', 'text/javascript']],
  ['/lib/storage.js', ['lib/storage.js', 'text/javascript']],
  ['/examples/photosynthesis.md', ['examples/photosynthesis.md', 'text/plain']],
  ['/examples/french-revolution.md', ['examples/french-revolution.md', 'text/plain']],
  ['/examples/number-systems.md', ['examples/number-systems.md', 'text/plain']],
]);

export function makeServer() {
  return createServer(async (request, response) => {
    const pathname = request.url.split('?')[0];
    const route = routes.get(pathname);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    } else if (!route) {
      response.writeHead(404).end('Not found');
    } else {
      try {
        const [file, type] = route;
        const content = await readFile(new URL(file, import.meta.url));
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(request.method === 'HEAD' ? undefined : content);
      } catch {
        response.writeHead(500).end('Unable to load asset');
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  makeServer().listen(port, '127.0.0.1', function () {
    console.log(`QuizForge running at http://127.0.0.1:${this.address().port}`);
  });
}
