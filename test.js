// Run with: node ludo/test.js
'use strict';
const L = require('./engine.js');
const { Agent, playGame, blankMemory } = require('./agent.js');

function check(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } }

// 1. Rule invariants over random games.
let turnsTotal = 0;
for (let g = 0; g < 5000; g++) {
  const s = L.newGame();
  let turns = 0;
  while (s.winner < 0) {
    const p = s.turn, roll = L.rollDie();
    let move = null;
    if (!L.isForfeit(s, roll)) {
      const moves = L.legalMoves(s, p, roll);
      if (moves.length) move = moves[Math.floor(Math.random() * moves.length)];
    }
    const res = L.play(s, roll, move);
    for (const c of res.captured) {
      check(!L.isSafe(L.absSquare(p, move.to)), 'capture on a safe square');
      check(c.player !== p, 'captured own token');
      check(s.tokens[c.player][c.token] === -1, 'captured token not in yard');
    }
    let count = 0;
    for (const t of s.tokens) for (const q of t) { count++; check(q >= -1 && q <= L.HOME, 'token out of range: ' + q); }
    check(count === 16, 'token count');
    check(s.sixes <= 2, 'more than two sixes carried');
    check(++turns < 20000, 'game did not end');
  }
  check(s.tokens[s.winner].every(q => q === L.HOME), 'winner without all tokens home');
  turnsTotal += turns;
}
console.log('rules ok: 5000 random games, average ' + Math.round(turnsTotal / 5000) + ' rolls per game');

// 2. A new agent is indistinguishable from random.
check(blankMemory().weights.every(w => w === 0), 'new memory is not empty');

// 3. Learning: one agent against three random players.
const learner = new Agent();
const seats = [learner, null, null, null];
const GAMES = 20000, BLOCK = 2000;
let wins = 0, last = 0;
for (let g = 1; g <= GAMES; g++) {
  if (playGame(seats) === 0) wins++;
  if (g % BLOCK === 0) { last = wins / BLOCK; console.log('games ' + g + ': win rate ' + (100 * last).toFixed(1) + '%'); wins = 0; }
}
console.log('learned preferences:', learner.memory.weights.map(w => w.toFixed(2)).join(' '));
check(last > 0.35, 'agent did not learn (final win rate ' + last + ')');
console.log('learning ok');
