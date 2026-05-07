var LIST_NAMES = {
    favorites: 'Favoritos', pendientes: 'Pendientes', vistas: 'Vistas',
    verPronto: 'Ver Pronto', liked: 'Me gusta', siguiendo: 'Siguiendo',
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

/**
 * Handler genérico de POST optimista.
 * options:
 *   successMsg: string | function(formData) — mensaje de toast en éxito
 *   errorMsg: string — por defecto 'Error al guardar'
 *   reload: bool — recargar la página tras éxito
 *   reloadDelay: number — ms antes del reload (default 500)
 *   onBeforeSubmit(form, btn, formData) — cambios visuales optimistas
 *   onError(form, btn, formData) — rollback si el fetch falla
 */
function submitOptimistic(form, options) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var submitter = e.submitter || form.querySelector('button[type="submit"]');
        var btn = submitter || form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        var formData = new FormData(form, submitter);
        btn.classList.add('is-submitting');
        if (options.onBeforeSubmit) options.onBeforeSubmit(form, btn, formData);

        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (!res.ok && !res.redirected) throw new Error();
                var msg = typeof options.successMsg === 'function' ? options.successMsg(formData) : options.successMsg;
                if (msg) showToast(msg, 'success');
                if (options.reload) {
                    setTimeout(function () { window.location.reload(); }, options.reloadDelay || 500);
                }
            })
            .catch(function () {
                if (options.onError) options.onError(form, btn, formData);
                showToast(options.errorMsg || 'Error al guardar', 'error');
            })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

function handleWatchedEpisodeForm(form) {
    submitOptimistic(form, {
        onBeforeSubmit: function (_f, btn, formData) {
            var isWatched = btn.classList.contains('bg-green-500');
            btn.dataset.wasWatched = isWatched ? '1' : '0';

            if (isWatched) {
                btn.classList.remove('bg-green-500', 'text-white', 'hover:bg-green-600');
                btn.classList.add('border', 'border-gray-300', 'text-gray-500', 'hover:border-green-400', 'hover:text-green-600');
                btn.childNodes.forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Marcar visto'; });
            } else {
                btn.classList.remove('border', 'border-gray-300', 'text-gray-500', 'hover:border-green-400', 'hover:text-green-600');
                btn.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600');
                btn.childNodes.forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Visto'; });
            }

            // Atenuar/restaurar la fila del episodio (igual que en el SSR: opacity-60 cuando está visto)
            var summary = btn.closest('summary');
            if (summary) {
                if (isWatched) summary.classList.remove('opacity-60');
                else summary.classList.add('opacity-60');
            }

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

            // Totales globales (solo si la temporada es "regular", no la 0)
            if (seasonNum !== '0') {
                var totalWrap = document.querySelector('[data-total-watched]');
                var totalCount = document.querySelector('[data-total-count]');
                var totalPct = document.querySelector('[data-total-pct]');
                var totalBarWrap = document.querySelector('[data-total-progress]');
                var totalBar = document.querySelector('[data-total-bar]');
                if (totalWrap && totalCount && totalPct && totalBarWrap && totalBar) {
                    var totalRegular = parseInt(totalWrap.getAttribute('data-total-regular') || '0');
                    var currentTotal = parseInt(totalWrap.getAttribute('data-total-watched') || '0') + (isWatched ? -1 : 1);
                    currentTotal = Math.max(0, Math.min(totalRegular, currentTotal));
                    totalWrap.setAttribute('data-total-watched', String(currentTotal));
                    totalCount.textContent = currentTotal + '/' + totalRegular;
                    var pct = totalRegular > 0 ? Math.round(currentTotal / totalRegular * 100) : 0;
                    totalPct.textContent = String(pct);
                    totalBar.style.width = pct + '%';
                    totalWrap.style.display = currentTotal > 0 ? '' : 'none';
                    totalBarWrap.style.display = currentTotal > 0 ? '' : 'none';
                }
            }
        },
        successMsg: function (formData) {
            // Reconstruye el mensaje usando el flag guardado antes del toggle
            var ep = 'T' + formData.get('season') + ' E' + formData.get('episode');
            var wasWatched = form.querySelector('button[type="submit"]').dataset.wasWatched === '1';
            return wasWatched ? ep + ' desmarcado' : ep + ' visto';
        }
    });
}

function handleWatchedSeasonForm(form) {
    submitOptimistic(form, {
        successMsg: function (formData) {
            var action = formData.get('action');
            return action === 'mark' ? 'Temporada ' + formData.get('season') + ' marcada' : 'Temporada ' + formData.get('season') + ' desmarcada';
        },
        reload: true
    });
}

function handleWatchedAllForm(form) {
    submitOptimistic(form, {
        successMsg: function (formData) {
            return formData.get('action') === 'mark' ? 'Toda la serie marcada como vista' : 'Serie desmarcada';
        },
        reload: true
    });
}

function handleOpinionForm(form) {
    submitOptimistic(form, {
        successMsg: function (formData) {
            return formData.get('action') === 'delete_opinion' ? 'Opinión eliminada' : 'Opinión guardada';
        },
        reload: true,
        reloadDelay: 400
    });
}

function handleRatingForm(form) {
    submitOptimistic(form, {
        successMsg: function (formData) {
            var action = formData.get('action');
            if (action === 'delete_rating') return 'Nota eliminada';
            var r = formData.get('rating');
            return r ? 'Nota ' + r + '/10 guardada' : 'Nota guardada';
        },
        reload: true,
        reloadDelay: 400
    });
}

function handleMediaTagsForm(form) {
    submitOptimistic(form, {
        successMsg: function (formData) {
            var tags = String(formData.get('tags') || '').trim();
            var notes = String(formData.get('notes') || '').trim();
            if (!tags && !notes) return 'Tags y notas eliminados';
            return 'Tags y notas guardados';
        },
        reload: true,
        reloadDelay: 400
    });
}

function handleNotificationForm(form) {
    submitOptimistic(form, {
        onBeforeSubmit: function (f, btn, formData) {
            var action = formData.get('action');
            if (action === 'add') {
                btn.classList.remove('border', 'border-amber-200', 'text-amber-600', 'hover:bg-amber-50', 'hover:border-amber-400');
                btn.classList.add('bg-amber-500', 'text-white', 'hover:bg-amber-600');
            } else {
                btn.classList.remove('bg-amber-500', 'text-white', 'hover:bg-amber-600');
                btn.classList.add('border', 'border-amber-200', 'text-amber-600', 'hover:bg-amber-50', 'hover:border-amber-400');
            }
            var actionInput = f.querySelector('input[name="action"]');
            if (actionInput) actionInput.value = (action === 'add') ? 'remove' : 'add';
        },
        successMsg: function (formData) {
            return formData.get('action') === 'add' ? 'Notificación activada' : 'Notificación desactivada';
        }
    });
}

function handleGenericFavAction(form) {
    var state = { textNode: null, originalText: '', action: '', actionInput: null };
    submitOptimistic(form, {
        onBeforeSubmit: function (f, btn, formData) {
            state.action = formData.get('action');
            var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null);
            while (walker.nextNode()) {
                var trimmed = walker.currentNode.textContent.trim();
                if (trimmed && TEXT_TOGGLES[trimmed]) {
                    state.textNode = walker.currentNode;
                    break;
                }
            }
            state.originalText = state.textNode ? state.textNode.textContent.trim() : '';
            if (state.textNode && TEXT_TOGGLES[state.originalText]) {
                state.textNode.textContent = ' ' + TEXT_TOGGLES[state.originalText] + ' ';
            }
            state.actionInput = f.querySelector('input[name="action"]');
            if (state.actionInput) state.actionInput.value = (state.action === 'add') ? 'remove' : 'add';
        },
        successMsg: function (formData) {
            var listType = formData.get('list_type') || formData.get('actionType');
            var name = LIST_NAMES[listType] || listType;
            return (state.action === 'add') ? 'Añadido a ' + name : 'Quitado de ' + name;
        },
        errorMsg: 'Error al procesar la acción',
        reload: true,
        reloadDelay: 300,
        onError: function () {
            if (state.textNode) state.textNode.textContent = ' ' + state.originalText + ' ';
            if (state.actionInput) state.actionInput.value = state.action;
        }
    });
}

function initOptimisticActions() {
    document.querySelectorAll('form[method="POST"]').forEach(function (form) {
        if (form.dataset.optimistic) return;
        form.dataset.optimistic = 'true';

        var actionType = form.querySelector('input[name="actionType"]');
        var val = actionType ? actionType.value : '';

        if (val === 'watched_episode') return handleWatchedEpisodeForm(form);
        if (val === 'watched_season') return handleWatchedSeasonForm(form);
        if (val === 'watched_all') return handleWatchedAllForm(form);
        if (val === 'notification') return handleNotificationForm(form);
        if (val === 'rating') return handleRatingForm(form);
        if (val === 'media_tags') return handleMediaTagsForm(form);

        var actionInput = form.querySelector('input[name="action"]');
        var action = actionInput ? actionInput.value : '';
        if (action === 'save_opinion' || action === 'delete_opinion') return handleOpinionForm(form);

        handleGenericFavAction(form);
    });
}

initOptimisticActions();
