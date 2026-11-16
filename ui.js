// Board drawing, game loop, controls and memory panels.
(function () {
  'use strict';
  var L = window.Ludo, A = window.LudoAgent;
  var NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
  var KEYS = ['red', 'green', 'yellow', 'blue'];
  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage (the page still works if the browser refuses it) ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not saved */ } }

  // Rule settings are remembered too. Anything that is not valid is ignored.
  var RULE_KEY = 'ludo.rules';
  function applyRuleSettings(r) {
    if (!r || typeof r !== 'object') return;
    ['exactHome', 'extraTurns', 'threeSixes', 'safeSquares'].forEach(function (k) {
      if (typeof r[k] === 'boolean') L.rules[k] = r[k];
    });
    if (Array.isArray(r.exitRolls) && r.exitRolls.length &&
        r.exitRolls.every(function (n) { return n >= 1 && n <= 6 && n % 1 === 0; })) {
      L.rules.exitRolls = r.exitRolls.slice().sort();
    }
  }
  applyRuleSettings(load(RULE_KEY));

  var agents = KEYS.map(function (k) { return new A.Agent(load('ludo.agent.' + k)); });
  var seats = ['agent', 'agent', 'agent', 'agent'];           // 'agent' or 'human'
  var hist = load('ludo.history');
  if (!hist || !Array.isArray(hist.pts) || !Array.isArray(hist.cur)) hist = newHistory();

  function newHistory() { return { size: 50, pts: [], cur: [0, 0, 0, 0], n: 0 }; }
  function saveAll() {
    for (var i = 0; i < 4; i++) save('ludo.agent.' + KEYS[i], agents[i].memory);
    save('ludo.history', hist);
  }
  function recordGame(winner) {
    hist.cur[winner]++; hist.n++;
    if (hist.n < hist.size) return;
    hist.pts.push(hist.cur.map(function (c) { return c / hist.size; }));
    hist.cur = [0, 0, 0, 0]; hist.n = 0;
    if (hist.pts.length > 240) {                               // halve the resolution to keep it small
      var merged = [], old = hist.size;
      for (var i = 0; i + 1 < hist.pts.length; i += 2) {
        merged.push(hist.pts[i].map(function (v, k) { return (v + hist.pts[i + 1][k]) / 2; }));
      }
      if (hist.pts.length % 2) {
        hist.cur = hist.pts[hist.pts.length - 1].map(function (v) { return Math.round(v * old); });
        hist.n = old;
      }
      hist.pts = merged; hist.size = old * 2;
    }
  }

  // ---------- board geometry on a 15 x 15 grid ----------
  var PATH = (function () {
    var p = [], i;
    for (i = 1; i <= 5; i++) p.push([i, 6]);
    for (i = 5; i >= 0; i--) p.push([6, i]);
    p.push([7, 0]);
    for (i = 0; i <= 5; i++) p.push([8, i]);
    for (i = 9; i <= 14; i++) p.push([i, 6]);
    p.push([14, 7]);
    for (i = 14; i >= 9; i--) p.push([i, 8]);
    for (i = 9; i <= 14; i++) p.push([8, i]);
    p.push([7, 14]);
    for (i = 14; i >= 9; i--) p.push([6, i]);
    for (i = 5; i >= 0; i--) p.push([i, 8]);
    p.push([0, 7]); p.push([0, 6]);
    return p;
  })();
  var YARD = [[0, 0], [9, 0], [9, 9], [0, 9]];
  var SLOT = [[1.75, 1.75], [4.25, 1.75], [1.75, 4.25], [4.25, 4.25]];
  function columnCell(player, k) {                             // k = 0..4
    return [[1 + k, 7], [7, 1 + k], [13 - k, 7], [7, 13 - k]][player];
  }
  // Centre of a token in grid units.
  function spot(player, token, p) {
    if (p < 0) return [YARD[player][0] + SLOT[token][0], YARD[player][1] + SLOT[token][1]];
    if (p <= L.LAST_TRACK) { var c = PATH[L.absSquare(player, p)]; return [c[0] + 0.5, c[1] + 0.5]; }
    if (p < L.HOME) { var h = columnCell(player, p - 51); return [h[0] + 0.5, h[1] + 0.5]; }
    var off = (token - 1.5) * 0.36;
    return [[6.5, 7.5 + off], [7.5 + off, 6.5], [8.5, 7.5 + off], [7.5 + off, 8.5]][player];
  }

  // ---------- drawing ----------
  var canvas = $('board'), ctx = canvas.getContext('2d');
  var game = L.newGame(), shown = null, pickable = [];
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function draw() {
    var rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var size = Math.max(150, Math.round(rect.width));
    if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
    var u = size / 15;
    var col = [css('--p0'), css('--p1'), css('--p2'), css('--p3')];
    var board = css('--board'), line = css('--line'), fg = css('--fg');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = board; ctx.fillRect(0, 0, size, size);

    function cell(c, fill, alpha) {
      if (fill) { ctx.globalAlpha = alpha || 1; ctx.fillStyle = fill; ctx.fillRect(c[0] * u, c[1] * u, u, u); ctx.globalAlpha = 1; }
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(c[0] * u + 0.5, c[1] * u + 0.5, u - 1, u - 1);
    }
    var p, i;
    for (p = 0; p < 4; p++) {                                  // yards
      var y = YARD[p];
      ctx.fillStyle = col[p]; ctx.fillRect(y[0] * u, y[1] * u, 6 * u, 6 * u);
      ctx.fillStyle = board; ctx.fillRect((y[0] + 0.8) * u, (y[1] + 0.8) * u, 4.4 * u, 4.4 * u);
      for (i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc((y[0] + SLOT[i][0]) * u, (y[1] + SLOT[i][1]) * u, 0.55 * u, 0, 7);
        ctx.globalAlpha = 0.28; ctx.fillStyle = col[p]; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < 52; i++) {                                 // shared track
      var owner = L.START.indexOf(i);
      cell(PATH[i], owner >= 0 ? col[owner] : null, 0.85);
      if (L.isSafe(i, game.rules) && owner < 0) star((PATH[i][0] + 0.5) * u, (PATH[i][1] + 0.5) * u, 0.3 * u, fg);
    }
    for (p = 0; p < 4; p++) for (i = 0; i < 5; i++) cell(columnCell(p, i), col[p], 0.85);
    var mid = [7.5 * u, 7.5 * u], corners = [[6, 6], [9, 6], [9, 9], [6, 9]];
    for (p = 0; p < 4; p++) {                                  // home triangles: left, top, right, bottom
      var a = corners[(p + 3) % 4], b = corners[p];
      ctx.beginPath(); ctx.moveTo(a[0] * u, a[1] * u); ctx.lineTo(b[0] * u, b[1] * u); ctx.lineTo(mid[0], mid[1]); ctx.closePath();
      ctx.fillStyle = col[p]; ctx.fill(); ctx.strokeStyle = board; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);

    // tokens, fanned out when several share a square
    var groups = {}, list = [];
    for (p = 0; p < 4; p++) for (i = 0; i < 4; i++) {
      var prog = shown && shown.player === p && shown.token === i ? shown.p : game.tokens[p][i];
      var s = spot(p, i, prog), key = s[0].toFixed(2) + ',' + s[1].toFixed(2);
      var t = { p: p, i: i, x: s[0], y: s[1], home: prog === L.HOME };
      (groups[key] = groups[key] || []).push(t); list.push(t);
    }
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], n = g.length;
      g.forEach(function (t, j) {
        t.r = t.home ? 0.2 : n > 1 ? 0.26 : 0.34;
        if (n > 1) { var ang = (j / n) * Math.PI * 2 - Math.PI / 2; t.x += Math.cos(ang) * 0.2; t.y += Math.sin(ang) * 0.2; }
      });
    });
    list.forEach(function (t) {
      var x = t.x * u, yy = t.y * u, r = t.r * u;
      ctx.beginPath(); ctx.arc(x, yy, r, 0, 7); ctx.fillStyle = col[t.p]; ctx.fill();
      ctx.lineWidth = Math.max(1.5, u * 0.07); ctx.strokeStyle = fg; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, yy, r * 0.45, 0, 7); ctx.fillStyle = board; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      t.px = x; t.py = yy; t.pr = r;
    });
    pickable.forEach(function (m) {
      var t = list[game.turn * 4 + m.token];
      ctx.beginPath(); ctx.arc(t.px, t.py, t.pr + u * 0.16, 0, 7);
      ctx.lineWidth = Math.max(2, u * 0.1); ctx.strokeStyle = fg; ctx.setLineDash([u * 0.18, u * 0.12]); ctx.stroke(); ctx.setLineDash([]);
    });
    draw.tokens = list;
  }
  function star(x, y, r, color) {
    ctx.beginPath();
    for (var k = 0; k < 10; k++) {
      var rad = k % 2 ? r * 0.45 : r, ang = -Math.PI / 2 + k * Math.PI / 5;
      ctx.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
    }
    ctx.closePath(); ctx.globalAlpha = 0.55; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  }

  var PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function showDie(n, player) {
    var dots = $('die').children;
    for (var i = 0; i < 9; i++) dots[i].className = PIPS[n].indexOf(i) >= 0 ? 'on' : '';
    $('die').style.borderColor = player == null ? '' : 'var(--p' + player + ')';
  }
  function say(main, sub) { $('status').textContent = main; $('substatus').textContent = sub || ' '; }

  // ---------- game loop ----------
  var runId = 0, paused = false, training = false, rollClick = null, pickClick = null;
  var STEP_MS = [260, 140, 70, 28, 6];
  function stepMs() { return STEP_MS[+$('speed').value]; }

  function sleep(ms, id) {
    return new Promise(function (resolve, reject) {
      var waited = 0;
      (function tick() {
        if (id !== runId) return reject('stopped');
        if (!paused && waited >= ms) return resolve();
        var d = Math.min(40, Math.max(1, ms - waited));
        setTimeout(function () { if (!paused) waited += d; tick(); }, d);
      })();
    });
  }
  function waitFor(setter, id) {
    return new Promise(function (resolve, reject) {
      setter(resolve);
      (function watch() { if (id !== runId) return reject('stopped'); setTimeout(watch, 100); })();
    });
  }

  function describe(res) {
    var m = res.move, text;
    if (m.from === -1) text = 'brings a token out';
    else if (m.to === L.HOME) text = 'gets a token home';
    else text = 'moves ' + res.roll;
    if (res.captured.length) text += ' and captures ' + res.captured.map(function (c) { return NAMES[c.player]; }).join(' and ');
    return text;
  }

  async function runGame() {
    var id = ++runId, i;
    game = L.newGame(); shown = null; pickable = [];
    game.turn = Math.floor(Math.random() * 4);
    for (i = 0; i < 4; i++) { agents[i].trace = null; if (seats[i] === 'agent') agents[i].startGame(); }
    $('roll').hidden = true; showDie(0); draw();
    try {
      while (game.winner < 0) {
        var p = game.turn, human = seats[p] === 'human', name = human ? 'You (' + NAMES[p] + ')' : NAMES[p];
        if (human) {
          say('Your turn, ' + NAMES[p], 'Roll the die.');
          $('roll').hidden = false; $('roll').focus({ preventScroll: true });
          await waitFor(function (r) { rollClick = r; }, id);
          $('roll').hidden = true;
        } else {
          await sleep(stepMs() * 2, id);
        }
        var roll = L.rollDie(), move = null;
        showDie(roll, p);
        if (L.isForfeit(game, roll)) {
          say(name + ' rolled a third 6', 'The turn is lost.');
          await sleep(stepMs() * 5, id);
        } else {
          var moves = L.legalMoves(game, p, roll);
          if (!moves.length) {
            say(name + ' rolled ' + roll, 'No token can move.');
            await sleep(stepMs() * (human ? 8 : 3), id);
          } else if (human && moves.length > 1) {
            say('You rolled ' + roll, 'Click one of the ringed tokens to move it.');
            pickable = moves; draw();
            move = await waitFor(function (r) { pickClick = r; }, id);
            pickable = []; pickClick = null;
          } else {
            move = human ? moves[0] : agents[p].choose(game, p, moves);
          }
        }
        if (move) {
          for (var q = move.from + 1; q <= move.to; q++) {      // walk square by square
            shown = { player: p, token: move.token, p: q }; draw();
            await sleep(stepMs(), id);
          }
          shown = null;
        }
        var res = L.play(game, roll, move);
        if (move) say(name + ' rolled ' + roll, NAMES[p] + ' ' + describe(res) + (res.extra ? '. Rolls again.' : '.'));
        draw();
        if (move) await sleep(stepMs() * 2, id);
      }
      var w = game.winner;
      for (i = 0; i < 4; i++) if (seats[i] === 'agent') agents[i].endGame(w === i);
      recordGame(w); saveAll(); renderAgents(); renderChart();
      say(seats[w] === 'human' ? 'You won as ' + NAMES[w] : NAMES[w] + ' wins',
        $('auto').checked ? 'Next game starts shortly.' : 'Press New game to play again.');
      if ($('auto').checked) { await sleep(Math.max(900, stepMs() * 12), id); runGame(); }
    } catch (e) { if (e !== 'stopped') throw e; }
  }

  canvas.addEventListener('click', function (ev) {
    if (!pickClick || !pickable.length) return;
    var rect = canvas.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    var best = null, bestD = Infinity;
    pickable.forEach(function (m) {
      var t = draw.tokens[game.turn * 4 + m.token], d = Math.hypot(t.px - x, t.py - y);
      if (d < bestD) { bestD = d; best = m; }
    });
    if (best && bestD < rect.width / 15 * 0.9) pickClick(best);
  });
  $('roll').addEventListener('click', function () { if (rollClick) { var r = rollClick; rollClick = null; r(); } });
  $('pause').addEventListener('click', function () {
    paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause';
  });
  $('newgame').addEventListener('click', function () { if (!training) runGame(); });

  // ---------- fast training ----------
  function train(total) {
    if (training) return;
    training = true; runId++;                                  // abandons the game on the board
    var done = 0, stop = false, bar = $('progress');
    bar.hidden = false; $('trainstop').hidden = false; $('roll').hidden = true;
    setTrainButtons(true);
    $('trainstop').onclick = function () { stop = true; };
    say('Training', 'The agents are playing each other at full speed.');
    (function chunk() {
      var until = Date.now() + 40;
      while (done < total && !stop && Date.now() < until) { recordGame(A.playGame(agents)); done++; }
      bar.firstElementChild.style.width = (100 * done / total) + '%';
      $('trainNote').textContent = done.toLocaleString() + ' of ' + total.toLocaleString() + ' games played';
      if (done < total && !stop) return setTimeout(chunk, 0);
      training = false; saveAll(); renderAgents(); renderChart();
      bar.hidden = true; $('trainstop').hidden = true; setTrainButtons(false);
      $('trainNote').textContent = 'Finished ' + done.toLocaleString() + ' games. Training always uses all four agents.';
      runGame();
    })();
  }
  function setTrainButtons(off) {
    ['train100', 'train1000', 'train10000', 'newgame'].forEach(function (b) { $(b).disabled = off; });
  }
  $('train100').addEventListener('click', function () { train(100); });
  $('train1000').addEventListener('click', function () { train(1000); });
  $('train10000').addEventListener('click', function () { train(10000); });

  // ---------- agent cards ----------
  function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n.toLocaleString(); }

  // One row per preference: a slider to set it, Lock to keep it fixed, and x to forget it.
  function prefRows(i) {
    return A.FACTS.map(function (f, k) {
      var d = ' data-a="' + i + '" data-k="' + k + '"';
      return '<li class="pref" id="pref' + i + '_' + k + '"><span class="pl">' + f.label + '</span><span class="v">0.0</span>' +
        '<input type="range" min="-6" max="6" step="0.5" value="0"' + d + ' aria-label="' + NAMES[i] + ': ' + f.label + '">' +
        '<button class="lock"' + d + ' aria-pressed="false" title="Lock: games no longer change this preference">Lock</button>' +
        '<button class="x"' + d + ' title="Forget this preference" aria-label="Forget: ' + f.label + '">×</button></li>';
    }).join('');
  }

  function buildAgents() {
    $('agents').innerHTML = NAMES.map(function (name, i) {
      return '<article class="panel agent" style="--c: var(--p' + i + ')">' +
        '<header><h3>' + name + '</h3>' +
        '<div class="seg" role="group" aria-label="Who plays ' + name + '">' +
        '<button id="seatA' + i + '" aria-pressed="true">Agent</button><button id="seatH' + i + '" aria-pressed="false">You</button></div></header>' +
        '<div class="stats"><div><b id="games' + i + '">0</b><span>games</span></div><div><b id="wins' + i + '">0</b><span>wins</span></div>' +
        '<div><b id="rate' + i + '">\u2013</b><span>last 100</span></div></div>' +
        '<div><div class="label">Preferences you can edit</div></div><ul class="prefs" id="prefs' + i + '">' + prefRows(i) + '</ul>' +
        '<div class="row"><button class="danger" id="wipe' + i + '">Wipe memory</button><button id="wipecancel' + i + '" hidden>Cancel</button></div>' +
        '</article>';
    }).join('');
    NAMES.forEach(function (name, i) {
      $('seatA' + i).addEventListener('click', function () { setSeat(i, 'agent'); });
      $('seatH' + i).addEventListener('click', function () { setSeat(i, 'human'); });
      confirmButton($('wipe' + i), $('wipecancel' + i), 'Wipe memory', 'Yes, wipe ' + name, function () {
        agents[i].wipe(); saveAll(); renderAgents();
        if (seats[i] === 'agent' && game.winner < 0 && !training) agents[i].startGame();
        say(name + "'s memory was wiped", 'It knows only the rules again.');
      });
    });
  }
  function setSeat(i, kind) {
    if (seats[i] === kind) return;
    seats[i] = kind;
    $('seatA' + i).setAttribute('aria-pressed', kind === 'agent');
    $('seatH' + i).setAttribute('aria-pressed', kind === 'human');
    if (!training) runGame();                                  // a seat change starts a fresh game
  }
  // Two-step button: the first click arms it, the second does the action.
  function confirmButton(btn, cancel, idle, armed, action) {
    function reset() { btn.classList.remove('armed'); btn.textContent = idle; cancel.hidden = true; }
    btn.addEventListener('click', function () {
      if (!btn.classList.contains('armed')) { btn.classList.add('armed'); btn.textContent = armed; cancel.hidden = false; return; }
      reset(); action();
    });
    cancel.addEventListener('click', reset);
  }

  function renderAgents() {
    agents.forEach(function (a, i) {
      var m = a.memory, rate = a.recentWinRate();
      $('games' + i).textContent = compact(m.games);
      $('wins' + i).textContent = compact(m.wins);
      $('rate' + i).textContent = rate == null ? '\u2013' : Math.round(rate * 100) + '%';
      A.FACTS.forEach(function (f, k) {                        // update rows in place so a drag is not interrupted
        var row = $('pref' + i + '_' + k), w = m.weights[k], range = row.querySelector('input');
        row.querySelector('.v').textContent = (w > 0 ? '+' : '') + w.toFixed(1);
        if (document.activeElement !== range) range.value = w;
        row.querySelector('.lock').setAttribute('aria-pressed', m.locks[k]);
        row.title = 'Chosen ' + m.seen[k].toLocaleString() + ' times';
      });
    });
  }

  confirmButton($('wipeall'), $('wipeallcancel'), 'Wipe all four memories', 'Yes, wipe all four', function () {
    agents.forEach(function (a) { a.wipe(); });
    hist = newHistory(); saveAll(); renderAgents(); renderChart();
    if (!training) runGame();
    $('status').textContent = 'All four memories were wiped';
  });

  // ---------- win-share chart ----------
  function renderChart() {
    var W = 600, H = 210, l = 38, r = 12, t = 10, b = 26, pw = W - l - r, ph = H - t - b;
    var pts = hist.pts, top = 0.5, i, k;
    pts.forEach(function (pt) { pt.forEach(function (v) { if (v > top) top = v; }); });
    top = Math.min(1, Math.ceil(top * 10) / 10);
    var y = function (v) { return t + ph - (v / top) * ph; };
    var x = function (j) { return l + (pts.length > 1 ? (j / (pts.length - 1)) * pw : pw / 2); };
    var out = '';
    for (var g = 0; g <= top + 1e-9; g += top > 0.6 ? 0.2 : 0.1) {
      out += '<line class="grid" x1="' + l + '" x2="' + (W - r) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>' +
        '<text x="' + (l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + Math.round(g * 100) + '%</text>';
    }
    out += '<line class="ref" x1="' + l + '" x2="' + (W - r) + '" y1="' + y(0.25) + '" y2="' + y(0.25) + '"/>';
    if (!pts.length) {
      out += '<text x="' + (l + pw / 2) + '" y="' + (t + 16) + '" text-anchor="middle">Lines appear after the first ' + hist.size + ' games.</text>';
    } else {
      for (k = 0; k < 4; k++) {
        var d = '';
        for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(pts[i][k]).toFixed(1);
        out += '<path class="s" d="' + d + '" style="stroke:var(--p' + k + ')"/>' +
          '<circle cx="' + x(pts.length - 1) + '" cy="' + y(pts[pts.length - 1][k]) + '" r="3.5" style="fill:var(--p' + k + ')"/>';
      }
      out += '<text x="' + l + '" y="' + (H - 7) + '">' + (pts.length > 1 ? 'game ' + hist.size : '') + '</text>' +
        '<text x="' + (W - r) + '" y="' + (H - 7) + '" text-anchor="end">game ' + (pts.length * hist.size).toLocaleString() + '</text>';
    }
    out += '<text x="' + (l + pw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">dashed line: 25%, an even split</text>';
    $('chart').innerHTML = out;
  }

  // ---------- editing preferences ----------
  $('agents').addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.type !== 'range') return;
    var a = +el.dataset.a, k = +el.dataset.k;
    agents[a].setWeight(k, +el.value);
    var w = agents[a].memory.weights[k];
    $('pref' + a + '_' + k).querySelector('.v').textContent = (w > 0 ? '+' : '') + w.toFixed(1);
  });
  $('agents').addEventListener('change', function (ev) { if (ev.target.type === 'range') saveAll(); });
  $('agents').addEventListener('click', function (ev) {
    var b = ev.target.closest('button.lock, button.x');
    if (!b) return;
    var a = +b.dataset.a, k = +b.dataset.k;
    if (b.classList.contains('lock')) agents[a].setLock(k, !agents[a].memory.locks[k]);
    else agents[a].forget(k);
    saveAll(); renderAgents();
  });

  // ---------- rules you can change while playing ----------
  function exitValue() { var e = L.rules.exitRolls.join(','); return e === '1,2,3,4,5,6' ? 'any' : e; }
  function syncRuleControls() {
    $('ruleExact').checked = L.rules.exactHome;
    $('ruleExtra').checked = L.rules.extraTurns;
    $('ruleThree').checked = L.rules.threeSixes;
    $('ruleSafe').checked = L.rules.safeSquares;
    var sel = $('ruleExit'), v = exitValue();
    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) {
      var o = document.createElement('option');                // a roll set typed as an order
      o.value = v; o.textContent = 'A roll of ' + v.split(',').join(', ');
      sel.appendChild(o);
    }
    sel.value = v;
  }
  // Applies L.rules to the game in progress (from the next roll) and remembers it.
  function pushRules() {
    var r = L.copyRules(L.rules);
    Object.keys(r).forEach(function (k) { game.rules[k] = r[k]; });
    save(RULE_KEY, L.rules); syncRuleControls(); draw();
  }
  function readRuleControls() {
    L.rules.exactHome = $('ruleExact').checked;
    L.rules.extraTurns = $('ruleExtra').checked;
    L.rules.threeSixes = $('ruleThree').checked;
    L.rules.safeSquares = $('ruleSafe').checked;
    var v = $('ruleExit').value;
    L.rules.exitRolls = v === 'any' ? [1, 2, 3, 4, 5, 6] : v.split(',').map(Number);
    pushRules();
    say('Rules changed', 'The new rules apply from the next roll.');
  }
  ['ruleExact', 'ruleExtra', 'ruleThree', 'ruleSafe', 'ruleExit'].forEach(function (id) {
    $(id).addEventListener('change', readRuleControls);
  });

  // ---------- typed orders ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function runCommands() {
    var text = $('cmd').value;
    if (!text.trim()) return;
    var results = window.LudoCommands.run(text, { agents: agents, rules: L.rules });
    agents.forEach(function (a, i) {                           // an agent that forgot everything mid-game keeps playing
      if (seats[i] === 'agent' && game.winner < 0 && !training && !a.trace) a.startGame();
    });
    saveAll(); renderAgents(); pushRules();
    $('cmdlog').innerHTML = results.map(function (r) {
      return '<li class="' + (r.ok ? 'ok' : 'err') + '"><code>' + esc(r.line) + '</code> ' + esc(r.text) + '</li>';
    }).join('');
    if (results.length && results.every(function (r) { return r.ok; })) $('cmd').value = '';
  }
  $('cmdrun').addEventListener('click', runCommands);
  $('cmd').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); runCommands(); }
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-ex]'), function (chip) {
    chip.addEventListener('click', function () {
      var box = $('cmd');
      box.value = (box.value.trim() ? box.value.replace(/\s*$/, '\n') : '') + chip.dataset.ex;
      box.focus();
    });
  });

  // ---------- backup ----------
  $('export').addEventListener('click', function () {
    var text = JSON.stringify({ ludoLearners: 1, agents: agents.map(function (a) { return a.memory; }), rules: L.rules, history: hist });
    $('backup').value = text; $('backup').select();
    var note = function (s) { $('backupNote').textContent = s; };
    try { navigator.clipboard.writeText(text).then(function () { note('Copied. Keep this text somewhere safe.'); },
      function () { note('Copy the text in the box and keep it somewhere safe.'); }); }
    catch (e) { note('Copy the text in the box and keep it somewhere safe.'); }
  });
  $('import').addEventListener('click', function () {
    var data = null;
    try { data = JSON.parse($('backup').value); } catch (e) { /* handled below */ }
    if (!data || !Array.isArray(data.agents) || data.agents.length !== 4 || !data.agents.every(A.validMemory)) {
      $('backupNote').textContent = 'That text is not a memory backup. Paste the full text from Export and try again.';
      return;
    }
    data.agents.forEach(function (m, i) { agents[i] = new A.Agent(m); });
    if (data.history && Array.isArray(data.history.pts) && Array.isArray(data.history.cur)) hist = data.history;
    applyRuleSettings(data.rules); pushRules();
    saveAll(); renderAgents(); renderChart();
    $('backupNote').textContent = 'Memories restored.';
    if (!training) runGame();
  });

  // ---------- start ----------
  buildAgents(); renderAgents(); renderChart(); syncRuleControls();
  if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  window.__ludo = { agents: agents, train: train };
  runGame();
})();
