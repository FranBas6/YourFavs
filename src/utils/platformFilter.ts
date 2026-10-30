/**
 * Filtro «Solo en mis plataformas» del catálogo.
 *
 * Antes cada página hacía `urlParams.get('mine') === '1'`, así que la ausencia del parámetro
 * significaba SIEMPRE "no filtres". Con el ajuste «Filtrar siempre por mis plataformas»
 * (`UserProfile.platformsFilterDefault`) la ausencia pasa a significar "lo que diga tu perfil",
 * y para poder apagarlo hace falta un `mine=0` EXPLÍCITO — si el chip solo borrase el parámetro,
 * con el ajuste activo apagarlo lo volvería a encender.
 *
 * Un usuario sin plataformas elegidas nunca filtra, aunque tenga el ajuste puesto: filtrar por
 * un conjunto vacío devolvería cero resultados sin explicar por qué.
 */
interface PlatformUser {
    platforms?: number[];
    platformsFilterDefault?: boolean;
}

export interface MineFilterState {
    /** ¿Hay que filtrar por las plataformas del perfil en esta petición? */
    mine: boolean;
    /** Valor que aplica cuando la URL no dice nada (para el chip y el contador de filtros). */
    mineDefault: boolean;
}

export function resolveMineFilter(
    params: URLSearchParams,
    user: PlatformUser | null | undefined,
): MineFilterState {
    const hasPlatforms = (user?.platforms?.length ?? 0) > 0;
    const mineDefault = hasPlatforms && user?.platformsFilterDefault === true;

    const raw = params.get('mine');
    if (raw !== null) return { mine: raw === '1' && hasPlatforms, mineDefault };
    return { mine: mineDefault, mineDefault };
}
