import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function configFilesMiddleware() {
  const configRoot = path.resolve(import.meta.dirname, 'src/config');

  function resolveConfigFile(reqUrl = '') {
    const cleanUrl = reqUrl.split('?')[0];
    const rel = decodeURIComponent(cleanUrl).replace(/^\/+/, '');
    if (!rel) return null;

    const target = path.resolve(configRoot, rel);
    const insideConfig = target === configRoot || target.startsWith(`${configRoot}${path.sep}`);
    if (!insideConfig || !target.endsWith('.json')) return null;

    return target;
  }

  return {
    name: 'config-files-middleware',
    configureServer(server) {
      server.middlewares.use('/__config', (req, res, next) => {
        const filePath = resolveConfigFile(req.url);
        if (!filePath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Invalid config file path.' }));
          return;
        }

        if (req.method === 'GET') {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch (err) {
            res.statusCode = err.code === 'ENOENT' ? 404 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
          return;
        }

        if (req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => {
            raw += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(raw);
              fs.mkdirSync(path.dirname(filePath), { recursive: true });
              fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
    handleHotUpdate({ file }) {
      const normalizedFile = path.resolve(file);
      if (
        (normalizedFile === configRoot || normalizedFile.startsWith(`${configRoot}${path.sep}`)) &&
        normalizedFile.endsWith('.json')
      ) {
        return [];
      }
    },
  };
}

function contentManifestPlugin() {
  const publicRoot = path.resolve(import.meta.dirname, 'public');
  const ALLOWED_ROOTS = ['engineContent', 'userContent'];
  const ALLOWED_FOLDERS = ['environments', 'models', 'prefabs', 'scenes'];
  const ALLOWED_EXTS = [
    '.scene.json',
    '.prefab.json',
    '.exr',
    '.hdr',
    '.glb',
    '.gltf',
    '.bin',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.tga',
  ];

  function getAssetExtension(filename) {
    const lower = filename.toLowerCase();
    return ALLOWED_EXTS.find((ext) => lower.endsWith(ext)) ?? null;
  }

  function scanPublicContent() {
    const packs = [];

    for (const scope of ALLOWED_ROOTS) {
      const scopeDir = path.join(publicRoot, scope);
      if (!fs.existsSync(scopeDir)) continue;

      const packEntries = fs
        .readdirSync(scopeDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const packDir of packEntries) {
        const packName = packDir.name;
        const folders = {};

        for (const folder of ALLOWED_FOLDERS) {
          const folderDir = path.join(scopeDir, packName, folder);
          const items = [];

          if (fs.existsSync(folderDir)) {
            const walk = (dir, relBase = '') => {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                  walk(full, rel);
                } else {
                  const ext = getAssetExtension(entry.name);
                  if (!ext) continue;
                  const logicalPath = `${scope}/${packName}/${folder}/${rel}`;
                  items.push({
                    name: entry.name.slice(0, -ext.length),
                    fileName: entry.name,
                    ext,
                    folder,
                    scope,
                    pack: packName,
                    logicalPath,
                    url: `/${logicalPath}`,
                  });
                }
              }
            };
            walk(folderDir);
          }

          folders[folder] = items;
        }

        packs.push({ scope, pack: packName, folders });
      }
    }

    return { generatedAt: Date.now(), packs };
  }

  return {
    name: 'public-content-manifest',
    configureServer(server) {
      const sseClients = new Set();
      let debounceTimer = null;

      const broadcastManifest = () => {
        if (sseClients.size === 0) return;
        const payload = `data: ${JSON.stringify(scanPublicContent())}\n\n`;
        for (const client of sseClients) {
          client.write(payload);
        }
      };

      const scheduleBroadcast = (changedPath = '') => {
        const normalized = path.resolve(changedPath);
        if (!normalized.startsWith(publicRoot)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(broadcastManifest, 120);
      };

      server.watcher.add(publicRoot);
      server.watcher.on('add', scheduleBroadcast);
      server.watcher.on('unlink', scheduleBroadcast);
      server.watcher.on('addDir', scheduleBroadcast);
      server.watcher.on('unlinkDir', scheduleBroadcast);

      server.middlewares.use('/__content-manifest', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanPublicContent(), null, 2));
      });

      server.middlewares.use('/__content-events', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(scanPublicContent())}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'content-manifest.json',
        source: JSON.stringify(scanPublicContent(), null, 2),
      });
    },
  };
}

export default defineConfig({
  root: 'src/root',
  publicDir: '../../public',
  plugins: [configFilesMiddleware(), contentManifestPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
