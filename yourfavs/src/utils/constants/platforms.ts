import type {Movie} from "../../types/ApiMovie";
import type {Serie} from "../../types/ApiSerie";
import {
    getNetflixMovies, getAmazonPrimeMovies, getDisneyPlusMovies, getHBOMaxMovies,
    getAppleTVMovies, getMovistarPlusMovies, getFilminMovies
} from "../../services/API/Movies/tmdbMovies";
import {
    getNetflixSeries, getAmazonPrimeSeries, getDisneyPlusSeries, getHBOMaxSeries,
    getAppleTVSeries, getMovistarPlusSeries, getFilminSeries
} from "../../services/API/Series/tmdbSeries";

export interface PlatformInfo {
    slug: string;
    name: string;
    logo: string;
}

export interface PlatformData extends PlatformInfo {
    movies: Movie[];
    series: Serie[];
}

const platformConfig = [
    {name: "NETFLIX", slug: "netflix", logo: "/logos/plataformas/netflix.svg", getMovies: getNetflixMovies, getSeries: getNetflixSeries},
    {name: "AMAZON PRIME", slug: "amazon", logo: "/logos/plataformas/amazon.svg", getMovies: getAmazonPrimeMovies, getSeries: getAmazonPrimeSeries},
    {name: "DISNEY+", slug: "disney", logo: "/logos/plataformas/disney.svg", getMovies: getDisneyPlusMovies, getSeries: getDisneyPlusSeries},
    {name: "HBO MAX", slug: "hbo", logo: "/logos/plataformas/hbo.svg", getMovies: getHBOMaxMovies, getSeries: getHBOMaxSeries},
    {name: "APPLE TV+", slug: "apple", logo: "/logos/plataformas/apple.svg", getMovies: getAppleTVMovies, getSeries: getAppleTVSeries},
    {name: "MOVISTAR+", slug: "movistar", logo: "/logos/plataformas/movistar.svg", getMovies: getMovistarPlusMovies, getSeries: getMovistarPlusSeries},
    {name: "FILMIN", slug: "filmin", logo: "/logos/plataformas/filmin.svg", getMovies: getFilminMovies, getSeries: getFilminSeries},
];

export const platformList: PlatformInfo[] = platformConfig.map(({slug, name, logo}) => ({slug, name, logo}));

export async function fetchAllPlatforms(pageStr: string): Promise<PlatformData[]> {
    const results = await Promise.all(
        platformConfig.map(async (p) => ({
            name: p.name,
            slug: p.slug,
            logo: p.logo,
            movies: await p.getMovies(pageStr) as Movie[],
            series: await p.getSeries(pageStr) as Serie[],
        }))
    );
    return results;
}

export async function fetchPlatformBySlug(slug: string, pageStr: string): Promise<{movies: Movie[], series: Serie[]}> {
    const platform = platformConfig.find(p => p.slug === slug);
    if (!platform) return {movies: [], series: []};
    return {
        movies: await platform.getMovies(pageStr) as Movie[],
        series: await platform.getSeries(pageStr) as Serie[],
    };
}
