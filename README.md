# Ludo Learners

A 2D Ludo game where four agents play each other. Each agent knows only the rules
(which moves are legal) and learns from nothing but whether it won. Every agent has its
own memory, saved in the browser, and each can be wiped separately or all at once.
You can also take over any seat.

- Open `index.html` in a browser to play and watch.
- `node test.js` runs the rule checks and a learning check.

Files: `engine.js` (rules), `agent.js` (learning agent), `ui.js` (board and controls).
