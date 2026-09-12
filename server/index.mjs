import express from 'express';
import { resolve } from 'node:path';
import { createApi } from './api.mjs';

const port = Number(process.env.PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024-65535.');
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Use system trust or NODE_EXTRA_CA_CERTS instead of disabling TLS.');
const origin = `http://localhost:${port}`;
const app = express();
app.disable('x-powered-by');
app.use((request, response, next) => {
  response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self), microphone=()' });
  if (request.headers.host !== new URL(origin).host) return response.sendStatus(403);
  let pathname;
  try { pathname = decodeURIComponent(request.path); } catch { return response.sendStatus(400); }
  if (pathname.split('/').some(segment => segment.startsWith('.')) || /^\/(server|tests|stuff|@fs)(\/|$)/.test(pathname)) return response.sendStatus(404);
  next();
});
app.use('/api', createApi({ apiKey: process.env.OPENAI_API_KEY, origin, visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4.1' }));
app.use('/api', (_request, response) => response.sendStatus(404));
let vite;
if (process.argv.includes('--production')) {
  app.use(express.static(resolve('dist'), { dotfiles: 'deny' }));
  app.get('/', (_request, response) => response.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, allowedHosts: ['localhost'] }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, '127.0.0.1', () => console.log(`SignFlow Live: ${origin}`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port in use. Set PORT to another local port.' : 'Local server could not start.');
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  server.closeAllConnections();
  server.close();
  await vite?.close();
  process.exit(0);
});
