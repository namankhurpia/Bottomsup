// Entry point: node server/main.js   (configure with environment variables)
import { startServer } from './index.js';

const server = await startServer({
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || './data',
  staticDir: process.env.STATIC_DIR || './dist',
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await server.close();
    process.exit(0);
  });
}
