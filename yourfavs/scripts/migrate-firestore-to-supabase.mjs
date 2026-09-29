/**
 * Copia usuarios + datos de Firestore a Supabase (esquema de supabase/migrations/…_initial_schema.sql).
 *
 * Es EL MISMO script para las dos cosas que hacen falta, para que el ensayo pruebe exactamente
 * lo que luego se ejecuta en producción:
 *
 *   · Sembrar el Supabase LOCAL con tus datos reales de la BD de test (yourfavsbd):
 *       npm run db:start
 *       node scripts/migrate-firestore-to-supabase.mjs --dry-run      ← solo lee y cuenta
 *       node scripts/migrate-firestore-to-supabase.mjs                 ← destino local, lee .env
 *     Los usuarios locales se crean con contraseña `--password` (por defecto `yourfavs-local`),
 *     para poder entrar con tu email de siempre.
 *
 *   · Migrar PRODUCCIÓN (Fase 5), a propósito con dos banderas explícitas:
 *       node scripts/migrate-firestore-to-supabase.mjs --env=.env.migration --target=env
 *     `--env` es el archivo del que salen FIREBASE_ADMIN_KEY_B64 (origen) y, con `--target=env`,
 *     SUPABASE_URL + SUPABASE_SECRET_KEY (destino). En prod los usuarios se crean SIN contraseña:
 *     quien entraba con Google entra igual (Supabase vincula por email) y quien usaba
 *     contraseña la restablece una vez.
 *
 * Idempotente: por cada usuario borra lo que ya tuviera en Supabase y lo vuelve a escribir, así
 * que se puede repetir tras corregir algo sin duplicar filas (el diario no tiene clave natural,
 * un upsert no bastaría). La cuenta de Auth se reutiliza si ya existe ese email.
 *
 * Lecturas de Firestore: una por documento, una sola vez. Nunca imprime secretos.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------------------
// Argumentos y entorno
// ---------------------------------------------------------------------------------------

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, ...v] = a.replace(/^--/, '').split('=');
        return [k, v.length ? v.join('=') : true];
    }),
);
const DRY = args['dry-run'] === true;
const TARGET = args.target || 'local';
const ENV_FILE = args.env || '.env';
const LOCAL_PASSWORD = typeof args.password === 'string' ? args.password : 'yourfavs-local';
const ONLY_UID = typeof args.uid === 'string' ? args.uid : null;

function readEnvFile(file) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const out = {};
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\r$/, '').trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
    return out;
}

const env = readEnvFile(ENV_FILE);
if (!env.FIREBASE_ADMIN_KEY_B64) throw new Error(`Falta FIREBASE_ADMIN_KEY_B64 en ${ENV_FILE}`);
const sa = JSON.parse(Buffer.from(env.FIREBASE_ADMIN_KEY_B64, 'base64').toString('utf8'));

function supabaseTarget() {
    if (TARGET === 'local') {
        const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
        return { url: status.API_URL, key: status.SECRET_KEY || status.SERVICE_ROLE_KEY };
    }
    if (TARGET === 'env') {
        if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error(`Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en ${ENV_FILE}`);
        return { url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY };
    }
    throw new Error(`--target desconocido: ${TARGET} (usa local o env)`);
}

// Salvaguarda: un .env de test nunca debe acabar escribiendo en un Supabase remoto por error,
// ni la BD de producción sembrando el local sin querer.
if (TARGET === 'env' && ENV_FILE === '.env') throw new Error('--target=env exige un --env explícito (p. ej. .env.migration)');

const fbApp = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const fdb = getFirestore(fbApp);
const fauth = getAuth(fbApp);

const target = DRY ? null : supabaseTarget();
const sb = target ? createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

console.log(`Origen Firestore: ${sa.project_id}`);
console.log(`Destino Supabase: ${DRY ? '(dry-run, no escribe)' : `${TARGET} → ${target.url}`}`);

// ---------------------------------------------------------------------------------------
// Conversión de tipos
// ---------------------------------------------------------------------------------------

/** Timestamp de Firestore, Date, ISO o milisegundos → ISO (o null). */
function ts(v) {
    if (v == null || v === '') return null;
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'number') return new Date(v).toISOString();
    if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
    if (typeof v?._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
    return null;
}
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const text = (v) => (typeof v === 'string' && v !== '' ? v : null);
const mediaType = (v) => (v === 'movie' || v === 'tv' ? v : null);
/** Día de Madrid (YYYY-MM-DD) de un instante: mismo criterio que appDateParts. */
const madridDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));

const LIST_COLLECTIONS = [
    'MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies', 'MoviesViendo',
    'SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto', 'SeriesAbandonadas',
];
/** Todo lo que sabemos traducir. Una subcolección que no esté aquí se AVISA, no se pierde en silencio. */
const KNOWN = new Set([
    ...LIST_COLLECTIONS, 'WatchedEpisodes', 'WatchLog', 'Activity', 'Ratings', 'MediaTags', 'SpoilerPrefs',
    'NotificationSubs', 'notifications', 'notifMeta', 'meta', 'taste', 'ActorsFavs', 'FollowedPeople',
    'customLists', 'media',
]);

// ---------------------------------------------------------------------------------------
// Firestore → filas
// ---------------------------------------------------------------------------------------

async function readUserTree(fuid) {
    const root = fdb.collection('users').doc(fuid);
    const [rootSnap, subs] = await Promise.all([root.get(), root.listCollections()]);
    const cols = {};
    for (const c of subs) cols[c.id] = (await c.get()).docs;
    const listItems = {};
    for (const d of cols.customLists || []) listItems[d.id] = (await d.ref.collection('items').get()).docs;
    return { profile: rootSnap.exists ? rootSnap.data() : {}, cols, listItems };
}

function toRows(tree, userId, fuid, skipped) {
    const { profile: p, cols, listItems } = tree;
    const docs = (name) => cols[name] || [];
    const skip = (what, why) => skipped.push(`${what}: ${why}`);
    const rows = {};
    const put = (table, row) => (rows[table] ||= []).push(row);

    // Perfil. La URL del avatar llevaba el uid de Firebase dentro: se reescribe al nuevo.
    rows.profile = {
        display_name: text(p.display_name), region: text(p.region), language: text(p.language),
        avatar_url: text(p.avatar_url)?.replace(`/api/profile/avatar/${fuid}`, `/api/profile/avatar/${userId}`) ?? null,
        theme: ['light', 'dark', 'system'].includes(p.theme) ? p.theme : null,
        email: text(p.email), onboarding: ['done', 'skipped'].includes(p.onboarding) ? p.onboarding : null,
        platforms: Array.isArray(p.platforms) ? p.platforms.map(int).filter((n) => n != null) : null,
        platforms_filter_default: typeof p.platformsFilterDefault === 'boolean' ? p.platformsFilterDefault : null,
        notif_prefs: p.notifPrefs ?? null, spoiler_free: typeof p.spoilerFree === 'boolean' ? p.spoilerFree : null,
        spoilers: p.spoilers ?? null, home_layout: p.homeLayout ?? null, firebase_uid: fuid,
    };

    for (const col of LIST_COLLECTIONS) {
        for (const d of docs(col)) {
            const x = d.data();
            const tmdb = int(d.id);
            if (tmdb == null) { skip(`${col}/${d.id}`, 'id no numérico'); continue; }
            put('library_items', {
                user_id: userId, collection: col, tmdb_id: tmdb, added_at: ts(x.added_at) ?? new Date(0).toISOString(),
                opinion: text(x.opinion), rating: num(x.rating) && x.rating <= 10 ? x.rating : null,
                position: Number.isFinite(x.position) ? x.position : null,
            });
        }
    }

    for (const d of docs('WatchedEpisodes')) {
        const serie = int(d.id);
        if (serie == null) { skip(`WatchedEpisodes/${d.id}`, 'id no numérico'); continue; }
        // El array puede traer el mismo episodio dos veces: gana el visionado más reciente.
        const byKey = new Map();
        for (const e of d.data().watched_episodes || []) {
            const season = int(e.season), episode = int(e.episode);
            if (season == null || episode == null) continue;
            const key = `${season}:${episode}`;
            const at = ts(e.watched_at);
            const prev = byKey.get(key);
            if (!prev || (at && (!prev.watched_at || at > prev.watched_at))) byKey.set(key, { season, episode, watched_at: at });
        }
        for (const e of byKey.values()) put('watched_episodes', { user_id: userId, serie_id: serie, ...e });
    }

    for (const d of docs('WatchLog')) {
        const x = d.data();
        const mt = mediaType(x.media_type), tmdb = int(x.tmdb_id);
        const logged = ts(x.logged_at);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(x.watched_on || '') ? x.watched_on : logged ? madridDay(logged) : null;
        if (!mt || tmdb == null || !day) { skip(`WatchLog/${d.id}`, 'falta media_type, tmdb_id o fecha'); continue; }
        put('watch_log', {
            user_id: userId, media_type: mt, tmdb_id: tmdb, season: int(x.season), episode: int(x.episode),
            watched_on: day, rewatch: x.rewatch === true, note: text(x.note), logged_at: logged ?? `${day}T12:00:00Z`,
            source: text(x.source),
        });
    }

    for (const d of docs('Activity')) {
        const x = d.data();
        const tmdb = int(x.tmdb_id);
        if (!x.verb || !['movie', 'tv', 'person'].includes(x.media_type) || tmdb == null) { skip(`Activity/${d.id}`, 'evento incompleto'); continue; }
        put('activity', { user_id: userId, verb: x.verb, media_type: x.media_type, tmdb_id: tmdb, logged_at: ts(x.logged_at) ?? new Date(0).toISOString(), meta: x.meta ?? null });
    }

    for (const d of docs('Ratings')) {
        const x = d.data();
        const mt = mediaType(x.media_type), tmdb = int(x.tmdb_id), score = num(x.score);
        if (!mt || tmdb == null || !score || score > 10) { skip(`Ratings/${d.id}`, 'nota incompleta'); continue; }
        put('ratings', { user_id: userId, media_type: mt, tmdb_id: tmdb, score, created_at: ts(x.created_at) ?? ts(x.updated_at), updated_at: ts(x.updated_at) ?? ts(x.created_at) });
    }

    for (const d of docs('MediaTags')) {
        const x = d.data();
        const mt = mediaType(x.media_type), tmdb = int(x.tmdb_id);
        if (!mt || tmdb == null) { skip(`MediaTags/${d.id}`, 'sin media_type o tmdb_id'); continue; }
        put('media_tags', { user_id: userId, media_type: mt, tmdb_id: tmdb, tags: Array.isArray(x.tags) ? x.tags.map(String) : [], notes: typeof x.notes === 'string' ? x.notes : '', updated_at: ts(x.updated_at) });
    }

    for (const d of docs('SpoilerPrefs')) {
        const x = d.data();
        const tmdb = int(x.tmdb_id ?? d.id.replace(/^tv_/, ''));
        if (tmdb == null || typeof x.spoilerFree !== 'boolean') { skip(`SpoilerPrefs/${d.id}`, 'incompleto'); continue; }
        put('spoiler_prefs', { user_id: userId, tmdb_id: tmdb, spoiler_free: x.spoilerFree, updated_at: ts(x.updated_at) });
    }

    for (const d of docs('NotificationSubs')) {
        const x = d.data();
        const mt = mediaType(x.media_type), tmdb = int(x.tmdb_id);
        if (!mt || tmdb == null) { skip(`NotificationSubs/${d.id}`, 'incompleto'); continue; }
        put('notification_subs', { user_id: userId, media_type: mt, tmdb_id: tmdb, added_at: ts(x.added_at) });
    }

    for (const d of docs('notifications')) {
        const x = d.data();
        if (!x.type) { skip(`notifications/${d.id}`, 'sin type'); continue; }
        put('notifications', {
            user_id: userId, id: d.id, type: x.type, title: text(x.title), subtitle: text(x.subtitle), href: text(x.href),
            poster_path: text(x.poster_path), created_at: ts(x.created_at), read: x.read === true,
        });
    }

    const state = (key, data) => data && put('user_state', { user_id: userId, key, data });
    state('notif_provider_state', docs('notifMeta').find((d) => d.id === 'providerState')?.data());
    state('notif_sync', docs('meta').find((d) => d.id === 'notifSync')?.data());
    const taste = docs('taste').find((d) => d.id === 'current')?.data();
    if (taste) { const { updated_at, ...rest } = taste; state('taste', { ...rest, updated_at: ts(updated_at) }); }

    for (const d of docs('ActorsFavs')) {
        const x = d.data();
        const pid = int(d.id);
        if (pid == null) { skip(`ActorsFavs/${d.id}`, 'id no numérico'); continue; }
        put('actor_favs', { user_id: userId, person_id: pid, added_at: ts(x.added_at), position: Number.isFinite(x.position) ? x.position : null });
    }

    for (const d of docs('FollowedPeople')) {
        const x = d.data();
        const pid = int(d.id);
        if (pid == null) { skip(`FollowedPeople/${d.id}`, 'id no numérico'); continue; }
        put('followed_people', { user_id: userId, person_id: pid, name: text(x.name), profile_path: text(x.profile_path), added_at: ts(x.added_at) });
    }

    for (const d of docs('customLists')) {
        const x = d.data();
        put('custom_lists', {
            id: d.id, user_id: userId, name: text(x.name) ?? 'Sin nombre', description: typeof x.description === 'string' ? x.description : '',
            icon: text(x.icon), color_stamp: text(x.colorStamp), cover: x.cover ?? null, position: Number.isFinite(x.position) ? x.position : null,
            created_at: ts(x.created_at), updated_at: ts(x.updated_at),
        });
        for (const it of listItems[d.id] || []) {
            const y = it.data();
            const mt = mediaType(y.media_type), tmdb = int(y.tmdb_id);
            if (!mt || tmdb == null) { skip(`customLists/${d.id}/items/${it.id}`, 'incompleto'); continue; }
            put('custom_list_items', {
                list_id: d.id, user_id: userId, media_type: mt, tmdb_id: tmdb, title: text(y.title), poster_path: text(y.poster_path),
                position: Number.isFinite(y.position) ? y.position : null, added_at: ts(y.added_at),
            });
        }
    }

    const avatar = docs('media').find((d) => d.id === 'avatar')?.data();
    if (avatar?.data) rows.avatar = { bytes: Buffer.from(avatar.data, 'base64'), contentType: avatar.content_type || 'image/jpeg' };

    // `null` en una columna con default haría fallar el NOT NULL: se quita y manda el default
    // (ver `defaultToNull: false` en writeUser).
    for (const list of Object.values(rows)) {
        if (!Array.isArray(list)) continue;
        for (const r of list) for (const k of Object.keys(r)) if (r[k] === null && ['added_at', 'created_at', 'updated_at'].includes(k)) delete r[k];
    }
    return rows;
}

// ---------------------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------------------

/** Orden de borrado/escritura: los hijos (items) después de sus padres (listas). */
const TABLES = [
    'library_items', 'watched_episodes', 'watch_log', 'activity', 'ratings', 'media_tags', 'spoiler_prefs',
    'notification_subs', 'notifications', 'user_state', 'actor_favs', 'followed_people', 'custom_lists', 'custom_list_items',
];

async function must(p, what) {
    const { data, error } = await p;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
}

let authUsersByEmail = null;
async function findOrCreateAuthUser(fbUser) {
    if (!authUsersByEmail) {
        authUsersByEmail = new Map();
        for (let page = 1; ; page++) {
            const { users } = await must(sb.auth.admin.listUsers({ page, perPage: 1000 }), 'listar usuarios');
            for (const u of users) if (u.email) authUsersByEmail.set(u.email.toLowerCase(), u);
            if (users.length < 1000) break;
        }
    }
    const existing = authUsersByEmail.get(fbUser.email.toLowerCase());
    if (existing) return { id: existing.id, created: false };
    const { user } = await must(sb.auth.admin.createUser({
        email: fbUser.email,
        email_confirm: true,
        ...(TARGET === 'local' ? { password: LOCAL_PASSWORD } : {}),
        user_metadata: { display_name: fbUser.displayName || null, firebase_uid: fbUser.uid },
    }), `crear ${fbUser.email}`);
    return { id: user.id, created: true };
}

async function writeUser(userId, rows) {
    for (const t of [...TABLES].reverse()) await must(sb.from(t).delete().eq('user_id', userId), `vaciar ${t}`);
    // Sin los nulos: lo que Firestore no tenía no debe pisar lo que ya hay (el email lo pone
    // el trigger desde Auth, y el perfil de Firestore casi nunca lo guardaba).
    const profile = Object.fromEntries(Object.entries(rows.profile).filter(([, v]) => v !== null));
    await must(sb.from('profiles').update(profile).eq('id', userId), 'perfil');
    for (const t of TABLES) {
        const list = rows[t] || [];
        // defaultToNull: false → una columna que falta en una fila toma su DEFAULT, no NULL
        // (PostgREST rellena con NULL las columnas que solo traen otras filas del lote).
        for (let i = 0; i < list.length; i += 500) await must(sb.from(t).insert(list.slice(i, i + 500), { defaultToNull: false }), `insertar ${t}`);
    }
    if (rows.avatar) {
        await must(sb.storage.from('avatars').upload(`${userId}/avatar`, rows.avatar.bytes, { contentType: rows.avatar.contentType, upsert: true }), 'avatar');
    }
}

async function countInSupabase(userId) {
    const out = {};
    for (const t of TABLES) {
        const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', userId);
        if (error) throw new Error(`contar ${t}: ${error.message}`);
        out[t] = count;
    }
    return out;
}

// ---------------------------------------------------------------------------------------
// Datos globales de la portada (homeRows/*) → app_state. Se regeneran solos si faltan,
// pero copiarlos evita una portada sin pilotos el primer día.
// ---------------------------------------------------------------------------------------

async function migrateGlobals() {
    const snap = await fdb.collection('homeRows').get();
    const rows = snap.docs.map((d) => {
        const { claimedAt, ...data } = d.data();
        return { key: d.id, data, claimed_at: 0 };
    });
    if (!DRY && rows.length) await must(sb.from('app_state').upsert(rows, { onConflict: 'key' }), 'app_state');
    return rows.length;
}

// ---------------------------------------------------------------------------------------

const fbUsers = [];
let pageToken;
do {
    const res = await fauth.listUsers(1000, pageToken);
    fbUsers.push(...res.users);
    pageToken = res.pageToken;
} while (pageToken);

const selected = fbUsers.filter((u) => (ONLY_UID ? u.uid === ONLY_UID : true));
console.log(`Usuarios en Firebase Auth: ${fbUsers.length}${ONLY_UID ? ` (solo ${ONLY_UID})` : ''}\n`);

let problems = 0;
for (const u of selected) {
    if (!u.email) { console.log(`⚠️  ${u.uid}: sin email, no se puede crear en Supabase. Saltado.`); problems++; continue; }
    const tree = await readUserTree(u.uid);
    const unknown = Object.keys(tree.cols).filter((c) => !KNOWN.has(c));
    const skipped = [];
    const userId = DRY ? '00000000-0000-0000-0000-000000000000' : (await findOrCreateAuthUser(u)).id;
    const rows = toRows(tree, userId, u.uid, skipped);

    const providers = u.providerData.map((p) => p.providerId).join(', ') || 'ninguno';
    console.log(`👤 ${u.email}  (firebase ${u.uid} → supabase ${DRY ? '—' : userId})  entra con: ${providers}`);
    if (!DRY) await writeUser(userId, rows);
    const counted = DRY ? null : await countInSupabase(userId);

    for (const t of TABLES) {
        const expected = (rows[t] || []).length;
        if (!expected && !(counted && counted[t])) continue;
        const got = counted ? counted[t] : '—';
        const ok = !counted || got === expected;
        if (!ok) problems++;
        console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(18)} ${String(expected).padStart(5)} leídas → ${String(got).padStart(5)} en Supabase`);
    }
    if (rows.avatar) console.log(`   ✓ avatar             ${Math.round(rows.avatar.bytes.length / 1024)} KB`);
    if (unknown.length) { problems++; console.log(`   ⚠️  subcolecciones SIN traducir (no se han copiado): ${unknown.join(', ')}`); }
    if (skipped.length) { console.log(`   ⚠️  ${skipped.length} documentos descartados:`); for (const s of skipped.slice(0, 15)) console.log(`      · ${s}`); }
    console.log('');
}

const globals = await migrateGlobals();
console.log(`🌍 portada global (homeRows → app_state): ${globals} documentos`);
console.log(problems ? `\n⚠️  Terminado con ${problems} avisos: revísalos arriba.` : '\n✅ Terminado sin diferencias.');
process.exit(problems ? 1 : 0);
