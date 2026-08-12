/**
 * Las filas CURADAS de la portada del catálogo, una por modo.
 *
 * La regla, del handoff y respetada aquí: **cada fila sale de una consulta que se puede escribir en
 * una línea**. Es lo que separa una fila con criterio de rellenar la página. TMDB es casi infinito;
 * llenar filas es fácil, llenarlas bien no. Y por eso cada una lleva su `why`: el criterio se pinta
 * en la cabecera, así que el usuario puede comprobar por qué está viendo eso.
 *
 * Lo que NO entra, y por qué:
 *   · «Premiadas» — TMDB no tiene campo de premios y las keywords están vacías (comprobado:
 *     `academy award winner` devuelve 2 películas en total, `palme d'or` 1). Su hueco lo ocupa
 *     «Joyas poco vistas», que sí sale de un campo.
 *   · «Miniseries de 1 temporada y menos de 8 episodios» — `number_of_seasons` y
 *     `number_of_episodes` NO existen en `/discover/tv`, solo en el detalle de cada título. Se usa
 *     `with_type=2`, que es el tipo *Miniseries* de TMDB: dato del propio título y una sola llamada.
 */
import type { CatalogMode } from '../catalogUrl';

export interface CatalogRowDef {
    key: string;
    title: string;
    /** Qué promete la fila, en una línea. */
    subtitle?: string;
    /** El criterio, tal cual, para el chip de la cabecera. */
    why: string;
    /** Qué pide a TMDB. `both` = las dos consultas, y la fila sale con dos carriles. */
    media: 'movie' | 'tv' | 'both';
    /** Params de discover que definen la fila (ver `discoverContent({ extraParams })`). */
    params: Record<string, string>;
    /**
     * Params que solo valen para un medio, encima de `params`. Hacen falta porque **los IDs de género
     * de TMDB son distintos en cine y en TV** (Acción es 28 en películas y 10759 en series), así que
     * una fila de género en modo «Todo» no puede usar el mismo `with_genres` para las dos consultas.
     */
    movieParams?: Record<string, string>;
    tvParams?: Record<string, string>;
    sortBy?: string;
    /** `vote_count.gte`: el suelo de fiabilidad de la fila. */
    voteCountMin?: string;
    color: 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'pink' | 'slate';
    icon: string;
    /** A dónde lleva «Ver más», ya con el modo puesto. */
    link: string;
}

/** Aventura (12) y Acción (28) en cine. */
const POPCORN_GENRES = '12,28';

const MINISERIES: CatalogRowDef = {
    key: 'miniseries',
    // La maqueta la titulaba «se ven en una sentada» con el criterio «1 temporada, menos de 8
    // episodios». Ese criterio NO se puede consultar (`number_of_episodes` no existe en discover), y
    // con `with_type=2` entran miniseries de nueve episodios: «una sentada» sería mentira.
    title: 'Miniseries · empiezan y acaban',
    subtitle: 'Una sola temporada, con final. Sin comprometerte a cinco años.',
    why: 'tipo = Miniserie',
    media: 'tv',
    params: { with_type: '2' },
    sortBy: 'vote_count.desc',
    voteCountMin: '200',
    color: 'purple',
    icon: 'square-stack',
    link: '/catalogo/fila/miniseries',
};

const TERMINADAS: CatalogRowDef = {
    key: 'terminadas',
    title: 'Terminadas · sin riesgo de cancelación',
    subtitle: 'Tienen final. Puedes empezarlas sabiendo que llega a algún sitio.',
    // «status = Ended» era jerga de TMDB colándose a la interfaz. Este dice lo mismo, es igual de
    // comprobable y usa el vocabulario que el propio panel de filtros ya enseña («Finalizada»).
    why: 'estado = Finalizada',
    media: 'tv',
    params: { with_status: '3' },
    sortBy: 'vote_count.desc',
    voteCountMin: '500',
    color: 'green',
    icon: 'check-check',
    link: '/catalogo/fila/terminadas',
};

const CORTAS: CatalogRowDef = {
    key: 'cortas',
    title: 'Menos de 90 minutos',
    subtitle: 'Para las noches en que empiezas tarde.',
    // El handoff ya corrige el «100 minutos» de la maqueta: el bucket que existe corta en 90 y no
    // se añade un parámetro nuevo para ganar diez minutos.
    why: 'duración ≤ 90 min',
    media: 'movie',
    params: { 'with_runtime.lte': '90', 'with_runtime.gte': '60' },
    sortBy: 'vote_average.desc',
    voteCountMin: '500',
    color: 'blue',
    icon: 'clock',
    link: '/catalogo/fila/cortas',
};

/**
 * Ordenar por POPULARIDAD con un filtro de género colapsa la fila a la franquicia de turno: la
 * primera versión devolvía cinco Spider-Man de ocho. Y por NOTA se convierte en «las mejores de
 * aventura de la historia», que ya es Top películas con otro nombre. Por taquilla sí son palomitas
 * de verdad — taquillazos con nota decente — y el `dedupeFranchises` del servicio se encarga de que
 * no salgan cuatro Vengadores seguidos.
 */
const PALOMITAS: CatalogRowDef = {
    key: 'palomitas',
    title: 'Para ver con palomitas',
    subtitle: 'Taquillazos de aventura y acción que no piden nada a cambio.',
    why: 'aventura y acción, nota ≥ 6,5, por taquilla',
    media: 'movie',
    params: { with_genres: POPCORN_GENRES, 'vote_average.gte': '6.5' },
    sortBy: 'revenue.desc',
    voteCountMin: '1000',
    color: 'amber',
    icon: 'popcorn',
    link: '/catalogo/fila/palomitas',
};

/**
 * La sustituta de «Premiadas». El techo de votos es lo que la hace interesante: aclamadas que NO son
 * mainstream. Sin ese techo sería otra fila de lo más visto.
 *
 * Las ventanas de votos están medidas, no elegidas a ojo: con el suelo en 300 TMDB devolvía nota
 * inflada de títulos oscuros («Socias por accidente», 8,9 con 347 votos). Subiéndolo salen joyas de
 * verdad — Los siete samuráis, Cinema Paradiso, A Silent Voice, La ventana indiscreta. Las series
 * necesitan una ventana más baja porque acumulan menos votos que el cine.
 */
const JOYAS: CatalogRowDef = {
    key: 'joyas',
    title: 'Joyas poco vistas',
    subtitle: 'Muy bien valoradas y sin llegar al gran público.',
    why: 'nota ≥ 7,5 y pocos votos',
    media: 'movie',
    params: { 'vote_average.gte': '7.5' },
    movieParams: { 'vote_count.gte': '2500', 'vote_count.lte': '8000' },
    tvParams: { 'vote_count.gte': '1500', 'vote_count.lte': '6000' },
    sortBy: 'vote_average.desc',
    color: 'pink',
    icon: 'gem',
    link: '/catalogo/fila/joyas',
};

/**
 * Producciones en español: dato del propio título y un corte que ninguna otra página ofrece.
 *
 * Por NOTA, no por popularidad: ordenada por popularidad la fila se convertía en sopa de estrenos
 * adolescentes de plataforma (Culpa mía, Culpa tuya, Culpa nuestra seguidas). Por nota salen
 * Contratiempo, El secreto de sus ojos, Los olvidados, Voces inocentes — que es lo que uno espera al
 * pedir cine en español. Suelo de votos más bajo en series porque acumulan menos.
 */
const ESPANOL: CatalogRowDef = {
    key: 'espanol',
    title: 'En español',
    subtitle: 'Lo mejor valorado en español, de España y de Latinoamérica.',
    why: 'idioma original = español, por nota',
    media: 'movie',
    params: { with_original_language: 'es' },
    movieParams: { 'vote_count.gte': '500' },
    tvParams: { 'vote_count.gte': '300' },
    sortBy: 'vote_average.desc',
    color: 'red',
    icon: 'languages',
    link: '/catalogo/fila/espanol',
};

/**
 * Lo mejor de una década, rotando. No pisa «Top de siempre», que es un ranking fijo y global: aquí el
 * corte temporal cambia lo que sale y da contenido nuevo cada día con una sola consulta.
 * Las claves de fecha son distintas en cine y en TV, de ahí los params por medio.
 */
export function decadeRowDef(decade: number): CatalogRowDef {
    const to = decade + 9;
    return {
        key: 'decada',
        title: `Lo mejor de los ${decade}`,
        subtitle: 'Las mejor valoradas de esa década, no las más famosas.',
        why: `${decade}–${to}, por nota`,
        media: 'movie',
        params: {},
        movieParams: { 'primary_release_date.gte': `${decade}-01-01`, 'primary_release_date.lte': `${to}-12-31` },
        tvParams: { 'first_air_date.gte': `${decade}-01-01`, 'first_air_date.lte': `${to}-12-31` },
        sortBy: 'vote_average.desc',
        voteCountMin: '1000',
        color: 'amber',
        icon: 'calendar-range',
        link: '/catalogo/fila/decada',
    };
}

/**
 * Estrenos con nota. Distinta de «Últimos lanzamientos», que ordena por fecha sin mirar la nota y te
 * enseña lo recién subido aunque sea malo.
 */
export function freshRowDef(sinceISO: string): CatalogRowDef {
    return {
        key: 'estrenos',
        title: 'Estrenos que merecen la pena',
        subtitle: 'De los últimos seis meses, y con nota suficiente para arriesgarse.',
        why: 'últimos 6 meses, nota ≥ 6,5',
        media: 'movie',
        params: { 'vote_average.gte': '6.5' },
        movieParams: { 'primary_release_date.gte': sinceISO },
        tvParams: { 'first_air_date.gte': sinceISO },
        sortBy: 'popularity.desc',
        voteCountMin: '200',
        color: 'green',
        icon: 'sparkles',
        link: '/catalogo/fila/estrenos',
    };
}

/** Décadas que rotan. La actual queda fuera: aún no ha dado su mejor cine. */
const ROTATING_DECADES = [2010, 2000, 1990, 1980, 1970];

/**
 * Fecha desde la que algo cuenta como «estreno», en `YYYY-MM-DD`. Seis meses atrás: menos ventana y
 * la fila se queda en cuatro títulos en temporada floja.
 */
export function freshSinceISO(now: number = Date.now()): string {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 6);
    return d.toISOString().slice(0, 10);
}

/**
 * Filas curadas del modo, en orden. Recibe el día para las que rotan, y así el resultado es estable
 * durante toda la jornada (la caché sirve y recargar no baila).
 */
export function curatedRowsFor(mode: CatalogMode, dayNum: number, freshSinceISO: string): CatalogRowDef[] {
    const decade = decadeRowDef(ROTATING_DECADES[dayNum % ROTATING_DECADES.length]);
    const fresh = freshRowDef(freshSinceISO);
    const forMedia = (d: CatalogRowDef, media: CatalogRowDef['media']): CatalogRowDef => ({ ...d, media });

    if (mode === 'series') {
        return [
            MINISERIES,
            TERMINADAS,
            forMedia(JOYAS, 'tv'),
            forMedia(decade, 'tv'),
            forMedia(ESPANOL, 'tv'),
            forMedia(fresh, 'tv'),
        ];
    }
    if (mode === 'movies') {
        return [CORTAS, PALOMITAS, JOYAS, decade, ESPANOL, fresh];
    }
    if (mode === 'all') {
        // En «Todo» solo caben las que valen para los dos tipos: una duración o un `with_type` no
        // significan nada mezclando cine y televisión.
        return [
            forMedia(JOYAS, 'both'),
            forMedia(decade, 'both'),
            forMedia(ESPANOL, 'both'),
            forMedia(fresh, 'both'),
        ];
    }
    // Tendencias es la única con personas y no tiene portada propia; aquí no aplica.
    return [];
}

/**
 * Busca una fila curada por su clave, para la vista ampliada (`/catalogo/fila/{clave}`). Devuelve
 * también el modo al que pertenece, que es lo que decide qué filtros se ofrecen allí.
 *
 * `preferred` es el modo desde el que se pulsó «Ver más», y es LOAD-BEARING: la misma clave existe en
 * varios modos con medios distintos (`joyas` es cine en Películas, TV en Series y las dos en Todo).
 * Sin él ganaba siempre la primera coincidencia —películas—, así que desde Series acababas en cine y
 * desde Todo se perdía el carril de series. Si la fila no existe en el modo pedido (unas miniseries no
 * son cine), se cae al modo donde sí exista.
 */
export function findCuratedRow(
    key: string,
    dayNum: number,
    freshSinceISO: string,
    preferred?: CatalogMode,
): { def: CatalogRowDef; mode: CatalogMode } | null {
    const order: CatalogMode[] = preferred
        ? [preferred, ...(['movies', 'series', 'all'] as CatalogMode[]).filter((m) => m !== preferred)]
        : (['movies', 'series', 'all'] as CatalogMode[]);
    for (const mode of order) {
        const found = curatedRowsFor(mode, dayNum, freshSinceISO).find((d) => d.key === key);
        if (found) return { def: found, mode };
    }
    return null;
}

/**
 * Géneros que rotan en la portada, para que no sea siempre la misma página. Se eligen por día (no al
 * azar en cada carga) para que la caché sirva de algo y para que recargar no baile.
 */
export const ROTATING_GENRE_SLUGS = [
    'accion', 'comedia', 'drama', 'crimen', 'aventura', 'fantasia',
    'ciencia_ficcion', 'misterio', 'terror', 'animacion', 'familia', 'romance',
];

/** Cuántos géneros se pintan bajo las filas curadas. */
export const GENRE_ROWS_PER_PAGE = 6;

/**
 * Ventana de géneros del día: avanza uno por día sobre la lista, así que la portada cambia a diario
 * y en un par de semanas has visto todos.
 */
export function genreSlugsForDay(dayNum: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < GENRE_ROWS_PER_PAGE; i++) {
        out.push(ROTATING_GENRE_SLUGS[(dayNum + i) % ROTATING_GENRE_SLUGS.length]);
    }
    return out;
}

/** Colores rotados para que seis filas seguidas de género no salgan todas del mismo color. */
const GENRE_COLORS: CatalogRowDef['color'][] = ['red', 'blue', 'amber', 'green', 'purple', 'slate'];

/**
 * Convierte un slug de género en una fila, resolviendo el ID correcto para cada medio. Devuelve
 * `null` si el género no existe para el modo pedido (p. ej. «telenovela» no es un género de cine).
 */
export function genreRowDef(
    slug: string,
    label: string,
    mode: CatalogMode,
    movieGenreId: number | undefined,
    tvGenreId: number | undefined,
    index: number,
): CatalogRowDef | null {
    const media: CatalogRowDef['media'] =
        mode === 'movies' ? 'movie' : mode === 'series' ? 'tv' : 'both';
    if (media === 'movie' && movieGenreId === undefined) return null;
    if (media === 'tv' && tvGenreId === undefined) return null;
    if (media === 'both' && movieGenreId === undefined && tvGenreId === undefined) return null;

    return {
        key: `genero_${slug}`,
        title: label,
        why: '',
        media,
        params: {},
        movieParams: movieGenreId !== undefined ? { with_genres: String(movieGenreId) } : undefined,
        tvParams: tvGenreId !== undefined ? { with_genres: String(tvGenreId) } : undefined,
        sortBy: 'popularity.desc',
        voteCountMin: '150',
        color: GENRE_COLORS[index % GENRE_COLORS.length],
        icon: 'layers',
        link: `/catalogo/categorias?categoria=${slug}`,
    };
}
