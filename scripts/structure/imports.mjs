/**
 * Lector de imports de `src/` — lo usan `scripts/check-structure.mjs` (fronteras entre carpetas) y la
 * herramienta temporal de reordenación. Sin dependencias.
 *
 * Reconoce TODAS las formas con las que un archivo de `src/` apunta a otro por ruta relativa:
 *   import x from './a'          export { x } from './a'        import type { T } from './a'
 *   import './a.css'             import('./a')                  @import './a.css';   (CSS)
 *   <script src="./a.ts">        (en .astro)
 * Los imports de paquetes (`astro`, `@supabase/…`) no son rutas y se ignoran.
 */
import fs from 'node:fs';
import path from 'node:path';

export const CODE_EXT = /\.(ts|tsx|js|mjs|astro|css)$/;
const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.astro', '.css', '/index.ts', '/index.js'];

/** Cada patrón captura (1) la comilla y (2) la ruta. `kind` sale del propio patrón. */
export const SPEC_PATTERNS = [
    // import … from / export … from (también `import type` / `export type`)
    { kind: 'from', re: /(?<![\w$.])(import|export)(\s+type)?\s+[^'"`;]*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\3/g, quote: 3, spec: 4 },
    // import './x' (efecto: CSS, scripts de <script>)
    { kind: 'side', re: /(?<![\w$.])import\s*(['"])(\.{1,2}\/[^'"]+)\1/g, quote: 1, spec: 2 },
    // import('./x')
    { kind: 'dynamic', re: /(?<![\w$.])import\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g, quote: 1, spec: 2 },
    // @import './x.css' / @import url('./x.css')
    { kind: 'css', re: /@import\s+(?:url\()?\s*(['"])(\.{1,2}\/[^'"]+)\1/g, quote: 1, spec: 2 },
    // <script src="./x">
    { kind: 'script', re: /<script\b[^>]*\ssrc=(['"])(\.{1,2}\/[^'"]+)\1/g, quote: 1, spec: 2 },
];

export function listFiles(dir, filter = CODE_EXT) {
    const out = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (filter.test(e.name)) out.push(p);
        }
    })(dir);
    return out.sort();
}

/** Ruta de disco a la que apunta `spec` desde `fromFile`, o `null` si no existe. */
export function resolveSpec(fromFile, spec) {
    const base = path.resolve(path.dirname(fromFile), spec.split('?')[0]);
    for (const e of RESOLVE_EXT) {
        const c = base + e;
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
}

function lineOf(text, index) {
    let n = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

/**
 * Imports relativos de un archivo: `{ spec, kind, typeOnly, line, target }`.
 * `kind`: static | type | side | dynamic | css | script. `target`: ruta absoluta o null.
 */
export function readImports(file, text = fs.readFileSync(file, 'utf8')) {
    const out = [];
    const seen = new Set();
    for (const p of SPEC_PATTERNS) {
        for (const m of text.matchAll(p.re)) {
            const spec = m[p.spec];
            const at = m.index + m[0].lastIndexOf(spec);
            if (seen.has(at)) continue; // `import './x'` también lo ve el patrón de efecto
            seen.add(at);
            let kind = p.kind;
            if (kind === 'from') kind = m[2] ? 'type' : 'static';
            if (kind === 'side' && file.endsWith('.css')) continue;
            out.push({ spec, kind, typeOnly: kind === 'type', line: lineOf(text, at), at, target: resolveSpec(file, spec) });
        }
    }
    return out.sort((a, b) => a.at - b.at);
}
