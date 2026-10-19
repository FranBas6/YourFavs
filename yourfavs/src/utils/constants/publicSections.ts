/**
 * Secciones del perfil público (handoff §6 y §8.4). El dueño las enciende y apaga en Ajustes;
 * el ORDEN del array guardado en `profiles.public_sections` es el orden de la página (el arrastre
 * para reordenar llega en una fase posterior).
 *
 * Espejo de `homeSections.ts`: una lista con la definición y una función que reconcilia lo
 * guardado con lo que existe, para que una sección añadida más tarde aparezca sola y una que ya no
 * existe no rompa nada.
 */
export type PublicSectionId = 'favs' | 'log' | 'best' | 'collections' | 'common';

export interface PublicSectionDef {
    id: PublicSectionId;
    /** Fila en Ajustes. */
    label: string;
    desc: string;
    color: 'amber' | 'blue' | 'pink' | 'green' | 'purple';
    icon: string;
    /** Aún no existe (fase posterior): fila en gris con «Pronto» e interruptor deshabilitado. */
    soon?: boolean;
}

export const PUBLIC_SECTIONS: PublicSectionDef[] = [
    { id: 'favs', label: 'Series favoritas', desc: 'Tu ranking, hasta 10. Se ordena en tu lista de Favoritos.', color: 'amber', icon: 'award' },
    { id: 'log', label: 'Lo último visto', desc: 'Las últimas 12, agrupadas por serie. Sin títulos de episodio.', color: 'blue', icon: 'history' },
    { id: 'best', label: 'Mejor valoradas', desc: 'Tus 12 notas más altas, con tu nota.', color: 'pink', icon: 'star' },
    { id: 'collections', label: 'Colecciones', desc: 'Las que actives más abajo.', color: 'green', icon: 'library' },
    { id: 'common', label: 'En común contigo', desc: 'Lo que tenéis los dos en vuestras listas. Solo la verán tus amigos.', color: 'purple', icon: 'users', soon: true },
];

export type PublicSectionPref = { id: PublicSectionId; on: boolean };

const KNOWN = new Set<string>(PUBLIC_SECTIONS.map((s) => s.id));

/**
 * Lo guardado, saneado y completado: primero las secciones guardadas que existen (en su orden),
 * luego las nuevas con su valor por defecto. Las de «Pronto» siempre salen apagadas, aunque
 * alguien hubiera conseguido guardarlas encendidas.
 */
export function resolvePublicSections(raw: unknown): PublicSectionPref[] {
    const saved = Array.isArray(raw) ? raw : [];
    const out: PublicSectionPref[] = [];
    const seen = new Set<string>();
    for (const item of saved) {
        const id = (item as { id?: unknown })?.id;
        if (typeof id !== 'string' || !KNOWN.has(id) || seen.has(id)) continue;
        seen.add(id);
        out.push({ id: id as PublicSectionId, on: (item as { on?: unknown }).on === true });
    }
    for (const def of PUBLIC_SECTIONS) {
        if (!seen.has(def.id)) out.push({ id: def.id, on: !def.soon });
    }
    return out.map((s) => (PUBLIC_SECTIONS.find((d) => d.id === s.id)?.soon ? { ...s, on: false } : s));
}
