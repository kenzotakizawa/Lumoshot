import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export interface TestServer {
  origin: string;
  close: () => Promise<void>;
}

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

export function startServer(handler: HttpHandler): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to resolve server address'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, doneErr) => {
            server.close((err) => (err ? doneErr(err) : done()));
          }),
      });
    });
  });
}

export function startRouteServer(
  routes: Record<string, { status: number; html: string }>
): Promise<TestServer> {
  return startServer((req, res) => {
    const url = req.url ?? '/';
    const route = routes[url] ?? routes['/'] ?? { status: 404, html: 'Not Found' };
    res.writeHead(route.status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(route.html);
  });
}

