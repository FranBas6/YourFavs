/* HoverPreview (C24) — solo desktop con hover real */
(function () {
    if (typeof window === 'undefined') return;
    var mq = window.matchMedia('(hover: hover) and (min-width: 1024px)');
    if (!mq.matches) return;

    var DEBOUNCE_MS = 1250;
    var MUTE_PREF_KEY = 'yf_hover_muted';

    function isMutedPref() {
        try {
            var v = localStorage.getItem(MUTE_PREF_KEY);
            return v === null ? true : v === '1';
        } catch (_) { return true; }
    }
    function setMutedPref(muted) {
        try { localStorage.setItem(MUTE_PREF_KEY, muted ? '1' : '0'); } catch (_) {}
    }

    var ytApiLoading = false;
    var ytApiReady = false;
    var ytReadyCbs = [];

    function loadYouTubeAPI(cb) {
        if (ytApiReady) return cb();
        ytReadyCbs.push(cb);
        if (ytApiLoading) return;
        ytApiLoading = true;
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = function () {
            ytApiReady = true;
            ytReadyCbs.forEach(function (fn) { fn(); });
            ytReadyCbs = [];
        };
    }

    function fetchVideo(type, id) {
        return fetch('/api/videos/' + type + '/' + id)
            .then(function (r) { return r.json(); })
            .catch(function () { return { trailer: null }; });
    }

    var videoCache = new Map();
    function getVideo(type, id) {
        var key = type + '_' + id;
        if (videoCache.has(key)) return Promise.resolve(videoCache.get(key));
        return fetchVideo(type, id).then(function (data) {
            videoCache.set(key, data);
            return data;
        });
    }

    function buildOverlay(host) {
        var overlay = document.createElement('div');
        overlay.className = 'hover-preview-overlay';
        // Centrado por CSS (top/left 50% + transform translate). No fijamos rect.

        var media = document.createElement('div');
        media.className = 'hover-preview-media';
        overlay.appendChild(media);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'hover-preview-close';
        closeBtn.setAttribute('aria-label', 'Cerrar');
        closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        overlay.appendChild(closeBtn);

        var info = document.createElement('div');
        info.className = 'hover-preview-info';

        var titleWrap = document.createElement('div');
        titleWrap.className = 'hp-titlewrap';
        var titleEl = document.createElement('div');
        titleEl.className = 'hp-title';
        titleEl.textContent = host.dataset.title || '';
        titleWrap.appendChild(titleEl);

        var year = host.dataset.year;
        var rating = host.dataset.rating;
        if (year || rating) {
            var meta = document.createElement('div');
            meta.className = 'hp-meta';
            var bits = [];
            if (year) bits.push('<span>' + year + '</span>');
            if (rating) bits.push('<span class="hp-rating">★ ' + rating + '</span>');
            meta.innerHTML = bits.join(' · ');
            titleWrap.appendChild(meta);
        }
        info.appendChild(titleWrap);

        // CTA explícito "Ver detalles" — único lugar que navega
        var href = host.dataset.href;
        if (href) {
            var cta = document.createElement('a');
            cta.className = 'hover-preview-cta';
            cta.href = href;
            cta.innerHTML = 'Ver detalles <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
            info.appendChild(cta);
        }

        overlay.appendChild(info);

        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            destroyOverlay(host);
        });

        return { overlay: overlay, media: media, info: info };
    }

    function fillFallback(media, host) {
        var bg = host.dataset.backdrop;
        if (bg) {
            var img = document.createElement('img');
            img.src = bg;
            img.alt = host.dataset.title || '';
            media.appendChild(img);
            return;
        }
        // Sin backdrop: clonar el primer <img> del slot (poster) en horizontal
        var poster = host.querySelector('img');
        if (poster && poster.src) {
            var img2 = document.createElement('img');
            img2.src = poster.src;
            img2.alt = host.dataset.title || '';
            img2.style.objectFit = 'cover';
            media.appendChild(img2);
        }
    }

    function mountIframe(media, info, ytKey) {
        var iframeEl = document.createElement('div');
        iframeEl.id = 'hp-yt-' + Math.random().toString(36).slice(2);
        media.appendChild(iframeEl);

        // Mask inicial negro encima del iframe — oculta el spinner y los controles
        // de autoplay (play/pause/skip) que YouTube enseña al arrancar
        var loadingMask = document.createElement('div');
        loadingMask.className = 'hp-loading-mask';
        media.appendChild(loadingMask);

        loadYouTubeAPI(function () {
            // Verifica que el media siga vivo (mouseleave podría haberlo destruido)
            if (!media.isConnected) return;

            var startMuted = isMutedPref();

            var player = new window.YT.Player(iframeEl.id, {
                videoId: ytKey,
                playerVars: {
                    autoplay: 1, mute: 1, controls: 1, rel: 0, modestbranding: 1,
                    iv_load_policy: 3, playsinline: 1, fs: 0,
                    showinfo: 0, loop: 1, playlist: ytKey,
                },
                events: {
                    onReady: function (e) {
                        try {
                            e.target.playVideo();
                            if (!startMuted) {
                                e.target.unMute();
                                e.target.setVolume(50);
                                muted = false;
                                renderMuteIcon();
                            }
                        } catch (_) {}
                    },
                    onStateChange: function (e) {
                        // Quitamos el mask en cuanto empieza a reproducir (ya no necesitamos
                        // tapar los controles porque ahora son intencionalmente visibles).
                        if (e.data === 1) {
                            setTimeout(function () {
                                if (loadingMask.isConnected) loadingMask.classList.add('is-hidden');
                            }, 200);
                        }
                    }
                }
            });
            media.__ytPlayer = player;

            var SVG_MUTED = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
            var SVG_UNMUTED = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

            var mute = document.createElement('button');
            mute.type = 'button';
            mute.className = 'hover-preview-mute';
            var muted = true;
            function renderMuteIcon() {
                mute.innerHTML = muted ? SVG_MUTED : SVG_UNMUTED;
                mute.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
            }
            renderMuteIcon();
            mute.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!media.__ytPlayer) return;
                if (muted) {
                    media.__ytPlayer.unMute();
                    media.__ytPlayer.setVolume(50);
                    muted = false;
                } else {
                    media.__ytPlayer.mute();
                    muted = true;
                }
                setMutedPref(muted);
                renderMuteIcon();
            });
            info.appendChild(mute);
        });
    }

    function destroyOverlay(host) {
        var overlay = host.__overlay;
        if (!overlay) return;
        var media = overlay.querySelector('.hover-preview-media');
        if (media && media.__ytPlayer) {
            try { media.__ytPlayer.destroy(); } catch (_) {}
        }
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (host.__backdrop && host.__backdrop.parentNode) {
            host.__backdrop.parentNode.removeChild(host.__backdrop);
        }
        host.__backdrop = null;
        host.__overlay = null;
        host.classList.remove('is-previewing');
    }

    function activate(host) {
        if (host.__overlay) return;
        var backdrop = document.createElement('div');
        backdrop.className = 'hover-preview-backdrop';
        document.body.appendChild(backdrop);
        host.__backdrop = backdrop;

        // Click en el dim cierra
        backdrop.addEventListener('click', function () { destroyOverlay(host); });

        var built = buildOverlay(host);
        document.body.appendChild(built.overlay);
        host.__overlay = built.overlay;
        host.classList.add('is-previewing');

        // Pintamos fallback inmediatamente (backdrop o poster), y luego intentamos trailer
        fillFallback(built.media, host);

        // Trigger animación
        requestAnimationFrame(function () {
            backdrop.classList.add('is-visible');
            built.overlay.classList.add('is-visible');
        });

        var type = host.dataset.tmdbType;
        var id = host.dataset.tmdbId;
        if (!type || !id) return;
        getVideo(type, id).then(function (data) {
            if (!host.__overlay || host.__overlay !== built.overlay) return; // ya se cerró o reabrió
            if (data && data.trailer) {
                // Limpiar fallback y montar iframe
                while (built.media.firstChild) built.media.removeChild(built.media.firstChild);
                mountIframe(built.media, built.info, data.trailer);
            }
        });
    }

    function attach(host) {
        if (host.__hpAttached) return;
        host.__hpAttached = true;

        var enterTimer = null;

        host.addEventListener('mouseenter', function () {
            if (enterTimer) clearTimeout(enterTimer);
            enterTimer = setTimeout(function () { activate(host); }, DEBOUNCE_MS);
        });
        host.addEventListener('mouseleave', function () {
            // Solo cancelamos el enterTimer si el usuario sale antes de que abra el preview.
            // El cierre del preview ya abierto es por: click backdrop, X, Esc o scroll.
            if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
        });
    }

    function destroyAll() {
        document.querySelectorAll('.hover-preview-host.is-previewing').forEach(function (h) { destroyOverlay(h); });
    }

    function init() {
        document.querySelectorAll('.hover-preview-host').forEach(attach);
        // Si el usuario scrollea, cerramos cualquier overlay
        window.addEventListener('scroll', destroyAll, { passive: true });
        // Esc cierra cualquier preview abierto
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') destroyAll();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
