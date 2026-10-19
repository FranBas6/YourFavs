/**
 * Qué partes de la capa social están encendidas (docs/PLAN_SOCIAL.md).
 *
 * Los componentes ya existen con todos sus estados (p. ej. `ProfileActions` tiene los 8 de la
 * relación), pero cada botón solo se pinta si su fase está activa. Así, F2/F3/F4 consisten en
 * cambiar una constante y conectar sus endpoints, no en rehacer la cabecera del perfil.
 *
 * En F1 está todo apagado: a un visitante solo le queda el botón «Compartir».
 */
export const SOCIAL_PHASE = {
    /** F2 · seguir / dejar de seguir. */
    follow: false,
    /** F3 · amistad por solicitud y la visibilidad «Solo amigos». */
    friends: false,
    /** F4 · recomendar a un amigo. */
    recommend: false,
    /** F2 · bloquear. */
    block: false,
} as const;
