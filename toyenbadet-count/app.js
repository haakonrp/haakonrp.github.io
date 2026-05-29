const IS_LOCAL = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const DATA_URL = IS_LOCAL
  ? "./data/toyenbadet.json"
  : "https://raw.githubusercontent.com/haakonrp/haakonrp.github.io/data/data/toyenbadet.json";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Opening hours per weekday (0=Sun..6=Sat). null = closed.
// Mon-Fri 07:00-19:30, Sat-Sun 10:00-16:30.
const OPENING = {
  0: { open: 10, close: 17 }, // Sun (close 16:30 → include hour 16)
  1: { open: 7,  close: 20 }, // Mon (close 19:30 → include hour 19)
  2: { open: 7,  close: 20 },
  3: { open: 7,  close: 20 },
  4: { open: 7,  close: 20 },
  5: { open: 7,  close: 20 },
  6: { open: 10, close: 17 }, // Sat
};
// Hour range shown across all days (union): 7..20
const HOURS = Array.from({ length: 21 - 7 }, (_, i) => i + 7); // [7..20]

function isOpen(day, hour) {
  const o = OPENING[day];
  return o && hour >= o.open && hour < o.close;
}

async function loadData() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Could not load data:", err);
    return [];
  }
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function renderCurrent(data) {
  const last = data[data.length - 1];
  if (!last) {
    document.getElementById("current-count").textContent = "–";
    document.getElementById("current-time").textContent = "no data yet";
    document.getElementById("point-count").textContent = "0";
    return;
  }
  document.getElementById("current-count").textContent = last.current;
  document.getElementById("current-time").textContent = fmtTime(last.timestamp);
  document.getElementById("point-count").textContent = data.length;
}

function localHour(ts) {
  return new Date(ts).getHours();
}
function localDay(ts) {
  return new Date(ts).getDay();
}

function renderByHour(data) {
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  for (const e of data) {
    const h = localHour(e.timestamp);
    const d = localDay(e.timestamp);
    if (!isOpen(d, h)) continue;
    sums[h] += e.current;
    counts[h]++;
  }
  const avgs = HOURS.map(h => (counts[h] ? Math.round(sums[h] / counts[h]) : null));

  new Chart(document.getElementById("byHour"), {
    type: "bar",
    data: {
      labels: HOURS.map(h => h.toString().padStart(2, "0")),
      datasets: [{
        label: "Average visitors",
        data: avgs,
        backgroundColor: avgs.map(v => v == null ? "#444" : `rgba(108,196,255,${0.3 + Math.min(1, (v||0)/600)*0.7})`),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: "rgba(40,40,40,0.95)",
          borderColor: "#555",
          borderWidth: 1,
          titleColor: "#fafafa",
          bodyColor: "#fafafa",
          titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: "normal" },
          bodyFont:  { family: "'JetBrains Mono', monospace", size: 11 },
          padding: 6,
          cornerRadius: 3,
          callbacks: {
            title: (items) => `${items[0].label}:00`,
            label: (ctx) => `avg ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: "#aaa" }, grid: { color: "#333" } },
        y: { ticks: { color: "#aaa" }, grid: { color: "#333" }, beginAtZero: true },
      },
    },
  });
}

function renderHeatmap(data) {
  const sums = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of data) {
    const d = localDay(e.timestamp);
    const h = localHour(e.timestamp);
    if (!isOpen(d, h)) continue;
    sums[d][h] += e.current;
    counts[d][h]++;
  }

  let max = 0;
  const avgs = sums.map((row, d) => row.map((s, h) => {
    if (!counts[d][h]) return null;
    const a = s / counts[d][h];
    if (a > max) max = a;
    return a;
  }));

  const grid = document.getElementById("heatmap");
  grid.style.gridTemplateColumns = `2.5rem repeat(${HOURS.length}, minmax(0, 1fr))`;
  grid.innerHTML = "";

  // header row
  grid.appendChild(cell("", "hcell head"));
  for (const h of HOURS) {
    grid.appendChild(cell(h.toString().padStart(2, "0"), "hcell head"));
  }

  // ISO week order: Mon..Sun (re-map index: 1..6,0)
  const order = [1,2,3,4,5,6,0];
  for (const d of order) {
    grid.appendChild(cell(DAY_NAMES[d], "hcell row-label"));
    for (const h of HOURS) {
      const c = document.createElement("div");
      c.className = "hcell";
      if (!isOpen(d, h)) {
        c.style.background = "#181818";
        c.style.opacity = "0.4";
        c.dataset.tip = `${DAY_NAMES[d]} ${h}:00\nclosed`;
        grid.appendChild(c);
        continue;
      }
      const v = avgs[d][h];
      if (v == null) {
        c.style.background = "#1a1a1a";
        c.dataset.tip = `${DAY_NAMES[d]} ${h}:00\nno data`;
      } else {
        const t = max ? v / max : 0;
        c.style.background = `rgba(108,196,255,${0.08 + t * 0.85})`;
        c.dataset.count = Math.round(v);
        c.dataset.tip = `${DAY_NAMES[d]} ${h}:00\navg ${Math.round(v)}`;
      }
      grid.appendChild(c);
    }
  }

  attachTooltip(grid);
}

function attachTooltip(root) {
  let tip = document.getElementById("hm-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "hm-tooltip";
    document.body.appendChild(tip);
  }
  const show = (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t || !root.contains(t)) { tip.style.display = "none"; return; }
    tip.textContent = t.dataset.tip;
    tip.style.display = "block";
    const pad = 10;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (x + r.width  > window.innerWidth)  x = e.clientX - r.width  - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    tip.style.left = x + "px";
    tip.style.top  = y + "px";
  };
  root.addEventListener("mousemove", show);
  root.addEventListener("mouseleave", () => { tip.style.display = "none"; });
}

function cell(text, cls) {
  const c = document.createElement("div");
  c.className = cls;
  c.textContent = text;
  return c;
}

function renderRecent(data) {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = data.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  new Chart(document.getElementById("recent"), {
    type: "line",
    data: {
      labels: recent.map(e => fmtTime(e.timestamp)),
      datasets: [{
        label: "Currently inside",
        data: recent.map(e => e.current),
        borderColor: "#6cc4ff",
        backgroundColor: "rgba(108,196,255,0.15)",
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#6cc4ff",
        pointHoverBorderColor: "#fafafa",
        pointHoverBorderWidth: 1,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false, axis: "x" },
      hover:       { mode: "index", intersect: false, axis: "x" },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          axis: "x",
          displayColors: false,
          backgroundColor: "rgba(40,40,40,0.95)",
          borderColor: "#555",
          borderWidth: 1,
          titleColor: "#fafafa",
          bodyColor: "#fafafa",
          titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: "normal" },
          bodyFont:  { family: "'JetBrains Mono', monospace", size: 11 },
          padding: 6,
          cornerRadius: 3,
          callbacks: { label: (ctx) => `${ctx.parsed.y} inside` },
        },
      },
      scales: {
        x: { ticks: { color: "#aaa", maxTicksLimit: 8 }, grid: { color: "#333" } },
        y: { ticks: { color: "#aaa" }, grid: { color: "#333" }, beginAtZero: true },
      },
    },
  });
}

(async () => {
  const data = await loadData();
  renderCurrent(data);
  if (data.length) {
    renderByHour(data);
    renderHeatmap(data);
    renderRecent(data);
  }
})();
