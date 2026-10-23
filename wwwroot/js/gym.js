// Appearance: "light", "dark" or "auto" (follow the device). The server also reads the cookie to render the right theme at once.
window.gymTheme = (function () {
    function apply(mode) {
        var root = document.documentElement;
        if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
        else root.removeAttribute('data-theme');
        var meta = document.querySelector('meta[name=theme-color]');
        if (meta) {
            var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            meta.setAttribute('content', dark ? '#0b0f14' : '#f2f5f9');
        }
    }
    return {
        set: function (mode) {
            mode = (mode === 'light' || mode === 'dark') ? mode : 'auto';
            document.cookie = 'gym.theme=' + mode + '; path=/; max-age=31536000; samesite=lax';
            apply(mode);
        }
    };
})();

// Starting a session: the tap on the start button (a real user gesture) also turns on keep-screen-awake when the user has it enabled.
document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-awake="1"]');
    if (el && !el.disabled && window.gymWake) window.gymWake.enable();
}, true);

// Keep the phone screen on during a workout.
// 1) Screen Wake Lock API (needs HTTPS). 2) Fallback for plain HTTP / older browsers: a tiny, invisible video that is "playing"
// (the same trick phones use for video calls), which keeps most mobile browsers from locking the screen.
window.gymWake = (function () {
    var lock = null, video = null, canvas = null, timer = null, wanted = false, mode = 'none';

    function mark() { document.documentElement.classList.toggle('screen-awake', mode !== 'none'); }

    function viaWakeLock() {
        if (!('wakeLock' in navigator) || !navigator.wakeLock) return Promise.resolve(false);
        return navigator.wakeLock.request('screen').then(function (l) {
            lock = l;
            mode = 'wakelock';
            mark();
            l.addEventListener('release', function () {
                lock = null;
                if (mode === 'wakelock') { mode = 'none'; mark(); }
            });
            return true;
        }).catch(function () { return false; });
    }

    function viaVideo() {
        try {
            if (!canvas) { canvas = document.createElement('canvas'); canvas.width = canvas.height = 2; }
            if (!canvas.captureStream) return false;
            var ctx = canvas.getContext('2d'), n = 0;
            function draw() { ctx.fillStyle = (n++ % 2) ? '#000000' : '#010101'; ctx.fillRect(0, 0, 2, 2); }
            draw();
            if (!video) {
                video = document.createElement('video');
                video.setAttribute('playsinline', '');
                video.setAttribute('aria-hidden', 'true');
                video.muted = true;
                video.loop = true;
                video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
                document.body.appendChild(video);
            }
            video.srcObject = canvas.captureStream(5);
            timer = setInterval(draw, 500);
            var p = video.play();
            if (p && p.catch) p.catch(function () { /* retried on the next tap / when the tab is visible again */ });
            mode = 'video';
            mark();
            return true;
        } catch (e) { return false; }
    }

    function enable() {
        wanted = true;
        if (mode !== 'none') return Promise.resolve(mode);
        return viaWakeLock().then(function (ok) {
            if (!ok) viaVideo();
            return mode;
        });
    }

    function disable() {
        wanted = false;
        try { if (lock) lock.release(); } catch (e) { }
        lock = null;
        if (timer) { clearInterval(timer); timer = null; }
        if (video) { try { video.pause(); video.srcObject = null; video.remove(); } catch (e) { } video = null; }
        mode = 'none';
        mark();
    }

    // The browser drops wake locks when the tab is hidden: take it again when the user comes back.
    document.addEventListener('visibilitychange', function () {
        if (!wanted || document.visibilityState !== 'visible') return;
        if (mode === 'none') enable();
        else if (mode === 'video' && video) { var p = video.play(); if (p && p.catch) p.catch(function () { }); }
    });

    // A tap can also (re)start a video that the browser refused to autoplay.
    document.addEventListener('pointerdown', function () {
        if (wanted && mode === 'video' && video && video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () { }); }
    }, { passive: true });

    return { enable: enable, disable: disable, mode: function () { return mode; } };
})();

// In-page viewer for exercise media (YouTube / image / video), so the phone does not jump to the YouTube app.
// Any link with data-media="youtube|image|video" and data-src opens here; its href stays as the fallback (new tab).
window.gymMedia = (function () {
    var box = null;
    var TEXT = {
        ms: { close: 'Tutup', ext: 'Buka di tab baharu ↗', hint: 'Video tidak dapat dimainkan? ' },
        en: { close: 'Close', ext: 'Open in a new tab ↗', hint: 'Video will not play? ' }
    };
    function t(key) {
        var lang = ((document.documentElement.lang || 'ms') + '').slice(0, 2);
        return (TEXT[lang] || TEXT.ms)[key];
    }
    function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function close() {
        if (!box) return;
        box.remove();          // removing the element also stops the video / audio
        box = null;
        document.documentElement.classList.remove('media-open');
    }

    function open(info) {
        close();
        var body;
        if (info.kind === 'youtube')
            body = '<iframe src="' + esc(info.src) + '" title="' + esc(info.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
        else if (info.kind === 'video')
            body = '<video src="' + esc(info.src) + '" controls autoplay playsinline></video>';
        else
            body = '<img src="' + esc(info.src) + '" alt="' + esc(info.title) + '">';

        box = document.createElement('div');
        box.className = 'media-back';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML =
            '<div class="media-modal">' +
            '<div class="media-head"><b>' + esc(info.title) + '</b><button type="button" class="media-x" data-media-close aria-label="' + t('close') + '">✕</button></div>' +
            '<div class="media-body ' + esc(info.kind) + '">' + body + '</div>' +
            '<div class="media-foot"><span>' + (info.kind === 'youtube' ? t('hint') : '') + '</span><a href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">' + t('ext') + '</a></div>' +
            '</div>';
        document.body.appendChild(box);
        document.documentElement.classList.add('media-open');
    }

    document.addEventListener('click', function (ev) {
        var tgt = ev.target;
        if (!tgt || !tgt.closest) return;
        if (box && (tgt.closest('[data-media-close]') || tgt === box)) { close(); return; }
        var a = tgt.closest('[data-media]');
        if (a && a.getAttribute('data-src')) {
            ev.preventDefault();
            open({
                kind: a.getAttribute('data-media'), src: a.getAttribute('data-src'),
                title: a.getAttribute('data-title') || '', url: a.getAttribute('data-url') || a.getAttribute('href') || a.getAttribute('data-src')
            });
        }
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });

    return { open: open, close: close };
})();

// Rest timer — runs entirely in the browser (no server round-trip per second).
// The countdown is based on a deadline timestamp, so it stays correct even if the tab is throttled or delayed.
window.gymTimer = (function () {
    var state = { total: 0, deadline: 0, remaining: 0, running: false, over: false, label: '', media: null };
    var tick = null;
    var audioCtx = null;

    // Texts for the two supported languages (the page language comes from <html lang>).
    var TEXT = {
        ms: { pause: 'Pause', resume: 'Resume', add: '+15s', reset: 'Reset', close: 'Tutup', go: 'Teruskan ▶', rest: 'Rehat', resting: 'Berehat…', paused: 'Dijeda', over: 'REST TIME OVER!', watch: 'Tonton video senaman seterusnya', viewImg: 'Lihat gambar senaman seterusnya' },
        en: { pause: 'Pause', resume: 'Resume', add: '+15s', reset: 'Reset', close: 'Close', go: 'Continue ▶', rest: 'Rest', resting: 'Resting…', paused: 'Paused', over: 'REST TIME OVER!', watch: 'Watch the next exercise video', viewImg: 'View the next exercise image' }
    };
    function t(key) {
        var lang = ((document.documentElement.lang || 'ms') + '').slice(0, 2);
        return (TEXT[lang] || TEXT.ms)[key];
    }

    function root() { return document.getElementById('rest-timer'); }

    function fmt(sec) {
        sec = Math.max(0, Math.ceil(sec));
        var m = Math.floor(sec / 60), s = sec % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function ensureDom() {
        var el = root();
        if (!el) return null;
        if (!el.querySelector('.rt-time')) {
            el.innerHTML =
                '<div class="rt-inner">' +
                '<div class="rt-info"><div class="rt-label"></div><div class="rt-time" aria-live="off">00:00</div><div class="rt-msg"></div><div class="rt-media"></div></div>' +
                '<div class="rt-btns">' +
                '<button type="button" data-a="pause" class="rt-btn">' + t('pause') + '</button>' +
                '<button type="button" data-a="add" class="rt-btn">' + t('add') + '</button>' +
                '<button type="button" data-a="reset" class="rt-btn">' + t('reset') + '</button>' +
                '<button type="button" data-a="close" class="rt-btn rt-x" aria-label="' + t('close') + '">✕</button>' +
                '<button type="button" data-a="close" class="rt-btn rt-go">' + t('go') + '</button>' +
                '</div></div>';
        }
        return el;
    }

    function remaining() {
        return state.running ? (state.deadline - Date.now()) / 1000 : state.remaining;
    }

    function render() {
        var el = ensureDom();
        if (!el) return;
        var rem = remaining();
        el.classList.add('show');
        el.classList.toggle('over', state.over);
        el.querySelector('.rt-label').textContent = state.label || t('rest');
        el.querySelector('.rt-time').textContent = fmt(rem);
        el.querySelector('.rt-msg').textContent = state.over ? t('over') : (state.running ? t('resting') : t('paused'));
        // Link to the next exercise's video / image, so the user can prepare while resting (rebuilt only when it changes).
        var slot = el.querySelector('.rt-media');
        var key = state.media ? state.media.url + '|' + state.media.title : '';
        if (slot && slot.getAttribute('data-key') !== key) {
            slot.setAttribute('data-key', key);
            slot.textContent = '';
            if (state.media) {
                var a = document.createElement('a');
                a.className = 'rt-watch';
                a.href = state.media.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                if (state.media.kind && state.media.kind !== 'link' && state.media.src) {
                    a.setAttribute('data-media', state.media.kind);
                    a.setAttribute('data-src', state.media.src);
                }
                a.setAttribute('data-title', state.media.title || '');
                a.setAttribute('data-url', state.media.url);
                a.textContent = (state.media.kind === 'image' ? '🖼 ' + t('viewImg') : '▶ ' + t('watch'));
                slot.appendChild(a);
            }
        }
        var pause = el.querySelector('[data-a=pause]');
        pause.textContent = state.running ? t('pause') : t('resume');
        pause.disabled = state.over;
    }

    function beep() {
        try {
            if (!audioCtx) return;
            var t = audioCtx.currentTime;
            for (var i = 0; i < 3; i++) {
                var o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'square'; o.frequency.value = 880;
                g.gain.setValueAtTime(0.0001, t + i * 0.3);
                g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.3 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.3 + 0.2);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(t + i * 0.3); o.stop(t + i * 0.3 + 0.22);
            }
        } catch (e) { /* audio is optional */ }
    }

    function expire() {
        state.over = true;
        state.running = false;
        state.remaining = 0;
        var el = root();
        if (el && el.dataset.sound !== 'false') beep();
        if (el && el.dataset.vibrate !== 'false' && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    }

    function loop() {
        if (state.running && remaining() <= 0 && !state.over) expire();
        render();
    }

    function begin(seconds, label, media) {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC && !audioCtx) audioCtx = new AC();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* ignore */ }

        state.total = seconds;
        state.label = label || '';
        state.media = (media && media.url) ? media : null;
        state.over = false;
        state.running = true;
        state.deadline = Date.now() + seconds * 1000;
        state.remaining = seconds;
        if (!tick) tick = setInterval(loop, 200);
        render();
    }

    function act(a) {
        if (a === 'pause') {
            if (state.over) return;
            if (state.running) { state.remaining = remaining(); state.running = false; }
            else { state.deadline = Date.now() + state.remaining * 1000; state.running = true; }
        } else if (a === 'add') {
            var wasOver = state.over;
            var base = wasOver ? 0 : remaining();
            state.over = false;
            state.remaining = base + 15;
            if (state.running || wasOver) { state.deadline = Date.now() + state.remaining * 1000; state.running = true; }
        } else if (a === 'reset') {
            state.over = false;
            state.running = true;
            state.deadline = Date.now() + state.total * 1000;
            state.remaining = state.total;
        } else if (a === 'close') {
            state.running = false; state.over = false;
            if (tick) { clearInterval(tick); tick = null; }
            var el = root();
            if (el) el.classList.remove('show', 'over');
            return;
        }
        render();
    }

    // Browsers only allow audio after a user gesture: unlock it on the first touch/click anywhere.
    function unlockAudio() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC && !audioCtx) audioCtx = new AC();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* ignore */ }
    }
    document.addEventListener('pointerdown', unlockAudio, { passive: true });

    document.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('#rest-timer [data-a]');
        if (b) act(b.getAttribute('data-a'));
    });

    return {
        start: begin,
        startFrom: function (btn) {
            begin(parseInt(btn.getAttribute('data-secs'), 10) || 90, btn.getAttribute('data-label') || '');
        }
    };
})();
