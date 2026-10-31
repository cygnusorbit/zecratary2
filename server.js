/**
 * Authoritative Production Standalone Server Runner for Hostinger LiteSpeed FCGI (lsnode)
 * Resolves Next.js standalone server whether executed from repo root or standalone root.
 */
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`[Hostinger LSNode] Bootstrapping production runner on port ${PORT}...`);

// Comprehensive search paths for Next.js standalone server:
// 1. If running from standalone root (Hostinger publishes .next/standalone to /nodejs)
// 2. If running from repository root (Hostinger runs from repository root)
const candidatePaths = [
  path.join(__dirname, 'apps/web/server.js'),
  path.join(__dirname, 'apps/web/.next/standalone/apps/web/server.js'),
  path.join(__dirname, '.next/standalone/apps/web/server.js'),
  path.join(__dirname, 'apps/web/.next/standalone/server.js'),
  path.join(__dirname, '.next/standalone/server.js')
];

let targetServer = null;
for (const p of candidatePaths) {
  // Prevent infinite self-execution if current file is server.js
  if (p !== __filename && fs.existsSync(p)) {
    targetServer = p;
    break;
  }
}

if (targetServer) {
  console.log(`[Hostinger LSNode] Found standalone entry point at: ${targetServer}`);
  // Change working directory to standalone app directory so relative assets and node_modules resolve
  process.chdir(path.dirname(targetServer));
  try {
    require(targetServer);
  } catch (err) {
    console.error('[FATAL] Failed to start standalone server:', err);
    process.exit(1);
  }
} else {
  console.log('[Hostinger LSNode] Standalone server not found. Searching fallback paths...');
  
  const moduleDirs = [
    path.join(__dirname, 'node_modules'),
    path.join(__dirname, 'apps/web/node_modules'),
    path.join(__dirname, 'apps/web/.next/standalone/node_modules')
  ];

  moduleDirs.forEach((dir) => {
    if (fs.existsSync(dir) && !module.paths.includes(dir)) {
      module.paths.unshift(dir);
    }
  });

  let nextModule = null;
  const nextCandidates = [
    path.join(__dirname, 'apps/web/node_modules/next'),
    path.join(__dirname, 'node_modules/next'),
    'next'
  ];

  for (const cand of nextCandidates) {
    try {
      nextModule = require(cand);
      console.log(`[Hostinger LSNode] Resolved 'next' from: ${cand}`);
      break;
    } catch (e) {}
  }

  if (!nextModule) {
    console.error('[FATAL] Standalone build missing and "next" not found in candidate paths.');
    process.exit(1);
  }

  try {
    const http = require('http');
    const app = nextModule({
      dev: false,
      dir: path.join(__dirname, 'apps/web'),
      hostname: process.env.HOSTNAME,
      port: PORT
    });
    const handle = app.getRequestHandler();

    app.prepare().then(() => {
      const server = http.createServer((req, res) => handle(req, res));
      server.listen(PORT, process.env.HOSTNAME, () => {
        console.log(`[Hostinger LSNode] Server ready on http://${process.env.HOSTNAME}:${PORT}`);
      });
    }).catch((err) => {
      console.error('[FATAL] Next.js app.prepare() failed:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('[FATAL] Unable to initialize Next.js runtime:', err);
    process.exit(1);
  }
}
