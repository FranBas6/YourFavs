const languageMap: Record<string, string> = {
    'en': 'Inglés',
    'es': 'Español',
    'fr': 'Francés',
    'de': 'Alemán',
    'it': 'Italiano',
    'pt': 'Portugués',
    'ru': 'Ruso',
    'ja': 'Japonés',
    'ko': 'Coreano',
    'zh': 'Chino',
    'ar': 'Árabe',
    'hi': 'Hindi',
    'nl': 'Neerlandés',
    'sv': 'Sueco',
    'da': 'Danés',
    'fi': 'Finlandés',
    'no': 'Noruego',
    'pl': 'Polaco',
    'cs': 'Checo',
    'hu': 'Húngaro',
    'tr': 'Turco',
    'el': 'Griego',
    'ro': 'Rumano',
    'hr': 'Croata',
    'bg': 'Búlgaro',
    'sr': 'Serbio',
    'uk': 'Ucraniano',
    'he': 'Hebreo',
    'th': 'Tailandés',
    'vi': 'Vietnamita',
    'id': 'Indonesio',
    'ms': 'Malayo',
    'tl': 'Tagalo',
    'sw': 'Suajili',
    'is': 'Islandés',
    'lv': 'Letón',
    'lt': 'Lituano',
    'sk': 'Eslovaco',
    'sl': 'Esloveno',
    'et': 'Estonio',
    'mk': 'Macedonio',
    'hy': 'Armenio',
    'ka': 'Georgiano',
    'am': 'Amárico',
    'sq': 'Albanés',
    'mt': 'Maltés',
    'bs': 'Bosnio',
    'ne': 'Nepalí',
    'pa': 'Punjabi',
    'gu': 'Gujarati',
    'te': 'Telugu',
    'ta': 'Tamil',
    'ml': 'Malabar',
    'mr': 'Marathi',
    'kn': 'Kannada',
    'or': 'Odia',
    'as': 'Assamés',
    'bn': 'Bengalí',
    'si': 'Cingalés',
    'ur': 'Urdu'
};

export function getLanguageDisplayName(iso: string): string {
    return languageMap[iso] || iso.toUpperCase();
}

const ratingMap: Record<string, Record<string, string>> = {
    'ES': {
        'APTA': 'Apta para todos los públicos',
        // En películas TMDB usa «A» (y alguna vez «TP») para lo mismo.
        'A': 'Apta para todos los públicos',
        'TP': 'Apta para todos los públicos',
        '7': 'No recomendada para menores de 7 años',
        '12': 'No recomendada para menores de 12 años',
        '16': 'No recomendada para menores de 16 años',
        '18': 'No recomendada para menores de 18 años',
        'X': 'Película X'
    },
    'US': {
        // Movies
        'G': 'G - Todos los públicos',
        'PG': 'PG - Guía parental sugerida',
        'PG-13': 'PG-13 - Padres fuertemente advertidos',
        'R': 'R - Restringida',
        'NC-17': 'NC-17 - Solo adultos',
        // TV Series
        'TV-Y': 'TV-Y - Todos los niños',
        'TV-Y7': 'TV-Y7 - Niños de 7 años en adelante',
        'TV-G': 'TV-G - Todos los públicos',
        'TV-PG': 'TV-PG - Guía parental',
        'TV-14': 'TV-14 - Padres fuertemente advertidos',
        'TV-MA': 'TV-MA - Solo adultos'
    }
};

export function getContentRating(ratings: any[]): { text: string; rating: string } | null {
    const esRating = ratings.find((r: any) => r.iso_3166_1 === 'ES');
    const usRating = ratings.find((r: any) => r.iso_3166_1 === 'US');
    const rating = esRating || usRating || ratings[0];

    if (!rating) return null;

    const countryMap = ratingMap[rating.iso_3166_1 as string];
    if (countryMap && countryMap[rating.rating]) {
        return { text: countryMap[rating.rating], rating: rating.rating };
    }

    return { text: `${rating.rating} (${rating.iso_3166_1})`, rating: rating.rating };
}

export function formatDate(dateString: string): string {
    if (!dateString) return "No disponible";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

export function getRatingStars(rating: number): string {
    if (!rating) return "";
    const fullStars = Math.floor(rating / 2);
    const halfStar = rating % 2 >= 1 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    return "★".repeat(fullStars) + (halfStar ? "½" : "") + "☆".repeat(emptyStars);
}

export function formatTrailerUrl(url: string): string {
    if (url.includes('youtube.com/embed/')) return url;

    let videoId = '';
    if (url.includes('youtube.com/watch')) {
        const urlObj = new URL(url);
        const id = urlObj.searchParams.get('v');
        if (id) videoId = id;
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    }

    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    // Bare YouTube video ID (e.g. "dQw4w9WgXcQ" from TMDB video.key)
    if (/^[\w-]+$/.test(url) && !url.includes('/') && !url.includes('.')) {
        return `https://www.youtube.com/embed/${url}`;
    }
    return url;
}

export const providerLinks: Record<string, string> = {
    'Netflix': 'https://www.netflix.com/',
    'Disney Plus': 'https://www.disneyplus.com/',
    'HBO Max': 'https://www.hbomax.com/',
    'Amazon Prime Video': 'https://www.primevideo.com/',
    'Amazon Video': 'https://www.amazon.com/dp/B08J4Q4Z5D',
    'Apple TV+': 'https://tv.apple.com/',
    'Apple TV': 'https://tv.apple.com/',
    'Filmin': 'https://www.filmin.es/',
    'Movistar Plus+': 'https://www.movistarplus.es/',
    'Rakuten TV': 'https://rakuten.tv/',
    'SkyShowtime': 'https://www.skyshowtime.com/',
    'MUBI': 'https://mubi.com/',
    'FlixOlé': 'https://flixole.com/',
    'Atresplayer': 'https://www.atresplayer.com/',
    'RTVE Play': 'https://www.rtve.es/play/',
    'Google Play Movies': 'https://play.google.com/store/movies',
    'YouTube': 'https://www.youtube.com/',
    'Microsoft Store': 'https://www.microsoft.com/store/movies',
    'Plex': 'https://www.plex.tv/',
    'fuboTV': 'https://www.fubo.tv/',
    'Hayu': 'https://www.hayu.com/',
    'Curiosity Stream': 'https://curiositystream.com/',
    'GuideDoc': 'https://guidedoc.tv/',
    'MagellanTV': 'https://www.magellantv.com/',
    'DOCSVILLE': 'https://www.docsville.com/',
    'WOW Presents Plus': 'https://www.wowpresentsplus.com/',
    'Mitele': 'https://www.mitele.es/',
    'StarzPlay': 'https://www.starzplay.com/',
    'Paramount+': 'https://www.paramountplus.com/',
    'Peacock': 'https://www.peacocktv.com/',
    'Tubi': 'https://tubitv.com/',
    'Pluto TV': 'https://pluto.tv/',
    'Crunchyroll': 'https://www.crunchyroll.com/',
    'Funimation': 'https://www.funimation.com/',
    'Vix': 'https://vix.com/',
    'Cinepolis Klic': 'https://www.cinepolisklic.com/'
};

/** Escala de notas del usuario: 0,5-10 en pasos de medio punto (20 valores posibles). */
export const RATING_STEP = 0.5;
export const RATING_MIN = 0.5;
export const RATING_MAX = 10;

/**
 * Normaliza la nota que llega del formulario: acota a 0,5-10 y **cuantiza a medio punto**.
 * La escala pasó de enteros a medios puntos (poder poner un 7,5); cuantizar impide que
 * entren decimales arbitrarios (7,37) por un input manipulado o un redondeo del navegador.
 * Devuelve `null` si no hay número válido → el handler entonces no escribe nada.
 * Vive aquí (y no en `BD/lists/ratings.ts`) por ser pura: así no arrastra el cliente de la base de datos.
 */
export function normalizeScore(raw: unknown): number | null {
    const n = Number(raw);
    if (!isFinite(n) || n <= 0) return null;
    const clamped = Math.min(RATING_MAX, Math.max(RATING_MIN, n));
    return Math.round(clamped / RATING_STEP) * RATING_STEP;
}

/**
 * Formatea una nota del usuario (escala 0,5-10 en medios puntos) para mostrarla:
 * "7,5" con coma y sin decimales de relleno ("7", no "7,0").
 * Antes las notas eran enteras y se imprimían crudas; al admitir medios puntos, sin esto
 * aparecería "7.5" con punto en las cards, en Actividad y en la búsqueda personal.
 */
export function formatScore(score: number | string | null | undefined): string {
    // Ojo: `Number(null)` y `Number('')` son 0 (finito), así que hay que descartarlos antes
    // o una nota inexistente se pintaría como "0".
    if (score === null || score === undefined || score === '') return '';
    const n = Number(score);
    if (!isFinite(n)) return '';
    return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

/** Fecha de la base de datos (ISO, Date o milisegundos) → milisegundos; 0 si falta o no es válida. */
export function toTimestamp(dateValue: any): number {
    if (!dateValue) return 0;
    const ms = new Date(dateValue).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

/**
 * El título original, solo si dice algo distinto del traducido («Severance» bajo «Separación»).
 * Mayúsculas, acentos y signos no cuentan: «La Casa de Papel» y «La casa de papel» son el mismo. Y si el
 * traducido ya lo lleva dentro («Del revés 2 (Inside Out 2)»), repetirlo debajo no aporta nada.
 */
export function distinctOriginalTitle(title: string | null | undefined, original: string | null | undefined): string | null {
    const o = (original ?? '').trim();
    if (!o) return null;
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return norm(title ?? '').includes(norm(o)) ? null : o;
}
