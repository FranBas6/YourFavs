/**
 * Direcciones de perfil público que nadie puede quedarse (handoff perfil público §5.3).
 *
 * Son rutas de la app, palabras que suenan oficiales o que confunden en una URL. Se comparan en
 * minúsculas, que es como se guardan los handles. Si añades una ruta de primer nivel a la app,
 * piensa si su nombre debería estar aquí.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
    'admin', 'api', 'app', 'ajustes', 'perfil', 'u', 'yourfavs', 'soporte', 'ayuda',
    'login', 'entrar', 'registro', 'null', 'undefined', 'me', 'yo',
    // Rutas de primer nivel de la app, por si algún día el perfil sale de /u/.
    'mislistas', 'catalogo', 'movie', 'serie', 'actor', 'team', 'productora', 'gustos', 'about', 'auth',
]);
