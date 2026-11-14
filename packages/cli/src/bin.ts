#!/usr/bin/env node
const [dir] = process.argv.slice(2);

if (!dir) {
  console.error("Usage: seedlayer <directory>");
  process.exit(1);
}

console.log(`seedlayer: would create a project in ${dir}`);
