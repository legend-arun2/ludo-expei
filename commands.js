// Typed orders for the agents and the rules. Works in the browser and in Node.
//
//   red: always capture            green and blue: avoid risk locked
//   all: be cautious               red: set capture to 2.5
//   blue: forget all               rule exact home off
//
// The agents are not language models, so this is a small fixed vocabulary.
// Anything it does not understand is reported, never guessed.
(function (root) {
  'use strict';
  var L = root.Ludo || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var A = root.LudoAgent || (typeof require !== 'undefined' ? require('./agent.js') : null);

  var NAMES = ['red', 'green', 'yellow', 'blue'];
  var LIMIT = A.LIMIT;

  // First match wins, so the more specific phrases come first.
  var FACT_WORDS = [
    [3, /column/],
    [6, /risk|expos|unsafe|land (in|where)/],
    [5, /flee|escape|danger|threat|run away/],
    [1, /captur|\bhit\b|kill|attack/],
    [2, /safe|star/],
    [0, /leave|yard|\bout\b|bring/],
    [4, /\bhome\b|finish/],
    [7, /pair|stack|join|together|group/],
    [8, /lead|front|furthest|ahead|advance/]
  ];
  var PRESETS = {
    aggressive: { 1: 4, 0: 2, 6: 1 },
    cautious:   { 6: -4, 5: 3, 2: 3, 7: 2 },
    racer:      { 4: 3, 3: 2, 8: 3 }
  };
  var KNOWN = 'leave the yard, capture, safe square, home column, home, flee danger, risk, pair, lead';

  function findFact(phrase) {
    for (var i = 0; i < FACT_WORDS.length; i++) if (FACT_WORDS[i][1].test(phrase)) return FACT_WORDS[i][0];
    return -1;
  }
  function fmt(v) { return (v > 0 ? '+' : '') + v.toFixed(1); }
  function ok(text) { return { ok: true, text: text }; }
  function bad(text) { return { ok: false, text: text }; }
  function label(k) { return A.FACTS[k].label.charAt(0).toLowerCase() + A.FACTS[k].label.slice(1); }
  function names(idx) {
    var n = idx.map(function (i) { return NAMES[i].charAt(0).toUpperCase() + NAMES[i].slice(1); });
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0];
  }

  // ---------- orders for agents ----------
  function agentOrder(idx, a, ctx) {
    var who = names(idx), m, suffix = null;
    var sm = /\s+(unlocked|locked)$/.exec(a);
    if (sm) { suffix = sm[1]; a = a.slice(0, sm.index); }

    if (/^(forget|wipe|reset|clear)\s+(all|everything|memory)$/.test(a)) {
      idx.forEach(function (i) { ctx.agents[i].wipe(); });
      return ok(who + ' forgot everything and knows only the rules.');
    }
    if ((m = /^(?:be\s+|play\s+|go\s+)?(aggressive|cautious|racer)$/.exec(a))) {
      var preset = PRESETS[m[1]];
      idx.forEach(function (i) {
        Object.keys(preset).forEach(function (k) { ctx.agents[i].setWeight(+k, preset[k], suffix === 'locked'); });
      });
      return ok(who + (idx.length > 1 ? ' are' : ' is') + ' now ' + m[1] + (suffix === 'locked' ? ' (locked).' : '.'));
    }

    var verb, phrase, value = null;
    if ((m = /^set\s+(.+?)\s+(?:to\s+)?(-?\d+(?:\.\d+)?)$/.exec(a))) { verb = 'set'; phrase = m[1]; value = +m[2]; }
    else if ((m = /^(always|never|prefer|like|avoid|dislike|lock|unlock|forget|reset)\s+(.+)$/.exec(a))) { verb = m[1]; phrase = m[2]; }
    else return bad('Not understood. Try "' + NAMES[idx[0]] + ': always capture" or "' + NAMES[idx[0]] + ': be cautious".');

    var facts = [], parts = phrase.split(/\s*(?:,|\band\b)\s*/);
    for (var p = 0; p < parts.length; p++) {
      var k = findFact(parts[p]);
      if (k < 0) return bad('Unknown preference "' + parts[p] + '". The agents know: ' + KNOWN + '.');
      if (facts.indexOf(k) < 0) facts.push(k);
    }

    var lock = suffix === 'locked' ? true : suffix === 'unlocked' ? false : undefined, text;
    if (verb === 'always' || verb === 'never') { value = verb === 'always' ? LIMIT : -LIMIT; if (lock === undefined) lock = true; }
    if (verb === 'prefer' || verb === 'like') value = 3;
    if (verb === 'avoid' || verb === 'dislike') value = -3;

    idx.forEach(function (i) {
      facts.forEach(function (k) {
        var ag = ctx.agents[i];
        if (verb === 'lock') ag.setLock(k, true);
        else if (verb === 'unlock') ag.setLock(k, false);
        else if (verb === 'forget' || verb === 'reset') ag.forget(k);
        else ag.setWeight(k, value, lock);
      });
    });
    var what = facts.map(label).join(' and ');
    if (verb === 'lock') text = who + ': "' + what + '" is locked and will not change.';
    else if (verb === 'unlock') text = who + ': "' + what + '" can change again.';
    else if (verb === 'forget' || verb === 'reset') text = who + ' forgot "' + what + '".';
    else {
      var shown = Math.max(-LIMIT, Math.min(LIMIT, value));
      text = who + ': "' + what + '" set to ' + fmt(shown) + (lock === true ? ' and locked.' : lock === false ? ', not locked.' : '.');
    }
    return ok(text);
  }

  // ---------- orders for the rules ----------
  function ruleOrder(rest, ctx) {
    var r = ctx.rules;
    var on = /\b(on|yes|true|enable|enabled)\b/.test(rest) ? true : /\b(off|no|false|disable|disabled)\b/.test(rest) ? false : null;
    var field = null, name;
    if (/exact/.test(rest)) { field = 'exactHome'; name = 'Exact roll to get home'; }
    else if (/extra|again|bonus/.test(rest)) { field = 'extraTurns'; name = 'Extra roll after a 6, a capture or getting home'; }
    else if (/three|triple|sixes/.test(rest)) { field = 'threeSixes'; name = 'Losing the turn on a third 6'; }
    else if (/safe|star/.test(rest)) { field = 'safeSquares'; name = 'Safe squares'; }
    else if (/exit|yard|leave|start|\bout\b/.test(rest)) {
      var rolls;
      if (/\bany\b/.test(rest)) rolls = [1, 2, 3, 4, 5, 6];
      else {
        rolls = (rest.match(/[1-6]/g) || []).map(Number).filter(function (n, i, all) { return all.indexOf(n) === i; }).sort();
        if (!rolls.length) return bad('Say which rolls bring a token out, for example "rule exit 6", "rule exit 1,6" or "rule exit any".');
      }
      r.exitRolls = rolls;
      return ok('Rule: a token leaves the yard on ' + (rolls.length === 6 ? 'any roll.' : 'a roll of ' + rolls.join(', ') + '.'));
    }
    else return bad('Unknown rule. Try: exact home, extra turns, three sixes, safe squares, exit.');
    if (on === null) return bad('Say on or off, for example "rule ' + rest.replace(/\s*(on|off)$/, '') + ' off".');
    r[field] = on;
    return ok('Rule: ' + name + ' is now ' + (on ? 'on.' : 'off.'));
  }

  // ---------- entry point ----------
  // ctx = { agents: [Agent x4], rules: Ludo.rules }. Returns one result per non-empty line.
  function run(text, ctx) {
    var out = [];
    String(text).split(/[\n;]+/).forEach(function (raw) {
      var line = raw.trim().toLowerCase(), m;
      if (!line) return;
      var res;
      if ((m = /^rules?\b\s*[:\-]?\s*(.*)$/.exec(line))) {
        res = m[1] ? ruleOrder(m[1], ctx) : bad('Say which rule, for example "rule exact home off".');
      } else if ((m = /^((?:all|everyone|everybody|red|green|yellow|blue)(?:\s*(?:,|and)\s*(?:red|green|yellow|blue))*)\s*[:,\-]?\s*(.*)$/.exec(line))) {
        var idx = [];
        if (/^(all|everyone|everybody)/.test(m[1])) idx = [0, 1, 2, 3];
        else NAMES.forEach(function (n, i) { if (new RegExp('\\b' + n + '\\b').test(m[1])) idx.push(i); });
        res = m[2] ? agentOrder(idx, m[2].trim(), ctx) : bad('Say what ' + names(idx) + ' should do, for example "' + NAMES[idx[0]] + ': always capture".');
      } else {
        res = bad('Start with a colour or "all", for example "red: always capture", or with "rule".');
      }
      res.line = raw.trim();
      out.push(res);
    });
    return out;
  }

  root.LudoCommands = { run: run, findFact: findFact, PRESETS: PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LudoCommands;
})(typeof window !== 'undefined' ? window : globalThis);
