// Rest timer — runs entirely in the browser (no server round-trip per second).
// The countdown is based on a deadline timestamp, so it stays correct even if the tab is throttled or delayed.
window.gymTimer = (function () {
    var state = { total: 0, deadline: 0, remaining: 0, running: false, over: false, label: '' };
    var tick = null;
    var audioCtx = null;

    // Texts for the two supported languages (the page language comes from <html lang>).
    var TEXT = {
        ms: { pause: 'Pause', resume: 'Resume', add: '+15s', reset: 'Reset', close: 'Tutup', go: 'Teruskan ▶', rest: 'Rehat', resting: 'Berehat…', paused: 'Dijeda', over: 'REST TIME OVER!' },
        en: { pause: 'Pause', resume: 'Resume', add: '+15s', reset: 'Reset', close: 'Close', go: 'Continue ▶', rest: 'Rest', resting: 'Resting…', paused: 'Paused', over: 'REST TIME OVER!' }
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
                '<div class="rt-info"><div class="rt-label"></div><div class="rt-time" aria-live="off">00:00</div><div class="rt-msg"></div></div>' +
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

    function begin(seconds, label) {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC && !audioCtx) audioCtx = new AC();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* ignore */ }

        state.total = seconds;
        state.label = label || '';
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
