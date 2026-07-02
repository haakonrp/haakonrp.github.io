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
  // Kept for backward compatibility with older "#p=" links.
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64decode(b64) {
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  }

  const hasLZ = typeof LZString !== "undefined" &&
    typeof LZString.compressToEncodedURIComponent === "function";

  function normalizePoll(obj) {
    if (!obj || !Array.isArray(obj.d)) return null;
    obj.v = obj.v && typeof obj.v === "object" ? obj.v : {};
    obj.t = typeof obj.t === "string" ? obj.t : "";
    obj.y = Number.isInteger(obj.y) ? obj.y : new Date().getFullYear();
    return obj;
  }

  // Decode a poll from any string that contains a "#z=" (compressed) or
  // "#p=" (legacy base64) payload — a full URL, a bare hash, or just the token.
  function decodePoll(str) {
    if (!str) return null;
    let m = str.match(/[#&?]?z=([A-Za-z0-9+\-$_.]+)/);
    if (m && hasLZ) {
      try {
        const json = LZString.decompressFromEncodedURIComponent(m[1]);
        if (json) return normalizePoll(JSON.parse(json));
      } catch { /* fall through */ }
    }
    m = str.match(/[#&?]?p=([A-Za-z0-9\-_]+)/);
    if (m) {
      try { return normalizePoll(JSON.parse(b64decode(m[1]))); }
      catch { return null; }
    }
    return null;
  }

  function readPoll() {
    return decodePoll(location.hash);
  }

  function pollToHash(poll) {
    const json = JSON.stringify(poll);
    if (hasLZ) return "#z=" + LZString.compressToEncodedURIComponent(json);
    return "#p=" + b64encode(json); // fallback if the lib failed to load
  }

  function pollUrl(poll) {
    return location.origin + location.pathname + pollToHash(poll);
  }

  // Replace the hash without adding a browser-history entry per keystroke.
  function setHash(poll) {
    history.replaceState(null, "", pollToHash(poll));
  }

  // ---------- merging links from other people ----------
  // Because votes travel in the URL, when several people fill in the SAME link
  // independently you end up with several links that each know about only one
  // voter. This merges those links back together: votes are keyed by name, so
  // we just fold each pasted poll's voters into the current one.
  function samePollDates(a, b) {
    if (a.d.length !== b.d.length) return false;
    const sa = [...a.d].sort().join(","), sb = [...b.d].sort().join(",");
    return sa === sb && a.y === b.y;
  }

  // Parse any number of links out of a blob of pasted text.
  function extractLinks(text) {
    if (!text) return [];
    // Split on whitespace/newlines; keep tokens that look like they carry a poll.
    return text.split(/\s+/).filter(t => /[#&?]?[zp]=/.test(t));
  }

  // Merge every valid, same-poll link found in `text` into `poll`.
  // Returns { added, updated, skipped, mismatched }.
  function mergeLinks(poll, text) {
    const res = { added: 0, updated: 0, skipped: 0, mismatched: 0 };
    const links = extractLinks(text);
    if (!links.length) { res.skipped = -1; return res; } // signal: nothing parseable
    for (const link of links) {
      const other = decodePoll(link);
      if (!other) { res.skipped++; continue; }
      if (!samePollDates(poll, other)) { res.mismatched++; continue; }
      for (const [name, votes] of Object.entries(other.v)) {
        if (!name) continue;
        if (poll.v[name] === undefined) { poll.v[name] = votes; res.added++; }
        else if (poll.v[name] !== votes) { poll.v[name] = votes; res.updated++; } // last paste wins
      }
    }
    return res;
  }

  // ---------- persistence & "unshared changes" safety net ----------
  // Everything lives in the URL, but people close tabs and lose links. So we
  // also stash the latest poll locally: if they reopen the bare site we can
  // offer to restore it, and we warn before leaving with unshared changes.
  const LAST_POLL_KEY = "doodle-last-poll";

  function saveLastPoll(poll) {
    try { localStorage.setItem(LAST_POLL_KEY, JSON.stringify(poll)); } catch {}
  }
  function loadLastPoll() {
    try {
      const raw = localStorage.getItem(LAST_POLL_KEY);
      return raw ? normalizePoll(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  // "dirty" = there are changes the user hasn't shared/copied yet.
  let unsharedChanges = false;
  function markDirty() { unsharedChanges = true; }
  function markShared() { unsharedChanges = false; }

  window.addEventListener("beforeunload", (e) => {
    if (!unsharedChanges) return;
    // Browsers show their own generic message; returnValue must be set.
    e.preventDefault();
    e.returnValue = "";
    return "";
  });

  // ---------- date helpers ----------

  // "08-15" + year -> Date at local midnight
  function toDate(year, md) {
    const [mo, da] = md.split("-").map(Number);
    return new Date(year, mo - 1, da);
  }

  // Label for a single date, e.g. "Fri 15 Aug".
  function dateLabel(year, md) {
    const d = toDate(year, md);
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
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
    // Each screen change starts from the top so headers/notices are visible
    // (e.g. the "now share your link" reminder after saving a vote).
    window.scrollTo(0, 0);
  }

  function setHeader(title, subtitle) {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    document.title = title;
  }

  // ---------- default candidate nights ----------
  // Pre-fill with the Fridays & Saturdays of August (weekend overnights),
  // since the goal is a weekend-ish overnight trip.
  // Sensible defaults for a brand-new poll: current month/year, nothing
  // selected yet — the user picks the nights themselves.
  function defaultStart() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month 0-11
  }

  // ===========================================================================
  // SCREEN: create / edit a poll
  // ===========================================================================
  function renderCreate(existing, lastPoll) {
    clear();
    setHeader("doodle", "create a poll to find the best date");

    const def = defaultStart();
    const poll = existing || { t: "", y: def.year, d: [], v: {} };

    // If we have a saved poll from a previous visit (and we're not editing an
    // existing one), offer to jump back into it so a lost link isn't fatal.
    if (!existing && lastPoll && Array.isArray(lastPoll.d) && lastPoll.d.length) {
      const voters = Object.keys(lastPoll.v || {});
      const restore = el("div", "restore");
      const info = el("div", "restore-info");
      info.appendChild(el("div", "restore-title",
        lastPoll.t ? `Continue “${lastPoll.t}”?` : "Continue your last poll?"));
      info.appendChild(el("div", "restore-sub",
        `${lastPoll.d.length} date${lastPoll.d.length === 1 ? "" : "s"}` +
        (voters.length ? ` · ${voters.length} vote${voters.length === 1 ? "" : "s"}` : "")));
      restore.appendChild(info);
      const openBtn = el("button", "btn small", "Open");
      openBtn.addEventListener("click", () => {
        setHash(lastPoll);
        markShared();
        const savedName = localStorage.getItem("doodle-name");
        if (savedName && lastPoll.v[savedName]) renderResults(lastPoll);
        else renderVote(lastPoll);
      });
      restore.appendChild(openBtn);
      view.appendChild(restore);
    }

    // --- title ---
    const titleField = el("div", "field");
    titleField.appendChild(el("label", null, "What are we planning?"));
    const titleInput = el("input");
    titleInput.type = "text";
    titleInput.value = poll.t;
    titleInput.maxLength = 80;
    titleField.appendChild(titleInput);
    view.appendChild(titleField);

    // --- calendar: tap days to add/remove candidate dates ---
    const calField = el("div", "field");
    calField.appendChild(el("label", null, "Pick the dates — tap a day"));

    // The month currently shown in the picker: the poll's first date if any,
    // otherwise the current month.
    let viewMonth = poll.d.length
      ? toDate(poll.y, poll.d[0]).getMonth()
      : def.month;
    let viewYear = poll.y;

    const cal = el("div", "cal");
    calField.appendChild(cal);
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
        summary.appendChild(el("p", "empty", "No dates picked yet — tap days above."));
        return;
      }
      // Selected dates are shown directly on the calendar (green days);
      // just show a small count here.
      summary.appendChild(el("div", "cal-summary-count",
        `${poll.d.length} date${poll.d.length === 1 ? "" : "s"} selected`));
    }

    drawCalendar();

    // --- actions ---
    const createBtn = el("button", "btn primary", existing ? "Save changes" : "Create poll");
    createBtn.addEventListener("click", () => {
      poll.t = titleInput.value.trim() || "doodle";
      if (!poll.d.length) {
        calField.classList.add("shake");
        setTimeout(() => calField.classList.remove("shake"), 400);
        return;
      }
      // Drop any votes that reference dates no longer on the poll.
      poll.v = {}; // fresh poll starts with no votes
      setHash(poll);
      saveLastPoll(poll);
      renderVote(poll);
    });
    actions.appendChild(createBtn);
  }

  // ===========================================================================
  // SCREEN: vote (mark your availability)
  // ===========================================================================
  function renderVote(poll) {
    clear();
    setHeader(poll.t || "doodle", "tap the dates that work for you");

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

    // When the typed name matches someone who ALREADY voted, load their
    // answers so they can edit. Otherwise keep whatever this person has
    // already selected — don't wipe it just because the name isn't saved yet.
    let lastLoadedName = savedName;
    nameInput.addEventListener("input", () => {
      const n = nameInput.value.trim();
      if (n && poll.v[n]) {
        myVotes = poll.v[n];
        lastLoadedName = n;
        paintRows();
      } else if (lastLoadedName && poll.v[lastLoadedName]) {
        // We had loaded an existing voter's answers, but the name was edited
        // away from that match — start fresh rather than keep their votes.
        myVotes = emptyVotes(len);
        lastLoadedName = "";
        paintRows();
      }
      // else: name is new/unknown and nothing was previously loaded —
      // leave the current selections untouched.
    });

    // --- calendar: tap candidate nights to cycle Yes / Maybe / No ---
    const calWrap = el("div", "votecal");
    view.appendChild(calWrap);

    // Legend so the colours are self-explanatory.
    const legend = el("div", "legend vote-legend");
    legend.innerHTML =
      '<span class="lg"><b class="c-yes">✓</b> yes</span>' +
      '<span class="lg"><b class="c-maybe">~</b> maybe</span>' +
      '<span class="lg"><b class="c-no">·</b> no</span>' +
      '<span class="lg dim">tap once = yes, again = maybe, again = no</span>';
    view.appendChild(legend);

    // Quick shortcut: mark every night Yes at once (or clear back to No when
    // everything is already Yes). Handy for "I'm free most nights" voters.
    const bulkBtn = el("button", "btn ghost bulk-btn");
    bulkBtn.type = "button";
    view.appendChild(bulkBtn);

    const allYes = () => len > 0 && myVotes === "2".repeat(len);
    function updateBulkBtn() {
      bulkBtn.textContent = allYes() ? "Clear all" : "Mark all Yes";
    }
    bulkBtn.addEventListener("click", () => {
      myVotes = (allYes() ? "0" : "2").repeat(len);
      paintRows();
    });

    // Map "MM-DD" -> candidate index, and which months to show.
    const idxOf = {};
    poll.d.forEach((md, i) => { idxOf[md] = i; });
    const months = [...new Set(poll.d.map(md => Number(md.slice(0, 2)) - 1))].sort((a, b) => a - b);

    // Keep references to each candidate cell so we can repaint on change.
    const cellByIdx = {};

    function cycle(i) {
      const cur = voteAt(myVotes, i);
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      myVotes = withVote(myVotes, i, next, len);
      paintCell(i);
      updateBulkBtn();
    }

    function paintCell(i) {
      const cell = cellByIdx[i];
      if (!cell) return;
      const v = voteAt(myVotes, i);
      cell.classList.remove("v-yes", "v-maybe", "v-no");
      cell.classList.add(v === YES ? "v-yes" : v === MAYBE ? "v-maybe" : "v-no");
      const mark = cell.querySelector(".vc-mark");
      mark.textContent = v === YES ? "✓" : v === MAYBE ? "~" : "·";
    }
    function paintRows() { // (name kept: called by the name-input handler)
      for (let i = 0; i < len; i++) paintCell(i);
      updateBulkBtn();
    }

    function drawVoteCalendars() {
      calWrap.innerHTML = "";
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
              // Not a candidate night — faint, non-interactive.
              grid.appendChild(el("div", "cal-cell off", String(day)));
              continue;
            }
            const cell = el("button", "cal-cell vc");
            cell.type = "button";
            cell.appendChild(el("span", "cal-day", String(day)));
            cell.appendChild(el("span", "vc-mark"));
            cell.title = dateLabel(poll.y, md);
            cell.addEventListener("click", () => cycle(i));
            cellByIdx[i] = cell;
            grid.appendChild(cell);
          }
        }
        cal.appendChild(grid);
        calWrap.appendChild(cal);
      }
      paintRows();
    }
    drawVoteCalendars();

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
      saveLastPoll(poll);   // recoverable if they close the tab
      markDirty();          // remind them to share until they do
      renderResults(poll, { justSaved: true });
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
          cell.title = `${dateLabel(poll.y, md)}\n${t.yes} yes` +
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
  function renderResults(poll, opts) {
    opts = opts || {};
    clear();
    const voters = Object.keys(poll.v);
    setHeader(poll.t || "doodle",
      voters.length
        ? `${voters.length} ${voters.length === 1 ? "person has" : "people have"} voted`
        : "no votes yet — be the first!");

    // Just saved a vote? Remind them their answers only count once the link is
    // shared (everything lives in the URL). Auto-copy so it's ready to paste.
    if (opts.justSaved) {
      const notice = el("div", "save-notice");
      notice.appendChild(el("div", "save-notice-title", "Saved! Now share your link"));
      notice.appendChild(el("div", "save-notice-sub",
        "Your votes are stored in the link — send it back to the group so they're not lost."));
      const copyBtn = el("button", "btn primary", "Share poll link");
      copyBtn.addEventListener("click", () => sharePoll(poll, copyBtn));
      notice.appendChild(copyBtn);
      view.appendChild(notice);

      // Best-effort silent copy to clipboard right away (ignored if blocked).
      navigator.clipboard && navigator.clipboard.writeText(pollUrl(poll)).catch(() => {});
    }

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
      const idxs = [...bestIdx];
      const single = idxs.length === 1;
      banner.appendChild(el("div", "winner-tag",
        single ? "Best date" : `Top dates · ${idxs.length} tied`));
      // Don't dump a huge list — show a few, then summarise the rest.
      const MAX = 3;
      const shown = idxs.slice(0, MAX).map(i => dateLabel(poll.y, poll.d[i]));
      let text = shown.join("  ·  ");
      if (idxs.length > MAX) text += `  ·  +${idxs.length - MAX} more`;
      banner.appendChild(el("div", "winner-date", text));
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
    hr.appendChild(el("th", "corner", "Date"));
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
      if (!confirm("Start a new poll? This clears the current one from the screen. " +
        "Make sure you've shared this poll's link first — you can reopen it from that link.")) {
        return;
      }
      history.replaceState(null, "", location.pathname);
      renderCreate(null);
    });

    actions.appendChild(newBtn);
    actions.appendChild(voteBtn);
    actions.appendChild(shareBtn);

    // Combine links others sent back — placed below the Share button.
    renderMergeBox(poll);
  }

  // Collapsible box for folding in links other people sent back.
  function renderMergeBox(poll) {
    const box = el("div", "merge");

    const toggle = el("button", "merge-toggle");
    toggle.type = "button";
    toggle.innerHTML = '<span>＋ Combine links from others</span>';
    box.appendChild(toggle);

    const body = el("div", "merge-body");
    body.hidden = true;
    body.appendChild(el("p", "merge-hint",
      "Got links back from people who voted separately? Paste them here " +
      "(one per line) to combine everyone's answers."));

    const ta = el("textarea", "merge-input");
    ta.rows = 3;
    ta.placeholder = "Paste one or more poll links…";
    body.appendChild(ta);

    const go = el("button", "btn small", "Combine");
    body.appendChild(go);

    const status = el("div", "merge-status");
    body.appendChild(status);

    toggle.addEventListener("click", () => {
      body.hidden = !body.hidden;
      toggle.classList.toggle("open", !body.hidden);
      if (!body.hidden) ta.focus();
    });

    go.addEventListener("click", () => {
      const r = mergeLinks(poll, ta.value);
      status.classList.remove("ok", "warn");
      if (r.skipped === -1) {
        status.textContent = "No poll links found in that text.";
        status.classList.add("warn");
        return;
      }
      const changed = r.added + r.updated;
      if (changed > 0) {
        setHash(poll);
        saveLastPoll(poll);
        const parts = [];
        if (r.added) parts.push(`${r.added} new vote${r.added === 1 ? "" : "s"}`);
        if (r.updated) parts.push(`${r.updated} updated`);
        let msg = "Combined " + parts.join(" and ") + ".";
        if (r.mismatched) msg += ` (${r.mismatched} link${r.mismatched === 1 ? "" : "s"} were for a different poll — skipped.)`;
        status.textContent = msg;
        status.classList.add("ok");
        // Re-render so the grid/calendar reflect the merged votes.
        setTimeout(() => renderResults(poll), 700);
      } else if (r.mismatched) {
        status.textContent = `Those links are for a different poll (different dates) — nothing merged.`;
        status.classList.add("warn");
      } else {
        status.textContent = "Nothing new to add — those votes are already here.";
        status.classList.add("warn");
      }
    });

    box.appendChild(body);
    actions.appendChild(box);
  }


  // ---------- sharing ----------
  async function sharePoll(poll, btn) {
    // Ensure the hash reflects the latest state before sharing.
    setHash(poll);
    const url = pollUrl(poll);
    const shareData = {
      title: poll.t || "doodle",
      url,
    };
    // Prefer the OS share sheet (WhatsApp, Messages, Mail, …) when available.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        markShared(); // they've sent it somewhere
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
      markShared(); // link is on their clipboard, safe to leave
      flash(btn, "Link copied ✓");
    } catch {
      // Last-resort fallback: show the URL for manual copy.
      prompt("Copy this link and share it:", url);
      markShared();
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
      // No poll in the URL — fresh visit or a reopened tab. Offer to restore
      // the last poll we saw on this device, if any.
      renderCreate(null, loadLastPoll());
      return;
    }
    // A poll came in via a link: it's already "out there", so remember it
    // locally and clear any leave-warning.
    saveLastPoll(poll);
    markShared();
    // If this device hasn't voted yet, drop them on the voting screen;
    // otherwise show results. Either way both screens are reachable.
    const savedName = localStorage.getItem("doodle-name");
    if (savedName && poll.v[savedName]) renderResults(poll);
    else renderVote(poll);
  }

  window.addEventListener("hashchange", route);
  route();
})();
