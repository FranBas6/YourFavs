/**
 * Destinos de la navegación de Mis listas (rediseño, Fase 5 · 5.1; README del handoff §3.8 «S7»).
 * Tres grupos: Listas · Social · Tus números. `tone` es el color de su lista (--a-{tone} / --a-{tone}-bg):
 * la fila activa se tiñe con él; Social y Números usan el tinte neutro.
 * `countKey` es la clave de /api/lists/counts (los contadores se piden al cargar, no en el SSR).
 */
export type ListsNavTone = 'fav' | 'like' | 'visto' | 'pend' | 'pronto' | 'seguir' | 'ep' | 'person' | 'rating' | 'tint';

export interface ListsNavItem {
    href: string;
    label: string;
    icon: string;
    tone: ListsNavTone;
    countKey?: string;
    /** Rutas que también la activan (subpáginas). */
    match?: string[];
    /** Globos que rellena scripts/notifications/bell.ts. */
    badge?: 'pending' | 'notif';
}

export interface ListsNavGroup { key: string; label: string; items: ListsNavItem[] }

export const LISTS_NAV: ListsNavGroup[] = [
    {
        key: 'listas', label: 'Listas', items: [
            { href: '/mislistas/favoritos', label: 'Favoritos', icon: 'crown', tone: 'fav', countKey: 'favoritos' },
            { href: '/mislistas/megusta', label: 'Me gusta', icon: 'heart', tone: 'like', countKey: 'megusta' },
            { href: '/mislistas/vistos', label: 'Vistos', icon: 'check', tone: 'visto', countKey: 'vistos' },
            { href: '/mislistas/pendientes', label: 'Pendientes', icon: 'clock', tone: 'pend', countKey: 'pendientes' },
            { href: '/mislistas/verpronto', label: 'Ver pronto', icon: 'cal', tone: 'pronto', countKey: 'verpronto' },
            { href: '/mislistas/siguiendo', label: 'Siguiendo', icon: 'eye', tone: 'seguir', countKey: 'siguiendo' },
            { href: '/mislistas/colecciones', label: 'Colecciones', icon: 'folder', tone: 'tint', countKey: 'colecciones' },
            { href: '/mislistas/actores', label: 'Actores', icon: 'user', tone: 'person' },
            { href: '/mislistas/calendario', label: 'Calendario', icon: 'calday', tone: 'ep' },
        ],
    },
    {
        key: 'social', label: 'Social', items: [
            { href: '/mislistas/amigos', label: 'Amigos', icon: 'users', tone: 'tint', badge: 'pending' },
            { href: '/mislistas/actividad', label: 'Actividad', icon: 'activity', tone: 'tint' },
            { href: '/mislistas/notificaciones', label: 'Notificaciones', icon: 'bell', tone: 'tint', badge: 'notif' },
        ],
    },
    {
        key: 'numeros', label: 'Tus números', items: [
            { href: '/mislistas/year', label: 'Tu año', icon: 'calendar', tone: 'tint' },
            { href: '/mislistas/year/siempre', label: 'En números', icon: 'chart', tone: 'tint' },
            { href: '/mislistas/recomendaciones', label: 'Para ti', icon: 'spark', tone: 'tint' },
        ],
    },
];

/** El destino activo para una ruta: el de prefijo más largo («/mislistas/year/siempre» gana a «/mislistas/year»). */
export function activeListsNavItem(path: string): ListsNavItem | null {
    const p = path.replace(/\/+$/, '') || '/';
    let best: ListsNavItem | null = null;
    for (const g of LISTS_NAV) for (const it of g.items) {
        const hit = p === it.href || p.startsWith(it.href + '/');
        if (hit && (!best || it.href.length > best.href.length)) best = it;
    }
    return best;
}
