#!/usr/bin/env node

/**
 * Copy the standalone overlay build into the Laravel package. Composer
 * installs ship without a JavaScript build, so the file is committed.
 *
 * Usage: npm run build:laravel   (or --check to fail when it is stale)
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "packages/react/dist/snag.iife.js");
const target = resolve(root, "packages/laravel/resources/js/snag.js");

if (!existsSync(source)) {
  console.error(`Missing ${source}. Run npm run build -w @snag-tech/react first.`);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  const same = existsSync(target) && readFileSync(source).equals(readFileSync(target));
  if (!same) {
    console.error("packages/laravel/resources/js/snag.js is stale. Run npm run build:laravel and commit it.");
    process.exit(1);
  }
  console.log("Laravel bundle is up to date.");
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Copied ${source} -> ${target}`);
