var LIST_NAMES = {
    favorites: 'Favoritos', pendientes: 'Pendientes', vistas: 'Vistas',
    verPronto: 'Lo próximo', liked: 'Me gusta', siguiendo: 'Siguiendo',
    favs: 'Favoritos', verpronto: 'Lo próximo', viendo: 'Viendo', abandonada: 'Abandonadas'
};

var TEXT_TOGGLES = {
    'Añadir a Favoritos': 'Quitar de Favoritos',
    'Quitar de Favoritos': 'Añadir a Favoritos',
    'Lo próximo': 'Quitar de Lo próximo',
    'Quitar de Lo próximo': 'Lo próximo',
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
 * Aviso de error que NO desaparece solo (QA 3.1, H64): «No se ha guardado (sin conexión) · Reintentar».
 * Antes salía «Error al guardar» 2,5 s y el cambio se quedaba pintado como si se hubiera guardado.
 * Uno por formulario: reintentar o cerrar lo quita; un nuevo fallo del mismo lo sustituye.
 */
function showSaveError(form, message, retry) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    if (form.__yfErrToast) form.__yfErrToast.remove();
    var toast = document.createElement('div');
    toast.className = 'toast toast-error so-undo-toast';
    toast.setAttribute('role', 'alert');
    var text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    var again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Reintentar';
    again.addEventListener('click', function () { toast.remove(); form.__yfErrToast = null; retry(); });
    toast.appendChild(again);
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';
    close.addEventListener('click', function () { toast.remove(); form.__yfErrToast = null; });
    toast.appendChild(close);
    container.appendChild(toast);
    form.__yfErrToast = toast;
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
        // Confirmación opcional (data-confirm): p. ej. "Volver a ver" reinicia el progreso.
        var confirmMsg = form.getAttribute('data-confirm');
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        var submitter = e.submitter || form.querySelector('button[type="submit"]');
        var btn = submitter || form.querySelector('button[type="submit"]');
        if (!btn || btn.classList.contains('is-submitting')) return;
        var formData = new FormData(form, submitter);
        btn.classList.add('is-submitting');
        if (options.onBeforeSubmit) options.onBeforeSubmit(form, btn, formData);

        fetch(window.location.pathname, { method: 'POST', body: formData })
            .then(function (res) {
                if (!res.ok && !res.redirected) throw new Error();
                // La ficha captura sus errores y redirige igual: con ?guardado=error no es un éxito (QA 3.1).
                if (res.redirected && /[?&]guardado=error\b/.test(res.url)) throw new Error('servidor');
                // La ficha redirige a ?seguida=1 si marcar un episodio pasó la serie a Siguiendo (QA 2.4):
                // lo cuenta scripts/series/autoFollow.ts, con «Deshacer».
                if (res.redirected && /[?&]seguida=1\b/.test(res.url)) document.dispatchEvent(new CustomEvent('yf:auto-follow'));
                var msg = typeof options.successMsg === 'function' ? options.successMsg(formData) : options.successMsg;
                if (msg) showToast(msg, 'success');
                if (options.onSuccess) options.onSuccess(formData);
                if (options.reload) {
                    setTimeout(function () { window.location.reload(); }, options.reloadDelay || 500);
                }
            })
            .catch(function () {
                // Deshacer lo pintado antes de tiempo y avisar hasta que el usuario reintente o cierre.
                if (options.onError) options.onError(form, btn, formData);
                var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
                showSaveError(form, offline ? 'No se ha guardado: no hay conexión' : (options.errorMsg || 'No se ha guardado'), function () {
                    if (form.requestSubmit) form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
                    else form.dispatchEvent(new Event('submit', { cancelable: true }));
                });
            })
            .finally(function () { btn.classList.remove('is-submitting'); });
    });
}

/**
 * Invierte en pantalla el estado de un episodio (botón, fila, celda de la tira, contador de la temporada y
 * total de la serie) a partir de lo que hay pintado. Se usa al enviar y, si falla, otra vez para
 * deshacerlo (QA 3.1, H64: sin red, el episodio se quedaba en «Visto» y el progreso subido).
 */
function flipEpisodeUI(btn, formData) {
            // Botón del sistema (rediseño 4.8): el estado va en aria-pressed; el texto no cambia.
            var sysBtn = btn.classList.contains('btn');
            var isWatched = sysBtn ? btn.getAttribute('aria-pressed') === 'true' : btn.classList.contains('bg-green-500');

            if (sysBtn) {
                btn.setAttribute('aria-pressed', isWatched ? 'false' : 'true');
            } else if (isWatched) {
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
            // Tira de episodios de la fila de temporada (rediseño 4.6): visto = color pleno.
            var cell = document.querySelector('[data-ep-cell="' + seasonNum + '-' + formData.get('episode') + '"]');
            if (cell) cell.classList.toggle('is-seen', !isWatched);
            var bar = document.querySelector('[data-season-bar="' + seasonNum + '"]');
            var count = document.querySelector('[data-season-count="' + seasonNum + '"]');
            if (count) {
                // «7/10»: el total va en el propio texto (la barra de temporada ya no existe desde el rediseño 4.6).
                var parts = count.textContent.split('/');
                var total = parseInt(parts[1]) || 0;
                var current = parseInt(parts[0]) + (isWatched ? -1 : 1);
                current = Math.max(0, Math.min(total, current));
                count.textContent = current + '/' + total;
                if (bar && total) bar.style.width = Math.round(current / total * 100) + '%';
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
}

function handleWatchedEpisodeForm(form) {
    submitOptimistic(form, {
        onBeforeSubmit: function (_f, btn, formData) {
            var sysBtn = btn.classList.contains('btn');
            var isWatched = sysBtn ? btn.getAttribute('aria-pressed') === 'true' : btn.classList.contains('bg-green-500');
            btn.dataset.wasWatched = isWatched ? '1' : '0';
            flipEpisodeUI(btn, formData);
        },
        onError: function (_f, btn, formData) { flipEpisodeUI(btn, formData); },
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
            // La escala admite medios puntos (7,5) → con coma, como se escribe en español.
            var r = Number(formData.get('rating'));
            return isFinite(r) && r > 0
                ? 'Nota ' + r.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '/10 guardada'
                : 'Nota guardada';
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
            btn.dataset.wasPressed = btn.getAttribute('aria-pressed') || '';
            // Barra de las fichas (rediseño, Fase 4): botón del sistema con estado; recarga al guardar.
            if (btn.classList.contains('btn')) {
                if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', action === 'add' ? 'true' : 'false');
                return;
            }
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
        },
        reload: form.hasAttribute('data-reload'),
        reloadDelay: 300,
        onError: function (f, btn, formData) {
            if (btn.classList.contains('btn')) {
                if (btn.dataset.wasPressed) btn.setAttribute('aria-pressed', btn.dataset.wasPressed);
                return;
            }
            // Botón antiguo: volver al valor de `action` y al color de antes.
            var actionInput = f.querySelector('input[name="action"]');
            if (actionInput) actionInput.value = formData.get('action');
            var on = formData.get('action') !== 'add';
            btn.classList.toggle('bg-amber-500', on); btn.classList.toggle('text-white', on);
        }
    });
}

function handleGenericFavAction(form) {
    var state = { textNode: null, originalText: '', action: '', actionInput: null };
    submitOptimistic(form, {
        onBeforeSubmit: function (f, btn, formData) {
            state.action = formData.get('action');
            state.actionInput = f.querySelector('input[name="action"]');
            // Barra de las fichas (rediseño, Fase 4): los botones con estado se pintan pulsados o
            // no al instante (el texto no cambia) y la página recarga con el estado real.
            if (btn.hasAttribute('aria-pressed') && !btn.hasAttribute('aria-haspopup')) {
                state.pressed = btn.getAttribute('aria-pressed');
                state.pressedBtn = btn;
                btn.setAttribute('aria-pressed', state.action === 'add' ? 'true' : 'false');
                if (state.actionInput) state.actionInput.value = (state.action === 'add') ? 'remove' : 'add';
                return;
            }
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
            if (form.getAttribute('data-ok')) return form.getAttribute('data-ok');
            var listType = formData.get('list_type') || formData.get('actionType');
            var name = LIST_NAMES[listType] || listType;
            return (state.action === 'add') ? 'Añadido a ' + name : 'Quitado de ' + name;
        },
        onSuccess: function () {
            // Al guardar un título (add a una lista), dejamos pendiente la pista de
            // onboarding; se mostrará tras el reload si el usuario es elegible (Fase F·C).
            if (state.action === 'add') {
                try { sessionStorage.setItem('yf_taste_hint_pending', '1'); } catch (e) {}
            }
        },
        errorMsg: 'Error al procesar la acción',
        reload: true,
        reloadDelay: 300,
        onError: function () {
            if (state.pressedBtn) state.pressedBtn.setAttribute('aria-pressed', state.pressed);
            if (state.textNode) state.textNode.textContent = ' ' + state.originalText + ' ';
            if (state.actionInput) state.actionInput.value = state.action;
        }
    });
}

function initOptimisticActions() {
    document.querySelectorAll('form[method="POST"]').forEach(function (form) {
        if (form.dataset.optimistic) return;
        // Formularios con su propio script (p. ej. «Seguir saga», `scripts/library/sagaFollow.ts`): aquí
        // no se tocan. Sin esto les caía el manejador genérico de listas («Quitado de null») y mandaba
        // los datos a la propia ficha a la vez que su script (2026-11-23).
        if (form.hasAttribute('data-no-optimistic')) return;
        form.dataset.optimistic = 'true';

        var actionType = form.querySelector('input[name="actionType"]');
        var val = actionType ? actionType.value : '';

        if (val === 'watched_episode') return handleWatchedEpisodeForm(form);
        if (val === 'watched_season') return handleWatchedSeasonForm(form);
        if (val === 'watched_all') return handleWatchedAllForm(form);
        if (val === 'notification') return handleNotificationForm(form);
        if (val === 'rating') return handleRatingForm(form);
        if (val === 'media_tags') return handleMediaTagsForm(form);
        // §2 modo sin spoilers: envío NATIVO (no optimista). El servidor redirige con `?sp`
        // y la ficha muestra su propio toast al cargar (evita el genérico "Quitado de spoiler_pref").
        if (val === 'spoiler_pref') return;

        var actionInput = form.querySelector('input[name="action"]');
        var action = actionInput ? actionInput.value : '';
        if (action === 'save_opinion' || action === 'delete_opinion') return handleOpinionForm(form);
        // "Terminada" (Bloque 2): cierra la sesión de visionado; recarga para reflejar el estado.
        if (action === 'finish_viewing') return submitOptimistic(form, { successMsg: 'Marcada como vista', reload: true, reloadDelay: 300 });

        handleGenericFavAction(form);
    });
}

initOptimisticActions();

// La ficha volvió con ?guardado=error (envío sin JavaScript, o recarga): avisar y limpiar la URL (QA 3.1).
(function () {
    try {
        var u = new URL(location.href);
        if (u.searchParams.get('guardado') !== 'error') return;
        u.searchParams.delete('guardado');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
        showToast('No se ha guardado. Inténtalo otra vez', 'error');
    } catch (e) {}
})();

// ── Fase F · Acceso C — pista post-guardado (no bloqueante, nunca modal) ──────
// Tras guardar un título, si el usuario es elegible (sesión + onboarding no hecho)
// y aún no la descartó, le invitamos UNA vez a contar sus gustos. Banner cerrable.
function dismissTasteHint() {
    try { localStorage.setItem('yf_taste_hint_done', '1'); } catch (e) {}
}
function showTasteHintBanner() {
    if (document.getElementById('yf-taste-hint')) return;
    var el = document.createElement('div');
    el.id = 'yf-taste-hint';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(8px);z-index:10050;' +
        'width:min(460px,92vw);display:flex;align-items:center;gap:14px;background:var(--bg-elev);' +
        'border:1px solid var(--border);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);' +
        'padding:14px 16px;font-family:var(--font,sans-serif);opacity:0;transition:opacity .25s ease,transform .25s ease;';
    el.innerHTML =
        '<span style="width:40px;height:40px;border-radius:11px;background:var(--stamp-green,#D1FAE5);color:var(--stamp-green-ink,#047857);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;font-weight:700;">✓</span>' +
        '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:14px;font-weight:700;color:var(--text,#111827);">Guardado</div>' +
            '<div style="font-size:12.5px;color:var(--text-3,#6B7280);">¿Quieres mejores recomendaciones? <a href="/gustos" style="color:var(--accent,#E63946);font-weight:600;text-decoration:none;">Cuéntanos tus gustos →</a></div>' +
        '</div>' +
        '<button type="button" aria-label="Cerrar" style="width:28px;height:28px;flex-shrink:0;border-radius:8px;border:none;background:var(--bg-tint,#F9FAFB);color:var(--text-3,#6B7280);cursor:pointer;font-size:14px;">✕</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });

    var close = function () { dismissTasteHint(); el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 250); };
    el.querySelector('button').addEventListener('click', close);
    el.querySelector('a').addEventListener('click', dismissTasteHint); // al ir a /gustos, no volver a mostrar
}
function maybeShowTasteHint() {
    try {
        if (document.body.getAttribute('data-taste-hint') !== 'eligible') return;
        if (localStorage.getItem('yf_taste_hint_done')) return;
        if (sessionStorage.getItem('yf_taste_hint_pending') !== '1') return;
        sessionStorage.removeItem('yf_taste_hint_pending');
        showTasteHintBanner();
    } catch (e) {}
}
maybeShowTasteHint();
