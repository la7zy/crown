// The episode page of the live site. It unlocks an episode and hands it to the reader
// (ambient.js, after.js, immersive.js), which shows the story with its scenes.
//
// An episode is a locked file, epNN.bin: 16 bytes of salt, 12 bytes of IV, then the episode as
// AES-GCM ciphertext. The key is PBKDF2-SHA256 of the day's code. Once a code has opened an
// episode, the key (never the code) is kept in this browser, so the episode opens by itself
// from then on, and without internet too.
(function () {
  'use strict';

  var ITERATIONS = 150000, SALT_BYTES = 16, HEADER_BYTES = 28;   // header: the salt, then a 12-byte IV
  var SITE_NAME = 'The Price of a Crown';
  var HOME = 'index.html';
  var READER_FILES = ['ambient.js', 'after.js', 'immersive.js'];
  var EPISODE_CACHE = 'crown-episodes';   // the same name as in sw.js: opened episodes, kept for reading without internet
  var LIST_WAIT_MS = 4000;                // how long the list of episodes may hold up a screen
  var THUMB = { width: 480, height: 270 };
  var WRONG_CODE = 'That code did not open this episode. Check it and try again.';
  var NO_DOWNLOAD = 'The episode did not download. Check your internet and try again.';
  var NOT_OPENED = 'OperationError';      // what the browser calls a key that does not fit
  var LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  var main = document.getElementById('story');
  var asked = Number((new URLSearchParams(window.location.search).get('e') || '').replace(/[^0-9]/g, '').slice(0, 2));
  var E = asked ? (asked < 10 ? '0' : '') + asked : '';   // the episode's number, as two digits
  var KEY_NAME = 'crown.k.' + E;                          // where this browser keeps the episode's key
  var locked = null;                                      // the locked file, once it has been downloaded
  var listing = null;                                     // the list of episodes, once it has been asked for

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // Reads or writes this browser's storage. A browser that refuses (private mode) simply forgets.
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { return null; }
    return value;
  }

  function toBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return window.btoa(s);
  }

  function fromBase64(text) {
    var s = window.atob(text), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  // "Tower-1554" and "tower 1554" are the same code.
  function normalise(code) { return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // ---------- unlocking ----------

  function download() {
    if (locked) return Promise.resolve(locked);
    return fetch('ep' + E + '.bin').then(function (r) {
      if (r.status === 404) throw new Error('missing');
      if (!r.ok) throw new Error('download');
      return r.arrayBuffer();
    }).then(function (buffer) {
      if (buffer.byteLength <= HEADER_BYTES) throw new Error('download');
      locked = new Uint8Array(buffer);
      return locked;
    });
  }

  function keyFromCode(code, salt) {
    return window.crypto.subtle.importKey('raw', new TextEncoder().encode(normalise(code)), 'PBKDF2', false, ['deriveBits'])
      .then(function (material) { return window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, 256); })
      .then(function (bits) { return new Uint8Array(bits); });
  }

  // The episode inside the file. Fails with an OperationError when the key is not the right one.
  function unlock(key, file) {
    return window.crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
      .then(function (k) { return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.slice(SALT_BYTES, HEADER_BYTES) }, k, file.slice(HEADER_BYTES)); })
      .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
  }

  function openWithKey(stored) {
    return download().then(function (file) { return unlock(fromBase64(stored), file); });
  }

  function openWithCode(code) {
    return download().then(function (file) {
      return keyFromCode(code, file.slice(0, SALT_BYTES)).then(function (key) {
        return unlock(key, file).then(function (episode) { store(KEY_NAME, toBase64(key)); return episode; });
      });
    });
  }

  function reason(e) { return e && e.name === NOT_OPENED ? WRONG_CODE : NO_DOWNLOAD; }

  // Keeps the locked file on this phone, so that the episode can be read again without internet.
  // The service worker hands it back when there is no network. A phone with no room keeps no copy.
  function keepForOffline() {
    if (!locked || !window.caches) return;
    window.caches.open(EPISODE_CACHE)
      .then(function (cache) { return cache.put('ep' + E + '.bin', new Response(locked, { headers: { 'Content-Type': 'application/octet-stream' } })); })
      .catch(function () {});
  }

  // The code a QR link carries: ep.html?e=01#c=word-1234
  function codeInAddress() {
    var found = window.location.hash.match(/c=([^&]+)/);
    if (!found) return null;
    try { return decodeURIComponent(found[1]); } catch (e) { return null; }   // a mangled link is treated as no code
  }

  function forgetCodeInAddress() {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The site's list of episodes. The page works without it: it only loses titles and the way on.
  // So a list that fails or is slow counts as empty for now, and is asked for again next time.
  function episodes() {
    if (listing) return listing;
    var asked = fetch('episodes.json')
      .then(function (r) { if (!r.ok) throw new Error('list'); return r.json(); })
      .then(function (d) { return (d && Array.isArray(d.eps) ? d.eps : []).filter(function (e) { return e && typeof e.n === 'string'; }); });
    var tooSlow = new Promise(function (resolve, reject) { window.setTimeout(function () { reject(new Error('slow')); }, LIST_WAIT_MS); });
    listing = Promise.race([asked, tooSlow]).catch(function () { listing = null; return []; });
    return listing;
  }

  // ---------- the screens shown before an episode is open ----------

  // An empty card on the dark screen, with the way back to the list above it.
  function card() {
    var screen = el('section', 'lock'), top = el('div', 'top'), nav = el('nav', 'episodes'), back = el('a', '', 'All episodes'), box = el('div', 'lock-card');
    nav.setAttribute('aria-label', 'Episodes');
    back.href = HOME;
    nav.appendChild(back);
    top.appendChild(nav);
    screen.appendChild(top);
    screen.appendChild(box);
    document.body.classList.add('locked');
    main.textContent = '';
    main.appendChild(screen);
    return { screen: screen, box: box };
  }

  function message(title, text, button) {
    var c = card();
    c.box.appendChild(el('p', 'lock-eyebrow', E ? 'Episode ' + Number(E) : SITE_NAME));
    c.box.appendChild(el('h1', '', title));
    c.box.appendChild(el('p', 'lock-about', text));
    if (button) c.box.appendChild(button);
    return c;
  }

  function notReleased() {
    var back = el('a', 'onward-go', 'See all episodes');
    back.href = HOME;
    message('Not released yet', 'Your teacher has not opened this episode yet. It will be here on its reading day.', back);
  }

  function reloadButton(text) {
    var again = el('button', 'lock-go', text);
    again.type = 'button';
    again.addEventListener('click', function () { window.location.reload(); });
    return again;
  }

  function readerFailed() {
    message('The page did not finish loading', 'Check your internet, then load the page again.', reloadButton('Load the page again'));
  }

  // No code can help while the file itself is missing from this phone, so there is no code box here.
  function downloadFailed() {
    message('The episode did not download', 'Check your internet, then try again.', reloadButton('Try again'));
  }

  // The episode's picture: blurred behind the whole screen, and sharp at the top of the card.
  function picture(c) {
    var src = 'thumb' + E + '.jpg', art = el('div', 'lock-art'), frame = el('figure', 'lock-thumb'), img = el('img'), badge = el('span', 'lock-badge');
    art.style.backgroundImage = 'url(' + src + ')';
    c.screen.appendChild(art);
    img.alt = '';
    img.width = THUMB.width;
    img.height = THUMB.height;
    img.addEventListener('error', function () { frame.hidden = true; });
    img.src = src;
    badge.innerHTML = LOCK_ICON;   // fixed markup from this file
    badge.appendChild(document.createTextNode('Locked'));
    frame.appendChild(img);
    frame.appendChild(badge);
    c.box.appendChild(frame);
  }

  function codeForm(firstMessage) {
    var form = el('form', 'lock-form'), label = el('label', '', 'Today’s code'), row = el('div', 'lock-row');
    var input = el('input'), go = el('button', 'lock-go', 'Open episode'), error = el('p', 'lock-err');
    form.noValidate = true;
    label.htmlFor = 'code';
    input.id = 'code'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = 'word-1234';
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('aria-describedby', 'code-error');
    go.type = 'submit';
    error.id = 'code-error';
    error.setAttribute('role', 'alert');
    function say(text) { error.textContent = text; error.hidden = !text; input.setAttribute('aria-invalid', String(Boolean(text))); }
    say(firstMessage || '');
    input.addEventListener('input', function () { say(''); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (go.disabled) return;
      if (!normalise(input.value)) { say('Type the code first.'); return; }
      go.disabled = true;
      go.textContent = 'Opening…';
      openWithCode(input.value).then(show, function (err) { go.disabled = false; go.textContent = 'Open episode'; say(reason(err)); });
    });
    row.appendChild(input);
    row.appendChild(go);
    [label, row, error, el('p', 'lock-hint', 'Scan the code on the classroom screen, or type it here. You only need it once on this phone.')].forEach(function (n) { form.appendChild(n); });
    return form;
  }

  function lockScreen(firstMessage) {
    return episodes().then(function (eps) {
      var ep = eps.filter(function (x) { return x.n === E; })[0] || {}, c = card();
      picture(c);
      c.box.appendChild(el('p', 'lock-eyebrow', 'Episode ' + Number(E)));
      c.box.appendChild(el('h1', '', ep.t || 'Episode ' + Number(E)));
      if (ep.d) c.box.appendChild(el('p', 'lock-about', ep.d));
      c.box.appendChild(codeForm(firstMessage));
      document.title = (ep.t ? ep.t + ' | ' : '') + SITE_NAME;
    });
  }

  // ---------- an open episode ----------

  // The scenes of an episode travel inside its locked file, as code that leaves them in window.SCN.
  // If that code fails, the story is still shown, on plain backdrops.
  function startScenes(code) {
    if (typeof code !== 'string') return;
    try { (new Function(code))(); }
    catch (e) { window.console.error('The scenes of this episode did not start.', e); }
  }

  function loadScripts(files) {
    return files.reduce(function (before, file) {
      return before.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = file;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('could not load ' + file)); };
          document.body.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  function saveFile(bytes, name, type) {
    var url = URL.createObjectURL(new Blob([bytes], { type: type })), a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  // The printable story, when the episode carries one: offered after the activities.
  function offerDownload(episode) {
    var after = main.querySelector('.afterword');
    if (!after || !episode.pdf) return;
    var box = el('div', 'keep'), button = el('button', '', 'Download the story as a PDF');
    button.type = 'button';
    button.addEventListener('click', function () { saveFile(fromBase64(episode.pdf), episode.pdfName || 'episode-' + E + '.pdf', 'application/pdf'); });
    box.appendChild(el('p', '', 'Want it on paper? The whole story is ready to print.'));
    box.appendChild(button);
    after.insertBefore(box, after.querySelector('.onward'));
  }

  // Hands the episode to the reader. Whatever goes wrong here ends on a screen that says so.
  function show(episode) {
    return episodes().then(function (eps) {
      window.EP = { n: E, title: episode.title, html: episode.html, vocab: episode.vocab || {}, quiz: episode.quiz || [], extra: episode.extra || {} };
      window.SERIES = { eps: eps.map(function (e) { return { n: e.n, title: e.t, about: e.d, part: e.p, built: Boolean(e.ready) }; }) };
      window.READER = { episodeUrl: 'ep.html?e=', homeUrl: HOME, tag: '', siteName: SITE_NAME, scoreKey: 'crown.s.' };
      startScenes(episode.code);
      forgetCodeInAddress();
      main.textContent = '';
      document.body.classList.remove('locked');
      window.scrollTo(0, 0);
      return loadScripts(READER_FILES);
    }).then(function () {
      // a script that stops with an error still counts as loaded, so look for the page it should have built
      if (!main.querySelector('.intro')) throw new Error('the reader did not start');
      offerDownload(episode);
      keepForOffline();
    }).catch(function (e) {
      window.console.error(e);
      readerFailed();
    });
  }

  function start() {
    if (!E) { window.location.replace(HOME); return; }
    if (!(window.crypto && window.crypto.subtle)) {
      message('This page needs a secure connection', 'Open it from the https address your teacher gave you.');
      return;
    }
    var stored = store(KEY_NAME), typed = codeInAddress();
    var withCode = function () { return typed ? openWithCode(typed).then(show) : lockScreen(); };
    download().then(function () {
      // a key kept from an earlier visit opens the episode at once; if it no longer fits, ask as if for the first time
      return stored ? openWithKey(stored).then(show, withCode) : withCode();
    }).catch(function (e) {
      var notOnSite = Boolean(e && e.message === 'missing'), wrongCode = Boolean(e && e.name === NOT_OPENED);
      // A code that does not open this episode is not left in the address. After a failed
      // download it stays there, so that "Try again" tries it once more.
      if (notOnSite || wrongCode) forgetCodeInAddress();
      if (notOnSite) notReleased();
      else if (wrongCode) lockScreen(WRONG_CODE);
      else downloadFailed();
    });
  }

  start();
  // Keeps the pages for reading without internet. The site works without it.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
