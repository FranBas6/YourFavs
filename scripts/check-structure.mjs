#!/usr/bin/env node
/**
 * Fronteras entre carpetas de `src/` (CLAUDE.md, «Reglas de frontera»). Sin dependencias.
 *
 *   node scripts/check-structure.mjs            sale con 1 si hay alguna infracción (`npm run check:structure`)
 *   node scripts/check-structure.mjs --report   solo informa; sale con 0 aunque las haya
 *
 * Reglas (el porqué de cada una está en CLAUDE.md, «Reglas de frontera»):
 *   R1  utils/ y types/ → solo utils/ y types/ (lo usa el navegador: nada de servidor)
 *   R2  scripts/ (navegador) → scripts/, utils/, types/ (los `import type` valen de cualquier sitio)
 *   R3  services/ → services/, utils/, types/ (el servidor no sabe de vistas)
 *   R4  infraestructura (services/db, tmdb, cache, http) → infraestructura, utils/, types/
 *   R5  components/ y layouts/ → todo menos pages/
 *   R6  pages/ → nunca otra ruta (sí sus ayudas `_*.ts`, que Astro no publica como ruta)
 *   R7  nada de import() entre temas distintos de services/ (salvo lista blanca, hoy vacía)
 *   R8  sin índices («barrels»): ni index.ts ni index.js fuera de pages/
 *   R9  carpetas en minúscula (fuera de pages/) y nunca dos archivos que solo difieran en mayúsculas
 *   R0  todo import relativo tiene que existir
 *   R10 sin ciclos al cargar (imports normales que se cierran en círculo), salvo los de la lista
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, readImports } from './structure/imports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const strict = !process.argv.includes('--report');
const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

const INFRA = new Set(['db', 'tmdb', 'cache', 'http']);

/**
 * R7 · `import()` entre temas de services/ permitidos. Vacía a propósito: los que había tapaban el ciclo de
 * la invalidación de cachés, que ya no existe (services/library/libraryChanges.ts). Un `import()` entre temas
 * suele esconder un ciclo; antes de añadir uno aquí, mira si se resuelve con un import normal (R10 avisará
 * si cierra un círculo). Formato: 'tema-origen -> tema-destino'.
 */
const DYNAMIC_ALLOW = new Set([]);

/** Capa de un archivo de src/: pages · layouts · components · scripts · services · infra · utils · types · styles · assets · root */
function layerOf(r) {
    const [a, b] = r.split('/');
    if (!r.includes('/')) return 'root';
    if (a === 'services') return INFRA.has(b) ? 'infra' : 'services';
    return a;
}
/** Tema dentro de services/ (`services/series/x.ts` → `series`). */
const domainOf = (r) => r.split('/')[1];

/**
 * R10 · Ciclos al cargar conocidos (archivos del ciclo, ordenados y unidos con « · »). Funcionan porque al
 * cargar solo se usan funciones, no constantes; no metas constantes compartidas entre ellos.
 */
const CYCLE_ALLOW = new Set([
    'utils/social/recUi.ts · utils/social/ui.ts',
]);

const files = listFiles(SRC);
/** Imports que se ejecutan AL CARGAR (no los de tipos ni los `import()`): la materia de R10. */
const loadEdges = new Map();
const problems = [];
const add = (rule, where, msg) => problems.push({ rule, where, msg });

for (const file of files) {
    const from = rel(file);
    const fl = layerOf(from);
    for (const imp of readImports(file)) {
        const where = `src/${from}:${imp.line}`;
        if (!imp.target) { add('R0', where, `no existe: ${imp.spec}`); continue; }
        const to = rel(imp.target);
        const tl = layerOf(to);
        if ((imp.kind === 'static' || imp.kind === 'side') && /\.(ts|tsx|js|mjs|astro)$/.test(to)) {
            if (!loadEdges.has(from)) loadEdges.set(from, new Set());
            loadEdges.get(from).add(to);
        }
        if (imp.typeOnly) {
            if (tl === 'pages' && !path.basename(to).startsWith('_') && fl !== 'pages') add('R6', where, `tipo importado de una ruta: ${to}`);
            continue;
        }
        const bad = (rule) => add(rule, where, `${fl} → ${to}`);
        switch (fl) {
            case 'utils': case 'types':
                if (!['utils', 'types'].includes(tl)) bad('R1');
                break;
            case 'scripts':
                if (!['scripts', 'utils', 'types'].includes(tl)) bad('R2');
                break;
            case 'infra':
                if (!['infra', 'utils', 'types'].includes(tl)) bad('R4');
                break;
            case 'services':
                if (!['services', 'infra', 'utils', 'types'].includes(tl)) bad('R3');
                else if (imp.kind === 'dynamic' && tl === 'services' && domainOf(from) !== domainOf(to)
                    && !DYNAMIC_ALLOW.has(`${domainOf(from)} -> ${domainOf(to)}`)) {
                    add('R7', where, `import() entre temas: ${domainOf(from)} → ${domainOf(to)} (${to})`);
                }
                break;
            case 'components': case 'layouts':
                if (tl === 'pages') bad('R5');
                break;
            case 'pages':
                // `_algo.ts` junto a sus rutas es la convención de Astro para ayudas que no son ruta.
                if (tl === 'pages' && !path.basename(to).startsWith('_')) bad('R6');
                break;
        }
    }
}

// R10 · ciclos al cargar (componentes fuertemente conexos de Tarjan con más de un archivo)
{
    let index = 0;
    const idx = new Map(), low = new Map(), onStack = new Set(), stack = [];
    const visit = (v) => {
        idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
        for (const w of loadEdges.get(v) || []) {
            if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
            else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        }
        if (low.get(v) === idx.get(v)) {
            const comp = [];
            let w;
            do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
            const key = comp.sort().join(' · ');
            if (comp.length > 1 && !CYCLE_ALLOW.has(key)) add('R10', `src/${comp[0]}`, `ciclo al cargar entre ${comp.length} archivos: ${key}`);
        }
    };
    for (const v of loadEdges.keys()) if (!idx.has(v)) visit(v);
}

// R8 · índices
for (const file of files) {
    const r = rel(file);
    if (!r.startsWith('pages/') && /(^|\/)index\.(ts|js|mjs|tsx)$/.test(r)) add('R8', `src/${r}`, 'índice («barrel») fuera de pages/');
}

// R9 · mayúsculas en carpetas y choques de nombre
const dirs = new Set(files.map((f) => path.dirname(rel(f))));
for (const d of dirs) {
    if (!d.startsWith('pages') && d !== '.' && d.split('/').some((seg) => seg !== seg.toLowerCase())) add('R9', `src/${d}/`, 'carpeta con mayúsculas');
    // Solo archivos: `amigos.astro` junto a la carpeta `amigos/` es como Astro anida rutas.
    const names = fs.readdirSync(path.join(SRC, d), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    const lower = new Map();
    for (const n of names) {
        const k = n.toLowerCase().replace(/\.[^.]+$/, '');
        if (lower.has(k) && lower.get(k) !== n) add('R9', `src/${d}/${n}`, `choca con ${lower.get(k)} (solo cambian mayúsculas o extensión)`);
        lower.set(k, n);
    }
}

const byRule = {};
for (const p of problems) byRule[p.rule] = (byRule[p.rule] || 0) + 1;
for (const p of problems.sort((a, b) => a.rule.localeCompare(b.rule) || a.where.localeCompare(b.where))) {
    console.log(`${p.rule}  ${p.where}  ${p.msg}`);
}
const summary = Object.entries(byRule).map(([r, n]) => `${r}: ${n}`).join(' · ');
console.log(problems.length ? `\n${problems.length} infracciones (${summary})` : 'Estructura: sin infracciones.');
if (strict && problems.length) process.exit(1);
