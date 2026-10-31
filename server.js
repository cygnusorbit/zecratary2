/**
 * Authoritative Production Server Runner for Hostinger LiteSpeed FCGI & Cloud VPS
 * Handles dynamic module resolution and Next.js standalone / workspace fallback
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const Module = require('module');

// 1. Configure production environment and network bindings
process.env.NODE_ENV = 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`[Hostinger Runner] Bootstrapping on http://${process.env.HOSTNAME}:${PORT}...`);

// 2. Register all workspace and standalone node_modules into Node's search paths
// Prevents "Cannot find module 'next'" under LiteSpeed FCGI (lsnode.js)
const candidateModulePaths = [
  path.join(__dirname, 'node_modules'),
  path.join(__dirname, 'apps/web/node_modules'),
  path.join(__dirname, 'apps/web/.next/standalone/node_modules'),
  path.join(__dirname, 'apps/web/.next/standalone/apps/web/node_modules'),
  path.join(__dirname, '.next/standalone/node_modules')
];

candidateModulePaths.forEach((p) => {
  if (fs.existsSync(p)) {
    if (!module.paths.includes(p)) {
      module.paths.unshift(p);
    }
    if (Module.globalPaths && !Module.globalPaths.includes(p)) {
      Module.globalPaths.unshift(p);
    }
  }
});

// 3. Search for Next.js standalone entry points
const candidateStandalonePaths = [
  path.join(__dirname, 'apps/web/.next/standalone/apps/web/server.js'),
  path.join(__dirname, 'apps/web/.next/standalone/server.js'),
  path.join(__dirname, '.next/standalone/apps/web/server.js'),
  path.join(__dirname, '.next/standalone/server.js')
];

let standaloneServer = null;
for (const p of candidateStandalonePaths) {
  if (fs.existsSync(p)) {
    standaloneServer = p;
    break;
  }
}

// 4. Execution mode routing
if (standaloneServer) {
  console.log(`[Hostinger Runner] Launching Next.js standalone bundle: ${standaloneServer}`);
  process.chdir(path.dirname(standaloneServer));
  try {
    require(standaloneServer);
  } catch (err) {
    console.error('[FATAL] Failed to start standalone server:', err);
    process.exit(1);
  }
} else {
  console.log('[Hostinger Runner] Standalone bundle not found. Starting standard Next.js instance...');
  try {
    const next = require('next');
    const app = next({
      dev: false,
      dir: path.join(__dirname, 'apps/web'),
      hostname: process.env.HOSTNAME,
      port: PORT
    });
    const handle = app.getRequestHandler();

    app.prepare().then(() => {
      const server = http.createServer((req, res) => {
        handle(req, res);
      });

      server.listen(PORT, process.env.HOSTNAME, () => {
        console.log(`[Hostinger Runner] Server ready and listening on http://${process.env.HOSTNAME}:${PORT}`);
      });
    }).catch((err) => {
      console.error('[FATAL] Next.js app.prepare() failed:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('[FATAL] Could not initialize Next.js server:', err);
    process.exit(1);
  }
}
