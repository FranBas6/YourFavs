import { db, fetchAll, getAuthId, requireAuthId } from "../shared/userScope";

interface ActorsFavs {
    id: string;
    position: number;
    added_at?: Date | string;
}

export type {ActorsFavs};

// Tabla `actor_favs` (antes users/{uid}/ActorsFavs). Posiciones 1..n para el orden manual:
// desplazar y renumerar son funciones SQL (una sentencia; antes una escritura por actor).

async function actorPositions(): Promise<ActorsFavs[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<{ person_id: number; position: number | null; added_at: string }>((from, to) =>
        db().from('actor_favs').select('person_id, position, added_at').eq('user_id', userId)
            .order('position', { nullsFirst: false }).order('person_id').range(from, to),
    );
    return rows.map(r => ({ id: String(r.person_id), position: r.position ?? 0, added_at: r.added_at }));
}

async function rpc(name: 'shift_actor_fav_positions' | 'renumber_actor_favs', args?: Record<string, unknown>): Promise<void> {
    const { error } = await db().rpc(name as never, args as never);
    if (error) throw new Error(error.message);
}

async function setActorPosition(actorId: string, position: number): Promise<void> {
    const { error } = await db().from('actor_favs').update({ position })
        .eq('user_id', requireAuthId()).eq('person_id', Number(actorId));
    if (error) throw new Error(error.message);
}

// Gestionar acciones POST de actores favoritos (add, remove, update position)
export async function handleActorFavAction(formData: FormData): Promise<string> {
    const actorId = String(formData.get('actor_id'));
    const action = String(formData.get('action'));
    const customPosition = formData.get('custom_position') ? Number(formData.get('custom_position')) : null;

    const favorites = await actorPositions();
    const actorExiste = favorites.some(f => f.id === actorId);

    if (action === 'add' && !actorExiste) {
        let newPosition: number;
        if (customPosition !== null) {
            await rpc('shift_actor_fav_positions', { p_from: customPosition, p_to: null, p_delta: 1 });
            newPosition = customPosition;
        } else {
            newPosition = favorites.length > 0
                ? Math.max(...favorites.map(f => f.position || 0)) + 1
                : 1;
        }

        const { error } = await db().from('actor_favs').upsert(
            { user_id: requireAuthId(), person_id: Number(actorId), added_at: new Date().toISOString(), position: newPosition },
            { onConflict: 'user_id,person_id' },
        );
        if (error) throw new Error(error.message);

    } else if (action === 'remove' && actorExiste) {
        await removeActorFromFavorites(actorId);
        await rpc('renumber_actor_favs'); // cierra el hueco: 1..n

    } else if (action === 'update' && actorExiste) {
        const requestedPosition = customPosition !== null ? customPosition : Number(formData.get('custom_position'));

        if (!requestedPosition || Number.isNaN(requestedPosition)) {
            throw new Error('Nueva posición inválida');
        }

        if (favorites.length === 0) throw new Error('No hay actores en favoritos');

        const actorIndex = favorites.findIndex(fav => fav.id === actorId);
        if (actorIndex === -1) throw new Error('Actor no encontrado en favoritos');

        const currentPos = favorites[actorIndex].position;

        if (requestedPosition < 1 || requestedPosition > favorites.length) {
            throw new Error(`Posición debe estar entre 1 y ${favorites.length}`);
        }

        if (currentPos !== requestedPosition) {
            if (requestedPosition < currentPos) {
                await rpc('shift_actor_fav_positions', { p_from: requestedPosition, p_to: currentPos - 1, p_delta: 1 });
            } else {
                await rpc('shift_actor_fav_positions', { p_from: currentPos + 1, p_to: requestedPosition, p_delta: -1 });
            }
            await setActorPosition(actorId, requestedPosition);
        }
    }

    return `/actor/${actorId}`;
}

export const getActorsFav = async (): Promise<ActorsFavs[]> => {
    try {
        return await actorPositions();
    } catch (error) {
        console.error("Error al obtener los actores favoritos:", error);
        return [];
    }
};

// Función para actualizar la posición de un actor en favoritos
export const updateActorPosition = async (actorId: string, newPosition: number): Promise<void> => {
    try {
        await setActorPosition(actorId, newPosition);
        console.log(`Posición del actor ${actorId} actualizada a ${newPosition}`);
    } catch (error) {
        console.error("Error al actualizar la posición del actor:", error);
        throw error;
    }
};

// Función para eliminar un actor de favoritos
export const removeActorFromFavorites = async (actorId: string): Promise<void> => {
    try {
        const { error } = await db().from('actor_favs').delete()
            .eq('user_id', requireAuthId()).eq('person_id', Number(actorId));
        if (error) throw new Error(error.message);
        console.log(`Actor ${actorId} eliminado de favoritos`);
    } catch (error) {
        console.error("Error al eliminar el actor de favoritos:", error);
        throw error;
    }
};
