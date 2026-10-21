/**
 * Textos de los mensajes (handoff de mensajes §4.1 y §4.4). Sin imports de servidor: los usa el
 * servidor para la vista previa de la lista y el navegador para pintar la conversación.
 */
import type { ChatMessage, MsgSys, PersonCard } from './types';

/** Un trozo de texto; `b` = nombre en negrita. */
export interface TextPart { t: string; b?: boolean }

export const DELETED_ACCOUNT = 'Cuenta eliminada';
export const DELETED_TEXT = 'Mensaje eliminado';
export const FOLDED_TEXT = 'Mensaje de alguien que has bloqueado';

type Names = (id: string | null) => string;

/** «Lucía», «Lucía y Carla», «Lucía, Carla y Pepe». */
function joinNames(parts: TextPart[][]): TextPart[] {
    const out: TextPart[] = [];
    parts.forEach((p, i) => {
        if (i > 0) out.push({ t: i === parts.length - 1 ? ' y ' : ', ' });
        out.push(...p);
    });
    return out;
}

/** Texto de un mensaje de sistema para quien mira (`me`), con los nombres marcados. */
export function sysParts(sys: MsgSys, me: string, name: Names): TextPart[] {
    const byMe = sys.actor === me;
    const actor: TextPart = { t: name(sys.actor), b: true };
    const others = sys.targets.filter((t) => t !== me).map((t) => [{ t: name(t), b: true }]);
    const meToo = sys.targets.includes(me);
    const quoted = `«${sys.name ?? ''}»`;
    switch (sys.type) {
        case 'created':
            return byMe ? [{ t: `Has creado el grupo ${quoted}` }] : [actor, { t: ` ha creado el grupo ${quoted}` }];
        case 'added': {
            // «a Lucía, Carla y a ti»: «a ti» siempre al final.
            const list = joinNames(meToo ? [...others, [{ t: 'a ti' }]] : others);
            return byMe ? [{ t: 'Has añadido a ' }, ...list] : [actor, { t: ' ha añadido a ' }, ...list];
        }
        case 'left':
            return byMe ? [{ t: 'Has salido del grupo' }] : [actor, { t: ' ha salido del grupo' }];
        case 'removed':
            if (byMe) return [{ t: 'Has quitado a ' }, ...joinNames(others)];
            return meToo ? [actor, { t: ' te ha quitado' }] : [actor, { t: ' ha quitado a ' }, ...joinNames(others)];
        case 'renamed':
            return byMe ? [{ t: `Has cambiado el nombre a ${quoted}` }] : [actor, { t: ` ha cambiado el nombre a ${quoted}` }];
        case 'admin':
            if (sys.inherited) return meToo ? [{ t: 'Ahora administras el grupo' }] : [{ t: 'Ahora ' }, ...joinNames(others), { t: ' administra el grupo' }];
            if (byMe) return [{ t: 'Has dado permisos de administración a ' }, ...joinNames(others)];
            return meToo
                ? [actor, { t: ' te ha dado permisos de administración' }]
                : [actor, { t: ' ha dado permisos de administración a ' }, ...joinNames(others)];
    }
}

export const plain = (parts: TextPart[]) => parts.map((p) => p.t).join('');

/** Nombre corto para la vista previa de grupos («Ana: …»). */
export const firstName = (full: string) => full.split(/\s+/)[0] || full;

/** Vista previa de la última línea de una conversación (fila de la lista, §4.1). */
export function previewOf(m: ChatMessage | null, me: string, group: boolean, people: Map<string, PersonCard>): string {
    if (!m) return 'Aún no hay mensajes';
    const name: Names = (id) => (id && people.get(id)?.name) || DELETED_ACCOUNT;
    if (m.kind === 'system' && m.sys) return plain(sysParts(m.sys, me, name));
    if (m.deleted) return DELETED_TEXT;
    if (m.folded) return FOLDED_TEXT;
    // Un spoiler nunca se adelanta en la lista: «Spoiler de Severance T2 E5» (M4c).
    const sp = m.spoiler;
    const spoiler = sp ? `Spoiler de ${sp.title}${sp.season && sp.episode ? ` T${sp.season} E${sp.episode}` : ''}` : '';
    // Una tarjeta sin comentario: su título entre comillas («Tú: «Perfect Days»»).
    const card = m.card ? (m.card.type === 'wtw' ? `¿Qué vemos? · ${m.card.ref.title}` : `«${m.card.ref.title}»`) : '';
    const body = spoiler || (m.body ?? '').replace(/\s+/g, ' ').trim() || card;
    if (m.author === me) return `Tú: ${body}`;
    return group ? `${firstName(name(m.author))}: ${body}` : body;
}
