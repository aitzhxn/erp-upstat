/**
 * One-off style transformer: replaces better-sqlite3 `database.prepare(...).run|get|all`
 * with `await run|get|all(...)` from pgClient. Run from backend/: node scripts/transform-db-sqlite-to-pg.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function readStringLiteral(s, start) {
  const q = s[start];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    if (q === '`' && s[i] === '$' && s[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < s.length && depth > 0) {
        if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
          const sub = readStringLiteral(s, i);
          if (sub) {
            i = sub.end;
            continue;
          }
        }
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
      }
      continue;
    }
    if (s[i] === q) return { end: i + 1 };
    i++;
  }
  throw new Error(`Unterminated string at ${start}`);
}

function readIdentifier(s, start) {
  let i = start;
  if (!(i < s.length && /[$A-Za-z_]/.test(s[i]))) return null;
  while (i < s.length && /[$A-Za-z0-9_]/.test(s[i])) i++;
  return { end: i, text: s.slice(start, i) };
}

function readBalancedParens(s, openIdx) {
  if (s[openIdx] !== '(') throw new Error('expected (');
  let i = openIdx + 1;
  let depth = 1;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const sub = readStringLiteral(s, i);
      i = sub.end;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    i++;
  }
  return { end: i, inner: s.slice(openIdx + 1, i - 1) };
}

function transformPrepareCalls(src) {
  const needle = 'database.prepare';
  let out = '';
  let i = 0;
  while (i < src.length) {
    const j = src.indexOf(needle, i);
    if (j === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, j);
    let pos = j + needle.length;
    pos = skipWs(src, pos);
    if (src[pos] !== '(') {
      out += needle;
      i = j + needle.length;
      continue;
    }
    const sqlOpen = pos;
    pos = skipWs(src, sqlOpen + 1);
    let sqlExpr;
    if (src[pos] === '`' || src[pos] === "'" || src[pos] === '"') {
      const end = readStringLiteral(src, pos).end;
      sqlExpr = src.slice(pos, end);
      pos = end;
    } else {
      const id = readIdentifier(src, pos);
      if (!id) throw new Error(`Bad prepare at ${j}`);
      sqlExpr = id.text;
      pos = id.end;
    }
    pos = skipWs(src, pos);
    if (src[pos] !== ')') throw new Error(`Expected ) after SQL near ${j}`);
    pos++;
    pos = skipWs(src, pos);
    // Stored statement: const insert = database.prepare(`...`); then insert.run(...) — skip
    if (src[pos] !== '.') {
      out += src.slice(j, pos);
      i = pos;
      continue;
    }
    pos++;
    const m = readIdentifier(src, pos);
    if (!m || !['run', 'get', 'all'].includes(m.text)) {
      throw new Error(`Unknown prepare method near ${j}: ${m?.text}`);
    }
    pos = m.end;
    pos = skipWs(src, pos);
    if (src[pos] !== '(') throw new Error(`Expected ( after ${m.text} near ${j}`);
    const argsBlock = readBalancedParens(src, pos);
    const inner = argsBlock.inner.trim();
    const argsArr = inner.length === 0 ? '[]' : `[${inner}]`;
    const fn = m.text === 'run' ? 'run' : m.text === 'get' ? 'get' : 'all';
    out += `await ${fn}(${sqlExpr}, ${argsArr})`;
    i = argsBlock.end;
  }
  return out;
}

function main() {
  const dbPath = path.join(__dirname, '..', 'src', 'db.ts');
  let s = fs.readFileSync(dbPath, 'utf8');

  const headerOld = `import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { PostWithHolder, PostHolder, User } from './types';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.db');
const database = new Database(dbPath);
database.pragma('foreign_keys = ON');
`;

  const headerNew = `import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { PostWithHolder, PostHolder, User } from './types';
import { execRaw, run, get, all, transaction, clientRun, clientGet, clientAll } from './pgClient';
`;

  if (!s.includes('import Database from')) {
    console.error('db.ts already transformed or unexpected header');
    process.exit(1);
  }
  s = s.replace(headerOld, headerNew);

  s = s.replace(/database\.exec\(/g, 'await execRaw(');

  s = transformPrepareCalls(s);

  fs.writeFileSync(dbPath, s);
  console.log('Wrote', dbPath);
}

main();
