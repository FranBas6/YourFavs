import type {Movie} from "../../types/ApiMovie";
import type {Serie} from "../../types/ApiSerie";
import {fetchByProvider, PROVIDERS} from "../../services/API/shared/tmdbDiscoverService";
import {getCached, setCached} from "../recsBlobCache";
import {appDateParts} from "../appTime";

export interface PlatformInfo {
    slug: string;
    name: string;
    logo: string;
}

export interface PlatformData extends PlatformInfo {
    movies: Movie[];
    series: Serie[];
}

// Cada plataforma es su `provider_id` de TMDB y nada más: antes esto pasaba por 14 envoltorios
// (`getNetflixMovies`, `getNetflixSeries`, …) que solo se usaban aquí y que fijaban la región a ES
// por dentro, así que no había forma de respetar la del perfil sin tocarlos uno a uno.
const platformConfig = [
    {name: "NETFLIX", slug: "netflix", logo: "/logos/plataformas/netflix.svg", providerId: PROVIDERS.NETFLIX},
    {name: "AMAZON PRIME", slug: "amazon", logo: "/logos/plataformas/amazon.svg", providerId: PROVIDERS.AMAZON},
    {name: "DISNEY+", slug: "disney", logo: "/logos/plataformas/disney.svg", providerId: PROVIDERS.DISNEY},
    {name: "HBO MAX", slug: "hbo", logo: "/logos/plataformas/hbo.svg", providerId: PROVIDERS.HBO},
    {name: "APPLE TV+", slug: "apple", logo: "/logos/plataformas/apple.svg", providerId: PROVIDERS.APPLE},
    {name: "MOVISTAR+", slug: "movistar", logo: "/logos/plataformas/movistar.svg", providerId: PROVIDERS.MOVISTAR},
    {name: "FILMIN", slug: "filmin", logo: "/logos/plataformas/filmin.svg", providerId: PROVIDERS.FILMIN},
];

export const platformList: PlatformInfo[] = platformConfig.map(({slug, name, logo}) => ({slug, name, logo}));

export async function fetchAllPlatforms(pageStr: string, region: string = 'ES'): Promise<PlatformData[]> {
    const results = await Promise.all(
        platformConfig.map(async (p) => ({
            name: p.name,
            slug: p.slug,
            logo: p.logo,
            movies: await fetchByProvider<Movie>('movie', p.providerId, pageStr, region),
            series: await fetchByProvider<Serie>('tv', p.providerId, pageStr, region),
        }))
    );
    return results;
}

// --- «Plataforma destacada» de la portada (A3, 2026-10-29) ---
// Antes la portada llamaba a `fetchAllPlatforms` (7 plataformas × cine y series = 14 discover en CADA
// carga, sin caché) para enseñar UNA al azar. Ahora la plataforma es la del día —rotan las siete en
// orden, una por día de Madrid— y solo se piden sus 2 listas, con la caché L1+L2 de las filas del
// catálogo (la clave lleva el día, así que caduca sola a medianoche).
const PLATFORM_DAY_VERSION = 'v1';
const PLATFORM_DAY_L1_MS = 30 * 60 * 1000;
const PLATFORM_DAY_L2_MS = 6 * 60 * 60 * 1000;
const platformDayL1 = new Map<string, {data: PlatformData; expires: number}>();

export async function fetchPlatformOfTheDay(pageStr: string, region: string = 'ES'): Promise<PlatformData | null> {
    const day = appDateParts(Date.now()).key; // 'YYYY-MM-DD' en Europe/Madrid
    const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
    const p = platformConfig[dayNumber % platformConfig.length];
    const key = `homePlatform_${PLATFORM_DAY_VERSION}_${p.slug}_${region}_p${pageStr}_${day}`;
    const now = Date.now();

    const hitL1 = platformDayL1.get(key);
    if (hitL1 && hitL1.expires > now) return hitL1.data;
    const hitL2 = await getCached<PlatformData>(key);
    if (hitL2) {
        platformDayL1.set(key, {data: hitL2, expires: now + PLATFORM_DAY_L1_MS});
        return hitL2;
    }

    const [movies, series] = await Promise.all([
        fetchByProvider<Movie>('movie', p.providerId, pageStr, region),
        fetchByProvider<Serie>('tv', p.providerId, pageStr, region),
    ]);
    const data: PlatformData = {name: p.name, slug: p.slug, logo: p.logo, movies, series};
    // Un fallo de TMDB llega como lista vacía: eso no se guarda, se reintenta en la próxima carga.
    if (movies.length || series.length) {
        platformDayL1.set(key, {data, expires: now + PLATFORM_DAY_L1_MS});
        void setCached(key, data, PLATFORM_DAY_L2_MS);
    }
    return data;
}

export async function fetchPlatformBySlug(slug: string, pageStr: string, region: string = 'ES'): Promise<{movies: Movie[], series: Serie[]}> {
    const platform = platformConfig.find(p => p.slug === slug);
    if (!platform) return {movies: [], series: []};
    return {
        movies: await fetchByProvider<Movie>('movie', platform.providerId, pageStr, region),
        series: await fetchByProvider<Serie>('tv', platform.providerId, pageStr, region),
    };
}
