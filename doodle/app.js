(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Simple "Doodle" clone — no backend.
  //
  // The entire poll (title, candidate nights, and everyone's votes) is encoded
  // into the URL hash. To collect answers you share the link; each person opens
  // it, marks Yes / Maybe / No for each night, and shares the updated link back.
  //
  // URL shape:  <page>#p=<base64(JSON)>
  //
  // Compact JSON schema (short keys to keep the URL small):
  //   {
  //     t: "Trip title",
  //     y: 2026,                 // base year for the dates
  //     d: ["08-15", "08-22"],   // candidate nights, MM-DD (the night you sleep over)
  //     v: {                     // votes, keyed by person name
  //       "Alice": "210",        // one char per date: 2=yes 1=maybe 0=no
  //       "Bob":   "120"
  //     }
  //   }
  // ---------------------------------------------------------------------------

  const view = document.getElementById("view");
  const actions = document.getElementById("actions");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");

  const YES = 2, MAYBE = 1, NO = 0;
  const CYCLE = [NO, YES, MAYBE]; // click order: none/no -> yes -> maybe -> no
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // ---------- URL <-> state ----------

  // UTF-8 safe base64 (handles emoji / accents in names & titles).
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64decode(b64) {
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  }

  function readPoll() {
    const m = location.hash.match(/[#&]p=([^&]+)/);
    if (!m) return null;
    try {
      const obj = JSON.parse(b64decode(m[1]));
      if (!obj || !Array.isArray(obj.d)) return null;
      obj.v = obj.v && typeof obj.v === "object" ? obj.v : {};
      obj.t = typeof obj.t === "string" ? obj.t : "";
      obj.y = Number.isInteger(obj.y) ? obj.y : new Date().getFullYear();
      return obj;
    } catch {
      return null;
    }
  }

  function pollToHash(poll) {
    return "#p=" + b64encode(JSON.stringify(poll));
  }

  function pollUrl(poll) {
    return location.origin + location.pathname + pollToHash(poll);
  }

  // Replace the hash without adding a browser-history entry per keystroke.
  function setHash(poll) {
    history.replaceState(null, "", pollToHash(poll));
  }

  // ---------- date helpers ----------

  // "08-15" + year -> Date at local midnight
  function toDate(year, md) {
    const [mo, da] = md.split("-").map(Number);
    return new Date(year, mo - 1, da);
  }

  // Label for an overnight stay: the night you sleep + the morning after.
  // e.g. "Fri 15 → Sat 16 Aug"
  function nightLabel(year, md) {
    const start = toDate(year, md);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const sameMonth = start.getMonth() === end.getMonth();
    const startTxt = `${WEEKDAYS[start.getDay()]} ${start.getDate()}` +
      (sameMonth ? "" : ` ${MONTHS[start.getMonth()]}`);
    const endTxt = `${WEEKDAYS[end.getDay()]} ${end.getDate()} ${MONTHS[end.getMonth()]}`;
    return `${startTxt} → ${endTxt}`;
  }

  function shortLabel(year, md) {
    const d = toDate(year, md);
    return { dow: WEEKDAYS[d.getDay()], day: d.getDate(), mon: MONTHS[d.getMonth()] };
  }

  // "YYYY-MM-DD" for a given year + "MM-DD"
  function isoDate(year, md) {
    return `${year}-${md}`;
  }

  // ---------- calendar helpers ----------

  // Build a month grid as rows of 7 cells, weeks starting Monday.
  // Cells that fall outside the month are null (rendered as blanks).
  // Returns { weeks: [[dayNum|null, ...7], ...], monthName, year }.
  function monthGrid(year, month /* 0-11 */) {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // JS: 0=Sun..6=Sat. Shift so Monday=0..Sunday=6.
    const lead = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, monthName: MONTHS[month], year };
  }

  function mdOf(month /* 0-11 */, day) {
    return `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ---------- vote string helpers ----------

  function voteAt(str, i) {
    const c = str && str[i];
    return c === "2" ? YES : c === "1" ? MAYBE : NO;
  }
  function withVote(str, i, val, len) {
    const arr = (str || "").padEnd(len, "0").slice(0, len).split("");
    arr[i] = String(val);
    return arr.join("");
  }
  function emptyVotes(len) {
    return "0".repeat(len);
  }

  // ---------- render helpers ----------

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear() {
    view.innerHTML = "";
    actions.innerHTML = "";
  }

  function setHeader(title, subtitle) {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    document.title = title;
  }

  // ---------- default candidate nights ----------
  // Pre-fill with the Fridays & Saturdays of August (weekend overnights),
  // since the goal is a weekend-ish overnight trip.
  function defaultAugustNights() {
    const now = new Date();
    // If we're already past August, plan for next year's August.
    const year = now.getMonth() > 7 ? now.getFullYear() + 1 : now.getFullYear();
    const nights = [];
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, 7, day); // month 7 = August
      if (d.getMonth() !== 7) break;
      const dow = d.getDay();
      if (dow === 5 || dow === 6) { // Fri or Sat
        nights.push(`08-${String(day).padStart(2, "0")}`);
      }
    }
    return { year, nights };
  }

  // ===========================================================================
  // SCREEN: create / edit a poll
  // ===========================================================================
  function renderCreate(existing) {
    clear();
    setHeader("doodle", "create a poll to find the best night");

    const def = defaultAugustNights();
    const poll = existing || { t: "", y: def.year, d: def.nights.slice(), v: {} };

    // --- title ---
    const titleField = el("div", "field");
    titleField.appendChild(el("label", null, "What are we planning?"));
    const titleInput = el("input");
    titleInput.type = "text";
    titleInput.value = poll.t;
    titleInput.maxLength = 80;
    titleField.appendChild(titleInput);
    view.appendChild(titleField);

    // --- calendar: tap days to add/remove candidate nights ---
    const calField = el("div", "field");
    calField.appendChild(el("label", null, "Pick the nights — tap a day"));

    // The month currently shown in the picker (defaults to the poll's month).
    let viewMonth = poll.d.length
      ? toDate(poll.y, poll.d[0]).getMonth()
      : 7; // August
    let viewYear = poll.y;

    const cal = el("div", "cal");
    calField.appendChild(cal);
    calField.appendChild(el("p", "hint",
      "Each option is one night — you sleep over and head back the next morning."));
    view.appendChild(calField);

    // "Nights on the poll" summary chips (read-only list, remove via calendar too)
    const summary = el("div", "cal-summary");
    view.appendChild(summary);

    function toggleDay(md) {
      const i = poll.d.indexOf(md);
      if (i >= 0) poll.d.splice(i, 1);
      else poll.d.push(md);
      poll.d.sort();
      drawCalendar();
    }

    function drawCalendar() {
      cal.innerHTML = "";

      // header: prev / month-year / next
      const head = el("div", "cal-head");
      const prev = el("button", "cal-nav", "‹");
      prev.type = "button";
      prev.setAttribute("aria-label", "previous month");
      const title = el("div", "cal-title",
        `${MONTHS[viewMonth]} ${viewYear}`);
      const next = el("button", "cal-nav", "›");
      next.type = "button";
      next.setAttribute("aria-label", "next month");
      prev.addEventListener("click", () => {
        if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
        drawCalendar();
      });
      next.addEventListener("click", () => {
        if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
        drawCalendar();
      });
      head.appendChild(prev);
      head.appendChild(title);
      head.appendChild(next);
      cal.appendChild(head);

      // weekday header row (Mon-first)
      const dow = el("div", "cal-dow");
      ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d =>
        dow.appendChild(el("span", null, d)));
      cal.appendChild(dow);

      // day grid
      const grid = el("div", "cal-grid");
      const { weeks } = monthGrid(viewYear, viewMonth);
      for (const week of weeks) {
        for (const day of week) {
          if (day == null) {
            grid.appendChild(el("div", "cal-cell blank"));
            continue;
          }
          const md = mdOf(viewMonth, day);
          // A candidate is stored against poll.y; only mark selected when the
          // shown year matches the poll's year (poll spans a single year).
          const selected = viewYear === poll.y && poll.d.includes(md);
          const cell = el("button", "cal-cell" + (selected ? " sel" : ""), String(day));
          cell.type = "button";
          const wd = new Date(viewYear, viewMonth, day).getDay();
          if (wd === 5 || wd === 6) cell.classList.add("wknd");
          cell.addEventListener("click", () => {
            poll.y = viewYear; // poll year follows the calendar
            toggleDay(md);
          });
          grid.appendChild(cell);
        }
      }
      cal.appendChild(grid);

      drawSummary();
    }

    function drawSummary() {
      summary.innerHTML = "";
      if (!poll.d.length) {
        summary.appendChild(el("p", "empty", "No nights picked yet — tap days above."));
        return;
      }
      // Selected nights are shown directly on the calendar (green days);
      // just show a small count here.
      summary.appendChild(el("div", "cal-summary-count",
        `${poll.d.length} night${poll.d.length === 1 ? "" : "s"} selected`));
    }

    drawCalendar();

    // --- actions ---
    const createBtn = el("button", "btn primary", existing ? "Save changes" : "Create poll");
    createBtn.addEventListener("click", () => {
      poll.t = titleInput.value.trim() || "Overnight trip";
      if (!poll.d.length) {
        calField.classList.add("shake");
        setTimeout(() => calField.classList.remove("shake"), 400);
        return;
      }
      // Drop any votes that reference dates no longer on the poll.
      poll.v = {}; // fresh poll starts with no votes
      setHash(poll);
      renderVote(poll);
    });
    actions.appendChild(createBtn);
  }

  // ===========================================================================
  // SCREEN: vote (mark your availability)
  // ===========================================================================
  function renderVote(poll) {
    clear();
    setHeader(poll.t || "Overnight trip", "tap each night: Yes · Maybe · No");

    const len = poll.d.length;

    // --- name ---
    const nameField = el("div", "field");
    nameField.appendChild(el("label", null, "Your name"));
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.maxLength = 40;
    nameField.appendChild(nameInput);
    view.appendChild(nameField);

    // Remember the last name used on this device for convenience.
    const savedName = localStorage.getItem("doodle-name") || "";
    nameInput.value = savedName;

    // Working copy of this person's votes (pre-fill if they already voted).
    let myVotes = (savedName && poll.v[savedName]) || emptyVotes(len);

    // When the typed name matches an existing voter, load their answers.
    nameInput.addEventListener("input", () => {
      const n = nameInput.value.trim();
      myVotes = (n && poll.v[n]) || emptyVotes(len);
      paintRows();
    });

    // --- date rows ---
    const rows = el("div", "vote-rows");
    view.appendChild(rows);

    const labelFor = { 0: "No", 1: "Maybe", 2: "Yes" };
    const rowEls = [];

    poll.d.forEach((md, i) => {
      const row = el("button", "vote-row");
      const info = el("div", "vote-info");
      info.appendChild(el("div", "vote-label", nightLabel(poll.y, md)));
      row.appendChild(info);
      const badge = el("div", "vote-badge");
      row.appendChild(badge);
      row.addEventListener("click", () => {
        const cur = voteAt(myVotes, i);
        const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
        myVotes = withVote(myVotes, i, next, len);
        paintRow(i);
      });
      rows.appendChild(row);
      rowEls.push({ row, badge });
    });

    function paintRow(i) {
      const v = voteAt(myVotes, i);
      const { row, badge } = rowEls[i];
      row.classList.remove("v-yes", "v-maybe", "v-no");
      row.classList.add(v === YES ? "v-yes" : v === MAYBE ? "v-maybe" : "v-no");
      badge.textContent = labelFor[v];
    }
    function paintRows() {
      for (let i = 0; i < len; i++) paintRow(i);
    }
    paintRows();

    // --- actions ---
    const saveBtn = el("button", "btn primary", "Save my availability");
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameField.classList.add("shake");
        setTimeout(() => nameField.classList.remove("shake"), 400);
        nameInput.focus();
        return;
      }
      poll.v[name] = myVotes;
      localStorage.setItem("doodle-name", name);
      setHash(poll);
      renderResults(poll);
    });

    const resultsBtn = el("button", "btn ghost", "See results");
    resultsBtn.addEventListener("click", () => renderResults(poll));

    actions.appendChild(resultsBtn);
    actions.appendChild(saveBtn);
  }

  // Availability heat-map calendar for the results screen.
  // Shades each candidate night by how "available" the group is:
  //   fill = (yes + maybe*0.5) / voters   →  greener = more people can make it.
  // Non-candidate days are dimmed; the best night(s) get a ring.
  function renderResultsCalendar(poll, tally, bestIdx, voterCount) {
    // Map "MM-DD" -> candidate index for quick lookup while drawing.
    const idxOf = {};
    poll.d.forEach((md, i) => { idxOf[md] = i; });

    // Which months do the candidate nights span? (Usually one, e.g. August.)
    const months = [...new Set(poll.d.map(md => Number(md.slice(0, 2)) - 1))].sort((a, b) => a - b);

    const wrap = el("div", "rescal");
    for (const month of months) {
      const cal = el("div", "cal cal-result");

      const head = el("div", "cal-head static");
      head.appendChild(el("div", "cal-title", `${MONTHS[month]} ${poll.y}`));
      cal.appendChild(head);

      const dow = el("div", "cal-dow");
      ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d =>
        dow.appendChild(el("span", null, d)));
      cal.appendChild(dow);

      const grid = el("div", "cal-grid");
      const { weeks } = monthGrid(poll.y, month);
      for (const week of weeks) {
        for (const day of week) {
          if (day == null) { grid.appendChild(el("div", "cal-cell blank")); continue; }
          const md = mdOf(month, day);
          const i = idxOf[md];
          if (i === undefined) {
            // Not a candidate night — show faint, non-interactive.
            grid.appendChild(el("div", "cal-cell off", String(day)));
            continue;
          }
          const t = tally[i];
          const cell = el("div", "cal-cell cand");
          if (bestIdx.has(i)) cell.classList.add("best");
          // heat fill
          const frac = voterCount ? (t.yes + t.maybe * 0.5) / voterCount : 0;
          if (voterCount && frac > 0) {
            cell.style.background = `rgba(106,168,79,${0.12 + frac * 0.78})`;
          }
          cell.appendChild(el("span", "cal-day", String(day)));
          // little tally under the number
          if (voterCount) {
            const tag = el("span", "cal-tag");
            tag.textContent = t.maybe ? `${t.yes}·${t.maybe}~` : `${t.yes}`;
            cell.appendChild(tag);
          }
          cell.title = `${nightLabel(poll.y, md)}\n${t.yes} yes` +
            (t.maybe ? `, ${t.maybe} maybe` : "") + `, ${t.no} no`;
          grid.appendChild(cell);
        }
      }
      cal.appendChild(grid);
      wrap.appendChild(cal);
    }
    view.appendChild(wrap);
  }

  // ===========================================================================
  // SCREEN: results (grid of everyone's votes + best night)
  // ===========================================================================
  function renderResults(poll) {
    clear();
    const voters = Object.keys(poll.v);
    setHeader(poll.t || "Overnight trip",
      voters.length
        ? `${voters.length} ${voters.length === 1 ? "person has" : "people have"} voted`
        : "no votes yet — be the first!");

    const len = poll.d.length;

    // Tally per date: count of yes / maybe, and a score (yes=2, maybe=1).
    const tally = poll.d.map((_, i) => {
      let yes = 0, maybe = 0, no = 0, score = 0;
      for (const name of voters) {
        const v = voteAt(poll.v[name], i);
        if (v === YES) { yes++; score += 2; }
        else if (v === MAYBE) { maybe++; score += 1; }
        else no++;
      }
      return { yes, maybe, no, score };
    });

    // Best = highest score; ties broken by most "yes".
    let bestScore = -1;
    tally.forEach(t => { if (t.score > bestScore) bestScore = t.score; });
    const bestIdx = new Set();
    if (voters.length && bestScore > 0) {
      let bestYes = -1;
      tally.forEach((t, i) => { if (t.score === bestScore && t.yes > bestYes) bestYes = t.yes; });
      tally.forEach((t, i) => {
        if (t.score === bestScore && t.yes === bestYes) bestIdx.add(i);
      });
    }

    // --- winner banner ---
    if (bestIdx.size) {
      const banner = el("div", "winner");
      const names = [...bestIdx].map(i => nightLabel(poll.y, poll.d[i]));
      banner.appendChild(el("div", "winner-tag", bestIdx.size > 1 ? "Top nights" : "Best night"));
      banner.appendChild(el("div", "winner-date", names.join("  ·  ")));
      view.appendChild(banner);
    }

    // --- availability calendar (heat-map of candidate nights) ---
    renderResultsCalendar(poll, tally, bestIdx, voters.length);

    // --- grid ---
    const wrap = el("div", "grid-wrap");
    const table = el("table", "grid");

    // header row: names
    const thead = el("thead");
    const hr = el("tr");
    hr.appendChild(el("th", "corner", "Night"));
    for (const name of voters) {
      const th = el("th", "name");
      th.appendChild(el("span", null, name));
      hr.appendChild(th);
    }
    const sumTh = el("th", "name sum-h", "✓");
    sumTh.title = "yes / maybe count";
    hr.appendChild(sumTh);
    thead.appendChild(hr);
    table.appendChild(thead);

    // body: one row per date
    const tbody = el("tbody");
    poll.d.forEach((md, i) => {
      const tr = el("tr");
      if (bestIdx.has(i)) tr.classList.add("best");
      const s = shortLabel(poll.y, md);
      const dcell = el("th", "date");
      dcell.appendChild(el("span", "d-dow", s.dow));
      dcell.appendChild(el("span", "d-day", `${s.day} ${s.mon}`));
      tr.appendChild(dcell);

      for (const name of voters) {
        const v = voteAt(poll.v[name], i);
        const td = el("td", "cell " + (v === YES ? "c-yes" : v === MAYBE ? "c-maybe" : "c-no"));
        td.textContent = v === YES ? "✓" : v === MAYBE ? "~" : "·";
        tr.appendChild(td);
      }

      const t = tally[i];
      const sum = el("td", "cell sum");
      sum.innerHTML =
        `<span class="s-yes">${t.yes}</span>` +
        (t.maybe ? `<span class="s-maybe">+${t.maybe}</span>` : "");
      tr.appendChild(sum);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    view.appendChild(wrap);

    if (!voters.length) {
      view.appendChild(el("p", "empty",
        "Share the link so people can add their availability, or add yours first."));
    } else {
      const legend = el("div", "legend");
      legend.innerHTML =
        '<span class="lg"><b class="c-yes">✓</b> yes</span>' +
        '<span class="lg"><b class="c-maybe">~</b> maybe</span>' +
        '<span class="lg"><b class="c-no">·</b> no</span>';
      view.appendChild(legend);
    }

    // --- actions ---
    const shareBtn = el("button", "btn primary", "Share poll link");
    shareBtn.addEventListener("click", () => sharePoll(poll, shareBtn));

    const voteBtn = el("button", "btn", "Add / edit my vote");
    voteBtn.addEventListener("click", () => renderVote(poll));

    const newBtn = el("button", "btn ghost", "New poll");
    newBtn.addEventListener("click", () => {
      history.replaceState(null, "", location.pathname);
      renderCreate(null);
    });

    actions.appendChild(newBtn);
    actions.appendChild(voteBtn);
    actions.appendChild(shareBtn);
  }

  // ---------- sharing ----------
  async function sharePoll(poll, btn) {
    // Ensure the hash reflects the latest state before sharing.
    setHash(poll);
    const url = pollUrl(poll);
    const shareData = {
      title: poll.t || "Overnight trip",
      text: "When can you make it? Mark your availability:",
      url,
    };
    // Prefer the OS share sheet (WhatsApp, Messages, Mail, …) when available.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User dismissed the share sheet — do nothing, don't fall back.
        if (err && err.name === "AbortError") return;
        // Some desktop browsers expose navigator.share but reject; fall back.
        await copyLink(url, btn);
      }
      return;
    }
    // No share support (most desktops) — copy the link instead.
    await copyLink(url, btn);
  }

  async function copyLink(url, btn) {
    try {
      await navigator.clipboard.writeText(url);
      flash(btn, "Link copied ✓");
    } catch {
      // Last-resort fallback: show the URL for manual copy.
      prompt("Copy this link and share it:", url);
    }
  }

  function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
  }

  // ===========================================================================
  // boot
  // ===========================================================================
  function route() {
    const poll = readPoll();
    if (!poll) {
      renderCreate(null);
      return;
    }
    // If this device hasn't voted yet, drop them on the voting screen;
    // otherwise show results. Either way both screens are reachable.
    const savedName = localStorage.getItem("doodle-name");
    if (savedName && poll.v[savedName]) renderResults(poll);
    else renderVote(poll);
  }

  window.addEventListener("hashchange", route);
  route();
})();
