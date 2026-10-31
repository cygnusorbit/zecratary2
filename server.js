/**
 * Production Standalone Runner for Hostinger Cloud & VPS
 * Bridges root entry to apps/web Next.js standalone build
 */
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`[Hostinger Runner] Initializing server on http://${process.env.HOSTNAME}:${PORT}`);

const candidatePaths = [
  path.join(__dirname, 'apps/web/.next/standalone/apps/web/server.js'),
  path.join(__dirname, 'apps/web/.next/standalone/server.js'),
  path.join(__dirname, '.next/standalone/apps/web/server.js'),
  path.join(__dirname, '.next/standalone/server.js')
];

let targetServer = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    targetServer = p;
    break;
  }
}

if (!targetServer) {
  console.error('[FATAL] Next.js standalone server entry point was not found.');
  console.error('Candidate locations checked:');
  candidatePaths.forEach((p) => console.error(`  - ${p}`));
  console.error('\nRun "npm run build" to generate the standalone bundle.');
  process.exit(1);
}

console.log(`[Hostinger Runner] Loading standalone server from: ${targetServer}`);

// Change working directory to the directory containing the standalone server
// This ensures relative module imports, node_modules, and chunks resolve properly
process.chdir(path.dirname(targetServer));

try {
  require(targetServer);
} catch (err) {
  console.error('[FATAL] Uncaught runtime exception while starting Next.js standalone server:', err);
  process.exit(1);
}
