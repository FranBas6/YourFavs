/**
 * Tipos de la capa social que viajan entre servidor y navegador (docs/PLAN_SOCIAL.md, F2+).
 *
 * Sin imports de servidor: los usan también los scripts del cliente (`scripts/social/*`).
 */

export type StampColor = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'pink' | 'slate';

/** Una persona tal como se pinta en filas, avisos y ⌘K. Nunca lleva email ni nada privado. */
export interface PersonCard {
    id: string;
    /** Solo si su perfil público está activo: sin él no hay enlace ni se le puede seguir. */
    handle: string | null;
    name: string;
    /** URL del avatar público (por handle) o null → iniciales sobre stamp. */
    avatar: string | null;
    archetype: { name: string; icon: string } | null;
    color: StampColor;
    initials: string;
}

/**
 * Relación de quien mira con otra persona. Seguir y amistad son independientes (handoff §0.1).
 *
 * A propósito NO existe «me ha bloqueado» ni «me rechazó»: nada de lo que llega al navegador
 * puede delatarlo (handoff §5.2).
 */
export interface Relation {
    iFollow: boolean;
    followsMe: boolean;
    blockedByMe: boolean;
    /** F3. */
    friends: boolean;
    friendsSince: string | null;
    requestOut: boolean;
    requestIn: boolean;
}

export const NO_RELATION: Relation = {
    iFollow: false, followsMe: false, blockedByMe: false,
    friends: false, friendsSince: null, requestOut: false, requestIn: false,
};

export interface PersonEntry {
    person: PersonCard;
    rel: Relation;
    /** Fecha (ms) que da sentido a la fila: desde cuándo le sigues, te sigue o le bloqueaste. */
    at?: number;
}

export interface SocialPhaseFlags {
    follow: boolean;
    friends: boolean;
    recommend: boolean;
    block: boolean;
}

export type FriendsTab = 'pendientes' | 'amigos' | 'siguiendo' | 'seguidores' | 'bloqueados';

/** Aviso de la campana ya listo para pintar. Los sociales traen la persona y la relación ACTUAL. */
export interface NotifView {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    href: string;
    poster_path: string | null;
    created_at: number;
    read: boolean;
    actor?: PersonCard;
    rel?: Relation;
    /** Solo `friend_request`: cómo está ahora esa solicitud. */
    req?: 'pending' | 'accepted' | 'rejected' | 'gone';
    /** Solo `recommendation` y `rec_reply` (F4): la recomendación, con su estado para quien mira. */
    rec?: RecView;
}

// -------------------------------------------------------------------------------------
// Recomendaciones (F4)
// -------------------------------------------------------------------------------------
export type RecTarget = 'movie' | 'tv' | 'person' | 'company';
export type RecStatus = 'pending' | 'added' | 'alerts' | 'opened' | 'discarded';
/** Lo que ve quien recibe: su estado o, si sigue pendiente, «ya la tenías» / «ya la viste». */
export type RecShown = RecStatus | 'had' | 'seen';
export type QuickKey = 'thanks' | 'seen_it' | 'saving' | 'not_for_me';

export const QUICK_TEXT: Record<QuickKey, string> = {
    thanks: '¡Gracias!',
    seen_it: 'Ya la había visto',
    saving: 'Me la apunto',
    not_for_me: 'No es para mí',
};

export interface RecReply { kind: 'quick' | 'text'; key: QuickKey | null; text: string | null; at: number }

export interface RecView {
    id: number;
    targetType: RecTarget;
    targetId: number;
    title: string;
    image: string | null;
    message: string | null;
    createdAt: number;
    /** Para quien recibe. En `rec_reply` (quien envía) no se usa. */
    shown: RecShown;
    reply: RecReply | null;
}

export interface RecReceived extends RecView { from: PersonCard }

export interface RecSentRecipient {
    person: PersonCard;
    /** Lo único que ve quien envía: descartar y abrir sin responder siguen «sent». */
    visible: 'sent' | 'added' | 'alerts';
    reply: RecReply | null;
}

export interface RecSent extends Omit<RecView, 'shown' | 'reply'> { recipients: RecSentRecipient[] }
