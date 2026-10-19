/**
 * Qué partes de la capa social están encendidas (docs/PLAN_SOCIAL.md).
 *
 * Los componentes ya existen con todos sus estados (p. ej. `ProfileActions` tiene los 8 de la
 * relación), pero cada botón solo se pinta si su fase está activa. Así, F2/F3/F4 consisten en
 * cambiar una constante y conectar sus endpoints, no en rehacer la cabecera del perfil.
 *
 * F1: todo apagado (a un visitante solo le quedaba «Compartir»). F2: seguir y bloquear.
 */
export const SOCIAL_PHASE = {
    /** F2 · seguir / dejar de seguir. */
    follow: true,
    /** F3 · amistad por solicitud y la visibilidad «Solo amigos». */
    friends: false,
    /** F4 · recomendar a un amigo. */
    recommend: false,
    /** F2 · bloquear. */
    block: true,
} as const;
