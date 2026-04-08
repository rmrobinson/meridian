import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Read env from web-timeline/ (where .env.local lives), no prefix filter so
  // BACKEND_URL (not exposed to the browser) is also available here.
  const env = loadEnv(mode, __dirname, '');

  const plugins = [];

  if (env.BACKEND_URL) {
    // Real backend: proxy /api/* to the backend server.
    // The browser always makes same-origin requests; Vite forwards them
    // server-side so there are no CORS issues.
    console.log(`[vite] proxying /api → ${env.BACKEND_URL}`);
  } else {
    // No backend configured: serve the mock fixture for /api/timeline,
    // replicating the serve.json rewrite that npx-serve used to handle.
    plugins.push({
      name: 'mock-api',
      configureServer(server) {
        server.middlewares.use('/api/timeline', (_req, res) => {
          const fixture = path.join(
            __dirname,
            'app/tests/fixtures/mock-timeline.json',
          );
          res.setHeader('Content-Type', 'application/json');
          fs.createReadStream(fixture).pipe(res);
        });
      },
    });
  }

  return {
    root: 'app',
    envDir: __dirname,
    server: {
      port: 3000,
      proxy: env.BACKEND_URL
        ? { '/api': { target: env.BACKEND_URL, changeOrigin: true } }
        : undefined,
    },
    plugins,
  };
});
