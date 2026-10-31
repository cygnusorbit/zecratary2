/**
 * Authoritative Production Standalone Server Entry Point for Hostinger LiteSpeed FCGI (lsnode)
 * Resolves Next.js standalone build, manages port binding dynamically, and handles graceful shutdown.
 */
const path = require('path');
const fs = require('fs');
const net = require('net');

process.env.NODE_ENV = 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Check if a specific TCP port is available
function checkPortAvailable(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

// Find first available port starting from startPort
async function getAvailablePort(startPort, host) {
  let port = startPort;
  while (port < startPort + 50) {
    const isFree = await checkPortAvailable(port, host);
    if (isFree) return port;
    port++;
  }
  return startPort;
}

// Register clean shutdown handlers so Ctrl+C releases the port immediately
function registerGracefulShutdown() {
  const shutdown = (sig) => {
    console.log(`\n[Hostinger LSNode] Caught ${sig}. Shutting down cleanly...`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function startServer() {
  registerGracefulShutdown();

  const specifiedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
  let finalPort;

  if (specifiedPort) {
    // If explicitly assigned (Hostinger runtime environment), honor it directly
    finalPort = specifiedPort;
  } else {
    // Local development/testing: check port 3000 or pick next available
    finalPort = await getAvailablePort(3000, process.env.HOSTNAME);
  }

  process.env.PORT = String(finalPort);
  console.log(`[Hostinger LSNode] Bootstrapping production runner on port ${finalPort}...`);

  // Candidate standalone server entry points built by Next.js
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
    // Change working directory to standalone root so internal node_modules and chunks resolve
    process.chdir(path.dirname(standaloneEntry));
    try {
      require(standaloneEntry);
    } catch (err) {
      console.error('[FATAL] Failed to execute standalone server:', err);
      process.exit(1);
    }
  } else {
    console.log('[Hostinger LSNode] Standalone bundle not found at root. Checking workspace fallback...');
    
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
        port: finalPort
      });
      const handle = app.getRequestHandler();

      app.prepare().then(() => {
        const server = http.createServer((req, res) => handle(req, res));
        server.listen(finalPort, process.env.HOSTNAME, () => {
          console.log(`[Hostinger LSNode] Server ready on http://${process.env.HOSTNAME}:${finalPort}`);
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
}

startServer();
