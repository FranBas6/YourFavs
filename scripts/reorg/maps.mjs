/**
 * Mapas de la reordenación (docs/Estructura/PLAN_ESTRUCTURA.md §3). Rutas relativas a `src/`.
 * Una entrada que acaba en `/` mueve todos los archivos de esa carpeta (sin subcarpetas).
 * TEMPORAL: se borra con `move.mjs` al terminar la sesión 4.
 */
const each = (from, names, to) => names.map((n) => [from + n, to + n]);

export const MAPS = {
    // ---- Sesión 1 · services/ por temas --------------------------------------------------------
    '1.1': [ // infraestructura: db, tmdb, cache, http
        ...each('lib/supabase/', ['admin.ts', 'authHttp.ts', 'database.types.ts', 'env.ts', 'server.ts'], 'services/db/'),
        ...each('services/BD/shared/', ['userScope.ts', 'userState.ts'], 'services/db/'),
        ['services/API/shared/appState.ts', 'services/db/appState.ts'],
        ...each('services/API/shared/', ['tmdbClient.ts', 'tmdbTitleCache.ts', 'tmdbInfoService.ts', 'watchProviders.ts', 'summaryItem.ts', 'titleSummaries.ts'], 'services/tmdb/'),
        ['lib/dev/tmdbMeter.ts', 'services/tmdb/tmdbMeter.ts'],
        ['utils/recsBlobCache.ts', 'services/cache/recsBlobCache.ts'],
        ['lib/http.ts', 'services/http/http.ts'],
    ],
    '1.2': [ // títulos: movies, series, titles, people
        ['services/API/Movies/', 'services/movies/'],
        ['services/BD/movies/yourfavsMovie.ts', 'services/movies/yourfavsMovie.ts'],
        ['services/API/Series/', 'services/series/'],
        ['services/BD/series/yourfavsSerie.ts', 'services/series/yourfavsSerie.ts'],
        ...each('services/API/shared/', ['collectionsDiscovery.ts', 'crossMediaRelated.ts'], 'services/titles/'),
        ...each('services/BD/shared/', ['checkExistence.ts', 'mediaTags.ts', 'spoilerPrefs.ts'], 'services/titles/'),
        ['services/API/Actors/', 'services/people/'],
        ['services/API/Team/InfoMember.ts', 'services/people/InfoMember.ts'],
        ['services/API/Productora/InfoProductora.ts', 'services/people/InfoProductora.ts'],
        ['services/API/People/upcomingReleases.ts', 'services/people/upcomingReleases.ts'],
        ['services/BD/actors/yourfavsActor.ts', 'services/people/yourfavsActor.ts'],
        ['services/BD/people/yourfavsPeople.ts', 'services/people/yourfavsPeople.ts'],
    ],
    '1.3': [ // el resto de services/
        ...each('services/API/shared/', ['tmdbDiscoverService.ts', 'catalogRows.ts'], 'services/catalog/'),
        ...each('services/API/shared/', ['dailyBrief.ts', 'radar.ts', 'weeklyRanking.ts', 'hookRows.ts'], 'services/home/'),
        ...each('services/BD/shared/', ['library.ts', 'librarySnapshot.ts', 'stateTransitions.ts', 'episodeWatches.ts', 'activityLog.ts', 'activityFeed.ts', 'personalIndex.ts'], 'services/library/'),
        ['services/BD/lists/', 'services/library/'],
        ['services/BD/actions/handleVerProntoAction.ts', 'services/library/handleVerProntoAction.ts'],
        ['services/API/shared/forYouRecommendations.ts', 'services/recs/forYouRecommendations.ts'],
        ['services/API/notifications/', 'services/notifications/'],
        ['services/BD/notifications/', 'services/notifications/'],
        ['services/API/Calendar/', 'services/calendar/'],
        ['services/BD/profile/icsToken.ts', 'services/calendar/icsToken.ts'],
        ...each('services/BD/profile/', ['userProfile.ts', 'userTaste.ts'], 'services/profile/'),
        ['services/BD/social/', 'services/social/'],
        ['services/BD/import/importLibrary.ts', 'services/import/importLibrary.ts'],
        ...each('services/API/shared/', ['importResolve.ts', 'tmdbAccount.ts', 'traktAccount.ts'], 'services/import/'),
        ['services/scraping/eldoblaje.ts', 'services/dubbing/eldoblaje.ts'],
    ],

    // ---- Sesión 2 · utils/ puro ------------------------------------------------------------------
    '2.1': [ // lo de servidor sale de utils/ y lib/
        ...each('utils/', ['personalPageHelper.ts', 'calculateStats.ts', 'seenKeys.ts'], 'services/library/'),
        ...each('utils/', ['yearStats.ts', 'cinemaIdentity.ts', 'topActorsLibrary.ts'], 'services/stats/'),
        ...each('utils/', ['personalRecommendations.ts', 'genrePreferences.ts'], 'services/recs/'),
        ['utils/rankingCore.ts', 'services/home/rankingCore.ts'],
        ['utils/constants/platforms.ts', 'services/catalog/platforms.ts'],
        ...each('lib/social/', ['signupMode.ts', 'http.ts'], 'services/social/'),
        ['lib/admin.ts', 'services/social/admin.ts'],
    ],
    '2.2': [ // lo puro, por temas dentro de utils/
        ...each('utils/', ['appTime.ts', 'buildUrl.ts', 'loadAllPages.ts', 'processBatch.ts', 'safeFetch.ts', 'withTimeout.ts', 'sorting.ts'], 'utils/core/'),
        ['utils/constants/helpers/', 'utils/titles/'],
        ...each('utils/', ['episodeType.ts', 'episodeView.ts', 'seasonView.ts', 'resumeReason.ts'], 'utils/titles/'),
        ...each('utils/constants/', ['genres.ts', 'genreSlugs.ts', 'languages.ts', 'tasteGenres.ts', 'streamingPlatforms.ts'], 'utils/titles/'),
        ...each('utils/', ['catalogUrl.ts', 'platformFilter.ts'], 'utils/catalog/'),
        ...each('utils/constants/', ['catalogRows.ts', 'categories.ts', 'featuredCollections.ts'], 'utils/catalog/'),
        ...each('utils/constants/', ['homeSections.ts', 'coachHints.ts'], 'utils/home/'),
        ['lib/nextEpisodeView.ts', 'utils/home/nextEpisodeView.ts'],
        ...each('utils/constants/', ['listsNav.ts', 'myLists.ts'], 'utils/library/'),
        ...each('utils/constants/', ['settingsSections.ts', 'publicSections.ts', 'reservedHandles.ts'], 'utils/settings/'),
        ...each('lib/social/', ['amigosView.ts', 'chatView.ts', 'icons.ts', 'messagesText.ts', 'miniChatView.ts', 'recUi.ts', 'types.ts', 'ui.ts'], 'utils/social/'),
        ['utils/constants/social.ts', 'utils/social/social.ts'],
    ],

    // ---- Sesión 3 · scripts/ y components/ -------------------------------------------------------
    '3.1': [
        ['utils/authActions.ts', 'scripts/auth/authActions.ts'],
        ['scripts/serie/', 'scripts/series/'],
        ['scripts/ajustes/', 'scripts/settings/'],
        ['scripts/shared/spoil.ts', 'scripts/ui/spoil.ts'],
    ],
    '3.2': [
        ...each('components/', ['BottomSheet.astro', 'EmptyState.astro', 'Pagination.astro', 'Row.astro', 'SectionHeader.astro', 'Stamp.astro', 'StatRow.astro'], 'components/ui/'),
        ['components/skeletons/', 'components/ui/skeletons/'],
        ...each('components/', ['AuthModal.astro', 'Coach.astro', 'CommandPalette.astro', 'Header.astro', 'MobileNavSheets.astro', 'MobileTabBar.astro', 'QuickView.astro', 'SaveToPopover.astro'], 'components/shell/'),
        ['components/Cards/', 'components/cards/'],
        ...each('components/', ['AdvancedFilters.astro', 'CatalogHeader.astro', 'CatalogModes.astro', 'NetworkBar.astro'], 'components/catalog/'),
        ['components/Sections/CatalogRow.astro', 'components/catalog/CatalogRow.astro'],
        ...each('components/Sections/', ['BriefDiario.astro', 'HookRow.astro', 'NextEpisode.astro', 'RankingRow.astro', 'RecommendedForYou.astro', 'RescatarSeries.astro', 'SocialRow.astro'], 'components/home/'),
        ['components/detail/', 'components/title/'],
        ['components/personal/FollowPersonButton.astro', 'components/person/FollowPersonButton.astro'],
        ['components/personal/PlansBlock.astro', 'components/social/PlansBlock.astro'],
        ['components/personal/', 'components/library/'],
        ['components/ajustes/', 'components/settings/'],
    ],
};
