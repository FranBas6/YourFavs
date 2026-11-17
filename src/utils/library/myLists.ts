/**
 * Fuente de datos compartida para la navegación (desktop dropdowns + sheets móvil).
 *
 * NOTA: por ahora ESPEJA los arrays inline de `Header.astro` (`discoverItems`,
 * `myListsItems` + `navMain` Tendencias/Cartelera). Cuando se elimine la
 * hamburguesa (Hito B) se refactoriza `Header.astro` para importar de aquí y
 * quedará una única fuente de verdad. Mantener en sync hasta entonces.
 */

export type StampColor = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'pink' | 'slate';

export interface NavItem {
    href: string;
    color: StampColor;
    icon: string;          // nombre de icono Lucide (sin prefijo)
    title: string;
    desc?: string;
    /** Clave de /api/lists/counts. Si existe, la fila muestra contador en vez de desc. */
    countKey?: 'favoritos' | 'megusta' | 'vistos' | 'pendientes' | 'verpronto' | 'siguiendo' | 'colecciones';
}

/** Hoja "Explorar el catálogo": la portada de la sección + Tendencias + Cartelera + los de "Descubrir". */
export const EXPLORE_ITEMS: NavItem[] = [
    { href: "/catalogo",                     color: "red",    icon: "library",       title: "Catálogo",             desc: "Películas y series por criterio" },
    { href: "/catalogo/tendencias",          color: "red",    icon: "trending-up",   title: "Tendencias",           desc: "Lo que se mueve" },
    { href: "/catalogo/cartelera",           color: "blue",   icon: "clapperboard",  title: "Cartelera",            desc: "En cines ahora" },
    { href: "/catalogo/ultimoslanzamientos", color: "green",  icon: "sparkles",      title: "Últimos lanzamientos", desc: "Estrenos en streaming" },
    { href: "/catalogo/maspopulares",        color: "pink",   icon: "flame",         title: "Más populares",        desc: "Lo que todo el mundo ve" },
    // Mismo orden que el desplegable «Descubrir» del header (escritorio): faltaba en móvil.
    { href: "/catalogo/plataformas",         color: "slate",  icon: "layout-grid",   title: "Plataformas",          desc: "Por dónde se ve" },
    { href: "/catalogo/topmovies",           color: "amber",  icon: "star",          title: "Top películas",        desc: "Las mejores de siempre" },
    { href: "/catalogo/topseries",           color: "blue",   icon: "trophy",        title: "Top series",           desc: "Imprescindibles TV" },
    { href: "/catalogo/categorias",          color: "slate",  icon: "layers",        title: "Categorías",           desc: "Por género" },
    { href: "/catalogo/colecciones",         color: "purple", icon: "tag",           title: "Sagas",                desc: "Colecciones y franquicias" },
];

/** Hoja "Mis listas": espejo del dropdown "Mis listas" del header. */
export const MY_LISTS_ITEMS: NavItem[] = [
    { href: "/mislistas/favoritos",   color: "red",    icon: "heart",    title: "Favoritos",       desc: "Tus imprescindibles",   countKey: "favoritos" },
    { href: "/mislistas/megusta",     color: "amber",  icon: "star",     title: "Me gusta",        desc: "Lo que te gustó",       countKey: "megusta" },
    { href: "/mislistas/vistos",      color: "green",  icon: "eye",      title: "Vistos",          desc: "Ya las viste",          countKey: "vistos" },
    { href: "/mislistas/pendientes",  color: "blue",   icon: "bookmark", title: "Pendientes",      desc: "Para ver pronto",       countKey: "pendientes" },
    { href: "/mislistas/verpronto",   color: "purple", icon: "clock",    title: "Ver pronto",      desc: "En tu radar",           countKey: "verpronto" },
    { href: "/mislistas/siguiendo",   color: "pink",   icon: "tv",       title: "Siguiendo",       desc: "Series al día",         countKey: "siguiendo" },
    { href: "/mislistas/actores",     color: "slate",  icon: "user",     title: "Actores",         desc: "Favoritos y avisos" },
    { href: "/mislistas/colecciones", color: "purple", icon: "library",  title: "Mis colecciones", desc: "Listas personalizadas", countKey: "colecciones" },
    { href: "/mislistas/actividad",   color: "green",  icon: "activity", title: "Actividad",       desc: "Tu historial" },
    { href: "/mislistas/amigos",      color: "pink",   icon: "handshake", title: "Amigos",         desc: "Seguir y amistad" },
];
