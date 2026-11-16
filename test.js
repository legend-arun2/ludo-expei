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
      check(!L.isSafe(L.absSquare(p, move.to), s.rules), 'capture on a safe square');
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

// 1b. Every rule switch still gives games that end with valid boards.
const variants = [
  { exactHome: false }, { extraTurns: false }, { threeSixes: false }, { safeSquares: false },
  { exitRolls: [1, 6] }, { exitRolls: [1, 2, 3, 4, 5, 6] },
  { exactHome: false, extraTurns: false, safeSquares: false, exitRolls: [1, 2, 3, 4, 5, 6] }
];
for (const v of variants) {
  Object.assign(L.rules, L.defaultRules(), v);
  for (let g = 0; g < 300; g++) {
    const s = L.newGame();
    let turns = 0;
    while (s.winner < 0) {
      const roll = L.rollDie();
      let move = null;
      if (!L.isForfeit(s, roll)) {
        const moves = L.legalMoves(s, s.turn, roll);
        if (moves.length) move = moves[Math.floor(Math.random() * moves.length)];
      }
      const res = L.play(s, roll, move);
      for (const c of res.captured) check(!L.isSafe(L.absSquare(res.player, move.to), s.rules), 'capture on safe square, ' + JSON.stringify(v));
      for (const t of s.tokens) for (const q of t) check(q >= -1 && q <= L.HOME, 'token out of range, ' + JSON.stringify(v));
      if (v.extraTurns === false) check(!res.extra, 'extra roll given with extraTurns off');
      check(++turns < 40000, 'game did not end, ' + JSON.stringify(v));
    }
  }
}
Object.assign(L.rules, L.defaultRules());
console.log('rule switches ok: ' + variants.length + ' variants');

// 1c. Orders: wording, locks, forgetting, rules, and refusals.
const C = require('./commands.js');
const team = [0, 1, 2, 3].map(() => new Agent());
const ctx = { agents: team, rules: L.rules };
const go = (t) => C.run(t, ctx);
const CAP = 1, SAFEK = 2, RISK = 6;
check(go('red: always capture')[0].ok && team[0].memory.weights[CAP] === 6 && team[0].memory.locks[CAP], 'always capture');
check(go('green and blue: never land where an opponent can hit')[0].ok &&
  team[1].memory.weights[RISK] === -6 && team[3].memory.locks[RISK] && team[2].memory.weights[RISK] === 0, 'never risk');
check(go('yellow: prefer safe squares')[0].ok && team[2].memory.weights[SAFEK] === 3 && !team[2].memory.locks[SAFEK], 'prefer safe');
check(go('all: set capture to 2.5')[0].ok && team[3].memory.weights[CAP] === 2.5, 'set value');
check(go('red: unlock capture')[0].ok && !team[0].memory.locks[CAP], 'unlock');
check(go('red: be aggressive locked')[0].ok && team[0].memory.weights[CAP] === 4 && team[0].memory.locks[CAP], 'preset');
check(go('blue: forget capture')[0].ok && team[3].memory.weights[CAP] === 0, 'forget one');
check(go('blue: forget all')[0].ok && team[3].memory.weights.every(w => w === 0) && team[3].memory.locks.every(l => !l), 'forget all');
check(go('rule exact home off')[0].ok && L.rules.exactHome === false, 'rule off');
check(go('rule exit 1,6')[0].ok && L.rules.exitRolls.join() === '1,6', 'rule exit');
check(go('rule exit any')[0].ok && L.rules.exitRolls.length === 6, 'rule exit any');
Object.assign(L.rules, L.defaultRules());
for (const bad of ['dance', 'red: fly to the moon', 'red: always juggle', 'rule gravity off', 'rule safe squares', 'red:']) {
  check(go(bad).every(r => !r.ok), 'should refuse: ' + bad);
}
check(go('red: always capture; green: avoid risk\nblue: lock home').length === 3, 'several orders at once');

// A locked preference does not move however the games go.
const held = new Agent();
held.setWeight(CAP, -5, true);
for (let g = 0; g < 400; g++) playGame([held, null, null, null]);
check(held.memory.weights[CAP] === -5, 'locked preference changed');
check(held.memory.weights.some((w, k) => k !== CAP && w !== 0), 'unlocked preferences did not learn');
console.log('orders ok');

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
