(() => {
  const STORAGE_KEY = 'padel-americano-v1';
  const view = document.getElementById('view');
  const actions = document.getElementById('actions');
  const wakeToggle = document.getElementById('wakeToggle');

  // ---------- State ----------
  const defaultState = () => ({
    screen: 'setup',           // 'setup' | 'play' | 'done'
    players: ['', '', '', ''], // names
    pointsPerMatch: 21,        // total points per match (americano typical 16/21/24/32)
    rounds: [],                // [{ matches: [{ teamA:[i,j], teamB:[k,l], scoreA, scoreB }], resting: [..] }]
    currentRound: 0,
  });

  let state = load() || defaultState();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  function reset() {
    state = defaultState();
    save();
    render();
  }

  // ---------- Wake Lock ----------
  let wakeLock = null;
  async function enableWakeLock() {
    if (!('wakeLock' in navigator)) {
      alert('Keep-screen-on not supported on this browser/device.');
      wakeToggle.checked = false;
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { /* released */ });
    } catch (e) {
      wakeToggle.checked = false;
    }
  }
  async function disableWakeLock() {
    if (wakeLock) { try { await wakeLock.release(); } catch {} wakeLock = null; }
  }
  wakeToggle.addEventListener('change', () => {
    if (wakeToggle.checked) enableWakeLock(); else disableWakeLock();
    localStorage.setItem('padel-wake', wakeToggle.checked ? '1' : '0');
  });
  // Re-acquire on visibility change
  document.addEventListener('visibilitychange', () => {
    if (wakeToggle.checked && document.visibilityState === 'visible' && !wakeLock) {
      enableWakeLock();
    }
  });
  // Restore wake preference
  if (localStorage.getItem('padel-wake') === '1') {
    wakeToggle.checked = true;
    enableWakeLock();
  }

  // ---------- Scheduler ----------
  // Generate a round-robin-ish schedule of rounds. Each round has matches of 2v2 on
  // floor(N/4) courts. Players not playing rest that round (rotated).
  // Greedy: minimize repeat partners, then repeat opponents.
  function generateSchedule(players, numRounds) {
    const n = players.length;
    const idx = players.map((_, i) => i);
    const partnerCount = Array.from({ length: n }, () => new Array(n).fill(0));
    const opponentCount = Array.from({ length: n }, () => new Array(n).fill(0));
    const restCount = new Array(n).fill(0);
    const rounds = [];

    for (let r = 0; r < numRounds; r++) {
      // Decide who rests: pick those with lowest restCount, then by index for determinism
      const restNeeded = n % 4;
      const sortedForRest = [...idx].sort((a, b) => {
        if (restCount[a] !== restCount[b]) return restCount[a] - restCount[b];
        return a - b;
      });
      const resting = sortedForRest.slice(0, restNeeded);
      resting.forEach(i => restCount[i]++);
      const restSet = new Set(resting);
      const playing = idx.filter(i => !restSet.has(i));

      // Greedy form matches: pick 4 at a time minimizing partner+opponent repeats
      const remaining = new Set(playing);
      const matches = [];
      while (remaining.size >= 4) {
        const arr = [...remaining];
        // Best 4-tuple split (a,b vs c,d) minimizing total interaction cost
        let best = null;
        // Limit search: pick lowest interaction first player as anchor
        const anchor = arr.reduce((a, b) => {
          const sa = arr.reduce((s, x) => s + partnerCount[a][x] + opponentCount[a][x], 0);
          const sb = arr.reduce((s, x) => s + partnerCount[b][x] + opponentCount[b][x], 0);
          return sa <= sb ? a : b;
        });
        const others = arr.filter(x => x !== anchor);
        for (let i = 0; i < others.length; i++) {
          for (let j = i + 1; j < others.length; j++) {
            for (let k = j + 1; k < others.length; k++) {
              const four = [anchor, others[i], others[j], others[k]];
              // 3 ways to split 4 into 2v2
              const splits = [
                [[four[0], four[1]], [four[2], four[3]]],
                [[four[0], four[2]], [four[1], four[3]]],
                [[four[0], four[3]], [four[1], four[2]]],
              ];
              for (const [A, B] of splits) {
                const cost =
                  partnerCount[A[0]][A[1]] * 10 +
                  partnerCount[B[0]][B[1]] * 10 +
                  opponentCount[A[0]][B[0]] +
                  opponentCount[A[0]][B[1]] +
                  opponentCount[A[1]][B[0]] +
                  opponentCount[A[1]][B[1]];
                if (!best || cost < best.cost) {
                  best = { cost, A, B, four };
                }
              }
            }
          }
        }
        const { A, B, four } = best;
        matches.push({ teamA: A, teamB: B, scoreA: null, scoreB: null });
        partnerCount[A[0]][A[1]]++; partnerCount[A[1]][A[0]]++;
        partnerCount[B[0]][B[1]]++; partnerCount[B[1]][B[0]]++;
        for (const a of A) for (const b of B) {
          opponentCount[a][b]++; opponentCount[b][a]++;
        }
        four.forEach(x => remaining.delete(x));
      }

      rounds.push({ matches, resting });
    }
    return rounds;
  }

  function defaultRoundsFor(n) {
    // Reasonable defaults: each player plays roughly (n-1) matches in americano.
    // We schedule n-1 rounds (or a bit fewer for small n).
    if (n <= 4) return 3;
    if (n <= 6) return 5;
    if (n <= 8) return 7;
    return n - 1;
  }

  // ---------- Rendering ----------
  function clear() { view.innerHTML = ''; actions.innerHTML = ''; }

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function renderSetup() {
    clear();
    const h = el('h2', {}, 'Players');
    view.appendChild(h);

    state.players.forEach((name, i) => {
      const row = el('div', { class: 'player-row' });
      const input = el('input', {
        type: 'text',
        placeholder: `Player ${i + 1}`,
        value: name,
        autocomplete: 'off',
        autocapitalize: 'words',
      });
      input.addEventListener('input', (e) => {
        state.players[i] = e.target.value;
        save();
        updateStartButton();
      });
      row.appendChild(input);
      if (state.players.length > 4) {
        row.appendChild(el('button', {
          class: 'icon-btn',
          'aria-label': 'Remove',
          onclick: () => { state.players.splice(i, 1); save(); renderSetup(); }
        }, '×'));
      }
      view.appendChild(row);
    });

    view.appendChild(el('div', { class: 'muted', style: 'margin-top:0.5rem;' },
      'Min 4 players. Adds rest rotation if not multiple of 4.'));

    view.appendChild(el('button', {
      class: 'btn secondary',
      style: 'margin-top:1rem;',
      onclick: () => { state.players.push(''); save(); renderSetup(); }
    }, '+ Add player'));

    // points per match
    const presets = [16, 21, 24, 32];
    const pts = el('div', { style: 'margin-top:1.5rem;' });
    pts.appendChild(el('h2', {}, 'Points per match'));
    const ptsRow = el('div', { class: 'player-row' });
    presets.forEach(p => {
      const b = el('button', {
        class: 'btn ' + (state.pointsPerMatch === p ? '' : 'secondary'),
        style: 'flex:1; padding-left:0; padding-right:0;',
        onclick: () => { state.pointsPerMatch = p; save(); renderSetup(); }
      }, String(p));
      ptsRow.appendChild(b);
    });
    const custom = el('input', {
      type: 'number',
      inputmode: 'numeric',
      min: '1',
      max: '99',
      class: 'score-input',
      style: 'flex:1; width:auto;',
      placeholder: 'Custom',
      value: presets.includes(state.pointsPerMatch) ? '' : String(state.pointsPerMatch),
    });
    custom.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        state.pointsPerMatch = v;
        save();
        // Update preset highlight without losing focus
        ptsRow.querySelectorAll('button').forEach((b, i) => {
          b.className = 'btn ' + (state.pointsPerMatch === presets[i] ? '' : 'secondary');
        });
      }
    });
    ptsRow.appendChild(custom);
    pts.appendChild(ptsRow);
    view.appendChild(pts);

    const startBtn = el('button', {
      class: 'btn',
      id: 'startBtn',
      onclick: startMatch,
    }, 'Start match');
    actions.appendChild(startBtn);

    const backLink = el('a', { class: 'back-link', href: '/' }, '← back');
    actions.appendChild(backLink);

    updateStartButton();
  }

  function updateStartButton() {
    const btn = document.getElementById('startBtn');
    if (!btn) return;
    const names = state.players.map(s => s.trim()).filter(Boolean);
    const ok = names.length >= 4 && names.length === new Set(names).size;
    btn.disabled = !ok;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startMatch() {
    const names = state.players.map(s => s.trim()).filter(Boolean);
    if (names.length < 4) return;
    state.players = shuffle(names);
    const numRounds = defaultRoundsFor(state.players.length);
    state.rounds = generateSchedule(state.players, numRounds);
    state.currentRound = 0;
    state.screen = 'play';
    save();
    render();
  }

  function renderPlay() {
    clear();
    const round = state.rounds[state.currentRound];
    if (!round) { renderDone(); return; }

    const head = el('div', { class: 'round-head' });
    head.appendChild(el('div', {}, el('h2', {}, 'Round'), el('div', { class: 'num' },
      `${state.currentRound + 1} / ${state.rounds.length}`)));
    head.appendChild(el('div', { class: 'muted', style: 'text-align:right;' },
      `to ${state.pointsPerMatch}`));
    view.appendChild(head);

    round.matches.forEach((m, mi) => {
      const card = el('div', { class: 'match' });
      card.appendChild(el('div', { class: 'court' }, `Court ${mi + 1}`));

      const teamA = el('div', { class: 'team' });
      teamA.appendChild(el('div', { class: 'names' },
        m.teamA.map(i => state.players[i]).join(' & ')));
      const inputA = el('input', {
        type: 'number',
        inputmode: 'numeric',
        min: '0',
        max: String(state.pointsPerMatch),
        class: 'score-input',
        placeholder: '0',
        value: m.scoreA != null ? String(m.scoreA) : '',
      });
      inputA.addEventListener('input', () => onScoreChange(mi, 'A', inputA, inputB));
      teamA.appendChild(inputA);
      card.appendChild(teamA);

      card.appendChild(el('div', { class: 'vs' }, 'VS'));

      const teamB = el('div', { class: 'team' });
      teamB.appendChild(el('div', { class: 'names' },
        m.teamB.map(i => state.players[i]).join(' & ')));
      const inputB = el('input', {
        type: 'number',
        inputmode: 'numeric',
        min: '0',
        max: String(state.pointsPerMatch),
        class: 'score-input',
        placeholder: '0',
        value: m.scoreB != null ? String(m.scoreB) : '',
      });
      inputB.addEventListener('input', () => onScoreChange(mi, 'B', inputB, inputA));
      teamB.appendChild(inputB);
      card.appendChild(teamB);
      view.appendChild(card);
    });

    if (round.resting && round.resting.length) {
      view.appendChild(el('div', { class: 'resting' },
        'Resting: ' + round.resting.map(i => state.players[i]).join(', ')));
    }

    // Leaderboard so far
    view.appendChild(renderLeaderboard(true));

    const nextBtn = el('button', {
      class: 'btn',
      id: 'nextBtn',
      onclick: nextRound,
    }, state.currentRound === state.rounds.length - 1 ? 'Finish' : 'Next round →');
    actions.appendChild(nextBtn);

    if (state.currentRound > 0) {
      actions.appendChild(el('button', {
        class: 'btn secondary',
        onclick: () => { state.currentRound--; save(); render(); }
      }, '← Previous'));
    }

    actions.appendChild(el('button', {
      class: 'btn danger',
      onclick: () => { if (confirm('Reset the whole match?')) reset(); }
    }, 'Reset'));

    validateRoundComplete();
  }

  function onScoreChange(mi, side, inputEl, otherEl) {
    const m = state.rounds[state.currentRound].matches[mi];
    const max = state.pointsPerMatch;
    let v = inputEl.value === '' ? null : parseInt(inputEl.value, 10);
    if (v != null && (isNaN(v) || v < 0)) v = 0;
    if (v != null && v > max) v = max;

    if (side === 'A') {
      m.scoreA = v;
      m.scoreB = v == null ? null : max - v;
    } else {
      m.scoreB = v;
      m.scoreA = v == null ? null : max - v;
    }
    if (otherEl && document.activeElement !== otherEl) {
      otherEl.value = (side === 'A' ? m.scoreB : m.scoreA) ?? '';
    }

    save();
    validateRoundComplete();
  }

  function validateRoundComplete() {
    const btn = document.getElementById('nextBtn');
    if (!btn) return;
    const round = state.rounds[state.currentRound];
    const complete = round.matches.every(m =>
      m.scoreA != null && m.scoreB != null && (m.scoreA + m.scoreB === state.pointsPerMatch)
    );
    btn.disabled = !complete;
    btn.textContent = complete
      ? (state.currentRound === state.rounds.length - 1 ? 'Finish' : 'Next round →')
      : `Scores must sum to ${state.pointsPerMatch}`;
  }

  function nextRound() {
    if (state.currentRound === state.rounds.length - 1) {
      state.screen = 'done';
    } else {
      state.currentRound++;
    }
    save();
    render();
  }

  function computeStandings() {
    const scores = state.players.map((name, i) => ({ i, name, points: 0, played: 0 }));
    for (const round of state.rounds) {
      for (const m of round.matches) {
        if (m.scoreA == null || m.scoreB == null) continue;
        for (const p of m.teamA) { scores[p].points += m.scoreA; scores[p].played++; }
        for (const p of m.teamB) { scores[p].points += m.scoreB; scores[p].played++; }
      }
    }
    scores.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return scores;
  }

  function renderPodium(standings) {
    // Order on display: 2nd, 1st, 3rd (silver, gold, bronze)
    const top3 = standings.slice(0, 3);
    if (top3.length < 2) return null;
    const podium = el('div', { class: 'podium' });
    const order = [
      { rank: 2, place: 'left' },
      { rank: 1, place: 'center' },
      { rank: 3, place: 'right' },
    ];
    for (const o of order) {
      const s = top3[o.rank - 1];
      if (!s) {
        podium.appendChild(el('div', { class: 'podium-col empty' }));
        continue;
      }
      const col = el('div', { class: `podium-col p${o.rank}` });
      col.appendChild(el('div', { class: 'medal' },
        o.rank === 1 ? '🥇' : o.rank === 2 ? '🥈' : '🥉'));
      col.appendChild(el('div', { class: 'p-name' }, s.name));
      col.appendChild(el('div', { class: 'p-pts' }, `${s.points} pts`));
      col.appendChild(el('div', { class: 'p-block' }, String(o.rank)));
      podium.appendChild(col);
    }
    return podium;
  }

  function renderLeaderboard(compact = false) {
    const wrap = el('div', { style: 'margin-top:1.5rem;' });
    wrap.appendChild(el('h2', {}, compact ? 'Standings' : 'Final standings'));
    const standings = computeStandings();
    if (!compact) {
      const podium = renderPodium(standings);
      if (podium) wrap.appendChild(podium);
    }
    const table = el('table', { class: 'lb' });
    const thead = el('thead');
    thead.appendChild(el('tr', {},
      el('th', { class: 'rank' }, '#'),
      el('th', {}, 'Player'),
      el('th', { class: 'num' }, 'Pts')));
    table.appendChild(thead);
    const tbody = el('tbody');
    standings.forEach((s, idx) => {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'rank' }, String(idx + 1)),
        el('td', {}, s.name),
        el('td', { class: 'num' }, String(s.points))));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function rematch() {
    const players = state.players.slice();
    const pointsPerMatch = state.pointsPerMatch;
    state = defaultState();
    state.players = players;
    state.pointsPerMatch = pointsPerMatch;
    // Start immediately with a fresh shuffled schedule
    state.players = shuffle(players);
    state.rounds = generateSchedule(state.players, defaultRoundsFor(state.players.length));
    state.screen = 'play';
    state.currentRound = 0;
    save();
    render();
  }

  function renderDone() {
    clear();
    view.appendChild(renderLeaderboard(false));
    actions.appendChild(el('button', {
      class: 'btn',
      onclick: rematch,
    }, 'Rematch (same players)'));
    actions.appendChild(el('button', {
      class: 'btn secondary',
      onclick: () => { state.screen = 'play'; state.currentRound = state.rounds.length - 1; save(); render(); }
    }, '← Back to last round'));
    actions.appendChild(el('button', {
      class: 'btn danger',
      onclick: () => { if (confirm('Start a new match?')) reset(); }
    }, 'New match'));
  }

  function render() {
    if (state.screen === 'setup') renderSetup();
    else if (state.screen === 'play') renderPlay();
    else renderDone();
  }

  render();
})();
