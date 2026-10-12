// Placeholder backdrop for parts of the story whose scene has not been drawn yet:
// a dark room with a breathing glow, a light shaft and drifting dust.
window.Ambient = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  var MAX_MOTES = 80;
  var EASE = 0.045; // share of the distance to the new mood covered per frame

  // top/bottom: wall colours. glow: light colour, gx/gy: its position (0-1),
  // gr: radius, ga: strength. motes: dust count. beam: light-shaft strength.
  var MOODS = {
    intro:   { top: [10, 17, 32], bottom: [3, 6, 12],   glow: [224, 176, 74],  gx: 0.5,  gy: 0.8,  gr: 0.75, ga: 0.24, motes: 46, beam: 0 },
    hearth:  { top: [40, 23, 14], bottom: [10, 6, 6],   glow: [255, 170, 84],  gx: 0.28, gy: 0.6,  gr: 0.85, ga: 0.44, motes: 72, beam: 0 },
    morning: { top: [28, 42, 64], bottom: [10, 14, 24], glow: [230, 208, 160], gx: 0.74, gy: 0.18, gr: 0.95, ga: 0.36, motes: 40, beam: 0.55 },
    cold:    { top: [15, 23, 36], bottom: [4, 7, 12],   glow: [120, 152, 196], gx: 0.62, gy: 0.3,  gr: 0.8,  ga: 0.24, motes: 26, beam: 0.2 },
    abbey:   { top: [21, 27, 46], bottom: [6, 8, 16],   glow: [242, 216, 150], gx: 0.5,  gy: 0.04, gr: 1.05, ga: 0.42, motes: 62, beam: 0.9 },
    ember:   { top: [17, 12, 14], bottom: [4, 4, 6],    glow: [204, 112, 60],  gx: 0.5,  gy: 0.86, gr: 0.6,  ga: 0.26, motes: 20, beam: 0 }
  };

  var cv = null, g = null, W = 0, H = 0;
  var cur = copy(MOODS.intro), target = MOODS.intro;

  function copy(m) {
    var o = {};
    Object.keys(m).forEach(function (k) { o[k] = Array.isArray(m[k]) ? m[k].slice() : m[k]; });
    return o;
  }
  function mix(a, b, u) { return a + (b - a) * u; }
  function hash(n) { var s = Math.sin(n * 127.1 + 11.3) * 43758.5453; return s - Math.floor(s); }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }

  function approach(u) {
    Object.keys(target).forEach(function (k) {
      if (Array.isArray(target[k])) for (var i = 0; i < 3; i++) cur[k][i] = mix(cur[k][i], target[k][i], u);
      else cur[k] = mix(cur[k], target[k], u);
    });
  }

  function init(canvas) { cv = canvas; g = cv.getContext('2d'); W = cv.width; H = cv.height; }

  function setMood(name, snap) {
    target = MOODS[name] || MOODS.intro;
    if (snap) cur = copy(target);
  }

  function render(t) {
    if (!g) return;
    approach(EASE);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    var wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, rgb(cur.top, 1));
    wall.addColorStop(1, rgb(cur.bottom, 1));
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = 'lighter';
    if (cur.beam > 0.01) {
      g.save();
      g.translate(W * cur.gx, -H * 0.1);
      g.rotate(0.3);
      var shaft = g.createLinearGradient(-W * 0.22, 0, W * 0.22, 0);
      var strength = cur.beam * 0.16 * (0.86 + 0.14 * Math.sin(t * 0.4));
      shaft.addColorStop(0, rgb(cur.glow, 0));
      shaft.addColorStop(0.5, rgb(cur.glow, strength));
      shaft.addColorStop(1, rgb(cur.glow, 0));
      g.fillStyle = shaft;
      g.fillRect(-W * 0.22, 0, W * 0.44, H * 1.5);
      g.restore();
    }

    var breathe = 0.86 + 0.1 * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 2.3);
    var gx = W * cur.gx, gy = H * cur.gy, radius = H * cur.gr;
    var light = g.createRadialGradient(gx, gy, 0, gx, gy, radius);
    light.addColorStop(0, rgb(cur.glow, cur.ga * breathe));
    light.addColorStop(0.45, rgb(cur.glow, cur.ga * breathe * 0.32));
    light.addColorStop(1, rgb(cur.glow, 0));
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);

    var count = Math.min(MAX_MOTES, Math.round(cur.motes));
    for (var i = 0; i < count; i++) {
      var h1 = hash(i), h2 = hash(i + 40.7), h3 = hash(i + 91.3);
      var y = (h2 - t * (0.006 + h3 * 0.012)) % 1; if (y < 0) y += 1;
      var x = h1 + Math.sin(t * (0.2 + h3 * 0.3) + i) * 0.025;
      var alpha = (0.2 + 0.8 * h3) * (0.5 + 0.5 * Math.sin(t * (0.5 + h1) + i * 1.7)) * 0.55;
      g.fillStyle = rgb(cur.glow, alpha.toFixed(3));
      g.beginPath();
      g.arc(x * W, y * H, 0.5 + h2 * 1.4, 0, TAU);
      g.fill();
    }

    g.globalCompositeOperation = 'source-over';
    var edge = g.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.8);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);
  }

  return { init: init, setMood: setMood, render: render, moods: Object.keys(MOODS) };
})();
