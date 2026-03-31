/**
 * Bootstrap: sets temp directory BEFORE ESM imports hoist and cache os.tmpdir().
 *
 * Windows issue: Node.js caches os.tmpdir() result on first call.
 * Many tools (Lighthouse, chrome-launcher) call os.tmpdir() during import.
 * The \\?\ prefix on Windows temp paths causes EPERM errors with fs.mkdtemp.
 *
 * This file runs via --require (before ESM module loading) to:
 * 1. Set a clean temp dir without the \\?\ prefix
 * 2. Monkey-patch os.tmpdir to return our dir, since it caches eagerly
 */
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const os = require("node:os");

// Use a short path on the same drive — avoids \\?\ prefix issues
const drive = process.cwd().substring(0, 2);
const fixTmp = resolve(`${drive}/tmp/findx`);
mkdirSync(fixTmp, { recursive: true });

// Set env vars (affects child processes and some libs)
process.env.TMP = fixTmp;
process.env.TEMP = fixTmp;
process.env.TMPDIR = fixTmp;

// Monkey-patch os.tmpdir() since it caches on first call and may have already run
const originalTmpdir = os.tmpdir;
const patchedTmpdir = () => fixTmp;

// Replace the exported function — modules that import os.tmpdir get the patched version
// This works because Node.js module exports are shared references
try {
  os.tmpdir = patchedTmpdir;
} catch {
  // os.tmpdir might be read-only in some Node versions — that's OK, env vars are set
}

console.log(`[setup-tmp] Temp dir: ${fixTmp} (os.tmpdir=${os.tmpdir()})`);
