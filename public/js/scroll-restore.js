/* 1.4 · Continuidad de scroll en el catálogo.
 *
 * La paginación ya viaja en la URL (?page=N), así que al volver de una ficha el
 * navegador ya recupera la página correcta; lo único que se pierde es la POSICIÓN
 * de scroll. Esto la guarda por URL y la restaura al VOLVER (atrás) o RECARGAR.
 *
 * Acotado a /catalogo/* a propósito: fuera de ahí restablecemos
 * history.scrollRestoration = 'auto' para no tocar el comportamiento nativo del
 * resto de páginas (fichas, listas, etc.).
 */
(function () {
    if (!/^\/catalogo\//.test(location.pathname)) {
        // Fuera del catálogo no gestionamos nada: comportamiento nativo intacto.
        try { history.scrollRestoration = 'auto'; } catch (e) {}
        return;
    }
    // No peleamos con el scroll a anclas (#peliculas / #series de la búsqueda).
    if (location.hash) return;

    try { history.scrollRestoration = 'manual'; } catch (e) {}
    var KEY = 'yf_scroll:' + location.pathname + location.search;

    function save() {
        try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
    }
    // pagehide cubre móvil/bfcache; beforeunload el resto.
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);

    // Solo restauramos al VOLVER (atrás/adelante) o RECARGAR; una navegación
    // nueva a esta URL debe empezar arriba (sin restos de visitas previas).
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    var isReturn = nav && (nav.type === 'back_forward' || nav.type === 'reload');

    var y = null;
    try { var v = sessionStorage.getItem(KEY); if (v != null) y = parseInt(v, 10); } catch (e) {}

    if (isReturn && y && y > 0) {
        var restore = function () { window.scrollTo(0, y); };
        // Tras el primer paint y de nuevo al cargar imágenes: evita aterrizar
        // corto por el layout shift de los pósters al cargar.
        requestAnimationFrame(function () { requestAnimationFrame(restore); });
        window.addEventListener('load', restore);
    } else {
        try { sessionStorage.removeItem(KEY); } catch (e) {}
    }
})();
