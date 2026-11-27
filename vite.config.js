import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function readUiConfig(configRoot) {
  try {
    const raw = fs.readFileSync(path.join(configRoot, 'uiSettings.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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
  const configRoot = path.resolve(import.meta.dirname, 'src/config');

  function getContentRules() {
    const uiCfg = readUiConfig(configRoot);
    const cbCfg = uiCfg.contentBrowser ?? {};
    const saveCfg = uiCfg.sceneSave ?? {};

    const categories = Array.isArray(cbCfg.categories) ? cbCfg.categories : [];
    const allExts = categories
      .flatMap((c) => (Array.isArray(c.extensions) ? c.extensions : []))
      .map((e) => e.toLowerCase())
      .sort((a, b) => b.length - a.length);

    const folderRules = {};
    for (const [folderName, exts] of Object.entries(cbCfg.folderRules ?? {})) {
      folderRules[folderName.toLowerCase()] = Array.isArray(exts)
        ? exts.map((e) => e.toLowerCase()).sort((a, b) => b.length - a.length)
        : [];
    }

    return {
      allExts,
      folderRules,
      sceneExt: String(saveCfg.extension ?? '.scene.json').toLowerCase(),
      defaultSaveDir: String(saveCfg.defaultDirectory ?? '').replace(/^\/+|\/+$/g, ''),
      defaultSaveName: String(saveCfg.defaultName ?? 'untitled'),
    };
  }

  function matchAllowedExt(filename, folderName, rules) {
    const lower = filename.toLowerCase();
    const scopedExts = rules.folderRules[String(folderName ?? '').toLowerCase()] ?? rules.allExts;
    return scopedExts.find((ext) => lower.endsWith(ext)) ?? null;
  }

  function scanTreeNode(absDir, relLogicalPath, activeFolderRule, rules) {
    const node = {
      name: relLogicalPath ? path.posix.basename(relLogicalPath) : 'public',
      logicalPath: relLogicalPath,
      folderRule: activeFolderRule,
      directories: [],
      files: [],
    };

    if (!fs.existsSync(absDir)) return node;

    const entries = fs
      .readdirSync(absDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(absDir, entry.name);
      const childLogical = relLogicalPath ? `${relLogicalPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        const nextFolderRule = Object.prototype.hasOwnProperty.call(rules.folderRules, lowerName)
          ? lowerName
          : activeFolderRule;

        node.directories.push(scanTreeNode(fullPath, childLogical, nextFolderRule, rules));
      } else if (entry.isFile()) {
        const ext = matchAllowedExt(entry.name, activeFolderRule, rules);
        if (!ext) continue;

        node.files.push({
          name: entry.name.slice(0, -ext.length),
          fileName: entry.name,
          ext,
          folder: activeFolderRule ?? '',
          logicalPath: childLogical,
          url: `/${childLogical}`,
        });
      }
    }

    return node;
  }

  function scanPublicContent() {
    const rules = getContentRules();
    const tree = scanTreeNode(publicRoot, '', null, rules);
    return {
      generatedAt: Date.now(),
      tree,
    };
  }

  function resolvePublicSaveTarget(rawRelativePath, rules) {
    const fallbackFile = `${rules.defaultSaveName}${rules.sceneExt}`;
    const fallbackRel = rules.defaultSaveDir
      ? `${rules.defaultSaveDir}/${fallbackFile}`
      : fallbackFile;

    let clean = String(rawRelativePath ?? fallbackRel)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .trim();

    if (!clean) clean = fallbackRel;
    if (!clean.toLowerCase().endsWith(rules.sceneExt)) {
      clean = `${clean}${rules.sceneExt}`;
    }

    const target = path.resolve(publicRoot, clean);
    const insidePublic = target === publicRoot || target.startsWith(`${publicRoot}${path.sep}`);
    if (!insidePublic) return null;

    return {
      absPath: target,
      logicalPath: path.relative(publicRoot, target).split(path.sep).join('/'),
    };
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
        if (!normalized.startsWith(publicRoot) && !normalized.startsWith(configRoot)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(broadcastManifest, 120);
      };

      server.watcher.add(publicRoot);
      server.watcher.on('add', scheduleBroadcast);
      server.watcher.on('unlink', scheduleBroadcast);
      server.watcher.on('addDir', scheduleBroadcast);
      server.watcher.on('unlinkDir', scheduleBroadcast);
      server.watcher.on('change', (changedPath) => {
        if (path.resolve(changedPath) === path.join(configRoot, 'uiSettings.json')) {
          scheduleBroadcast(changedPath);
        }
      });

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

      server.middlewares.use('/__scene/save', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          try {
            const rules = getContentRules();
            const body = JSON.parse(raw);
            const resolved = resolvePublicSaveTarget(body?.logicalPath, rules);
            if (!resolved || !body?.data || typeof body.data !== 'object') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Invalid scene save payload or path.' }));
              return;
            }

            fs.mkdirSync(path.dirname(resolved.absPath), { recursive: true });
            fs.writeFileSync(
              resolved.absPath,
              `${JSON.stringify(body.data, null, 2)}\n`,
              'utf8'
            );

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, logicalPath: resolved.logicalPath }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
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
