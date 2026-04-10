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

function initOptimisticActions() {
    document.querySelectorAll('form[method="POST"]').forEach(function (form) {
        if (form.querySelector('textarea') || form.dataset.optimistic) return;
        form.dataset.optimistic = 'true';

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
