import fs from 'fs';

const p = 'src/db.ts';
let s = fs.readFileSync(p, 'utf8');

// Wrap return types for export async function ... ): TYPE {
s = s.replace(/export async function ([^(]+\([^)]*\)): ([^{]+)\{/g, (_m, sig, ret) => {
  const t = ret.trim();
  if (t.startsWith('Promise<')) return `export async function ${sig}: ${t} {`;
  return `export async function ${sig}: Promise<${t}> {`;
});

// async internal helpers: ): void { -> Promise<void>
const internals = [
  'async function migrate',
  'async function seed',
  'async function ensureSecondAdminPost',
  'async function ensureUserAdiletMail',
];
for (const prefix of internals) {
  s = s.replace(new RegExp(`(${prefix}[^\\n]+): void \\{`, 'g'), '$1: Promise<void> {');
}

fs.writeFileSync(p, s);
console.log('Patched return types');
