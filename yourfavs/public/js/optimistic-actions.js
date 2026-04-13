var LIST_NAMES = {
    // Movies usan list_type
    favorites: 'Favoritos', pendientes: 'Pendientes', vistas: 'Vistas',
    verPronto: 'Ver Pronto', liked: 'Me gusta', siguiendo: 'Siguiendo',
    // Series usan actionType con valores diferentes
    favs: 'Favoritos', verpronto: 'Ver Pronto'
};

var TEXT_TOGGLES = {
    'Añadir a Favoritos': 'Quitar de Favoritos',
    'Quitar de Favoritos': 'Añadir a Favoritos',
    'Ver Pronto': 'Quitar de Ver Pronto',
    'Quitar de Ver Pronto': 'Ver Pronto',
    'Marcar Pendiente': 'Quitar de Pendientes',
    'Quitar de Pendientes': 'Marcar Pendiente',
    'Marcar como Vista': 'Quitar de Vistas',
    'Quitar de Vistas': 'Marcar como Vista',
    'Marcar Siguiendo': 'Dejar de Seguir',
    'Dejar de Seguir': 'Marcar Siguiendo',
    'Me gusta': 'Ya me gusta',
    'Ya me gusta': 'Me gusta'
};

function showToast(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'success');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
}

function handleWatchedEpisodeForm(form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        btn.classList.add('is-submitting');

        var formData = new FormData(form);
        var isWatched = btn.classList.contains('bg-green-500');

        // Toggle visual
        if (isWatched) {
            btn.classList.remove('bg-green-500', 'text-white', 'hover:bg-green-600');
            btn.classList.add('border', 'border-gray-300', 'text-gray-500', 'hover:border-green-400', 'hover:text-green-600');
            var txt = btn.querySelector('span, .btn-text');
            if (!txt) { btn.childNodes.forEach(function(n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Marcar visto'; }); }
        } else {
            btn.classList.remove('border', 'border-gray-300', 'text-gray-500', 'hover:border-green-400', 'hover:text-green-600');
            btn.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600');
            btn.childNodes.forEach(function(n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Visto'; });
        }

        // Actualizar barra de progreso de la temporada
        var seasonNum = formData.get('season');
        var bar = document.querySelector('[data-season-bar="' + seasonNum + '"]');
        var count = document.querySelector('[data-season-count="' + seasonNum + '"]');
        var progressDiv = document.querySelector('[data-season-progress="' + seasonNum + '"]');
        if (bar && count && progressDiv) {
            var total = parseInt(progressDiv.getAttribute('data-season-total') || '0');
            var parts = count.textContent.split('/');
            var current = parseInt(parts[0]) + (isWatched ? -1 : 1);
            current = Math.max(0, Math.min(total, current));
            count.textContent = current + '/' + total;
            bar.style.width = Math.round(current / total * 100) + '%';
        }

        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (res.ok || res.redirected) {
                    var ep = 'T' + seasonNum + ' E' + formData.get('episode');
                    showToast(isWatched ? ep + ' desmarcado' : ep + ' visto', 'success');
                } else { throw new Error(); }
            })
            .catch(function () { showToast('Error al guardar', 'error'); })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

function handleWatchedSeasonForm(form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        btn.classList.add('is-submitting');

        var formData = new FormData(form);

        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (res.ok || res.redirected) {
                    var season = formData.get('season');
                    var action = formData.get('action');
                    showToast(action === 'mark' ? 'Temporada ' + season + ' marcada' : 'Temporada ' + season + ' desmarcada', 'success');
                    setTimeout(function () { window.location.reload(); }, 500);
                } else { throw new Error(); }
            })
            .catch(function () { showToast('Error al guardar', 'error'); })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

function handleNotificationForm(form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        btn.classList.add('is-submitting');
        var formData = new FormData(form);
        var action = formData.get('action');

        // Toggle visual
        if (action === 'add') {
            btn.classList.remove('border', 'border-amber-200', 'text-amber-600', 'hover:bg-amber-50', 'hover:border-amber-400');
            btn.classList.add('bg-amber-500', 'text-white', 'hover:bg-amber-600');
        } else {
            btn.classList.remove('bg-amber-500', 'text-white', 'hover:bg-amber-600');
            btn.classList.add('border', 'border-amber-200', 'text-amber-600', 'hover:bg-amber-50', 'hover:border-amber-400');
        }

        var actionInput = form.querySelector('input[name="action"]');
        if (actionInput) actionInput.value = (action === 'add') ? 'remove' : 'add';

        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (res.ok || res.redirected) {
                    showToast(action === 'add' ? 'Notificación activada' : 'Notificación desactivada', 'success');
                } else { throw new Error(); }
            })
            .catch(function () { showToast('Error al guardar', 'error'); })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

function handleWatchedAllForm(form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        btn.classList.add('is-submitting');
        var formData = new FormData(form);
        var action = formData.get('action');
        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (res.ok || res.redirected) {
                    showToast(action === 'mark' ? 'Toda la serie marcada como vista' : 'Serie desmarcada', 'success');
                    setTimeout(function () { window.location.reload(); }, 500);
                } else { throw new Error(); }
            })
            .catch(function () { showToast('Error al guardar', 'error'); })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

function initOptimisticActions() {
    document.querySelectorAll('form[method="POST"]').forEach(function (form) {
        if (form.querySelector('textarea') || form.dataset.optimistic) return;
        form.dataset.optimistic = 'true';

        var actionType = form.querySelector('input[name="actionType"]');
        if (actionType && actionType.value === 'watched_episode') {
            handleWatchedEpisodeForm(form);
            return;
        }
        if (actionType && actionType.value === 'watched_season') {
            handleWatchedSeasonForm(form);
            return;
        }
        if (actionType && actionType.value === 'watched_all') {
            handleWatchedAllForm(form);
            return;
        }
        if (actionType && actionType.value === 'notification') {
            handleNotificationForm(form);
            return;
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var btn = form.querySelector('button[type="submit"]');
            if (!btn || btn.classList.contains('is-submitting')) return;

            var formData = new FormData(form);
            var action = formData.get('action');
            // Movies usan list_type, Series usan actionType
            var listType = formData.get('list_type') || formData.get('actionType');

            btn.classList.add('is-submitting');

            // Toggle del texto del botón
            var textNode = null;
            var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null);
            while (walker.nextNode()) {
                var trimmed = walker.currentNode.textContent.trim();
                if (trimmed && TEXT_TOGGLES[trimmed]) {
                    textNode = walker.currentNode;
                    break;
                }
            }

            var originalText = textNode ? textNode.textContent.trim() : '';
            if (textNode && TEXT_TOGGLES[originalText]) {
                textNode.textContent = ' ' + TEXT_TOGGLES[originalText] + ' ';
            }

            // Toggle del input action
            var actionInput = form.querySelector('input[name="action"]');
            if (actionInput) actionInput.value = (action === 'add') ? 'remove' : 'add';

            fetch(window.location.pathname, {
                method: 'POST',
                body: formData
            }).then(function (res) {
                if (res.ok || res.redirected) {
                    var name = LIST_NAMES[listType] || listType;
                    var msg = (action === 'add') ? 'Añadido a ' + name : 'Quitado de ' + name;
                    showToast(msg, 'success');
                    // Reload suave para actualizar secciones condicionales (opinión, etc.)
                    setTimeout(function () { window.location.reload(); }, 300);
                } else {
                    throw new Error('Error del servidor');
                }
            }).catch(function () {
                if (textNode) textNode.textContent = ' ' + originalText + ' ';
                if (actionInput) actionInput.value = action;
                showToast('Error al procesar la acción', 'error');
            }).finally(function () {
                btn.classList.remove('is-submitting');
            });
        });
    });
}

initOptimisticActions();
