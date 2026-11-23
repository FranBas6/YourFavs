/**
 * Por qué se recomienda algo: de dónde sale la semilla que lo trajo (QA 1.3, H20). Antes la tarjeta decía
 * siempre «Porque viste X», también de lo que solo habías elegido en el asistente de gustos, sin verlo.
 * Lo usan la tarjeta (`components/cards/TitleCard.astro`) y Para ti (`pages/mislistas/recomendaciones.astro`).
 * Puro: sin servidor.
 */
export type SeedWhy = 'fav' | 'like' | 'taste' | 'rated' | 'seen';

/** `lead` va delante del título («Porque te gusta Interstellar»); `chip`, en la cabecera de su fila. */
export const SEED_WHY: Record<SeedWhy, { lead: string; chip: string }> = {
    fav: { lead: 'Porque te encantó', chip: 'en tus favoritas' },
    like: { lead: 'Porque te gustó', chip: 'en Me gusta' },
    rated: { lead: 'Por tu buena nota a', chip: 'tu nota' },
    seen: { lead: 'Porque viste', chip: 'vista hace poco' },
    taste: { lead: 'Porque te gusta', chip: 'en tus gustos' },
};

/** Sin motivo conocido (recomendaciones guardadas antes de este cambio), lo que no afirma nada. */
export const seedLead = (why?: string | null): string => SEED_WHY[why as SeedWhy]?.lead ?? 'Por';
