// Ludo rules. Pure logic, no DOM. Works in the browser (window.Ludo) and in Node.
//
// Token progress p, relative to its own colour:
//   -1        in the yard
//   0..50     on the shared 52-square track (0 = own start square)
//   51..55    in the home column
//   56        home
(function (root) {
  'use strict';

  var PLAYERS = 4, TOKENS = 4, TRACK = 52, LAST_TRACK = 50, HOME = 56;
  var START = [0, 13, 26, 39];
  var SAFE = { 0: 1, 13: 1, 26: 1, 39: 1, 8: 1, 21: 1, 34: 1, 47: 1 };

  // Rules that can be changed between rolls. New games copy the current settings;
  // changing a running game's `state.rules` takes effect from the next roll.
  function defaultRules() {
    return { exactHome: true, extraTurns: true, threeSixes: true, safeSquares: true, exitRolls: [6] };
  }
  function copyRules(r) {
    var c = {};
    for (var k in r) c[k] = Array.isArray(r[k]) ? r[k].slice() : r[k];
    return c;
  }
  var rules = defaultRules();

  function newGame() {
    var tokens = [];
    for (var i = 0; i < PLAYERS; i++) tokens.push([-1, -1, -1, -1]);
    return { tokens: tokens, turn: 0, sixes: 0, winner: -1, rules: copyRules(rules) };
  }

  function absSquare(player, p) { return (START[player] + p) % TRACK; }
  function isSafe(abs, r) { return SAFE[abs] === 1 && !(r && r.safeSquares === false); }
  function rollDie(rng) { return 1 + Math.floor((rng || Math.random)() * 6); }

  // How many tokens of `player` stand on shared-track square `abs`.
  function countAt(state, player, abs) {
    var n = 0, t = state.tokens[player];
    for (var i = 0; i < TOKENS; i++) {
      if (t[i] >= 0 && t[i] <= LAST_TRACK && absSquare(player, t[i]) === abs) n++;
    }
    return n;
  }

  // Opponent tokens that a move by `player` onto progress `to` would send home.
  // A lone opponent token is captured; two of one colour on a square are safe.
  function capturesAt(state, player, to) {
    var out = [];
    if (to < 0 || to > LAST_TRACK) return out;
    var abs = absSquare(player, to);
    if (isSafe(abs, state.rules)) return out;
    for (var o = 0; o < PLAYERS; o++) {
      if (o === player || countAt(state, o, abs) !== 1) continue;
      for (var i = 0; i < TOKENS; i++) {
        var p = state.tokens[o][i];
        if (p >= 0 && p <= LAST_TRACK && absSquare(o, p) === abs) out.push({ player: o, token: i });
      }
    }
    return out;
  }

  function legalMoves(state, player, roll) {
    var moves = [], t = state.tokens[player], r = state.rules;
    for (var i = 0; i < TOKENS; i++) {
      var p = t[i];
      if (p === -1) { if (r.exitRolls.indexOf(roll) >= 0) moves.push({ token: i, from: -1, to: 0 }); }
      else if (p < HOME && (p + roll <= HOME || !r.exactHome)) {
        moves.push({ token: i, from: p, to: Math.min(p + roll, HOME) });
      }
    }
    return moves;
  }

  // Third six in a row: the turn is lost before any move is made.
  function isForfeit(state, roll) { return state.rules.threeSixes && roll === 6 && state.sixes === 2; }

  function nextPlayer(state) { state.turn = (state.turn + 1) % PLAYERS; state.sixes = 0; }

  // Apply the current player's roll. `move` is one of legalMoves(), or null when
  // there is none (or the roll is forfeited). Advances the turn. Returns what happened.
  function play(state, roll, move) {
    var player = state.turn;
    var res = { player: player, roll: roll, move: move, captured: [], home: false, extra: false, forfeit: false, won: false };
    if (isForfeit(state, roll)) { res.forfeit = true; nextPlayer(state); return res; }
    if (move) {
      res.captured = capturesAt(state, player, move.to);
      for (var c = 0; c < res.captured.length; c++) {
        state.tokens[res.captured[c].player][res.captured[c].token] = -1;
      }
      state.tokens[player][move.token] = move.to;
      res.home = move.to === HOME;
      if (res.home && state.tokens[player].every(function (p) { return p === HOME; })) {
        state.winner = player; res.won = true; return res;
      }
    }
    res.extra = state.rules.extraTurns && (roll === 6 || res.captured.length > 0 || res.home);
    if (res.extra) state.sixes = roll === 6 ? state.sixes + 1 : 0;
    else nextPlayer(state);
    return res;
  }

  // Could an opponent token land on `player`'s token at progress p with one roll?
  function inDanger(state, player, p) {
    if (p < 0 || p > LAST_TRACK) return false;
    var abs = absSquare(player, p);
    if (isSafe(abs, state.rules) || countAt(state, player, abs) > 1) return false;
    for (var o = 0; o < PLAYERS; o++) {
      if (o === player) continue;
      for (var i = 0; i < TOKENS; i++) {
        var q = state.tokens[o][i];
        if (q < 0 || q > LAST_TRACK) continue;
        var d = (abs - absSquare(o, q) + TRACK) % TRACK;
        if (d >= 1 && d <= 6 && q + d <= LAST_TRACK) return true;
      }
    }
    return false;
  }

  root.Ludo = {
    PLAYERS: PLAYERS, TOKENS: TOKENS, TRACK: TRACK, LAST_TRACK: LAST_TRACK, HOME: HOME, START: START,
    rules: rules, defaultRules: defaultRules, copyRules: copyRules,
    newGame: newGame, absSquare: absSquare, isSafe: isSafe, rollDie: rollDie, countAt: countAt,
    capturesAt: capturesAt, legalMoves: legalMoves, isForfeit: isForfeit, play: play, inDanger: inDanger
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Ludo;
})(typeof window !== 'undefined' ? window : globalThis);
