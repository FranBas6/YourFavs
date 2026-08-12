import type {Movie} from "../../types/ApiMovie";
import type {Serie} from "../../types/ApiSerie";
import {fetchByProvider, PROVIDERS} from "../../services/API/shared/tmdbDiscoverService";

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

export async function fetchPlatformBySlug(slug: string, pageStr: string, region: string = 'ES'): Promise<{movies: Movie[], series: Serie[]}> {
    const platform = platformConfig.find(p => p.slug === slug);
    if (!platform) return {movies: [], series: []};
    return {
        movies: await fetchByProvider<Movie>('movie', platform.providerId, pageStr, region),
        series: await fetchByProvider<Serie>('tv', platform.providerId, pageStr, region),
    };
}
