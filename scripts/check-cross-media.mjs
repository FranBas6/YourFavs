/** Verificación de crossMediaRelated contra la API real de TMDB. Carga el módulo TS con Vite. */
import fs from 'node:fs';
import { createServer } from 'vite';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/\r|"/g, '')]));

const server = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
    define: Object.fromEntries(Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])),
});
const M = await server.ssrLoadModule('/src/services/API/shared/crossMediaRelated.ts');

const SEEDS = [
    { label: 'SERIE Ataque a los Titanes', type: 'tv', id: 1429, title: 'Ataque a los Titanes', originalTitle: '進撃の巨人' },
    { label: 'PELI ESDLA: La Comunidad', type: 'movie', id: 120, title: 'El señor de los anillos: la Comunidad del Anillo', originalTitle: 'The Lord of the Rings: The Fellowship of the Ring' },
    { label: 'SERIE Anillos de Poder', type: 'tv', id: 84773, title: 'El Señor de los Anillos: los anillos de poder', originalTitle: 'The Lord of the Rings: The Rings of Power' },
    { label: 'PELI El Hobbit: un viaje inesperado', type: 'movie', id: 49051, title: 'El hobbit: un viaje inesperado', originalTitle: 'The Hobbit: An Unexpected Journey' },
    { label: 'SERIE Breaking Bad', type: 'tv', id: 1396, title: 'Breaking Bad', originalTitle: 'Breaking Bad' },
    { label: 'SERIE Downton Abbey', type: 'tv', id: 39052, title: 'Downton Abbey', originalTitle: 'Downton Abbey' },
    { label: 'SERIE Friends (control de ruido)', type: 'tv', id: 1668, title: 'Friends', originalTitle: 'Friends' },
    { label: 'SERIE Dark (control de ruido)', type: 'tv', id: 70523, title: 'Dark', originalTitle: 'Dark' },
    { label: 'SERIE Stranger Things (control)', type: 'tv', id: 66732, title: 'Stranger Things', originalTitle: 'Stranger Things' },
    // --- sentido película → serie ---
    { label: 'PELI Fargo', type: 'movie', id: 275, title: 'Fargo', originalTitle: 'Fargo' },
    { label: 'PELI Star Wars: Una nueva esperanza', type: 'movie', id: 11, title: 'La guerra de las galaxias', originalTitle: 'Star Wars' },
    { label: 'PELI El Padrino (control)', type: 'movie', id: 238, title: 'El padrino', originalTitle: 'The Godfather' },
    { label: 'PELI Harry Potter y la piedra filosofal', type: 'movie', id: 671, title: 'Harry Potter y la piedra filosofal', originalTitle: "Harry Potter and the Philosopher's Stone" },
    { label: 'SERIE Juego de Tronos', type: 'tv', id: 1399, title: 'Juego de tronos', originalTitle: 'Game of Thrones' },
    { label: 'SERIE The Walking Dead', type: 'tv', id: 1402, title: 'The Walking Dead', originalTitle: 'The Walking Dead' },
];

for (const s of SEEDS) {
    const trace = [];
    const t0 = Date.now();
    const res = await M.getCrossMediaRelated(s, trace);
    console.log(`\n### ${s.label}  (${Date.now() - t0}ms)`);
    if (!res.length) console.log('   (nada — sección no se pinta)');
    for (const r of res) console.log(`   ✅ ${r.title} (${r.year ?? '—'})  · chip: "${r.reason}"`);
    for (const d of trace.filter(d => !d.accepted)) {
        const g = d.signals;
        console.log(`   ⛔ ${d.candidate}  [match=${g.titleMatch} raiz=${g.rootWords}p/${g.rootChars}c votos=${g.voteCount} raras=${g.rareShared.map(k => k.name + '(' + k.uses + ')').join(',') || '—'}${g.isDocumentary ? ' DOC' : ''}]`);
    }
}
await server.close();
process.exit(0);
