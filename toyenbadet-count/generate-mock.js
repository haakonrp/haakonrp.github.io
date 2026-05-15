#!/usr/bin/env node
// Generate realistic mock data for Tøyenbadet visitor counts.
// Pattern: closed at night, low mornings/late evenings, peaks late afternoon,
// busier weekends, with some noise.

const fs = require("fs");
const path = require("path");

const HOURS_BACK = 24 * 21; // 3 weeks
const out = [];
const now = new Date();
now.setMinutes(5, 0, 0);

// base curve per hour 0..23 (rough capacity ~700)
const baseByHour = [
  0, 0, 0, 0, 0, 0,           // 00-05 closed
  20, 80, 150, 220, 280, 320, // 06-11
  380, 440, 500, 560, 620,    // 12-16
  650, 600, 500, 350, 180,    // 17-21
  40, 0,                      // 22-23
];

let visitorsIn = 12000;
let visitorsOut = 11800;

for (let i = HOURS_BACK; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 3600 * 1000);
  const h = d.getHours();
  const day = d.getDay(); // 0=Sun
  const weekend = day === 0 || day === 6;

  let target = baseByHour[h];
  if (weekend) target = Math.round(target * 1.25);
  // Friday afternoon a bit busier
  if (day === 5 && h >= 15 && h <= 19) target = Math.round(target * 1.15);
  // Monday slightly quieter
  if (day === 1) target = Math.round(target * 0.85);

  // jitter ±15%
  const noise = (Math.random() - 0.5) * 0.3;
  let current = Math.max(0, Math.round(target * (1 + noise)));

  // synthesize cumulative counters
  const churn = Math.round(target * 0.15 + Math.random() * 40);
  visitorsIn  += churn + Math.round(current * 0.05);
  visitorsOut = visitorsIn - current;

  out.push({
    timestamp: d.toISOString(),
    datelong: d.getTime(),
    current,
    visitorsIn,
    visitorsOut,
    capacityStatus: current > 600 ? "near" : "good",
  });
}

const target = path.join(__dirname, "data", "toyenbadet.json");
fs.writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} entries to ${target}`);
console.log(`Latest: ${out[out.length - 1].current} visitors @ ${out[out.length - 1].timestamp}`);
