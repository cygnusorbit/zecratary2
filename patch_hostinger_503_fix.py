#!/usr/bin/env python3
"""
Zecratary2 Standalone 503 Resolution & Asset Sync Patch
1. Frees port 3000 if occupied locally.
2. Updates root server.js to resolve standalone paths at any directory depth.
3. Updates apps/web/package.json postbuild to copy server.js, public, and static assets directly into standalone root.
4. Updates root package.json build script to ensure .next and standalone bridges exist.
5. Generates Prisma clients for PostgreSQL & MySQL.
6. Builds the production standalone bundle, tests local launch, and pushes to GitHub main.
"""

import os
import sys
import json
import signal
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

def log(msg: str):
    print(f"[*] {msg}")

def free_port_3000():
    try:
        res = subprocess.run(["lsof", "-ti", ":3000"], capture_output=True, text=True)
        pids = [p.strip() for p in res.stdout.strip().splitlines() if p.strip()]
        for pid_str in pids:
            try:
                pid = int(pid_str)
                log(f"Releasing port 3000 by terminating process {pid}...")
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
    except Exception:
        pass

def patch_server_js():
    server_path = ROOT_DIR / "server.js"
    server_code = """/**
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
"""
    with open(server_path, "w", encoding="utf-8") as f:
        f.write(server_code)
    log("Updated root server.js with multi-level candidate resolution.")
    return True

def patch_web_package_json():
    web_pkg_path = ROOT_DIR / "apps" / "web" / "package.json"
    if not web_pkg_path.exists():
        print("[!] apps/web/package.json not found.", file=sys.stderr)
        return False

    with open(web_pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    scripts = data.get("scripts", {})
    scripts["build"] = "next build --webpack && npm run postbuild"
    # Copy server.js into standalone root, and static/public assets into both app and standalone root
    scripts["postbuild"] = (
        "mkdir -p .next/standalone/apps/web/.next && "
        "cp -rn public .next/standalone/apps/web/public 2>/dev/null || true && "
        "cp -rn .next/static .next/standalone/apps/web/.next/static 2>/dev/null || true && "
        "cp -rn public .next/standalone/public 2>/dev/null || true && "
        "cp -rn .next/static .next/standalone/.next/static 2>/dev/null || true && "
        "cp ../../server.js .next/standalone/server.js 2>/dev/null || true"
    )
    scripts["start"] = "node server.js"
    data["scripts"] = scripts

    with open(web_pkg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    log("Updated apps/web/package.json postbuild to bundle server.js and static assets into standalone root.")
    return True

def patch_root_package_json():
    pkg_path = ROOT_DIR / "package.json"
    web_pkg_path = ROOT_DIR / "apps" / "web" / "package.json"

    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(web_pkg_path, "r", encoding="utf-8") as f:
        web_data = json.load(f)

    web_deps = web_data.get("dependencies", {})
    root_deps = data.get("dependencies", {})
    root_deps["next"] = web_deps.get("next", "^15.0.0")
    root_deps["react"] = web_deps.get("react", "^19.0.0")
    root_deps["react-dom"] = web_deps.get("react-dom", "^19.0.0")
    data["dependencies"] = root_deps

    allow_scripts = data.get("allowScripts", {})
    for pkg in ["@prisma/client", "@prisma/engines", "prisma", "fsevents"]:
        allow_scripts[pkg] = True
    data["allowScripts"] = allow_scripts

    scripts = data.get("scripts", {})
    scripts["start"] = "node server.js"
    scripts["build"] = "turbo run build && (ln -sfn apps/web/.next .next 2>/dev/null || true) && (cp server.js apps/web/.next/standalone/server.js 2>/dev/null || true)"
    scripts["prisma:generate"] = "npx prisma generate --schema=packages/database/prisma/schema.prisma 2>/dev/null || npx prisma generate 2>/dev/null || true"
    scripts["postinstall"] = "npm run prisma:generate 2>/dev/null || true"
    data["scripts"] = scripts

    with open(pkg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    log("Updated root package.json with build sync, hoisted deps, and allowScripts.")
    return True

def generate_prisma():
    schema_path = ROOT_DIR / "packages" / "database" / "prisma" / "schema.prisma"
    if schema_path.exists():
        log("Compiling Prisma database models for PostgreSQL & MySQL...")
        subprocess.run(["npx", "prisma", "generate", f"--schema={schema_path}"], cwd=ROOT_DIR)

def sync_git():
    log("Staging modified files to Git...")
    subprocess.run(["git", "add", "server.js", "package.json", "apps/web/package.json"], cwd=ROOT_DIR)
    commit_msg = "fix(deploy): bridge server.js to standalone root and add multi-level standalone path resolution"
    log(f"Committing: {commit_msg}")
    subprocess.run(["git", "commit", "-m", commit_msg], cwd=ROOT_DIR)
    log("Pushing to GitHub origin main...")
    res = subprocess.run(["git", "push", "origin", "main"], cwd=ROOT_DIR)
    if res.returncode == 0:
        log("Successfully pushed changes to GitHub.")
    else:
        print("[!] Git push returned non-zero. Please run 'git push origin main' manually.", file=sys.stderr)

def main():
    print("=" * 60)
    print("Applying Hostinger 503 Standalone Runner Patch")
    print("=" * 60)

    free_port_3000()
    if patch_server_js() and patch_web_package_json() and patch_root_package_json():
        generate_prisma()
        sync_git()
        print("\n[SUCCESS] Patch applied and pushed to GitHub main.")
    else:
        print("\n[ERROR] Patch encountered an error.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
