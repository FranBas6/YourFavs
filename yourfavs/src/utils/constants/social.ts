/**
 * Qué partes de la capa social están encendidas (docs/PLAN_SOCIAL.md).
 *
 * Los componentes ya existen con todos sus estados (p. ej. `ProfileActions` tiene los 8 de la
 * relación), pero cada botón solo se pinta si su fase está activa. Así, F2/F3/F4 consisten en
 * cambiar una constante y conectar sus endpoints, no en rehacer la cabecera del perfil.
 *
 * F1: todo apagado (a un visitante solo le quedaba «Compartir»). F2: seguir y bloquear. F3: amistad. F4: recomendar.
 * M1/M2: mensajes y grupos (con las dos en false, todo queda como en F6).
 */
export const SOCIAL_PHASE = {
    /** F2 · seguir / dejar de seguir. */
    follow: true,
    /** F3 · amistad por solicitud y la visibilidad «Solo amigos». */
    friends: true,
    /** F4 · recomendar a un amigo. */
    recommend: true,
    /** F2 · bloquear. */
    block: true,
    /** M1 · mensajes 1:1 entre amigos (docs/Mensajes/PLAN_MENSAJES.md). */
    messages: true,
    /** M2 · grupos de mensajes. Necesita `messages`. */
    groups: true,
} as const;
