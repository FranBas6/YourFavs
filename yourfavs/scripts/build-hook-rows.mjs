/**
 * Siembra el fondo de armario de la fila «Enganchan desde el primer episodio» (`homeRows/hooks`).
 *
 * Por qué un script manual y no un job: este proyecto NO tiene infraestructura de cron
 * (`netlify/functions/` no existe y `netlify.toml` no declara `[[scheduled]]`), y el cálculo son ~20
 * llamadas a TMDB por página de candidatas. Metido en el render de la portada la haría inaceptablemente
 * lenta. Así que: este script llena el documento de golpe, y a partir de ahí la app se mantiene sola con
 * recargas incrementales de UNA página (`POST /api/home/hooks-refresh`, que llama a `ensureHooksFresh`).
 *
 * El criterio se aplica una vez y se guardan LOS DOS márgenes (contra la media de la serie y contra la
 * de su propia T1), porque la misma llamada ya devuelve la primera temporada completa y sale gratis: así
 * cambiar `HOOK_BASELINE` en `hookRows.ts` no obliga a re-barrer TMDB.
 *
 * IDEMPOTENTE: fusiona por id con lo que ya hubiera, así que correrlo dos veces no duplica.
 *
 *   node scripts/build-hook-rows.mjs [--pages=20] [--region=ES] [--reset] [--dry-run]
 *
 * Usa TMDB_API_KEY y la service account de FIREBASE_ADMIN_KEY_B64 (.env).
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
// `--reset` reconstruye desde cero. Hace falta al cambiar el criterio: los ítems viejos no tienen el
// campo nuevo y quedarían fuera de la fila para siempre, ocupando sitio.
const reset = args.includes('--reset');
const pagesArg = Number((args.find((a) => a.startsWith('--pages=')) || '').split('=')[1]) || 20;
const region = (args.find((a) => a.startsWith('--region=')) || '').split('=')[1] || 'ES';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1];

const TMDB_KEY = pick('TMDB_API_KEY');
const SA_B64 = pick('FIREBASE_ADMIN_KEY_B64');
if (!TMDB_KEY) { console.error('Falta TMDB_API_KEY en .env'); process.exit(1); }
if (!SA_B64) { console.error('Falta FIREBASE_ADMIN_KEY_B64 en .env'); process.exit(1); }

const sa = JSON.parse(Buffer.from(SA_B64, 'base64').toString('utf8'));
const app = initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore(app);

// --- criterio (espejo de src/services/API/shared/hookRows.ts) -------------------------------------
const MIN_PILOT_VOTE = 8.0;
const MIN_PILOT_VOTES = 50;
const MIN_S1_SAMPLE = 3;
const MIN_EPISODE_VOTES = 20;
const MIN_START3 = 8.0;   // vara activa: los TRES primeros por encima de esto
const MAX_ITEMS = 120;

const round2 = (n) => Math.round(n * 100) / 100;

async function tmdb(path, params = {}) {
    const qs = new URLSearchParams({ api_key: TMDB_KEY, language: 'es-ES', ...params });
    const res = await fetch(`https://api.themoviedb.org/3${path}?${qs}`);
    if (!res.ok) throw new Error(`${res.status} en ${path}`);
    return res.json();
}

function hookItemFrom(detail, regions) {
    const eps = detail['season/1']?.episodes || [];
    const pilot = eps.find((e) => e.episode_number === 1) || eps[0];
    if (!pilot?.vote_average || !pilot.vote_count) return null;
    if (pilot.vote_average < MIN_PILOT_VOTE || pilot.vote_count < MIN_PILOT_VOTES) return null;
    const seriesVote = detail.vote_average || 0;
    if (!seriesVote) return null;

    const others = eps.filter(
        (e) => e.episode_number !== pilot.episode_number && (e.vote_count || 0) >= MIN_EPISODE_VOTES && (e.vote_average || 0) > 0,
    );
    const s1Mean = others.length >= MIN_S1_SAMPLE
        ? others.reduce((a, e) => a + e.vote_average, 0) / others.length
        : null;

    // Los tres primeros: hacen falta los TRES con votos suficientes, o no se puede afirmar nada.
    const first3 = eps.filter((e) => e.episode_number <= 3 && (e.vote_count || 0) >= MIN_EPISODE_VOTES && (e.vote_average || 0) > 0);
    const first3Min = first3.length >= 3 ? round2(Math.min(...first3.map((e) => e.vote_average))) : null;

    const marginSeries = round2(pilot.vote_average - seriesVote);
    const marginS1 = s1Mean === null ? null : round2(pilot.vote_average - s1Mean);
    // Se guarda si pasa CUALQUIERA de las tres varas, para poder cambiar de criterio sin re-barrer.
    const passesStart3 = first3Min !== null && first3Min >= MIN_START3;
    if (!passesStart3 && marginSeries <= 0 && (marginS1 === null || marginS1 <= 0)) return null;

    const providers = {};
    const results = detail['watch/providers']?.results || {};
    for (const r of regions) {
        const ids = (results[r]?.flatrate || []).map((p) => p.provider_id);
        if (ids.length) providers[r] = ids;
    }

    return {
        id: detail.id,
        name: detail.name || '',
        genreIds: (detail.genres || []).map((g) => g.id),
        posterPath: detail.poster_path ?? null,
        backdropPath: detail.backdrop_path ?? null,
        seriesVote: round2(seriesVote),
        s1Mean: s1Mean === null ? null : round2(s1Mean),
        first3Min,
        pilotName: pilot.name || 'Piloto',
        pilotVote: round2(pilot.vote_average),
        pilotVotes: pilot.vote_count,
        pilotRuntime: pilot.runtime ?? null,
        pilotStill: pilot.still_path ?? null,
        marginSeries,
        marginS1,
        providers,
    };
}

async function mapLimit(items, limit, fn) {
    const out = [];
    for (let i = 0; i < items.length; i += limit) {
        out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
    }
    return out;
}

// --- barrido ---------------------------------------------------------------------------------------
console.log(`Barriendo ${pagesArg} páginas de candidatas (región ${region})${dryRun ? ' [DRY RUN]' : ''}…`);

const ids = [];
for (let page = 1; page <= pagesArg; page++) {
    try {
        const r = await tmdb('/discover/tv', { sort_by: 'vote_count.desc', 'vote_count.gte': '200', page: String(page) });
        ids.push(...(r.results || []).map((x) => x.id));
    } catch (err) {
        console.warn(`  página ${page} falló: ${err.message}`);
    }
}
console.log(`  ${ids.length} candidatas`);

const details = await mapLimit(ids, 8, async (id) => {
    try {
        return await tmdb(`/tv/${id}`, { append_to_response: 'season/1,watch/providers' });
    } catch {
        return null;
    }
});

const fresh = details.map((d) => (d ? hookItemFrom(d, [region]) : null)).filter(Boolean);
console.log(`  ${fresh.length} cumplen el criterio (${((fresh.length / Math.max(ids.length, 1)) * 100).toFixed(0)}%)`);

const bySeries = fresh.filter((i) => i.marginSeries > 0).length;
const byS1 = fresh.filter((i) => i.marginS1 !== null && i.marginS1 > 0).length;
const byStart3 = fresh.filter((i) => i.first3Min !== null && i.first3Min >= MIN_START3).length;
console.log(`  arranque sostenido (E1-E3 >= ${MIN_START3}): ${byStart3}  ·  superan la SERIE: ${bySeries}  ·  superan su T1: ${byS1}`);

console.log('\n  Top 12 por arranque sostenido (la vara ACTIVA):');
[...fresh].filter((i) => i.first3Min !== null && i.first3Min >= MIN_START3)
    .sort((a, b) => (b.first3Min * 100 + b.pilotVote) - (a.first3Min * 100 + a.pilotVote))
    .slice(0, 12)
    .forEach((i) => console.log(`   E1-E3 desde ${i.first3Min.toFixed(2)}  piloto ${i.pilotVote}  serie ${i.seriesVote}  ${i.name}`));

console.log('\n  Top 12 por margen sobre la serie:');
[...fresh].sort((a, b) => b.marginSeries - a.marginSeries).slice(0, 12).forEach((i) => {
    console.log(`   +${i.marginSeries.toFixed(2)}  piloto ${i.pilotVote} (${i.pilotVotes}v) vs serie ${i.seriesVote}  ${i.name}`);
});
console.log('\n  Top 12 por margen sobre su T1:');
[...fresh].filter((i) => i.marginS1 !== null).sort((a, b) => b.marginS1 - a.marginS1).slice(0, 12).forEach((i) => {
    console.log(`   +${i.marginS1.toFixed(2)}  piloto ${i.pilotVote} vs T1 ${i.s1Mean}  ${i.name}`);
});

if (dryRun) {
    console.log('\nDRY RUN: no se ha escrito nada.');
    process.exit(0);
}

const ref = db.collection('homeRows').doc('hooks');
const snap = await ref.get();
const existing = reset ? [] : ((snap.exists ? snap.data() : null)?.items || []);
const byId = new Map();
for (const it of existing) byId.set(it.id, it);
for (const it of fresh) byId.set(it.id, it);
const items = [...byId.values()]
    .sort((a, b) => ((b.first3Min ?? -9) * 100 + b.pilotVote) - ((a.first3Min ?? -9) * 100 + a.pilotVote))
    .slice(0, MAX_ITEMS);

await ref.set({
    updatedAt: Date.now(),
    // El cursor arranca donde acabó el barrido: las recargas incrementales siguen desde ahí.
    cursorPage: pagesArg + 1,
    claimedAt: 0,
    region,
    items,
}, { merge: true });

console.log(`\n✅ homeRows/hooks escrito: ${items.length} ítems (antes ${existing.length}).`);
process.exit(0);
