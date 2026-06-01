// ---------- Nord-norsk ros ----------
const ROS = [
  'Faen i helvete så sterk du e, gut!',
  'No svetta sjølve berget, æ lova!',
  'Du knuste det der som ei tørrfisk mot kaikanten!',
  'Steike mæ flat, det der va jo reint vannvidd!',
  'Æ trur faktisk havet trakk sæ tilbake av respekt for dæ!',
  'Sterkar enn en olm okse, for svarte!',
  'Du e jo bygd som ei fiskebåt i storm, ditt beist!',
  'Helvete heite, der datt kjeften av heile gjengen!',
  'Det der va så bra at æ måtte ut å skrike mot havet!',
  'No rista det i fjella, for faen!',
  'Du trena så hardt at nordlyset blei misunnelig på dæ!',
  'Pokker ta mæ, der gjekk det varmt i lavvoen!',
  'Sterkar enn kaffe kokt tre gång på ein jævla torsdag!',
  'No e du offisielt kongen av heile haugen, for faen!',
  'Æ e så stolt at æ mest tar te tåra, ditt råskinn!',
  'Det der va meir imponerande enn ei kvalsafari uten kval!',
  'Faen så godt jobba, der svetta sjølve fjellveggen!',
  'Du e jo rein dynamitt, æ måtte sett mæ ned!',
  'Helvete så heftig, no klappa sjøsaman på heile kysten!',
  'Æ har aldri sett makan, du e jo et naturfenomen, gut!',
];
function pickRos() { return ROS[Math.floor(Math.random() * ROS.length)]; }

// ---------- Storage ----------
const LS_PRESETS = 'circuitTimer.presets';
const LS_LAST = 'circuitTimer.last';

const DEFAULT_PRESETS = {
  'Full body': {
    warmup: 0,
    exTime: 40,
    restEx: 20,
    sets: 3,
    restSet: 120,
    exercises: [
      'Hang ups',
      'Bulgarske utfall',
      'Rygghev',
      'Push ups',
      'Dips',
      'Sit ups',
      'Burpees',
    ],
  },
};

function loadPresets() {
  try {
    const raw = localStorage.getItem(LS_PRESETS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return structuredClone(DEFAULT_PRESETS);
}

function savePresets(p) {
  localStorage.setItem(LS_PRESETS, JSON.stringify(p));
}

function loadLast() {
  try {
    const raw = localStorage.getItem(LS_LAST);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return structuredClone(DEFAULT_PRESETS['Full body']);
}

function saveLast(cfg) {
  localStorage.setItem(LS_LAST, JSON.stringify(cfg));
}

const DEFAULT_EX_TIME = 40;

// Normalize config to current schema (exercises = [{name, time}]).
function normalizeConfig(c) {
  c = c || {};
  c.warmup = Number.isFinite(c.warmup) ? c.warmup : 0;
  c.restEx = Number.isFinite(c.restEx) ? c.restEx : 20;
  c.sets = Number.isFinite(c.sets) ? c.sets : 3;
  c.restSet = Number.isFinite(c.restSet) ? c.restSet : 120;
  const defT = Number.isFinite(c.exTime) ? c.exTime : DEFAULT_EX_TIME;
  c.exercises = (c.exercises || []).map((e) =>
    typeof e === 'string'
      ? { name: e, time: defT }
      : { name: e.name || '', time: Number.isFinite(e.time) ? e.time : defT }
  );
  delete c.exTime;
  return c;
}

// ---------- State ----------
let presets = loadPresets();
let config = normalizeConfig(loadLast());
let selectedPreset = ''; // name of the preset currently selected in the dropdown

const view = document.getElementById('view');
const actions = document.getElementById('actions');

// ---------- Icons ----------
const ICONS = {
  play: '<polygon points="6 4 20 12 6 20 6 4"></polygon>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"></rect>',
  next: '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line>',
  prev: '<polygon points="19 4 9 12 19 20 19 4"></polygon><line x1="5" y1="5" x2="5" y2="19"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
  reload: '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>',
  x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  restart: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
  award: '<circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.87"></polyline>',
  grip: '<circle cx="9" cy="6" r="1.3"></circle><circle cx="15" cy="6" r="1.3"></circle><circle cx="9" cy="12" r="1.3"></circle><circle cx="15" cy="12" r="1.3"></circle><circle cx="9" cy="18" r="1.3"></circle><circle cx="15" cy="18" r="1.3"></circle>',
};
const FILLED = new Set(['play', 'pause', 'stop', 'next', 'prev', 'grip']);
function icon(name, size = 18) {
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// ---------- Helpers ----------
function clampInt(v, min, fallback) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < min) return fallback;
  return n;
}

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function totalSeconds(c) {
  const n = c.exercises.length;
  if (n === 0 || c.sets === 0) return c.warmup;
  const work = c.exercises.reduce((s, e) => s + e.time, 0);
  const setWork = work + (n - 1) * c.restEx;
  return c.warmup + c.sets * setWork + (c.sets - 1) * c.restSet;
}

// ---------- Beeps ----------
let audioCtx;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, dur, when = 0, peak = 0.35) {
  try {
    const ctx = ensureAudio();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    const attack = 0.008;
    const release = Math.min(0.05, dur * 0.5);
    const sustainEnd = Math.max(t + attack, t + dur - release);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, sustainEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.gain.setValueAtTime(0, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  } catch (e) {}
}
const beepCount = () => beep(700, 0.12);
const beepGo = () => beep(1050, 0.25);
const beepDone = () => { beep(880, 0.2, 0); beep(1100, 0.25, 0.2); beep(1320, 0.4, 0.42); };

// ---------- Wake lock ----------
// Screen is kept awake automatically while a workout is running.
let wakeLock = null;
async function requestWake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && runState && !wakeLock) requestWake();
});

// ---------- Build timeline ----------
function buildSteps(c) {
  const steps = [];
  if (c.warmup > 0) steps.push({ kind: 'warmup', name: 'Warm up', dur: c.warmup });
  for (let s = 0; s < c.sets; s++) {
    for (let e = 0; e < c.exercises.length; e++) {
      const ex = c.exercises[e];
      steps.push({
        kind: 'work',
        name: ex.name || `Exercise ${e + 1}`,
        dur: ex.time,
        set: s + 1,
      });
      const lastExercise = e === c.exercises.length - 1;
      if (!lastExercise && c.restEx > 0) {
        steps.push({ kind: 'rest', name: 'Rest', dur: c.restEx, set: s + 1 });
      }
    }
    const lastSet = s === c.sets - 1;
    if (!lastSet && c.restSet > 0) {
      steps.push({ kind: 'restSet', name: 'Set rest', dur: c.restSet, set: s + 1 });
    }
  }
  return steps;
}

// =================================================================
// SETUP VIEW
// =================================================================
function renderSetup() {
  releaseWake();
  clearBodyPhase();
  view.innerHTML = '';

  // Build preset selector (placed in footer below Start)
  const bar = document.createElement('div');
  bar.className = 'preset-bar';
  const sel = document.createElement('select');
  const optNew = document.createElement('option');
  optNew.value = '';
  optNew.textContent = '— select preset —';
  sel.appendChild(optNew);
  Object.keys(presets).forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  if (selectedPreset && presets[selectedPreset]) sel.value = selectedPreset;
  // Selecting a preset loads it immediately
  sel.onchange = () => {
    if (sel.value && presets[sel.value]) {
      selectedPreset = sel.value;
      config = normalizeConfig(structuredClone(presets[sel.value]));
      saveLast(config);
      renderSetup();
    } else {
      selectedPreset = '';
    }
  };
  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn danger';
  delBtn.innerHTML = icon('trash');
  delBtn.title = 'Delete selected preset';
  let delArmed = false;
  delBtn.onclick = () => {
    const name = sel.value;
    if (!name || !presets[name]) { sel.focus(); return; }
    if (!delArmed) {
      delArmed = true;
      delBtn.classList.add('armed');
      delBtn.title = `Tap again to delete "${name}"`;
      setTimeout(() => {
        delArmed = false;
        delBtn.classList.remove('armed');
        delBtn.title = 'Delete selected preset';
      }, 2500);
      return;
    }
    delete presets[name];
    savePresets(presets);
    selectedPreset = '';
    renderSetup();
  };
  bar.append(sel, delBtn);

  // ----- Total + visual bar (top, so you see the plan at a glance) -----
  const total = document.createElement('div');
  total.className = 'total';
  total.innerHTML = `
    <div class="total-head">
      <span class="lbl">Total time</span>
      <span class="val" id="totalVal"></span>
    </div>
    <div class="timebar" id="timebar"></div>
    <div class="legend">
      <span class="it"><span class="sw warmup"></span>Warm up</span>
      <span class="it"><span class="sw work"></span>Exercise</span>
      <span class="it"><span class="sw rest"></span>Rest</span>
      <span class="it"><span class="sw restSet"></span>Set rest</span>
    </div>`;
  view.appendChild(total);

  // ----- Start (top, no scrolling needed for sane defaults) -----
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-start';
  startBtn.innerHTML = icon('play') + '<span>Start</span>';
  startBtn.onclick = () => {
    if (config.exercises.length === 0) { alert('Add at least one exercise.'); return; }
    saveLast(config);
    ensureAudio(); // unlock audio on user gesture (silent)
    startRun();
  };
  view.appendChild(startBtn);

  // ----- Exercises -----
  const h2 = document.createElement('h2');
  h2.textContent = `Exercises (${config.exercises.length})`;
  view.appendChild(h2);

  const list = document.createElement('div');
  list.id = 'exList';
  view.appendChild(list);
  renderExList(list, h2);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn secondary';
  addBtn.innerHTML = icon('plus') + '<span>Add exercise</span>';
  addBtn.style.marginTop = '0.25rem';
  addBtn.onclick = () => {
    const last = config.exercises[config.exercises.length - 1];
    config.exercises.push({ name: '', time: last ? last.time : DEFAULT_EX_TIME });
    renderExList(list, h2);
    updateTotal();
    saveLast(config);
  };
  view.appendChild(addBtn);

  // ----- Timing (below, tweak when needed) -----
  const h1 = document.createElement('h2');
  h1.textContent = 'Timing';
  view.appendChild(h1);

  view.appendChild(numberField('Warm up', 'seconds', config.warmup, 0, (v) => (config.warmup = v)));
  view.appendChild(numberField('Rest between exercises', 'seconds', config.restEx, 0, (v) => (config.restEx = v)));
  view.appendChild(numberField('Sets', 'rounds of all exercises', config.sets, 1, (v) => (config.sets = v)));
  view.appendChild(numberField('Rest between sets', 'seconds', config.restSet, 0, (v) => (config.restSet = v)));

  updateTotal();

  // ----- Actions (footer): presets, save, home -----
  actions.innerHTML = '';
  const presetWrap = document.createElement('div');
  presetWrap.className = 'preset-group';
  const presetLbl = document.createElement('h2');
  presetLbl.textContent = 'Presets';

  const saveRow = document.createElement('div');
  saveRow.className = 'preset-bar';
  const nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.className = 'preset-name';
  nameInp.placeholder = 'New preset name';
  nameInp.value = selectedPreset || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'icon-btn preset-save';
  saveBtn.innerHTML = icon('save');
  saveBtn.title = 'Save preset';
  const doSave = () => {
    const name = nameInp.value.trim();
    if (!name) { nameInp.focus(); return; }
    presets[name] = structuredClone(config);
    savePresets(presets);
    selectedPreset = name;
    renderSetup();
  };
  saveBtn.onclick = doSave;
  nameInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSave(); }
  });
  saveRow.append(nameInp, saveBtn);
  presetWrap.append(presetLbl, bar, saveRow);

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '/';
  back.innerHTML = icon('home', 14) + '<span>home</span>';

  actions.append(presetWrap, back);
}

function numberField(label, sub, value, min, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.innerHTML = `${label}<span class="sub">${sub}</span>`;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'num-input';
  inp.inputMode = 'numeric';
  inp.min = String(min);
  inp.value = String(value);
  inp.onchange = () => {
    const v = clampInt(inp.value, min, value);
    inp.value = String(v);
    onChange(v);
    saveLast(config);
    updateTotal();
  };
  f.append(l, inp);
  return f;
}

function renderExList(list, heading) {
  list.innerHTML = '';
  config.exercises.forEach((ex) => list.appendChild(makeExRow(ex, list, heading)));
  refreshExIdx(list);
  if (heading) heading.textContent = `Exercises (${config.exercises.length})`;
}

function refreshExIdx(list) {
  [...list.children].forEach((row, i) => {
    const idx = row.querySelector('.idx');
    if (idx) idx.textContent = i + 1;
    const nameInp = row.querySelector('input[type=text]');
    if (nameInp) nameInp.placeholder = `Exercise ${i + 1}`;
  });
}

function commitExOrder(list, heading) {
  config.exercises = [...list.children].map((row) => row._ex);
  refreshExIdx(list);
  saveLast(config);
  updateTotal();
  if (heading) heading.textContent = `Exercises (${config.exercises.length})`;
}

function makeExRow(ex, list, heading) {
  const row = document.createElement('div');
  row.className = 'ex-row';
  row._ex = ex;

  const handle = document.createElement('button');
  handle.className = 'drag-handle';
  handle.innerHTML = icon('grip');
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-label', 'Drag to reorder');
  attachDrag(handle, row, list, heading);

  const idx = document.createElement('span');
  idx.className = 'idx';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = ex.name;
  inp.oninput = () => { ex.name = inp.value; saveLast(config); };

  const timeWrap = document.createElement('div');
  timeWrap.className = 'time-wrap';
  const tinp = document.createElement('input');
  tinp.type = 'number';
  tinp.className = 'ex-time';
  tinp.inputMode = 'numeric';
  tinp.min = '1';
  tinp.value = String(ex.time);
  tinp.title = 'Seconds for this exercise';
  tinp.onchange = () => {
    const v = clampInt(tinp.value, 1, ex.time);
    tinp.value = String(v);
    ex.time = v;
    saveLast(config);
    updateTotal();
  };
  const unit = document.createElement('span');
  unit.className = 'unit';
  unit.textContent = 's';
  timeWrap.append(tinp, unit);

  const del = document.createElement('button');
  del.className = 'icon-btn danger';
  del.innerHTML = icon('x');
  del.title = 'Remove';
  del.onclick = () => {
    const i = config.exercises.indexOf(ex);
    if (i >= 0) config.exercises.splice(i, 1);
    renderExList(list, heading);
    updateTotal();
    saveLast(config);
  };

  row.append(handle, idx, inp, timeWrap, del);
  return row;
}

// Pointer-based drag reordering (works with touch + mouse)
function attachDrag(handle, row, list, heading) {
  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const y = e.clientY;
    const siblings = [...list.children].filter((r) => r !== row);
    let inserted = false;
    for (const r of siblings) {
      const rect = r.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        list.insertBefore(row, r);
        inserted = true;
        break;
      }
    }
    if (!inserted) list.appendChild(row);
    refreshExIdx(list);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    row.classList.remove('dragging');
    document.body.classList.remove('is-reordering');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    commitExOrder(list, heading);
  };

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    row.classList.add('dragging');
    document.body.classList.add('is-reordering');
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

function updateTotal() {
  const el = document.getElementById('totalVal');
  if (el) el.textContent = fmt(totalSeconds(config));
  renderTimeBar();
}

function renderTimeBar() {
  const bar = document.getElementById('timebar');
  if (!bar) return;
  const steps = buildSteps(config);
  const total = steps.reduce((s, st) => s + st.dur, 0);
  bar.innerHTML = '';
  if (total <= 0) return;
  steps.forEach((st) => {
    const seg = document.createElement('div');
    seg.className = 'seg ' + (st.kind === 'restSet' ? 'restSet' : st.kind);
    seg.style.width = (st.dur / total * 100) + '%';
    seg.title = `${st.name} · ${fmt(st.dur)}`;
    bar.appendChild(seg);
  });
}

// =================================================================
// RUN VIEW
// =================================================================
let runState = null;

function startRun() {
  const steps = buildSteps(config);
  if (steps.length === 0) { alert('Nothing to run.'); return; }
  requestWake();
  runState = {
    steps,
    i: 0,
    remaining: steps[0].dur,
    paused: false,
    lastTick: performance.now(),
    done: false,
    lastBeepSecond: null,
  };
  renderRun();
  loopStart();
}

let rafId = null;
function loopStart() {
  cancelAnimationFrame(rafId);
  runState.lastTick = performance.now();
  const tick = (now) => {
    if (!runState) return;
    if (!runState.paused && !runState.done) {
      const dt = (now - runState.lastTick) / 1000;
      runState.lastTick = now;
      runState.remaining -= dt;

      const secLeft = Math.ceil(runState.remaining);
      if (secLeft <= 3 && secLeft >= 1 && secLeft !== runState.lastBeepSecond) {
        runState.lastBeepSecond = secLeft;
        beepCount();
      }

      if (runState.remaining <= 0) {
        advance();
      }
      updateRunUI();
    } else {
      runState.lastTick = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function advance() {
  runState.i++;
  runState.lastBeepSecond = null;
  if (runState.i >= runState.steps.length) {
    runState.done = true;
    runState.remaining = 0;
    beepDone();
    renderRun();
    return;
  }
  runState.remaining = runState.steps[runState.i].dur;
  beepGo();
  renderRun();
}

function skipStep() {
  if (!runState || runState.done) return;
  runState.remaining = 0.0001;
  advance();
}

function prevStep() {
  if (!runState) return;
  runState.done = false;
  runState.i = Math.max(0, runState.i - 1);
  runState.remaining = runState.steps[runState.i].dur;
  runState.lastBeepSecond = null;
  renderRun();
}

function togglePause() {
  if (!runState || runState.done) return;
  runState.paused = !runState.paused;
  runState.lastTick = performance.now();
  renderRun();
}

function stopRun() {
  cancelAnimationFrame(rafId);
  runState = null;
  releaseWake();
  clearBodyPhase();
  renderSetup();
}

function classFor(kind) {
  if (kind === 'work') return 'work';
  if (kind === 'warmup') return 'warmup';
  if (kind === 'restSet') return 'restSet';
  return 'rest';
}

const PHASE_CLASSES = ['phase-work', 'phase-warmup', 'phase-rest', 'phase-restSet', 'phase-done'];
function setBodyPhase(name) {
  document.body.classList.add('is-running');
  PHASE_CLASSES.forEach((c) => document.body.classList.remove(c));
  if (name) document.body.classList.add('phase-' + name);
}
function clearBodyPhase() {
  document.body.classList.remove('is-running', ...PHASE_CLASSES);
}

function nextWorkName(i) {
  for (let k = i + 1; k < runState.steps.length; k++) {
    if (runState.steps[k].kind === 'work') return runState.steps[k].name;
  }
  return null;
}

function renderRun() {
  view.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'run';

  if (runState.done) {
    wrap.classList.add('done');
    setBodyPhase('done');
    wrap.innerHTML = `
      <div class="done-emoji">💪</div>
      <div class="done-title">Done!</div>
      <div class="done-ros">${pickRos()}</div>
      <div class="done-stats">
        <div><b>${fmt(totalSeconds(config))}</b><span>total</span></div>
        <div><b>${config.sets}</b><span>sets</span></div>
        <div><b>${config.exercises.length}</b><span>exercises</span></div>
      </div>
    `;
    view.appendChild(wrap);
    actions.innerHTML = '';
    const again = document.createElement('button');
    again.className = 'btn';
    again.innerHTML = icon('restart') + '<span>Restart</span>';
    again.onclick = startRun;
    const done = document.createElement('button');
    done.className = 'btn secondary';
    done.textContent = 'Back to setup';
    done.onclick = stopRun;
    actions.append(again, done);
    return;
  }

  const step = runState.steps[runState.i];
  wrap.classList.add(classFor(step.kind));
  setBodyPhase(classFor(step.kind));

  const tag = document.createElement('div');
  tag.className = 'phase-tag';
  tag.textContent =
    step.kind === 'work' ? `Set ${step.set} of ${config.sets}` :
    step.kind === 'warmup' ? 'Get ready' :
    step.kind === 'restSet' ? 'Set rest' : 'Rest';

  const name = document.createElement('div');
  name.className = 'phase-name';
  name.id = 'phaseName';
  name.textContent = step.name;

  // ring
  const R = 108, C = 2 * Math.PI * R;
  const step0 = runState.steps[runState.i];
  const frac0 = step0.dur > 0 ? Math.max(0, Math.min(1, runState.remaining / step0.dur)) : 0;
  const ring = document.createElement('div');
  ring.className = 'ring-wrap';
  ring.innerHTML = `
    <svg viewBox="0 0 240 240">
      <circle class="ring-bg" cx="120" cy="120" r="${R}" fill="none" stroke-width="18"></circle>
      <circle class="ring-fg" id="ringFg" cx="120" cy="120" r="${R}" fill="none" stroke-width="18"
        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac0)}"></circle>
    </svg>
    <div class="ring-inner">
      <div class="clock" id="clock">${fmtClock(runState.remaining)}</div>
    </div>`;

  const nextName = nextWorkName(runState.i);
  const nu = document.createElement('div');
  nu.className = 'next-up';
  nu.id = 'nextUp';
  nu.innerHTML = nextName ? `Next: <b>${escapeHtml(nextName)}</b>` : 'Last one!';

  wrap.append(tag, name, ring, nu);
  view.appendChild(wrap);

  // Actions
  actions.innerHTML = '';
  const top = document.createElement('div');
  top.className = 'row-2';
  const prevB = document.createElement('button');
  prevB.className = 'btn secondary icon-only';
  prevB.innerHTML = icon('prev');
  prevB.title = 'Previous';
  prevB.onclick = prevStep;
  const pauseB = document.createElement('button');
  pauseB.className = 'btn';
  pauseB.id = 'pauseBtn';
  pauseB.innerHTML = runState.paused ? icon('play') + '<span>Resume</span>' : icon('pause') + '<span>Pause</span>';
  pauseB.onclick = togglePause;
  const skipB = document.createElement('button');
  skipB.className = 'btn secondary icon-only';
  skipB.innerHTML = icon('next');
  skipB.title = 'Skip';
  skipB.onclick = skipStep;
  top.append(prevB, pauseB, skipB);

  const stopB = document.createElement('button');
  stopB.className = 'btn danger';
  stopB.innerHTML = icon('stop') + '<span>Stop</span>';
  stopB.onclick = stopRun;

  actions.append(top, stopB);
  updateRunUI();
}

function updateRunUI() {
  if (!runState || runState.done) return;
  const clock = document.getElementById('clock');
  if (clock) clock.textContent = fmtClock(runState.remaining);
  const ring = document.getElementById('ringFg');
  if (ring) {
    const step = runState.steps[runState.i];
    const frac = step.dur > 0 ? Math.max(0, Math.min(1, runState.remaining / step.dur)) : 0;
    const R = 108, C = 2 * Math.PI * R;
    ring.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Boot ----------
renderSetup();
