/* HoverPreview (C24) — solo desktop con hover real */
(function () {
    if (typeof window === 'undefined') return;
    var mq = window.matchMedia('(hover: hover) and (min-width: 1024px)');
    if (!mq.matches) return;

    var DEBOUNCE_MS = 500;
    var SCALE = 2;
    var EDGE_MARGIN = 40;
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
        var anchor = decideAnchor(host);
        var rect = host.getBoundingClientRect();
        var overlay = document.createElement('div');
        overlay.className = 'hover-preview-overlay';
        overlay.setAttribute('data-anchor', anchor);

        // Position: fixed, anclado al rect del host para evitar problemas de stacking
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';

        var media = document.createElement('div');
        media.className = 'hover-preview-media';
        overlay.appendChild(media);

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
        overlay.appendChild(info);

        // Click bubbles up to the wrapped <a>
        overlay.addEventListener('click', function (e) {
            var href = host.dataset.href;
            // Si el click es en el botón mute, no navegar
            if (e.target.closest('.hover-preview-mute')) return;
            if (href) window.location.href = href;
        });

        return { overlay: overlay, media: media, info: info };
    }

    function decideAnchor(host) {
        var rect = host.getBoundingClientRect();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var extraX = rect.width * (SCALE - 1) / 2;
        var heightGuess = rect.width * 9 / 16; // overlay es 16:9 sobre rect.width
        var extraY = heightGuess * (SCALE - 1);

        // Horizontal: si toca borde derecho, anclar derecha
        var hAnchor = 'left';
        if (rect.right + extraX + EDGE_MARGIN > vw) hAnchor = 'right';
        else if (rect.left - extraX - EDGE_MARGIN < 0) hAnchor = 'left';

        // Vertical: si crece y se sale por abajo, anclar bottom
        var vAnchor = 'top';
        if (rect.top + heightGuess * SCALE + EDGE_MARGIN > vh) vAnchor = 'bottom';

        if (hAnchor === 'right' && vAnchor === 'bottom') return 'right-bottom';
        if (hAnchor === 'left' && vAnchor === 'bottom') return 'left-bottom';
        if (hAnchor === 'right') return 'right';
        return 'left';
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
                    autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1,
                    iv_load_policy: 3, playsinline: 1, fs: 0, disablekb: 1,
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
                        if (e.data === 1) {
                            setTimeout(function () {
                                if (loadingMask.isConnected) loadingMask.classList.add('is-hidden');
                            }, 1500);
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
        host.__overlay = null;
        host.classList.remove('is-previewing');
    }

    function activate(host) {
        if (host.__overlay) return;
        var built = buildOverlay(host);
        document.body.appendChild(built.overlay);
        host.__overlay = built.overlay;
        host.classList.add('is-previewing');

        // Cuando el ratón sale del overlay (ej. saltar a otra card), también lo cerramos
        built.overlay.addEventListener('mouseleave', function () {
            destroyOverlay(host);
        });

        // Pintamos fallback inmediatamente (backdrop o poster), y luego intentamos trailer
        fillFallback(built.media, host);

        // Trigger animación
        requestAnimationFrame(function () { built.overlay.classList.add('is-visible'); });

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
        var leaveTimer = null;

        host.addEventListener('mouseenter', function () {
            if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
            if (enterTimer) clearTimeout(enterTimer);
            enterTimer = setTimeout(function () { activate(host); }, DEBOUNCE_MS);
        });
        host.addEventListener('mouseleave', function (e) {
            if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
            // Si el ratón está pasando al overlay, no destruir
            if (host.__overlay && e.relatedTarget && host.__overlay.contains(e.relatedTarget)) return;
            // Pequeño delay para evitar flicker entre rect del host y rect visual del overlay
            leaveTimer = setTimeout(function () { destroyOverlay(host); }, 80);
        });
    }

    function destroyAll() {
        document.querySelectorAll('.hover-preview-host.is-previewing').forEach(function (h) { destroyOverlay(h); });
    }

    function init() {
        document.querySelectorAll('.hover-preview-host').forEach(attach);
        // Si el usuario scrollea, cerramos cualquier overlay (fixed se desincroniza con el host)
        window.addEventListener('scroll', destroyAll, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
