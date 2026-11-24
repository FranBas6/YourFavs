/**
 * Datos de las páginas legales (QA 4.1, H59), en un solo sitio para que privacidad, aviso legal, términos
 * y normas digan lo mismo. Si cambian (otro email, una ciudad, una fecha de revisión), se toca aquí.
 * Proyecto personal sin ánimo de lucro: sin NIF ni domicilio, a decisión del titular (a confirmar en la
 * revisión externa de los textos, paso 4.6 de docs/QA/PLAN_ARREGLOS.md).
 */
export const LEGAL = {
    service: 'YourFavs',
    owner: 'Francisco José Bas Guil',
    email: 'franbasguil@gmail.com',
    /** Fecha de la última revisión de los textos («24 de noviembre de 2026»). */
    updated: '24 de noviembre de 2026',
    minAge: 14,
} as const;

/** Las páginas legales, para el pie, «Acerca de» y la navegación entre ellas. */
export const LEGAL_PAGES = [
    { href: '/privacidad', label: 'Privacidad' },
    { href: '/terminos', label: 'Términos' },
    { href: '/normas', label: 'Normas de la comunidad' },
    { href: '/aviso-legal', label: 'Aviso legal' },
] as const;
