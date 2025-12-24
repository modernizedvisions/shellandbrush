import fs from 'node:fs';
import path from 'node:path';

const adminRoot = path.join(process.cwd(), 'functions', 'api', 'admin');
const canonical = path.join(process.cwd(), 'functions', 'api', '_lib', 'adminAuth.ts');

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
};

walk(adminRoot);

let hasMissing = false;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const importMatch = content.match(/from\s+['\"]([^'\"]*_lib\/adminAuth)['\"]/);
  if (!importMatch) {
    continue;
  }

  const importPath = importMatch[1];
  const resolved = path.resolve(path.dirname(file), importPath) + '.ts';
  const exists = fs.existsSync(resolved);
  if (!exists) {
    hasMissing = true;
    console.error(`Missing adminAuth for ${file}: ${resolved}`);
  }
}

if (!fs.existsSync(canonical)) {
  hasMissing = true;
  console.error(`Canonical adminAuth missing: ${canonical}`);
}

process.exit(hasMissing ? 1 : 0);