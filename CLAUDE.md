# YourFavs — guía del código

Astro 5 SSR (Netlify) + Supabase (PostgreSQL con RLS) + API de TMDB. Seguimiento de películas y series
episodio a episodio, listas, estadísticas y una capa social (amigos, mensajes, planes).

## Comprobaciones

| Qué | Cómo | Notas |
|---|---|---|
| Fronteras entre carpetas | `npm run check:structure` | Falla si se rompe una regla (abajo). `--report` solo informa. |
| Tipos | `npx astro check` | Hay **21 errores ya conocidos** (línea base); un cambio no debe añadir ninguno. |
| Todo junto | `npm run check` | Fronteras y después tipos (por los 21 conocidos, siempre sale con error: mira que no haya nuevos). |
| Build | `npm run build` | **Nunca con un `npm run dev` levantado**: comparten la caché de Vite (`node_modules/.vite`) y el dev se rompe («Outdated Optimize Dep»). |
| Base de datos | tests pgTAP en `supabase/tests/` | |

No hay linter, ni formateador, ni tests de código (sin `vi.mock`/`jest.mock` que mantener).
`docs/` no se versiona: ahí viven planes y handoffs (`docs/Estructura/PLAN_ESTRUCTURA.md` es el de esta estructura).

## Estructura de `src/`

El primer nivel dice **dónde corre** el código; dentro, **las mismas carpetas de tema** en todas partes.

```
src/
├─ pages/        rutas de Astro (la URL es la ruta del archivo; no se reordena). pages/api/ = endpoints.
│                Ayudas pegadas a sus rutas: `_algo.ts` (Astro no las publica como ruta).
├─ layouts/      Layout.astro
├─ components/   vistas .astro, por tema
│   ├─ ui/         piezas básicas: BottomSheet, EmptyState, Pagination, Row, SectionHeader, Stamp, StatRow, skeletons/
│   ├─ shell/      lo que Layout pinta en todas las páginas: Header, MobileTabBar, MobileNavSheets, AuthModal,
│   │              CommandPalette (⌘K), QuickView, SaveToPopover, Coach
│   ├─ cards/      CardMovie, CardSerie, CardActor, TitleCard
│   ├─ catalog/    filtros, cabecera y modos del catálogo, CatalogRow
│   ├─ home/       bloques de la portada (BriefDiario, NextEpisode, RescatarSeries, SocialRow…) y Welcome
│   ├─ title/      fichas de película, serie, temporada y episodio (FichaActions, LevelControl, CastGrid…)
│   ├─ person/     actor / equipo / productora
│   ├─ library/    Mis listas (ListHeader, ListsNav, filtros, RecoRow, WhatToWatch…)
│   ├─ settings/   Ajustes (/perfil/…)
│   └─ social/     amigos, perfil público, planes, recomendar; messages/ = Mensajes
├─ scripts/      código del NAVEGADOR (se importa desde <script> de los .astro), por tema:
│                auth/ home/ notifications/ series/ settings/ social/ (+ messages/) ui/
├─ services/     SOLO SERVIDOR (Supabase, TMDB, secretos)
│   ├─ db/         infraestructura de Supabase: clientes (server, admin), env, tipos generados
│   │              (database.types.ts), userScope (usuario de la petición), userState, appState
│   ├─ tmdb/       infraestructura de TMDB: tmdbClient, tmdbTitleCache, tmdbInfoService, watchProviders,
│   │              summaryItem, titleSummaries, tmdbMeter (solo dev)
│   ├─ cache/      recsBlobCache (caché L2 en Netlify Blobs)
│   ├─ http/       respuestas JSON de las rutas api/
│   └─ temas:      movies · series · titles (lo común a película y serie: sagas, cine↔TV, etiquetas,
│                  spoilers) · people · catalog · home · library (listas, diario, progreso, transiciones,
│                  feed de Actividad, ⌘K, libraryChanges: avisos a las cachés) · stats (Tu año) ·
│                  recs (Para ti, gustos) · notifications · calendar · profile · social · import · dubbing
├─ utils/        COMPARTIDO: puro y seguro para el navegador (sin Supabase, TMDB ni variables de entorno)
│   ├─ core/       appTime (fechas en Madrid), processBatch, safeFetch, withTimeout, buildUrl…
│   ├─ titles/     media-helpers y demás helpers, episodeView, seasonView, géneros, idiomas…
│   ├─ catalog/  home/  library/  settings/    definiciones y textos de cada tema
│   ├─ social/     marcado social que pintan igual servidor y navegador (ui, chatView, recUi…)
│   └─ import/     lectores de CSV/ZIP de IMDb y Letterboxd
├─ styles/       tokens.css, global.css…; components/ y pages/ (por página); shared/
├─ types/        tipos compartidos de TMDB y de la biblioteca
├─ middleware.ts
└─ env.d.ts
```

### Dónde va algo nuevo

1. ¿Lo ejecuta el navegador? → `scripts/<tema>/`. ¿Lo usan servidor **y** navegador, y es puro? → `utils/<tema>/`.
2. ¿Lee Supabase o TMDB, o usa un secreto? → `services/<tema>/`. Si es infraestructura que usarán
   muchos temas (un cliente, una caché) → `services/{db,tmdb,cache,http}/`.
3. ¿Es una vista? → `components/<tema>/`; si la pintan todas las páginas → `shell/`; si es genérica → `ui/`.
4. El tema es el **mismo nombre** en todas las capas (`services/series/`, `scripts/series/`, `components/title/`
   para las fichas). Carpetas en minúscula y en inglés. No hay cajones genéricos (`shared`, `misc`, `lib`):
   si algo no encaja, es que falta un tema.

## Reglas de frontera (las comprueba `scripts/check-structure.mjs`)

| Regla | Puede importar | Por qué |
|---|---|---|
| R1 `utils/`, `types/` | solo `utils/` y `types/` | Lo usa el navegador: si tirara de `services/`, al bundle irían código de servidor o secretos. |
| R2 `scripts/` | `scripts/`, `utils/`, `types/` | Lo mismo, desde el lado del navegador. |
| R3 `services/` | `services/`, `utils/`, `types/` | El servidor no sabe de vistas. |
| R4 `services/{db,tmdb,cache,http}` | esas cuatro, `utils/`, `types/` | La infraestructura va debajo de todo; si tirara de un tema nacerían ciclos al cargar. |
| R5 `components/`, `layouts/` | todo menos `pages/` | |
| R6 `pages/` | todo menos otra ruta (sí sus `_*.ts`) | Una ruta no es una librería: si dos rutas comparten algo, va a `services/` o `utils/`. |
| R7 `import()` entre temas de `services/` | ninguno (lista blanca vacía) | Un `import()` entre temas suele esconder un ciclo: ver «cachés» abajo. |
| R8 sin índices | nada de `index.ts` que reexporte una carpeta (fuera de `pages/`) | Import directo al archivo. |
| R9 nombres | carpetas en minúscula; nunca dos archivos que solo difieran en mayúsculas o extensión | macOS y Windows no distinguen mayúsculas. |
| R10 sin ciclos al cargar | ningún círculo de imports normales (salvo `ui.ts` ↔ `recUi.ts`, abajo) | Con un ciclo, algo que se usa al cargar (una constante, una clave) puede no existir todavía. |
| R0 | todo import relativo existe | |

Los `import type` valen de cualquier sitio (se borran al compilar), salvo de una ruta.

## Trampas conocidas

- **Cachés que leen la biblioteca: `services/library/libraryChanges.ts`.** Snapshot de listas, ⌘K, Tu año, top
  de actores, sagas, gustos, «Para ti», feed de Actividad y estrenos de quien sigues se vacían solos:
  - una caché nueva se apunta al cargarse: `onLibraryChange(['lists', 'diary'], () => …vaciar lo del usuario…)`;
  - una escritura nueva avisa DESPUÉS de escribir: `libraryChanged('lists')` (temas: `lists`, `ratings`,
    `customLists`, `episodes`, `diary`, `activity`, `people`, `taste`, `tags`). Va en la capa de datos
    (library.ts, ratings.ts, watchLog.ts…), no en los manejadores, para que nadie pueda olvidarlo.
  - Las copias compartidas (Netlify Blobs) de gustos y «Para ti» se borran por su clave (`recs/recsCacheKeys.ts`)
    aunque la instancia no haya cargado esos módulos. Una caché nueva con copia compartida necesita lo mismo.
  - Antes esto eran `import()` copiados en tres sitios para esquivar un ciclo (y se olvidaban casos: las
    colecciones propias no vaciaban los gustos; «Apuntar visionado» no vaciaba Tu año). No vuelvas a ese patrón.
  - Si editas `libraryChanges.ts` con el dev levantado, **reinicia el dev**: la recarga en caliente vacía la lista
    de cachés apuntadas y las que no se recarguen dejan de enterarse (solo pasa en desarrollo).
- **Ciclo conocido:** `utils/social/ui.ts` ↔ `utils/social/recUi.ts` (permitido en R10). Funciona porque al cargar
  solo se usan funciones, no constantes; no metas constantes compartidas entre ellos.
- **Sin índices («barrels»).** Un `index.ts` obliga a cargar el tema entero y es la forma típica de crear ciclos
  al cargar (algo usado al cargar —una constante, una clave— que todavía no existe). Por eso R8.
- **Mayúsculas en macOS.** `Cards/` y `cards/` son la misma carpeta. Para renombrar solo mayúsculas, mover en dos
  tiempos (`git mv a tmp && git mv tmp b`). Y no pongas un componente y una lógica con el mismo nombre en la misma
  carpeta (`Stamp.astro` y `stamp.ts`): el import se confunde. R9 lo vigila.
- **Rutas en comentarios:** siempre desde `src/` (`services/library/watchLog.ts`), nunca con `../`: así se
  pueden buscar y reescribir si algo se mueve.
- **`scripts/check-cross-media.mjs`** levanta un servidor Vite con la caché por defecto (`node_modules/.vite`, la
  del `npm run dev`): no lo lances con el dev levantado.
- **Migraciones:** sus comentarios citan las rutas de cuando se escribieron (`services/BD/social/…` es hoy
  `services/social/…`). Una migración aplicada no se edita.
- **Tipos de Supabase:** `npm run supabase:types` escribe `src/services/db/database.types.ts`.
