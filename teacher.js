// The teacher page of the live site. The teacher password opens teacher.bin, a locked file that
// holds the code of every episode, and the page shows them in one table: each code can be copied,
// sent as a link, or shown as a QR code on the classroom screen.
//
// teacher.bin is locked like an episode: 16 bytes of salt, 12 bytes of IV, then AES-GCM ciphertext,
// with the key made from the password by PBKDF2-SHA256. When the password has worked, the key (never
// the password) is kept in this browser, so that the page opens by itself on the teacher's own device.
// "Lock the teacher page on this device" forgets it, for shared classroom computers.
(function () {
  'use strict';

  var ITERATIONS = 150000, SALT_BYTES = 16, HEADER_BYTES = 28;
  var KEY_NAME = 'crown.tk';          // the kept key; the earlier teacher page used the same name
  var OLD_NAMES = ['crown.tp'];       // an even older page kept the password itself: it is always removed
  var QR_LEVEL = 'M';                 // the QR code still reads when a little of it is hidden or blurred
  var MESSAGES = {
    wrong: 'That password did not work. Check it and try again.',
    missing: 'The teacher file is missing from the site.',
    download: 'The teacher file did not download. Check your internet and try again.',
    empty: 'Type the password first.'
  };

  var $ = function (id) { return document.getElementById(id); };
  var lastTrigger = null;             // the button that opened the QR view, to return to when it closes

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { return null; }
    return value;
  }

  function forget(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* nothing kept, nothing to forget */ }
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

  function normalise(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // ---------- opening teacher.bin ----------

  function download() {
    return fetch('teacher.bin', { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) throw new Error('missing');
      if (!r.ok) throw new Error('download');
      return r.arrayBuffer();
    }).then(function (buffer) { return new Uint8Array(buffer); });
  }

  function keyFromPassword(password, salt) {
    return window.crypto.subtle.importKey('raw', new TextEncoder().encode(normalise(password)), 'PBKDF2', false, ['deriveBits'])
      .then(function (material) { return window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, 256); })
      .then(function (bits) { return new Uint8Array(bits); });
  }

  // The list of episodes inside the file. Fails with an OperationError when the key does not fit.
  function unlock(key, file) {
    return window.crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
      .then(function (k) { return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.slice(SALT_BYTES, HEADER_BYTES) }, k, file.slice(HEADER_BYTES)); })
      .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
  }

  // keep: whether the teacher asked for the page to stay unlocked on this device
  function openWithPassword(password, keep) {
    return download().then(function (file) {
      return keyFromPassword(password, file.slice(0, SALT_BYTES)).then(function (key) {
        return unlock(key, file).then(function (data) { if (keep) store(KEY_NAME, toBase64(key)); else forget(KEY_NAME); return data; });
      });
    });
  }

  function openWithKey(kept) {
    return download().then(function (file) { return unlock(fromBase64(kept), file); });
  }

  function reason(e) {
    if (e && e.name === 'OperationError') return MESSAGES.wrong;
    return e && e.message === 'missing' ? MESSAGES.missing : MESSAGES.download;
  }

  // ---------- sharing ----------

  // The link a student can open straight away: the code travels after the #, so it is never sent to the server.
  function linkFor(ep) {
    return new URL('ep.html?e=' + ep.n + '#c=' + encodeURIComponent(ep.code), window.location.href).href;
  }

  function say(text) {
    var status = $('status');
    status.textContent = '';
    window.setTimeout(function () { status.textContent = text; }, 30);   // read out again even when the text is the same
  }

  function copy(text, what) {
    if (!navigator.clipboard) { say('Copying is not possible in this browser. ' + what + ': ' + text); return; }
    navigator.clipboard.writeText(text).then(
      function () { say(what + ' copied.'); },
      function () { say('Copying was not allowed. ' + what + ': ' + text); }
    );
  }

  function showQr(ep, trigger) {
    var q = window.qrcode(0, QR_LEVEL);
    q.addData(linkFor(ep));
    q.make();
    $('qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: 'QR code that opens episode ' + Number(ep.n) });   // markup made by the QR library, which escapes the text it is given
    $('qr-ep').textContent = 'Episode ' + Number(ep.n);
    $('qr-title').textContent = ep.t || '';
    $('qr-code').textContent = ep.code;
    lastTrigger = trigger;
    $('qr-view').hidden = false;
    document.querySelector('main').inert = true;   // while the code is shown, the page behind it cannot be reached
    $('qr-close').focus();
  }

  function closeQr() {
    $('qr-view').hidden = true;
    document.querySelector('main').inert = false;
    $('qr').textContent = '';
    if (lastTrigger) lastTrigger.focus();
  }

  // ---------- the table ----------

  function button(text, onClick) {
    var b = el('button', '', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function row(ep) {
    var tr = el('tr'), who = el('td'), code = el('td', 'code', ep.code), share = el('td'), tools = el('div', 'share');
    code.tabIndex = 0;   // a tap or the keyboard can reach it, and then it shows
    code.setAttribute('aria-label', 'Code for episode ' + Number(ep.n) + ': ' + ep.code);
    who.appendChild(el('span', 'n', 'Episode ' + Number(ep.n)));
    who.appendChild(el('span', 't', ep.t || ''));
    tools.appendChild(button('Copy code', function () { copy(ep.code, 'Episode ' + Number(ep.n) + ' code'); }));
    tools.appendChild(button('Copy link', function () { copy(linkFor(ep), 'Episode ' + Number(ep.n) + ' link'); }));
    tools.appendChild(button('Show QR', function (e) { showQr(ep, e.currentTarget); }));
    share.appendChild(tools);
    [who, code, share].forEach(function (td) { tr.appendChild(td); });
    return tr;
  }

  function showCodes(data) {
    var eps = (data && Array.isArray(data.eps) ? data.eps : [])
      .filter(function (e) { return e && /^\d\d$/.test(e.n) && typeof e.code === 'string'; })
      .sort(function (a, b) { return Number(a.n) - Number(b.n); });
    var rows = $('rows');
    rows.textContent = '';
    eps.forEach(function (ep) { rows.appendChild(row(ep)); });
    $('lock').hidden = true;
    $('codes').hidden = false;
    $('codes-title').focus();
  }

  // ---------- start ----------

  function wire() {
    var pw = $('pw'), err = $('err'), go = $('go');
    function fail(text) { err.textContent = text; err.hidden = !text; pw.setAttribute('aria-invalid', String(Boolean(text))); }
    pw.addEventListener('input', function () { fail(''); });
    $('unlock').addEventListener('submit', function (e) {
      e.preventDefault();
      if (go.disabled) return;
      if (!normalise(pw.value)) { fail(MESSAGES.empty); return; }
      go.disabled = true;
      openWithPassword(pw.value, $('keep').checked)
        .then(function (data) { pw.value = ''; showCodes(data); })
        .catch(function (error) { fail(reason(error)); })
        .then(function () { go.disabled = false; });
    });
    $('lk').addEventListener('click', function () { forget(KEY_NAME); window.location.reload(); });
    $('print').addEventListener('click', function () { window.print(); });
    $('qr-close').addEventListener('click', closeQr);
    $('qr-view').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeQr(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('qr-view').hidden) closeQr(); });
  }

  function start() {
    OLD_NAMES.forEach(forget);
    wire();
    if (!(window.crypto && window.crypto.subtle)) { $('err').textContent = 'This page needs a secure (https) connection.'; $('err').hidden = false; return; }
    var kept = store(KEY_NAME);
    if (!kept) return;
    // a key kept from an earlier visit opens the table at once; a key that no longer fits, or is damaged,
    // is forgotten, and the password is asked for as usual
    openWithKey(kept).then(showCodes).catch(function (e) {
      if (e && ['OperationError', 'DataError', 'InvalidCharacterError'].indexOf(e.name) >= 0) { forget(KEY_NAME); return; }
      $('err').textContent = reason(e);   // no internet, or the file is missing: say so above the password box
      $('err').hidden = false;
    });
  }

  start();
})();
