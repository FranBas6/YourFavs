#!/usr/bin/env node
/**
 * Herramienta TEMPORAL de la reordenación de carpetas (docs/Estructura/PLAN_ESTRUCTURA.md). Se borra al
 * terminar la sesión 4.
 *
 *   node scripts/reorg/move.mjs <paso> --dry     ensayo en seco: qué se mueve y qué referencias cambian
 *   node scripts/reorg/move.mjs <paso>           mueve con `git mv` y rehace las referencias
 *   node scripts/reorg/move.mjs <paso> --check   solo busca rutas viejas del paso (tiene que dar 0)
 *
 * El mapa de cada paso está en `scripts/reorg/maps.mjs` (rutas relativas a `src/`; una entrada que
 * acaba en `/` mueve todos los archivos de esa carpeta, sin subcarpetas).
 *
 * Qué rehace:
 *   1. Imports de `src/` (normales, de tipos, de efecto, `import()`, `export … from`, `@import` de CSS,
 *      `<script src>`), tanto los que APUNTAN a un archivo movido como los que SALEN de él. Conserva el
 *      estilo de cada ruta (con o sin extensión).
 *   2. Rutas citadas como texto (comentarios, `ssrLoadModule('/src/…')`, `package.json`…): la ruta
 *      completa, con `src/` delante o sin él, y sus sufijos de 2+ carpetas si no son ambiguos
 *      (`API/shared/tmdbClient.ts`). Con y sin extensión.
 * No hay tests en el proyecto, así que no hay `vi.mock`/`jest.mock` que rehacer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listFiles, readImports } from '../structure/imports.mjs';
import { MAPS } from './maps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const [step] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const CHECK_ONLY = process.argv.includes('--check');
const WITH_DOCS = process.argv.includes('--docs');
if (!MAPS[step]) { console.error(`Paso desconocido: ${step}. Hay: ${Object.keys(MAPS).join(', ')}`); process.exit(2); }

const toPosix = (p) => p.split(path.sep).join('/');
const relSrc = (abs) => toPosix(path.relative(SRC, abs));
const abs = (r) => path.join(SRC, r);

// ---- 1. Expandir y validar el mapa -------------------------------------------------------------
const LOG = path.join(ROOT, 'scripts/reorg/log', `${step}.json`);
const moves = []; // [oldRel, newRel]
if (CHECK_ONLY && fs.existsSync(LOG)) moves.push(...JSON.parse(fs.readFileSync(LOG, 'utf8')));
else for (const [from, to] of MAPS[step]) {
    if (from.endsWith('/')) {
        const dir = abs(from);
        if (!fs.existsSync(dir)) { if (!CHECK_ONLY) die(`No existe la carpeta ${from}`); continue; }
        // Los archivos que tienen entrada propia en el mapa van donde dice esa entrada.
        const explicit = new Set(MAPS[step].filter(([f]) => !f.endsWith('/')).map(([f]) => f));
        for (const n of fs.readdirSync(dir)) {
            if (fs.statSync(path.join(dir, n)).isFile() && !explicit.has(from + n)) moves.push([from + n, to + n]);
        }
    } else moves.push([from, to]);
}
function die(msg) { console.error('✗ ' + msg); process.exit(1); }

// Textos que pueden citar rutas de src/ fuera de src/.
const EXTRA = ['package.json', 'astro.config.mjs', 'netlify.toml', 'tailwind.config.js', 'README.md', 'README.es.md', 'CLAUDE.md']
    .map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f))
    .concat(listFiles(path.join(ROOT, 'scripts'), /\.(mjs|js|ts)$/).filter((f) => !f.includes(`${path.sep}reorg${path.sep}`)));
const DOCS = WITH_DOCS ? listFiles(path.join(ROOT, 'docs'), /\.md$/).filter((f) => !f.includes(`${path.sep}Estructura${path.sep}`)) : [];

// ---- Rutas citadas como texto ------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripExt = (p) => p.replace(/\.(ts|tsx|js|mjs|astro|css)$/, '');
function mentionRules(pairs, allRel) {
    const rules = [];
    const suffixCount = new Map();
    for (const r of allRel) {
        const seg = r.split('/');
        for (let i = 1; i < seg.length - 1; i++) { const s = seg.slice(i).join('/'); suffixCount.set(s, (suffixCount.get(s) || 0) + 1); }
    }
    for (const [o, n] of pairs) {
        const variants = [[`src/${o}`, `src/${n}`], [o, n]];
        const seg = o.split('/');
        for (let i = 1; i < seg.length - 1; i++) {
            const s = seg.slice(i).join('/');
            if (suffixCount.get(s) === 1) variants.push([s, n]);
        }
        for (const [a, b] of variants) {
            rules.push({ find: a, repl: b });
            if (stripExt(a) !== a) rules.push({ find: stripExt(a), repl: stripExt(b), noExt: true });
        }
    }
    // Primero las más largas: `src/a/b/c.ts` antes que `b/c.ts`.
    return rules.sort((x, y) => y.find.length - x.find.length).map((r) => ({
        ...r,
        // Delante no puede haber otro trozo de ruta… salvo una `/` antes de `src/` (`'/src/x.ts'`).
        re: new RegExp(`${r.find.startsWith('src/') ? '(?<![\\w\\-.])' : '(?<![\\w\\-./])'}${esc(r.find)}${r.noExt ? '(?=$|[^\\w\\-/.]|\\.(?:\\s|$))' : '(?![\\w\\-])'}`, 'g'),
    }));
}
function applyMentions(text, rules) {
    const tokens = [];
    let changed = 0;
    for (const r of rules) {
        text = text.replace(r.re, () => { changed++; tokens.push(r.repl); return `\u0000${tokens.length - 1}\u0000`; });
    }
    return { text: text.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]), changed };
}

const allNowRel = listFiles(SRC).map(relSrc);

if (CHECK_ONLY) {
    // Una ruta vieja que siga citada en algún sitio (sin contar las que el mapa conserva).
    const stillThere = new Set(allNowRel);
    const pairs = moves.filter(([o]) => !stillThere.has(o));
    const rules = mentionRules(pairs, allNowRel.concat(pairs.map(([o]) => o)));
    let hits = 0;
    for (const f of listFiles(SRC).concat(EXTRA, DOCS)) {
        const t = fs.readFileSync(f, 'utf8');
        for (const r of rules) for (const m of t.matchAll(r.re)) { hits++; console.log(`  ${toPosix(path.relative(ROOT, f))}: «${m[0]}»`); }
    }
    console.log(hits ? `✗ ${hits} rutas viejas` : '✓ Rutas viejas del paso: 0');
    process.exit(hits ? 1 : 0);
}

const oldSet = new Set(moves.map(([o]) => o));
const newSet = new Set();
for (const [o, n] of moves) {
    if (!fs.existsSync(abs(o))) die(`No existe: src/${o}`);
    // En macOS `Cards/x` y `cards/x` son el mismo archivo: eso no es «ya existe».
    if (fs.existsSync(abs(n)) && abs(n).toLowerCase() !== abs(o).toLowerCase()) die(`Ya existe el destino: src/${n}`);
    if (newSet.has(n)) die(`Dos archivos van a: src/${n}`);
    newSet.add(n);
}
// Mayúsculas: en la carpeta de destino no puede haber otro archivo con el mismo nombre (sin extensión)
// salvo mayúsculas. En macOS/Windows son el mismo archivo y el import se confunde.
{
    const byDir = new Map();
    const put = (r) => { const d = path.posix.dirname(r); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(r); };
    for (const r of allNowRel) if (!oldSet.has(r)) put(r);
    for (const n of newSet) put(n);
    for (const [d, list] of byDir) {
        const seen = new Map();
        for (const r of list) {
            const k = stripExt(path.posix.basename(r)).toLowerCase();
            if (seen.has(k) && (newSet.has(r) || newSet.has(seen.get(k)))) die(`Choque de nombres en src/${d}/: ${path.posix.basename(seen.get(k))} y ${path.posix.basename(r)}`);
            seen.set(k, r);
        }
    }
}

// ---- 2. Calcular los textos nuevos -------------------------------------------------------------
const newOf = new Map(moves.map(([o, n]) => [abs(o), abs(n)]));
const rules = mentionRules(moves, allNowRel);
const out = new Map(); // ruta absoluta FINAL → texto
const report = [];
let specChanges = 0, mentionChanges = 0;

for (const file of listFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const finalPath = newOf.get(file) ?? file;
    const edits = [];
    for (const imp of readImports(file, text)) {
        if (!imp.target) continue;
        const target = newOf.get(imp.target) ?? imp.target;
        if (finalPath === file && target === imp.target) continue;
        let spec = toPosix(path.relative(path.dirname(finalPath), target));
        if (!/\.(ts|tsx|js|mjs|astro|css)$/.test(imp.spec.split('?')[0])) spec = stripExt(spec);
        if (!spec.startsWith('.')) spec = './' + spec;
        if (spec !== imp.spec) edits.push({ at: imp.at, len: imp.spec.length, spec, line: imp.line, old: imp.spec });
    }
    let next = text;
    for (const e of edits.sort((a, b) => b.at - a.at)) next = next.slice(0, e.at) + e.spec + next.slice(e.at + e.len);
    const m = applyMentions(next, rules);
    next = m.text;
    specChanges += edits.length; mentionChanges += m.changed;
    if (next !== text || finalPath !== file) out.set(finalPath, next);
    if (edits.length || m.changed) report.push(`  ${relSrc(file)}${finalPath !== file ? ' → ' + relSrc(finalPath) : ''}: ${edits.length} imports, ${m.changed} rutas en texto`);
}
for (const file of EXTRA.concat(DOCS)) {
    const text = fs.readFileSync(file, 'utf8');
    const m = applyMentions(text, rules);
    if (m.changed) { out.set(file, m.text); mentionChanges += m.changed; report.push(`  ${toPosix(path.relative(ROOT, file))}: ${m.changed} rutas en texto`); }
}

console.log(`Paso ${step}: ${moves.length} archivos a mover`);
for (const [o, n] of moves) console.log(`  git mv src/${o} → src/${n}`);
console.log(`\nReferencias: ${specChanges} imports y ${mentionChanges} rutas en texto, en ${report.length} archivos`);
console.log(report.join('\n'));
if (DRY) { console.log('\n(ensayo en seco: no se ha tocado nada)'); process.exit(0); }

// ---- 3. Mover y escribir -----------------------------------------------------------------------
// En dos tiempos, pasando por una carpeta temporal: así un cambio que solo toca mayúsculas
// (`Cards/` → `cards/`) crea la carpeta nueva de verdad, en vez de reutilizar la vieja en macOS.
const TMP = path.join(SRC, '.reorg-tmp');
const pruneEmpty = (start) => {
    let d = start;
    while (d.startsWith(SRC) && d !== SRC && fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); d = path.dirname(d); }
};
for (const [o, n] of moves) {
    fs.mkdirSync(path.dirname(path.join(TMP, n)), { recursive: true });
    execFileSync('git', ['mv', abs(o), path.join(TMP, n)], { cwd: ROOT });
}
for (const [o] of moves) pruneEmpty(path.dirname(abs(o)));
for (const [, n] of moves) {
    fs.mkdirSync(path.dirname(abs(n)), { recursive: true });
    execFileSync('git', ['mv', path.join(TMP, n), abs(n)], { cwd: ROOT });
}
for (const [, n] of moves) pruneEmpty(path.dirname(path.join(TMP, n)));
pruneEmpty(TMP);
for (const [file, text] of out) fs.writeFileSync(file, text);
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, JSON.stringify(moves, null, 1));
console.log('\n✓ Movido. Ahora: astro check, build, check:structure y `--check` de este paso.');
