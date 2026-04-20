/* ============================================================
   REFLEX — Neural Speed Test
   script.js
   BAM Hackathon Edition
   ============================================================ */

// ---- GAME CONFIGURATION ----
const TOTAL_ROUNDS = 10;      // Rounds per game
const MAX_LIVES    = 3;       // Starting lives
const MIN_DELAY    = 1200;    // Minimum wait before GO (ms)
const MAX_DELAY    = 2500;    // Random extra wait (ms)
const GO_WINDOW    = 1600;    // How long the GO window stays open (ms)

// ---- LEVEL DEFINITIONS ----
// name: rank label | min: XP threshold to unlock
const LEVELS = [
  { name: 'RECRUIT',    min: 0    },
  { name: 'ROOKIE',     min: 300  },
  { name: 'OPERATOR',   min: 600  },
  { name: 'SPECIALIST', min: 1200 },
  { name: 'ELITE',      min: 2000 },
  { name: 'APEX',       min: 3200 },
  { name: 'NEURAL GOD', min: 5000 },
];

// ---- GHOST OPPONENTS ----
// avg: their average reaction time (ms) — harder at higher levels
const GHOSTS = [
  { name: 'ZeroLag_X',   avg: 180 },
  { name: 'NeuralViper',  avg: 210 },
  { name: 'Pulse99',      avg: 240 },
  { name: 'CyberReflex',  avg: 280 },
  { name: 'ByteRunner',   avg: 320 },
];

// ---- GAME STATE ----
let state         = 'idle';  // idle | waiting | go | early | result | gameover
let score         = 0;
let lives         = MAX_LIVES;
let combo         = 0;
let bestTime      = null;
let times         = [];      // Reaction times this game
let round         = 0;
let xp            = 0;
let currentLevel  = 0;
let ghost         = null;    // Current ghost opponent object

// Timer IDs (so we can cancel them)
let goTimeout   = null;
let waitTimeout = null;

// Timestamp when the GO flash appeared
let goStartTime = null;

// ---- DOM HELPERS ----
function getArena() {
  return document.getElementById('arena');
}

// Set the visual state class on the arena
function setArenaState(s) {
  getArena().className = 'arena state-' + s;
}

// Update the arena message and subtitle
function setMsg(msg, sub, color) {
  const msgEl = document.getElementById('arena-msg');
  msgEl.innerHTML = msg;
  msgEl.style.color = color || '#fff';
  document.getElementById('arena-sub').textContent = sub || '';
}

// ---- RATING SYSTEM ----
// Returns a label and CSS class based on reaction time
function getRating(ms) {
  if (ms < 150) return { label: 'NEURAL GOD', cls: 'rating-god'     };
  if (ms < 200) return { label: 'ELITE',      cls: 'rating-elite'   };
  if (ms < 280) return { label: 'FAST',       cls: 'rating-fast'    };
  if (ms < 380) return { label: 'AVERAGE',    cls: 'rating-average' };
  return               { label: 'SLOW',       cls: 'rating-slow'    };
}

// Returns a CSS class for the history dot based on reaction time
function getHistoryClass(ms) {
  if (!ms)      return 'miss';
  if (ms < 200) return 'god';
  if (ms < 280) return 'fast';
  if (ms < 380) return 'ok';
  return 'slow';
}

// ---- UI UPDATES ----

// Refresh the 4 stat boxes (score, best, lives, avg)
function updateStats() {
  document.getElementById('score-display').textContent = score;

  document.getElementById('best-display').textContent = bestTime ? bestTime : '—';

  const avg = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : null;
  document.getElementById('avg-display').textContent = avg ? avg : '—';

  document.getElementById('lives-display').textContent =
    lives > 0 ? ('♥ '.repeat(lives)).trim() : '—';
  document.getElementById('lives-display').className =
    'stat-value' + (lives <= 1 ? ' danger' : '');
}

// Update XP bar and level badge
function updateLevel() {
  // Check for level-up
  while (currentLevel < LEVELS.length - 1 && xp >= LEVELS[currentLevel + 1].min) {
    currentLevel++;
  }

  const lvl  = LEVELS[currentLevel];
  const next = LEVELS[currentLevel + 1];

  document.getElementById('level-badge').textContent = 'LVL ' + (currentLevel + 1);
  document.getElementById('level-name').textContent  = lvl.name;

  let pct = 100;
  if (next) {
    pct = Math.min(100, Math.round(
      ((xp - lvl.min) / (next.min - lvl.min)) * 100
    ));
  }
  document.getElementById('xp-bar').style.width = pct + '%';
}

// Rebuild the round pip indicators
function buildRoundPips() {
  const el = document.getElementById('round-track');
  el.innerHTML = '';
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const d = document.createElement('div');
    d.className = 'round-pip'
      + (i < round ? ' done' : (i === round ? ' current' : ''));
    el.appendChild(d);
  }
}

// Add a reaction-time dot to the history strip
function addHistoryDot(ms, missed) {
  const el  = document.getElementById('history-row');
  const d   = document.createElement('div');
  const cls = missed ? 'miss' : getHistoryClass(ms);
  d.className   = 'history-dot ' + cls;
  d.textContent = missed ? 'X' : (ms < 1000 ? ms : '...');
  el.appendChild(d);
}

// Animate a floating score popup inside the arena
function showScorePop(pts, color) {
  const arena = getArena();
  const el    = document.createElement('div');
  el.className = 'score-pop';
  el.style.color      = color || '#00ffc8';
  el.style.textShadow = '0 0 12px ' + (color || 'rgba(0,255,200,0.8)');
  el.style.left       = (80 + Math.random() * 200) + 'px';
  el.style.top        = (60 + Math.random() * 80)  + 'px';
  el.textContent      = '+' + pts;
  arena.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// Show / hide / update combo multiplier display
function updateCombo() {
  const el  = document.getElementById('combo-display');
  const num = document.getElementById('combo-num');
  if (combo >= 2) {
    el.classList.add('active');
    num.textContent = 'x' + combo;
  } else {
    el.classList.remove('active');
  }
}

// ---- GHOST OPPONENT ----

// Assign a ghost based on current level
function chooseGhost() {
  const idx = Math.min(currentLevel, GHOSTS.length - 1);
  ghost = { ...GHOSTS[idx], variation: 40 };

  document.getElementById('ghost-bar').style.display = '';
  document.getElementById('ghost-name').textContent  = ghost.name;
  document.getElementById('ghost-time').textContent  = ghost.avg + 'ms';
  document.getElementById('ghost-status').className  = 'ghost-status';
  document.getElementById('ghost-status').textContent = 'waiting';
}

// Compare player time vs ghost and update the bar
function resolveGhost(ms) {
  if (!ghost) return false;

  // Ghost has slight random variation each round
  const ghostMs = ghost.avg + (Math.random() * ghost.variation * 2 - ghost.variation);
  const ghostR  = Math.round(ghostMs);

  document.getElementById('ghost-time').textContent = ghostR + 'ms';

  if (ms < ghostMs) {
    document.getElementById('ghost-status').className   = 'ghost-status winning';
    document.getElementById('ghost-status').textContent = 'YOU WIN +' + (ghostR - ms) + 'ms';
    return true;
  } else {
    document.getElementById('ghost-status').className   = 'ghost-status losing';
    document.getElementById('ghost-status').textContent = 'LOST by ' + (ms - ghostR) + 'ms';
    return false;
  }
}

// ---- GAME FLOW ----

// Begin a new round: random wait → GO flash
function startRound() {
  if (lives <= 0 || round >= TOTAL_ROUNDS) { endGame(); return; }

  state = 'waiting';
  setArenaState('wait');
  setMsg('<span style="color:rgba(0,255,200,0.3);font-size:20px">◉</span>', 'Get ready...');
  buildRoundPips();

  // Slightly reduce wait at high combo (reward streaks with faster pace)
  const comboBonus = combo > 3 ? -300 : 0;
  const delay = MIN_DELAY + Math.random() * MAX_DELAY + comboBonus;

  waitTimeout = setTimeout(() => {
    // Show GO!
    state       = 'go';
    goStartTime = performance.now();
    setArenaState('go');
    setMsg('<span style="color:#00ffc8">GO!</span>', 'TAP NOW!', '#00ffc8');

    // Auto-fail if player doesn't tap in time
    goTimeout = setTimeout(() => {
      if (state === 'go') {
        state = 'result';
        combo = 0;
        updateCombo();
        setArenaState('result');
        setMsg('TOO SLOW', 'You missed the window', 'rgba(255,255,255,0.4)');
        addHistoryDot(null, true);
        setTimeout(nextRound, 1200);
      }
    }, GO_WINDOW);

  }, delay);
}

// Advance to next round or end the game
function nextRound() {
  if (lives <= 0 || round >= TOTAL_ROUNDS) { endGame(); return; }
  startRound();
}

// Final results screen
function endGame() {
  clearTimeout(goTimeout);
  clearTimeout(waitTimeout);
  state = 'gameover';
  setArenaState('gameover');

  const avg    = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : null;
  const rating = avg ? getRating(avg) : null;
  const lvl    = LEVELS[currentLevel];

  let html = `<div style="font-size:14px;letter-spacing:3px;color:rgba(255,255,255,0.4)">MISSION COMPLETE</div>`;
  html    += `<div style="font-family:'Orbitron',sans-serif;font-size:38px;font-weight:900;color:#00ffc8;text-shadow:0 0 20px rgba(0,255,200,0.7);margin:8px 0">${score}</div>`;
  html    += `<div style="font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.3)">FINAL SCORE</div>`;
  if (avg) {
    html += `<div style="margin-top:10px"><span class="rating-badge ${rating.cls}">${rating.label} — avg ${avg}ms</span></div>`;
  }
  html += `<div style="font-size:11px;letter-spacing:2px;color:rgba(0,255,200,0.5);margin-top:10px">${lvl.name}</div>`;

  document.getElementById('arena-msg').innerHTML = html;
  document.getElementById('arena-msg').style.color = '#fff';
  document.getElementById('arena-sub').textContent = '';

  // Restore start button as Play Again
  const startBtn = document.getElementById('start-btn');
  startBtn.style.display  = '';
  startBtn.textContent    = '▶ PLAY AGAIN';

  updateStats();
}

// Full reset — wipe everything back to initial state
function handleReset() {
  clearTimeout(goTimeout);
  clearTimeout(waitTimeout);

  state        = 'idle';
  score        = 0;
  lives        = MAX_LIVES;
  combo        = 0;
  round        = 0;
  times        = [];
  bestTime     = null;
  xp           = 0;
  currentLevel = 0;
  ghost        = null;

  document.getElementById('history-row').innerHTML  = '';
  document.getElementById('ghost-bar').style.display = 'none';
  document.getElementById('round-track').innerHTML   = '';

  setArenaState('wait');
  setMsg('READY?', 'Tap START to begin', 'rgba(0,255,200,0.8)');

  const startBtn = document.getElementById('start-btn');
  startBtn.style.display = '';
  startBtn.textContent   = '▶ START';

  updateStats();
  updateCombo();
  updateLevel();
}

// START button handler
function handleStart() {
  // First game OR replay after game over
  if (state === 'idle' || state === 'gameover') {
    // Reset counters for fresh game
    score        = 0;
    lives        = MAX_LIVES;
    combo        = 0;
    round        = 0;
    times        = [];
    bestTime     = null;
    xp           = 0;
    currentLevel = 0;

    document.getElementById('history-row').innerHTML = '';
    updateStats();
    updateCombo();
    updateLevel();
    chooseGhost();

    document.getElementById('start-btn').style.display = 'none';
    startRound();
    return;
  }

  // Tap to continue after seeing a result
  if (state === 'result') {
    nextRound();
  }
}

// ---- ARENA CLICK HANDLER ----
// This handles all player taps on the arena
function handleArenaClick() {

  // EARLY TAP — player clicked before GO
  if (state === 'waiting') {
    clearTimeout(waitTimeout);
    clearTimeout(goTimeout);

    lives--;
    combo = 0;
    updateCombo();
    state = 'early';
    setArenaState('early');
    setMsg('<span style="color:#ff4060">TOO EARLY!</span>', 'Patience, soldier...', '#ff4060');
    addHistoryDot(null, true);
    updateStats();

    setTimeout(nextRound, 1000);
    return;
  }

  // GOOD TAP — player clicked during GO window
  if (state === 'go') {
    clearTimeout(goTimeout);

    const ms = Math.round(performance.now() - goStartTime);
    times.push(ms);
    if (!bestTime || ms < bestTime) bestTime = ms;

    // Scoring formula: faster = more base points, combo multiplies them
    combo++;
    const multiplier = Math.min(combo, 8);           // Cap combo at x8
    const base       = Math.max(10, Math.round((600 - ms) / 5));
    const pts        = base * multiplier;
    score           += pts;

    // Earn XP proportional to score
    xp += Math.round(pts * 0.6);
    updateLevel();
    updateCombo();

    // Show floating score popup
    const popColor = combo >= 5 ? '#ffd700' : (ms < 200 ? '#00b4ff' : '#00ffc8');
    showScorePop(pts, popColor);

    // Check ghost result
    resolveGhost(ms);

    // Build result display
    const rating   = getRating(ms);
    const msHtml   = `<div class="reaction-time">${ms}<span class="reaction-ms">ms</span></div>`;
    const badgeHtml = `<span class="rating-badge ${rating.cls}">${rating.label}</span>`;
    const comboHtml = combo > 1
      ? `<div style="font-size:13px;color:#ff9500;letter-spacing:2px;margin-top:8px">COMBO x${combo} → +${pts} pts</div>`
      : '';

    setArenaState('result');
    state = 'result';
    document.getElementById('arena-msg').innerHTML    = msHtml + badgeHtml + comboHtml;
    document.getElementById('arena-msg').style.color = '#fff';
    document.getElementById('arena-sub').textContent = 'Tap to continue';

    addHistoryDot(ms);
    round++;
    buildRoundPips();
    updateStats();

    // Auto-end if final round
    if (round >= TOTAL_ROUNDS) {
      setTimeout(endGame, 1400);
    }
    return;
  }

  // TAP ON RESULT SCREEN — advance
  if (state === 'result') {
    nextRound();
  }
}

// ---- EVENT LISTENERS ----
document.getElementById('arena').addEventListener('click', handleArenaClick);

// ---- INIT ----
buildRoundPips();
