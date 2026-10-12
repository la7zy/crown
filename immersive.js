// The reader: splits an episode into its parts and plays each part's
// scene with the text while that part is being read.
(function () {
  'use strict';

  var EP = window.EP;
  var SCN = window.SCN || {};
  var Ambient = window.Ambient;
  var AfterStory = window.AfterStory;

  // Where the reader is running. The live site sets window.READER; without it these are the prototype's own values.
  var HOST = window.READER || {};
  var EPISODE_URL = HOST.episodeUrl || 'index.html?e=';        // the page of another episode; its number is added
  var HOME_URL = HOST.homeUrl || 'series.html';                // the list of all episodes
  var TAG = HOST.tag === undefined ? 'Prototype' : HOST.tag;   // the small label on the opening screen; '' for none
  var SITE_NAME = HOST.siteName || 'Prototype';                // comes after the episode's title in the tab

  var FRAME_MS = 33;                       // about 30 frames a second, like the live site
  var TRIGGER_LINE = '-40% 0px -60% 0px';  // a part takes over when its top passes 40% down the screen
  var SCENE_W = 720, SCENE_H = 900;
  var QUIET_MOODS = ['hearth', 'morning', 'cold', 'abbey', 'ember']; // for parts with no scene yet
  var AFTER_FADE = 150;                    // height of the soft edge at the top of the activities (see .afterword in the CSS)
  var PHONE_MAX = 600, TABLET_MAX = 1100;  // shortest side below 600: phone. Width below 1100, or touch: tablet.
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WIDE = window.matchMedia('(min-aspect-ratio: 4/5)');
  // Must match the "scene beside the text" media query in immersive.css.
  var BESIDE = window.matchMedia('(min-width: 880px) and (min-aspect-ratio: 5/4)');

  var main = document.getElementById('story');
  var stage = document.getElementById('stage');
  var fill = document.getElementById('fill');
  var motionBtn = document.getElementById('motion');
  var watchBtn = document.getElementById('watch');

  if (!EP) {
    var asked = Number(document.documentElement.dataset.episode);   // set by boot.js
    main.innerHTML = '<p class="missing">' + (asked ? 'Episode ' + asked : 'The episode') + ' has not been built for this prototype yet. In the “online series” folder, run <b>node prototype/build.mjs</b> and reload.</p>';
    return;
  }
  var EXTRA = EP.extra || {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // ---------- 1. cut the episode into blocks ----------

  // "Whitehall Palace. February 1689." -> place and time
  function splitWhere(text) {
    var s = text.trim().replace(/\.$/, '');
    var i = s.indexOf('. ');
    return i < 0 ? { place: s, when: '' } : { place: s.slice(0, i), when: s.slice(i + 2) };
  }

  function flatten(parent, gated, out) {
    Array.prototype.forEach.call(parent.children, function (node) {
      if (node.classList.contains('after')) flatten(node, true, out);
      else out.push({ node: node, gated: gated });
    });
    return out;
  }

  function readBlocks(html) {
    var src = el('div');
    src.innerHTML = html; // the author's own episode file, the same content the live reader shows
    var blocks = [], cur = null;
    var byParagraph = EXTRA.split === 'paragraph', waiting = null;   // waiting: a scene placed just before its paragraph

    function start(type, gated, where) {
      cur = { type: type, gated: gated, where: where || null, scene: null, label: '', body: el('div'), nodes: [] };
      blocks.push(cur);
      return cur;
    }
    start('intro', false);

    flatten(src, false, []).forEach(function (item) {
      var node = item.node;
      var isHeading = node.tagName === 'H2';
      if (cur.type === 'afterword') { cur.nodes.push(node); return; }
      if (isHeading && node.classList.contains('where')) { start('part', item.gated, splitWhere(node.textContent)); return; }
      if (isHeading) { start('afterword', item.gated).nodes.push(node); return; }
      if (node.classList.contains('gate')) { start('gate', item.gated).body = node; return; }
      if (node.classList.contains('film')) {
        if (byParagraph) { waiting = { scene: node.getAttribute('data-scene'), label: node.getAttribute('data-label') || '' }; return; }
        if (cur.type !== 'part' || cur.scene || cur.body.children.length) start('part', item.gated);
        cur.scene = node.getAttribute('data-scene');
        cur.label = node.getAttribute('data-label') || '';
        return;
      }
      if (byParagraph && node.tagName === 'P' && !node.classList.contains('sub') && !node.classList.contains('prev')) {
        start('part', item.gated);
        if (waiting) { cur.scene = waiting.scene; cur.label = waiting.label; waiting = null; }
      } else if (cur.type === 'gate') start('part', item.gated);
      cur.body.appendChild(node);
    });
    return blocks;
  }

  // ---------- 2. build the page ----------

  var parts = [];        // the story's parts, in order: { el, name }
  var protoTag = null;   // the small label on the opening screen, when there is one
  var quietCount = 0;
  function quietBackdrop() { return 'amb:' + QUIET_MOODS[quietCount++ % QUIET_MOODS.length]; }

  // Where this episode sits in the series, so that it can lead to its neighbours.
  var SERIES_EPS = (window.SERIES || { eps: [] }).eps, SERIES_AT = -1;
  SERIES_EPS.forEach(function (e, i) { if (e.n === EP.n) SERIES_AT = i; });

  // A small arrow to a neighbouring episode; greyed out when there is none, or it is not written yet.
  function hop(ep, arrow, what) {
    var ready = ep && ep.built, link = el(ready ? 'a' : 'span', ready ? 'hop' : 'hop is-off', arrow);
    if (ready) { link.href = EPISODE_URL + ep.n; link.setAttribute('aria-label', what + ': ' + ep.title); }
    else link.setAttribute('aria-hidden', 'true');
    return link;
  }

  // The way on at the end of an episode: the next one, or word that it is still to come.
  function onwardEl() {
    var next = SERIES_EPS[SERIES_AT + 1], box = el('nav', 'onward'), all = el('a', 'onward-all', 'All episodes');
    box.setAttribute('aria-label', 'Where to go next');
    all.href = HOME_URL;
    if (!next) {
      box.appendChild(el('p', 'onward-eyebrow', 'The end of the series'));
      box.appendChild(all);
      return box;
    }
    box.appendChild(el('p', 'onward-eyebrow', next.built ? 'Next episode' : 'Still to come'));
    box.appendChild(el('h2', 'onward-title', Number(next.n) + '. ' + next.title));
    box.appendChild(el('p', 'onward-about', next.about));
    if (next.built) {
      var go = el('a', 'onward-go', 'Read episode ' + Number(next.n));
      go.href = EPISODE_URL + next.n;
      box.appendChild(go);
    }
    box.appendChild(all);
    return box;
  }

  function introEl(b) {
    var head = el('header', 'intro');
    head.dataset.backdrop = 'amb:intro';
    var top = el('div', 'top');
    var switcher = el('nav', 'episodes'), before = SERIES_EPS[SERIES_AT - 1], next = SERIES_EPS[SERIES_AT + 1];
    switcher.setAttribute('aria-label', 'Episodes');
    var all = el('a', '', 'All episodes');
    all.href = HOME_URL;
    switcher.appendChild(all);
    switcher.appendChild(hop(before, '\u2039', 'Previous episode'));
    switcher.appendChild(el('span', 'is-on', SERIES_EPS.length ? Number(EP.n) + ' of ' + SERIES_EPS.length : 'Episode ' + Number(EP.n)));
    switcher.appendChild(hop(next, '\u203A', 'Next episode'));
    top.appendChild(switcher);
    if (TAG) { protoTag = el('span', 'proto', TAG); top.appendChild(protoTag); }
    head.appendChild(top);
    var title = el('div', 'title veil');
    while (b.body.firstChild) title.appendChild(b.body.firstChild);
    head.appendChild(title);
    return head;
  }

  function partEl(b) {
    // The episode's own scene if it has one, otherwise the scene added for this part.
    var info = (EXTRA.parts || [])[parts.length] || {};
    var where = b.where || (info.place ? { place: info.place, when: info.when || '' } : null);
    var name = b.scene || info.scene || (EXTRA.scenes || [])[parts.length] || null;
    var drawn = name && typeof SCN[name] === 'function';
    var sec = el('section', 'part' + (drawn ? ' has-scene' : ''));
    sec.dataset.backdrop = drawn ? 'scene:' + name : info.mood ? 'amb:' + info.mood : quietBackdrop();
    if (where) {
      var slate = el('div', 'slate');
      if (!drawn && TAG) slate.appendChild(el('p', 'tag', 'Scene not drawn yet'));   // a note for the prototype only
      if (info.link) slate.appendChild(el('p', 'link', info.link));   // the sentence that joins this part to the one before
      var h = el('h2', 'where');
      h.appendChild(el('span', 'place', where.place));
      if (where.when) h.appendChild(el('span', 'when', where.when));
      slate.appendChild(h);
      if (drawn && b.label) slate.appendChild(el('p', 'sr', 'With the text: ' + b.label));
      sec.appendChild(slate);
    }
    b.body.className = 'body veil';
    sec.appendChild(b.body);
    parts.push({ el: sec, name: where ? where.place + (where.when ? ', ' + where.when : '') : 'Part ' + (parts.length + 1) });
    return sec;
  }

  function afterwordEl(b) {
    var sec = el('section', 'afterword');
    sec.dataset.backdrop = 'amb:intro';
    afterEl = sec;
    if (AfterStory) AfterStory.build(sec, b.nodes, EP, api);
    else b.nodes.forEach(function (n) { sec.appendChild(n); });
    if (SERIES_AT >= 0) sec.appendChild(onwardEl());
    return sec;
  }

  function buildPage(blocks) {
    var after = null;
    blocks.forEach(function (b) {
      var node = b.type === 'intro' ? introEl(b) : b.type === 'part' ? partEl(b) : b.type === 'gate' ? b.body : afterwordEl(b);
      if (b.gated && b.type !== 'gate') {
        if (!after) { after = el('div', 'after'); after.hidden = true; main.appendChild(after); }
        after.appendChild(node);
      } else main.appendChild(node);
    });
    var gate = main.querySelector('.gate');
    if (gate && after) {
      var go = gate.querySelector('button');
      go.addEventListener('click', function () { after.hidden = false; go.hidden = true; });
    }
  }

  function wireVocab() {
    var bar = document.getElementById('def'), text = document.getElementById('deft');
    document.getElementById('defx').addEventListener('click', function () { bar.hidden = true; });
    main.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vw');
      if (!b) return;
      var word = b.getAttribute('data-w');
      text.textContent = '';
      text.appendChild(el('b', '', word));
      text.appendChild(document.createTextNode(': ' + ((EP.vocab || {})[word] || '')));
      bar.hidden = false;
    });
  }

  // ---------- 3. the stage ----------

  var layers = {};        // backdrop key -> layer
  var active = null;      // key of the backdrop now showing
  var zone = 'story';     // 'after' once the reader is in the activities
  var afterEl = null;     // the activities section
  var afterKey = null;    // the scene an activity last asked for
  var running = true;     // false while the reader has paused the motion
  var watching = false;   // true while the text is hidden to watch the scene
  var captions = false;   // scenes draw their own titles and subtitles only while watching
  var fillCtx = fill.getContext('2d');
  var ambCanvas = document.getElementById('amb');
  Ambient.init(ambCanvas);

  function sceneLayer(name) {
    var cv = el('canvas', 'scene');
    cv.width = SCENE_W;
    cv.height = SCENE_H;
    var g = cv.getContext('2d'), drawText = g.fillText;
    g.fillText = function () { if (captions) drawText.apply(g, arguments); };
    var sc = SCN[name](cv);
    stage.appendChild(cv);
    return { cv: cv, isScene: true, t: 0, still: sc.still || 0, dirty: true, render: sc.render };
  }

  function quietLayer(mood) {
    return { cv: ambCanvas, isScene: false, mood: mood, t: 0, dirty: true, render: Ambient.render };
  }

  function layer(key) {
    if (layers[key]) return layers[key];
    var kind = key.split(':')[0], name = key.split(':')[1];
    if (kind === 'scene' && typeof SCN[name] === 'function') {
      try { layers[key] = sceneLayer(name); }
      catch (e) { layers[key] = quietLayer('intro'); } // a scene that fails to start falls back to the quiet room
    } else layers[key] = quietLayer(kind === 'amb' ? name : 'intro');
    return layers[key];
  }

  function setBackdrop(key) {
    if (!key || key === active) return;
    var next = layer(key), prev = active ? layers[active] : null;
    if (prev && prev.cv !== next.cv) prev.cv.classList.remove('on');
    next.cv.classList.add('on');
    // The action starts as the reader arrives. With motion paused or reduced, show the scene's best moment instead.
    if (next.isScene) next.t = (REDUCED || !running) ? next.still : 0;
    else Ambient.setMood(next.mood, REDUCED || !running || !prev);
    next.dirty = true;
    active = key;
    watchBtn.hidden = !next.isScene;
  }

  // On phones the activities cover the stage once their soft top edge has scrolled off the screen;
  // after that there is nothing to draw.
  function stageHidden() {
    return zone === 'after' && !BESIDE.matches && afterEl !== null && afterEl.getBoundingClientRect().top < -AFTER_FADE;
  }

  var lastTs = 0, drawnTs = 0;
  function tick(ts) {
    window.requestAnimationFrame(tick);
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    var L = active ? layers[active] : null;
    if (!L || stageHidden()) return;
    var moving = running && !REDUCED;
    if (moving) L.t += dt;
    if (!(moving || L.dirty) || ts - drawnTs < FRAME_MS) return;
    drawnTs = ts;
    L.dirty = false;
    L.render(L.t);
    if (WIDE.matches || watching) fillCtx.drawImage(L.cv, 0, 0, fill.width, fill.height);
  }

  function redraw() { if (active) layers[active].dirty = true; }

  // What the activities may ask of the reader.
  var api = {
    // Draws one moment of a scene into `canvas`. Returns false if that scene does not exist.
    still: function (name, t, canvas) {
      var L = layer('scene:' + name);
      if (!L.isScene) return false;
      var keep = captions;
      captions = false;
      L.render(t);
      canvas.getContext('2d').drawImage(L.cv, 0, 0, canvas.width, canvas.height);
      captions = keep;
      if (active && layers[active] === L) L.render(L.t); else L.dirty = true;   // put the stage back at once
      return true;
    },
    // Plays a scene on the stage while the reader is in the activities.
    showScene: function (name) { afterKey = 'scene:' + name; if (zone === 'after') setBackdrop(afterKey); },
    partName: function (i) { return parts[i] ? parts[i].name : 'the story'; },
    goToPart: function (i) { if (parts[i]) parts[i].el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }
  };

  // ---------- 4. reader controls ----------

  function setRunning(on) {
    running = on;
    motionBtn.dataset.state = on ? 'playing' : 'paused';
    motionBtn.setAttribute('aria-label', on ? 'Pause the animation' : 'Play the animation');
  }

  function setWatching(on) {
    var L = active ? layers[active] : null;
    if (on && !(L && L.isScene)) return;
    watching = on;
    captions = on;
    document.documentElement.classList.toggle('watching', on);   // the scroll lock has to sit on <html>
    document.body.classList.toggle('watching', on);
    if (on) document.getElementById('def').hidden = true;
    watchBtn.textContent = on ? 'Back to reading' : 'Watch scene';
    motionBtn.hidden = on || REDUCED;
    if (on && !REDUCED) { L.t = 0; setRunning(true); }
    if (!on) { var here = currentBlock(); if (here) enter(here); }
    redraw();
  }

  // The block of the page that sits on the trigger line right now.
  function currentBlock() {
    var line = window.innerHeight * 0.4, found = null;
    Array.prototype.forEach.call(main.querySelectorAll('[data-backdrop]'), function (node) {
      if (node.offsetParent !== null && node.getBoundingClientRect().top <= line) found = node;
    });
    return found;
  }

  // The reader has reached this block: note the zone and show its backdrop.
  function enter(node) {
    zone = node.classList.contains('afterword') ? 'after' : 'story';
    document.body.dataset.zone = zone;
    setBackdrop(zone === 'after' && afterKey ? afterKey : node.dataset.backdrop);
  }

  // Which kind of screen this is. The layout itself is chosen by the CSS media queries.
  function describeScreen() {
    var w = window.innerWidth, shortest = Math.min(w, window.innerHeight), touch = window.matchMedia('(pointer: coarse)').matches;
    var device = shortest < PHONE_MAX ? 'phone' : (touch || w < TABLET_MAX) ? 'tablet' : 'computer';
    document.documentElement.dataset.device = device;
    document.documentElement.dataset.layout = BESIDE.matches ? 'beside' : 'behind';
    if (protoTag) protoTag.textContent = TAG + ' · ' + device;
    redraw();
  }

  motionBtn.addEventListener('click', function () { setRunning(!running); });
  watchBtn.addEventListener('click', function () { setWatching(!watching); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && watching) setWatching(false); });
  window.addEventListener('resize', describeScreen);

  // ---------- 5. start ----------

  document.title = EP.title + ' | ' + SITE_NAME;
  buildPage(readBlocks(EP.html));
  wireVocab();
  motionBtn.hidden = REDUCED;
  setRunning(true);
  setBackdrop('amb:intro');
  describeScreen();

  var watcher = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && !watching) enter(e.target);
    });
  }, { rootMargin: TRIGGER_LINE, threshold: 0 });
  Array.prototype.forEach.call(main.querySelectorAll('[data-backdrop]'), function (node) { watcher.observe(node); });

  // The same check straight from the scroll position, once per frame at most. The observer can be
  // delivered late (a background tab, a slow phone); this keeps the scene in step with the text anyway.
  var syncQueued = false;
  function sync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(function () {
      syncQueued = false;
      var here = watching ? null : currentBlock();
      if (here) enter(here);
    });
  }
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  main.addEventListener('click', sync);   // opening the gate changes the page without a scroll

  window.requestAnimationFrame(tick);
})();
