// Self-learning Ludo agent. Works in the browser (window.LudoAgent) and in Node.
//
// The agent is given only the legal moves. For each one it can observe a few plain
// facts (FACTS below). Its memory is one number per fact: how much it has come to
// prefer moves with that fact. Every number starts at 0, so a new agent plays at random.
// The only feedback it ever gets is the game result: 1 if it won, 0 if it lost.
(function (root) {
  'use strict';
  var L = root.Ludo || (typeof require !== 'undefined' ? require('./engine.js') : null);

  var FACTS = [
    { id: 'leave',   label: 'Bring a token out of the yard' },
    { id: 'capture', label: 'Capture an opponent' },
    { id: 'safe',    label: 'Land on a safe square' },
    { id: 'column',  label: 'Enter the home column' },
    { id: 'home',    label: 'Get a token home' },
    { id: 'flee',    label: 'Move a token that is in danger' },
    { id: 'risk',    label: 'Land where an opponent can hit' },
    { id: 'pair',    label: 'Join another of its own tokens' },
    { id: 'lead',    label: 'Move the token that is furthest along' }
  ];
  var N = FACTS.length, STEP = 0.1, LIMIT = 6, RECENT = 100;

  function blankMemory() {
    var m = { weights: [], seen: [], games: 0, wins: 0, recent: [] };
    for (var i = 0; i < N; i++) { m.weights.push(0); m.seen.push(0); }
    return m;
  }

  function validMemory(m) {
    return !!m && Array.isArray(m.weights) && m.weights.length === N && Array.isArray(m.seen) &&
      m.seen.length === N && m.weights.every(isFinite) && m.seen.every(isFinite) &&
      isFinite(m.games) && isFinite(m.wins) && Array.isArray(m.recent);
  }

  // The facts an agent can see about one legal move.
  function observe(state, player, move) {
    var x = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var caps = L.capturesAt(state, player, move.to);
    var onTrack = move.to <= L.LAST_TRACK;
    x[0] = move.from === -1 ? 1 : 0;
    x[1] = caps.length ? 1 : 0;
    x[2] = onTrack && L.isSafe(L.absSquare(player, move.to)) ? 1 : 0;
    x[3] = move.from <= L.LAST_TRACK && move.to > L.LAST_TRACK && move.to < L.HOME ? 1 : 0;
    x[4] = move.to === L.HOME ? 1 : 0;
    x[5] = L.inDanger(state, player, move.from) ? 1 : 0;
    x[7] = onTrack && L.countAt(state, player, L.absSquare(player, move.to)) > 0 ? 1 : 0;
    x[8] = Math.max(0, move.from) / L.HOME;

    // "Lands in danger" is judged on the board as it will be after the move.
    var saved = [], own = state.tokens[player][move.token], i;
    for (i = 0; i < caps.length; i++) {
      saved.push(state.tokens[caps[i].player][caps[i].token]);
      state.tokens[caps[i].player][caps[i].token] = -1;
    }
    state.tokens[player][move.token] = move.to;
    x[6] = L.inDanger(state, player, move.to) ? 1 : 0;
    state.tokens[player][move.token] = own;
    for (i = 0; i < caps.length; i++) state.tokens[caps[i].player][caps[i].token] = saved[i];
    return x;
  }

  function Agent(memory) {
    this.memory = validMemory(memory) ? memory : blankMemory();
    this.trace = null;
  }

  Agent.prototype.startGame = function () {
    this.trace = { grad: new Array(N).fill(0), seen: new Array(N).fill(0) };
  };

  // Pick a move. Moves it has come to prefer are more likely, never certain.
  Agent.prototype.choose = function (state, player, moves, rng) {
    if (moves.length === 1 && !this.trace) return moves[0];
    var w = this.memory.weights, xs = [], scores = [], max = -Infinity, i, k;
    for (i = 0; i < moves.length; i++) {
      var x = observe(state, player, moves[i]), s = 0;
      for (k = 0; k < N; k++) s += w[k] * x[k];
      xs.push(x); scores.push(s); if (s > max) max = s;
    }
    var total = 0, probs = [];
    for (i = 0; i < moves.length; i++) { probs.push(Math.exp(scores[i] - max)); total += probs[i]; }
    var r = (rng || Math.random)() * total, pick = moves.length - 1;
    for (i = 0; i < moves.length; i++) { r -= probs[i]; if (r <= 0) { pick = i; break; } }

    if (this.trace) {
      for (k = 0; k < N; k++) {
        var expected = 0;
        for (i = 0; i < moves.length; i++) expected += (probs[i] / total) * xs[i][k];
        this.trace.grad[k] += xs[pick][k] - expected;
        if (xs[pick][k] > 0 && (k < 8 || xs[pick][8] >= maxOf(xs, 8))) this.trace.seen[k]++;
      }
    }
    return moves[pick];
  };

  function maxOf(xs, k) { var m = 0; for (var i = 0; i < xs.length; i++) if (xs[i][k] > m) m = xs[i][k]; return m; }

  // The only lesson: did the game end in a win? Facts chosen more often than
  // chance in won games gain preference; in lost games they lose it.
  Agent.prototype.endGame = function (won) {
    var m = this.memory, result = won ? 1 : 0;
    if (this.trace) {
      var usual = m.games ? m.wins / m.games : 0;
      for (var k = 0; k < N; k++) {
        var w = m.weights[k] + STEP * (result - usual) * this.trace.grad[k];
        m.weights[k] = Math.max(-LIMIT, Math.min(LIMIT, w));
        m.seen[k] += this.trace.seen[k];
      }
    }
    m.games++; m.wins += result;
    m.recent.push(result); if (m.recent.length > RECENT) m.recent.shift();
    this.trace = null;
  };

  Agent.prototype.wipe = function () { this.memory = blankMemory(); this.trace = null; };

  Agent.prototype.recentWinRate = function () {
    var r = this.memory.recent; if (!r.length) return null;
    var s = 0; for (var i = 0; i < r.length; i++) s += r[i];
    return s / r.length;
  };

  // Play one whole game without drawing anything. seats[i] is an Agent, or null
  // for a player that always moves at random. Returns the winner's seat.
  function playGame(seats, rng, learn) {
    var state = L.newGame(), i;
    state.turn = Math.floor((rng || Math.random)() * L.PLAYERS);
    if (learn !== false) for (i = 0; i < seats.length; i++) if (seats[i]) seats[i].startGame();
    while (state.winner < 0) {
      var p = state.turn, roll = L.rollDie(rng), move = null;
      if (!L.isForfeit(state, roll)) {
        var moves = L.legalMoves(state, p, roll);
        if (moves.length) {
          move = seats[p] ? seats[p].choose(state, p, moves, rng)
                          : moves[Math.floor((rng || Math.random)() * moves.length)];
        }
      }
      L.play(state, roll, move);
    }
    if (learn !== false) for (i = 0; i < seats.length; i++) if (seats[i]) seats[i].endGame(state.winner === i);
    return state.winner;
  }

  root.LudoAgent = { FACTS: FACTS, Agent: Agent, blankMemory: blankMemory, validMemory: validMemory,
    observe: observe, playGame: playGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LudoAgent;
})(typeof window !== 'undefined' ? window : globalThis);
