# Toot Raft

One to four players, one round raft, fart-powered propulsion. An original browser game inspired by
the "co-op shared raft" idea. No code or assets from any other game.

## Play

- **Online:** enter a name, create a room, and send the 4-digit code to up to 3 friends. While
  you wait you can all paddle around the practice pond. The host starts the race with however
  many are there (1-4): 3-2-1, then level 1 against the clock. The rim is split evenly:
  alone you get all 360°, two players get a half each, three get 120° each, four a quarter.
- **Solo practice:** one person controls all four (good for learning the level).

**Scoring:** only time counts (splats don't). Points = 1000 × par ÷ your time, where par is
75 s for level 1. So par time scores 1000 and twice as fast scores 2000. Every finished race
is kept with the crew's names, crew size and date/time. There is one leaderboard per crew
size (solo, 2, 3 and 4 players). Smaller crews push a bit harder per fart (`CREW_THRUST` in
`src/sim/sim.js`) because fewer of them can push in any one direction.

## Run locally

    npm install
    npm start          # game server on http://localhost:8080 (serves the last `npm run build`)
    npm run dev        # optional: hot-reloading client on :5173, talks to the server above

    npm run build      # build the client into dist/
    npm run test:sim   # physics checks + autopilot that beats level 1
    node scripts/autopilot.js 2   # autopilot with a crew of 1-4
    npm run test:net   # full multiplayer test: real server, 4 WebSocket clients, a race
    npm run sounds     # render the fart voices to sound-preview/*.wav

Deploying to EC2: see [deploy/README.md](deploy/README.md).

## Layout

- `src/sim/`: pure simulation (Rapier 2D, fixed 60 Hz, no DOM). The same code runs in the
  browser (solo) and on the server (online).
  - `sim.js`: round raft, the rim split between 1-4 players (`arcFor`), gas meters,
    push-from-where-you-stand physics, checkpoints, spikes, finish.
  - `levels.js`: the level registry. `level.js` (level 1, the canal) and `pond.js` (lobby).
    **To add a level:** write a level file and add it to `LEVELS` and `RACE_LEVELS`.
  - `scoring.js`: the points formula.
- `server/`: `index.js` (HTTP, static files, WebSocket, game loop), `rooms.js` (room codes,
  seats, host, lobby → countdown → race → results), `db.js` (SQLite scores).
- `src/main.js`: client modes (menu / solo / online), `net.js` (WebSocket with auto-rejoin),
  `render.js` (three.js), `hud.js`, `input.js`, `audio.js` + `fartsynth.js`.

## How online play works

The server is the only source of truth: it runs every room's physics at 60 Hz and sends 30
snapshots a second. Browsers send just their own buttons (`fart`, `move`, `aim`) and draw
the world about 100 ms in the past, blending between snapshots so it looks smooth. Your own
fart sound plays the moment you press, not after a round trip. Refreshing the page or a
WiFi blip puts you back in your seat. A room is deleted 30 s after the last person leaves.
