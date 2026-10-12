// Everything that comes after the story, organised as five activities
// behind five tiles. The crown quiz and "Rumour or record?" are one card at a time.
window.AfterStory = (function () {
  'use strict';

  var RUMOUR_OPTIONS = ['Proven record', 'Reported, not proven', 'False rumour', 'Opinion'];
  var JEWELS = ['#d9535a', '#5b9be0', '#48b884', '#b684e0', '#e6a23c'];
  var STILL_W = 360, STILL_H = 270, FRAME_W = 360, FRAME_H = 450;   // question picture, cut from the middle of a scene
  var ICONS = {
    crown: '<path d="M3 18h18l1.4-10-5.4 4.2L12 5 7 12.2 1.6 8z" fill="currentColor"/>',
    order: '<rect x="3" y="4" width="6" height="6" rx="1.4" fill="currentColor"/><rect x="3" y="14" width="6" height="6" rx="1.4" fill="currentColor"/><path d="M13 7h8M13 17h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    rumour: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    words: '<path d="M3 5.5c3-1.2 6-1.2 9 .6 3-1.8 6-1.8 9-.6V19c-3-1.2-6-1.2-9 .6-3-1.8-6-1.8-9-.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.2v13.2" stroke="currentColor" stroke-width="2"/>',
    why: '<path d="M5 12h12M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    facts: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>'
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(cls, text) { var b = el('button', cls, text); b.type = 'button'; return b; }
  function icon(name) {
    var s = el('span', 'tile-icon');
    s.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + ICONS[name] + '</svg>'; // fixed markup from this file
    return s;
  }
  function shuffled(n) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  // One moment of a scene as a small picture, cut from the middle of the frame.
  // Returns null if the scene does not exist.
  function scenePicture(api, scene, at, cls) {
    var frame = el('canvas'), pic = el('canvas', cls);
    frame.width = FRAME_W; frame.height = FRAME_H; pic.width = STILL_W; pic.height = STILL_H;
    if (!api.still(scene, at, frame)) return null;
    pic.getContext('2d').drawImage(frame, 0, (FRAME_H - STILL_H) / 2, STILL_W, STILL_H, 0, 0, STILL_W, STILL_H);
    return pic;
  }

  // The crown with one socket per question; `filled` of them hold a jewel.
  function crown(total, filled, fresh) {
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), i;
    svg.setAttribute('viewBox', '0 0 200 112'); svg.setAttribute('class', 'crown-art'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', filled + ' of ' + total + ' jewels');
    svg.innerHTML = '<defs><linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".4" stop-color="#eec457"/><stop offset="1" stop-color="#9c7419"/></linearGradient></defs>' +
      '<path d="M22 92 14 30l36 30 24-44 26 40 26-40 24 44 36-30-8 62z" fill="url(#crown-gold)"/>' +
      '<rect x="20" y="88" width="160" height="16" rx="5" fill="#b98a22"/>' +
      '<circle cx="14" cy="30" r="6" fill="#fff0bd"/><circle cx="74" cy="16" r="6" fill="#fff0bd"/><circle cx="126" cy="16" r="6" fill="#fff0bd"/><circle cx="186" cy="30" r="6" fill="#fff0bd"/>';
    for (i = 0; i < total; i++) {
      var c = document.createElementNS(NS, 'circle'), on = i < filled;
      c.setAttribute('cx', 100 + (i - (total - 1) / 2) * (132 / Math.max(1, total - 1)));
      c.setAttribute('cy', 74); c.setAttribute('r', 9);
      c.setAttribute('class', 'jewel' + (on ? ' on' : '') + (on && i === fresh ? ' fresh' : ''));
      if (on) c.style.fill = JEWELS[i % JEWELS.length];
      svg.appendChild(c);
    }
    return svg;
  }

  // Runs a set of questions one card at a time inside `panel`.
  function deck(panel, cfg) {
    var state;

    function show(node, focus) {
      panel.textContent = '';
      panel.appendChild(node);
      if (focus) { node.tabIndex = -1; node.focus({ preventScroll: true }); }
    }

    function intro(focus) {
      state = { i: 0, score: 0, missed: [] };
      var box = el('div', 'q-card q-intro'), go = button('primary', cfg.intro.button);
      if (cfg.art) box.appendChild(cfg.art(state));
      box.appendChild(el('h3', 'q-title', cfg.intro.title));
      box.appendChild(el('p', 'q-lead', cfg.intro.text));
      go.addEventListener('click', ask);
      box.appendChild(go);
      show(box, focus === true);
    }

    function ask() {
      var item = cfg.items[state.i], card = el('div', 'q-card'), answered = false;
      var opts = el('div', 'q-options' + (cfg.grid ? ' is-grid' : '')), fb = el('div', 'q-feedback'), why = el('p', 'q-why'), row = el('div', 'q-row');
      var labels = cfg.options(item), order = cfg.shuffle ? shuffled(labels.length) : labels.map(function (x, k) { return k; }), right = cfg.answer(item);
      var last = state.i === cfg.items.length - 1, next = button('primary', last ? 'See my score' : 'Next'), buttons = [];
      var top = el('div', 'q-top');
      if (cfg.art) top.appendChild(cfg.art(state));
      top.appendChild(el('p', 'q-count', cfg.label + ' ' + (state.i + 1) + ' of ' + cfg.items.length));
      card.appendChild(top);
      if (cfg.picture) { var pic = cfg.picture(item); if (pic) card.appendChild(pic); }
      card.appendChild(el('p', cfg.quote ? 'q-text is-quote' : 'q-text', cfg.text(item)));

      order.forEach(function (k) {
        var b = button('q-option', labels[k]);
        b.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          buttons.forEach(function (x) { x.btn.disabled = true; if (x.k === right) x.btn.classList.add('right'); });
          if (k === right) state.score++; else { b.classList.add('wrong'); state.missed.push(item); }
          why.textContent = (k === right ? 'Yes. ' : 'Not quite. ') + cfg.why(item);
          if (cfg.art) { top.replaceChild(cfg.art(state, k === right), top.firstChild); }
          if (k !== right && cfg.again) {
            var back = button('', cfg.again.label);
            back.addEventListener('click', function () { cfg.again.go(item); });
            row.insertBefore(back, next);
          }
          fb.hidden = false;
          next.focus();
          if (cfg.onScore) cfg.onScore(state.score, cfg.items.length, false);
        });
        buttons.push({ btn: b, k: k });
        opts.appendChild(b);
      });
      card.appendChild(opts);
      fb.hidden = true; fb.setAttribute('aria-live', 'polite');
      fb.appendChild(why); row.appendChild(next); fb.appendChild(row);
      card.appendChild(fb);
      next.addEventListener('click', function () { state.i++; if (state.i < cfg.items.length) ask(); else result(); });
      show(card, true);
      if (cfg.onAsk) cfg.onAsk(item);
    }

    function result() {
      var total = cfg.items.length, box = el('div', 'q-card q-result'), again = button('', cfg.replay), verdict = cfg.verdict(state.score, total);
      if (cfg.art) box.appendChild(cfg.art(state));
      box.appendChild(el('h3', 'q-title', verdict.title));
      box.appendChild(el('p', 'q-score', 'You got ' + state.score + ' of ' + total + '.'));
      box.appendChild(el('p', 'q-lead', verdict.text));
      if (cfg.again && state.missed.length) {
        var list = el('div', 'q-missed');
        list.appendChild(el('p', 'q-count', 'Read these parts again'));
        state.missed.forEach(function (item) {
          var b = button('q-chip', cfg.again.name(item));
          b.addEventListener('click', function () { cfg.again.go(item); });
          list.appendChild(b);
        });
        box.appendChild(list);
      }
      again.addEventListener('click', function () { intro(true); });
      box.appendChild(again);
      show(box, true);
      if (cfg.onScore) cfg.onScore(state.score, total, true);
    }

    intro();
  }

  // ---------- the five activities ----------

  function crownGame(panel, ep, api, note) {
    var qs = ep.extra.check.questions, key = ((window.READER || {}).scoreKey || 'crown.proto.score.') + ep.n, best = store(key);
    if (best) note.textContent = 'Best: ' + best + ' jewels';
    deck(panel, {
      items: qs, label: 'Question', shuffle: true, replay: 'Play again',
      intro: { title: 'Win the crown', text: 'Answer ' + qs.length + ' questions about the story. Every right answer puts a jewel in the crown.', button: 'Start' },
      art: function (state, fresh) { var w = el('div', 'crown-wrap'); w.appendChild(crown(qs.length, state.score, fresh ? state.score - 1 : -1)); return w; },
      picture: function (q) { return scenePicture(api, q.scene, q.at, 'q-still'); },
      text: function (q) { return q.q; },
      options: function (q) { return q.options; },
      answer: function (q) { return q.answer; },
      why: function (q) { return q.why; },
      again: { label: 'Read that part again', name: function (q) { return api.partName(q.part); }, go: function (q) { api.goToPart(q.part); } },
      onAsk: function (q) { api.showScene(q.scene); },
      verdict: function (score, total) {
        if (score === total) return { title: 'The crown is yours', text: 'Every jewel is in place. You understood the whole story.' };
        if (score >= total - 2) return { title: 'Almost a full crown', text: 'You understood most of the story. A few jewels are still missing.' };
        return { title: 'The crown needs more jewels', text: 'Read the story once more, then try again.' };
      },
      onScore: function (score, total, finished) {
        note.textContent = score + ' of ' + total + ' jewels';
        if (finished) { var old = parseInt(store(key), 10) || 0; if (score >= old) store(key, score + ' of ' + total); }
      }
    });
  }

  // "Put the scenes in order": the pictures are shuffled and the reader taps them in
  // story order. The items in extra.json are listed in the true order, so item k belongs at place k.
  function orderGame(panel, ep, api, note) {
    var items = ep.extra.order.items;

    function mixedUp() {
      var order = shuffled(items.length), inPlace = order.every(function (k, i) { return k === i; });
      return inPlace ? order.slice(1).concat(order[0]) : order;
    }

    function start(focus) {
      var picked = [], checked = false, cards = [];
      var card = el('div', 'q-card order-card'), top = el('div', 'q-top'), count = el('p', 'q-count'), grid = el('div', 'order-grid');
      var result = el('div', 'order-result'), row = el('div', 'q-row'), reset = button('', 'Start again'), check = button('primary', 'Check my order');

      function refresh() {
        cards.forEach(function (c) {
          var place = picked.indexOf(c.k);
          c.btn.classList.toggle('is-picked', place >= 0);
          c.badge.textContent = place >= 0 ? String(place + 1) : '';
          c.btn.setAttribute('aria-label', c.item.label + (place >= 0 ? ', number ' + (place + 1) : ', not chosen yet'));
        });
        count.textContent = picked.length + ' of ' + items.length + ' chosen';
        check.disabled = picked.length < items.length;
      }

      function finish() {
        var score = 0, list = el('ol', 'order-list');
        checked = true;
        cards.forEach(function (c) {
          var ok = picked.indexOf(c.k) === c.k;
          if (ok) score++; else c.fix.textContent = 'This was number ' + (c.k + 1);
          c.btn.setAttribute('aria-label', c.item.label + (ok ? ', in the right place' : ', in the wrong place. This was number ' + (c.k + 1)));
          c.btn.classList.add(ok ? 'right' : 'wrong');
          c.btn.disabled = true;
        });
        result.appendChild(el('h3', 'q-title', score === items.length ? 'Perfect order' : score >= items.length - 2 ? 'Nearly there' : 'Some ' + (pictures ? 'scenes' : 'events') + ' are out of place'));
        result.appendChild(el('p', 'q-score', 'You put ' + score + ' of ' + items.length + ' in the right place.'));
        result.appendChild(el('p', 'q-count', 'The right order. Tap one to read it again.'));
        items.forEach(function (item) {
          var li = el('li'), link = button('order-link', item.label);
          link.addEventListener('click', function () { api.goToPart(item.part); });
          li.appendChild(link); list.appendChild(li);
        });
        result.appendChild(list);
        result.hidden = false;
        check.hidden = true;
        reset.textContent = 'Try again';
        note.textContent = score + ' of ' + items.length + ' in place';
        reset.focus();
      }

      top.appendChild(el('p', 'q-count', 'Tap in story order'));
      top.appendChild(count);
      card.appendChild(top);
      var lead = el('p', 'order-lead'), pictures = 0;
      card.appendChild(lead);
      mixedUp().forEach(function (k) {
        var item = items[k], b = button('order-item'), badge = el('span', 'order-badge'), fix = el('span', 'order-fix');
        var pic = scenePicture(api, item.scene, item.at, 'order-pic');
        if (pic) { b.appendChild(pic); pictures++; }
        b.appendChild(badge); b.appendChild(el('span', 'order-label', item.label)); b.appendChild(fix);
        b.addEventListener('click', function () {
          if (checked) return;
          picked = picked.indexOf(k) >= 0 ? picked.filter(function (x) { return x !== k; }) : picked.concat([k]);
          api.showScene(item.scene);
          refresh();
        });
        cards.push({ btn: b, badge: badge, fix: fix, item: item, k: k });
        grid.appendChild(b);
      });
      lead.textContent = pictures
        ? 'What happened first? Tap the pictures in the order they happened in the story. Tap a picture again to take its number away.'
        : 'What happened first? Tap the events in the order they happened in the story. Tap one again to take its number away.';
      card.appendChild(grid);
      result.hidden = true; result.setAttribute('aria-live', 'polite');
      card.appendChild(result);
      check.addEventListener('click', function () { if (!checked && picked.length === items.length) finish(); });
      reset.addEventListener('click', function () { start(true); });
      row.appendChild(reset); row.appendChild(check);
      card.appendChild(row);
      panel.textContent = '';
      panel.appendChild(card);
      if (focus) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
      refresh();
    }

    start(false);
  }

  function rumourGame(panel, ep, note) {
    deck(panel, {
      items: ep.quiz, label: 'Line', grid: true, quote: true, replay: 'Sort them again',
      intro: { title: 'Rumour or record?', text: 'Not everything in this story is equally certain. Read each line and choose what you think it is.', button: 'Begin' },
      text: function (q) { return q.s; },
      options: function () { return RUMOUR_OPTIONS; },
      answer: function (q) { return q.a; },
      why: function (q) { return q.w; },
      verdict: function (score, total) {
        if (score >= total - 1) return { title: 'A careful historian', text: 'You can tell what is proven from what people only said.' };
        if (score >= total / 2) return { title: 'A good start', text: 'Some rumours sound very much like records. That is why they spread.' };
        return { title: 'Rumours are hard to spot', text: 'Look at the reasons again. Ask: who saw it, and who wrote it down?' };
      },
      onScore: function (score, total) { note.textContent = score + ' of ' + total + ' right'; }
    });
  }

  function pairs(dl) {
    var out = [], term = null;
    Array.prototype.forEach.call(dl.children, function (n) {
      if (n.tagName === 'DT') term = n.textContent; else if (n.tagName === 'DD' && term) { out.push([term, n.textContent]); term = null; }
    });
    return out;
  }

  function wordCards(panel, dl) {
    var grid = el('div', 'word-grid');
    panel.appendChild(el('p', 'panel-lead', 'Tap a word to see what it means.'));
    pairs(dl).forEach(function (p) {
      var card = button('word-card'), inner = el('span', 'word-inner');
      inner.appendChild(el('span', 'word-front', p[0]));
      inner.appendChild(el('span', 'word-back', p[1]));
      card.appendChild(inner);
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', function () { var on = card.classList.toggle('is-flipped'); card.setAttribute('aria-pressed', String(on)); });
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  function whyCards(panel, dl) {
    var list = el('ol', 'why-list');
    pairs(dl).forEach(function (p) {
      var li = el('li', 'why-item');
      li.appendChild(el('h3', 'why-title', p[0]));
      li.appendChild(el('p', 'why-text', p[1]));
      list.appendChild(li);
    });
    panel.appendChild(list);
  }

  function factCards(panel, ul) {
    var row = el('div', 'fact-row'), items = ul.querySelectorAll('li');
    panel.appendChild(el('p', 'panel-lead', items.length + ' things you can tell someone today.'));
    Array.prototype.forEach.call(items, function (li, i) {
      var card = el('article', 'fact-card');
      card.appendChild(el('p', 'fact-num', String(i + 1)));
      card.appendChild(el('p', 'fact-text', li.textContent));
      row.appendChild(card);
    });
    panel.appendChild(row);
  }

  // ---------- the hub ----------

  // Cuts the original ending into its sections: one per heading.
  function sections(nodes) {
    var out = [], cur = null;
    nodes.forEach(function (n) {
      if (n.tagName === 'H2') { cur = { title: n.textContent.trim(), nodes: [] }; out.push(cur); } else if (cur) cur.nodes.push(n);
    });
    return out;
  }
  function find(sec, selector) {
    for (var i = 0; i < sec.nodes.length; i++) { if (sec.nodes[i].matches && sec.nodes[i].matches(selector)) return sec.nodes[i]; }
    return null;
  }

  function build(section, nodes, ep, api) {
    var secs = sections(nodes), tabs = [], tiles = el('div', 'tiles'), head = el('header', 'after-head');
    var hasCheck = ep.extra && ep.extra.check && ep.extra.check.questions && ep.extra.check.questions.length;

    function add(id, name, note, fill) { tabs.push({ id: id, name: name, note: note, fill: fill }); }

    var hasOrder = ep.extra && ep.extra.order && ep.extra.order.items && ep.extra.order.items.length > 1;
    if (hasCheck) add('crown', 'Win the crown', ep.extra.check.questions.length + ' questions', function (panel, noteEl) { crownGame(panel, ep, api, noteEl); });
    var drawn = hasOrder && ep.extra.order.items.some(function (item) { return item.scene; });   // an episode with no pictures yet orders events
    if (hasOrder) add('order', 'Put the scenes in order', ep.extra.order.items.length + (drawn ? ' scenes' : ' events'), function (panel, noteEl) { orderGame(panel, ep, api, noteEl); });
    secs.forEach(function (sec) {
      var dl = find(sec, 'dl'), ul = find(sec, 'ul');
      if (find(sec, '#quiz') && ep.quiz && ep.quiz.length) add('rumour', sec.title, ep.quiz.length + ' lines to sort', function (panel, noteEl) { rumourGame(panel, ep, noteEl); });
      else if (dl && /^words/i.test(sec.title)) add('words', sec.title, pairs(dl).length + ' words', function (panel) { wordCards(panel, dl); });
      else if (dl) add('why', sec.title, pairs(dl).length + ' reasons', function (panel) { whyCards(panel, dl); });
      else if (ul) add('facts', sec.title, ul.querySelectorAll('li').length + ' facts', function (panel) { factCards(panel, ul); });
    });

    head.appendChild(el('p', 'eyebrow', 'After the story'));
    head.appendChild(el('h2', 'after-title', 'Now it is your turn'));
    head.appendChild(el('p', 'after-lead', hasCheck ? 'Pick an activity. Start with the crown.' : 'Pick an activity.'));
    section.appendChild(head);
    tiles.setAttribute('role', 'tablist');
    section.appendChild(tiles);

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.tile.classList.toggle('is-on', on); t.tile.setAttribute('aria-selected', String(on)); t.tile.tabIndex = on ? 0 : -1;
        t.panel.hidden = !on;
      });
      if (!tab.built) { tab.fill(tab.panel, tab.noteEl); tab.built = true; }
      if (focus) tab.tile.focus();
    }

    tabs.forEach(function (tab, i) {
      var tile = button('tile tile-' + tab.id), panel = el('div', 'panel panel-' + tab.id);
      tab.noteEl = el('span', 'tile-note', tab.note);
      tile.appendChild(icon(tab.id)); tile.appendChild(el('span', 'tile-name', tab.name)); tile.appendChild(tab.noteEl);
      tile.id = 'tile-' + tab.id; tile.setAttribute('role', 'tab'); tile.setAttribute('aria-controls', 'panel-' + tab.id);
      panel.id = 'panel-' + tab.id; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tile.id);
      tile.addEventListener('click', function () { select(tab); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      tile.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        select(tabs[(i + step + tabs.length) % tabs.length], true);
      });
      tab.tile = tile; tab.panel = panel;
      tiles.appendChild(tile);
    });
    // a small tile left alone in its row on a phone takes the whole row
    var small = tabs.filter(function (t) { return t.id !== 'crown'; });
    if (small.length % 2) small[small.length - 1].tile.classList.add('is-wide');
    tabs.forEach(function (tab) { section.appendChild(tab.panel); });
    if (tabs.length) select(tabs[0]);
  }

  return { build: build };
})();
