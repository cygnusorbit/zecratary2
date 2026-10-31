/**
 * Production Standalone Runner for Hostinger LiteSpeed FCGI (lsnode)
 * Executes Next.js standalone bundle directly without top-level require('next')
 */
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`[Hostinger LSNode] Bootstrapping production runner on port ${PORT}...`);

// Search candidate standalone server entry points built by Next.js
const standaloneCandidates = [
  path.join(__dirname, 'apps/web/.next/standalone/apps/web/server.js'),
  path.join(__dirname, 'apps/web/.next/standalone/server.js'),
  path.join(__dirname, '.next/standalone/apps/web/server.js'),
  path.join(__dirname, '.next/standalone/server.js')
];

let standaloneEntry = null;
for (const cand of standaloneCandidates) {
  if (fs.existsSync(cand)) {
    standaloneEntry = cand;
    break;
  }
}

if (standaloneEntry) {
  console.log(`[Hostinger LSNode] Found standalone entry point at: ${standaloneEntry}`);
  // Change working directory to standalone root so its internal node_modules resolve
  process.chdir(path.dirname(standaloneEntry));
  try {
    require(standaloneEntry);
  } catch (err) {
    console.error('[FATAL] Failed to execute standalone server:', err);
    process.exit(1);
  }
} else {
  console.log('[Hostinger LSNode] Standalone bundle not found at root. Checking workspace fallback...');
  
  // Register fallback module paths
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

  try {
    const http = require('http');
    const next = require('next');
    const app = next({
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
