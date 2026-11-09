// ============================================================
//  admin-pages.js  -  every admin page EXCEPT Report Management
//  (that one is in admin.js). Needs storage.js, charts.js and admin.js first.
//
//    1. Menu / page switching         6. Resolution History
//    2. Dashboard cards + lists       7. Report Archive
//    3. Processing Queue              8. Resident Management
//    4. Analytics & Statistics        9. Notifications
//    5. Helpers (dates, tables)      10. Activity Logs, 11. Settings
//
//  All numbers come from the saved reports (BC.getReports()). When admin.js
//  reloads the data (a new report arrived, something was updated) it fires
//  the "bc:refresh" event and the page that is open redraws itself.
// ============================================================

(function () {
  if (document.body.dataset.page !== "admin-dashboard" || !BC.isAdmin()) return;

  const $ = function (id) { return document.getElementById(id); };
  const esc = BC.esc;
  const DAY = 864e5;
  const VIEWS = ["dashboard", "reports", "queue", "analytics", "history", "archive", "residents", "notifications", "logs", "settings"];
  const STATUS_COLORS = { "SUBMITTED": "#2563eb", "UNDER REVIEW": "#d97706", "IN PROGRESS": "#7c3aed", "RESOLVED": "#16a34a", "REJECTED": "#dc2626" };

  let all = [];              // every report (archived too)
  let currentView = "dashboard";
  let notifFilter = "all";
  const revealed = new Set();   // resident contact numbers the admin chose to show

  // ============================================================
  //  5. Helpers
  // ============================================================
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function parseDay(v) { const p = String(v).split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function toInput(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function shortDay(d) { return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
  function fullDay(d) { return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
  function ts(iso) { return new Date(iso).getTime(); }
  function ageDays(r) { return Math.floor((Date.now() - ts(r.createdAt)) / DAY); }
  function prioRank(r) { return { High: 3, Medium: 2, Low: 1 }[r.priority || "Medium"]; }
  function prefs() { return BC.getPrefs(); }

  function duration(ms) {
    if (!isFinite(ms) || ms <= 0) return "—";
    const m = Math.round(ms / 60000);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + mm + "m";
    return mm + "m";
  }

  function pct(cur, prev) { return Math.round(((cur - prev) / prev) * 100); }

  // edit = true opens the update form; archived reports are always read-only (restore them first)
  function openDetails(id, edit) {
    const r = all.find(function (x) { return x.id === id; });
    const ro = !edit || !!(r && r.archived);
    window.BCAdmin.openReport(id, !ro, ro);
  }

  function prioTag(r) {
    const p = r.priority || "Medium";
    return '<span class="prio prio-' + p.toLowerCase() + '">' + esc(p) + "</span>";
  }

  function miniItem(r, extra, edit) {
    return '<button type="button" class="mini-item" data-open="' + esc(r.id) + '"' + (edit ? ' data-edit="1"' : "") + ">" +
      '<span class="mi-top"><span class="mi-id">' + esc(r.reportNo) + "</span>" + BC.statusBadge(r.status) + (r.urgent || r.priority === "High" ? ' <span class="prio prio-high">' + (r.urgent ? "Urgent" : "High") + "</span>" : "") + "</span>" +
      '<span class="mi-sub">' + esc(r.type) + " &middot; " + esc(r.location) + "</span>" +
      '<span class="mi-when">' + esc(extra || BC.fmtDate(r.createdAt)) + "</span></button>";
  }

  // Opens whatever was clicked: [data-open] = details, [data-timeline] = activity timeline
  document.addEventListener("click", function (e) {
    const o = e.target.closest("[data-open]");
    if (o && !o.closest("#reportRows")) {
      const dlg = e.target.closest("dialog");
      if (dlg && dlg.id === "residentDialog") dlg.close();
      openDetails(o.dataset.open, o.dataset.edit === "1");
      return;
    }
    const t = e.target.closest("[data-timeline]");
    if (t) window.BCAdmin.openTimeline(t.dataset.timeline);
  });

  // A simple table filler: rows is an array of HTML strings
  function fill(tbody, rows, cols, emptyText) {
    tbody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="' + cols + '" class="empty">' + esc(emptyText) + "</td></tr>";
  }

  function fillTypeSelect(sel) {
    if (sel.options.length > 1) return;
    BC.CONCERN_TYPES.forEach(function (t) { sel.add(new Option(t, t)); });
  }

  // ============================================================
  //  1. Menu / page switching
  // ============================================================
  function showView() {
    let v = location.hash.replace("#", "");
    if (VIEWS.indexOf(v) < 0) v = "dashboard";
    currentView = v;
    VIEWS.forEach(function (name) { $("view-" + name).hidden = name !== v; });
    document.querySelectorAll("#adminNav a[data-view]").forEach(function (a) {
      const on = a.dataset.view === v;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("topTitle").textContent = $("view-" + v).dataset.title || "Barangay Admin";
    document.title = ($("view-" + v).dataset.title || "Admin") + " - Barangay Admin";
    renderView();
    window.scrollTo(0, 0);
  }

  function renderView() {
    renderBadges();
    ({
      dashboard: renderDashboard, reports: function () {}, queue: renderQueue, analytics: renderAnalytics,
      history: renderHistory, archive: renderArchive, residents: renderResidents, notifications: renderNotifs,
      logs: renderLogs, settings: renderSettings
    })[currentView]();
  }

  window.addEventListener("hashchange", showView);
  window.addEventListener("bc:refresh", function (e) { all = e.detail.all; renderView(); });
  // Clicking a summary card opens Report Management (admin.js already chose the status tab)
  document.querySelectorAll(".stat").forEach(function (b) {
    b.addEventListener("click", function () { location.hash = "#reports"; });
  });

  function renderBadges() {
    const unread = BC.getNotifs("admin").filter(function (n) { return !n.read; }).length;
    const q = queueGroups().total;
    [["notifications", unread], ["queue", q]].forEach(function (p) {
      const b = $("badge-" + p[0]);
      b.textContent = p[1] > 99 ? "99+" : p[1];
      b.hidden = !p[1];
    });
  }

  // ============================================================
  //  2. Dashboard: % comparison + attention + latest
  // ============================================================
  function renderDashboard() {
    const now = Date.now();
    const cur0 = now - 30 * DAY, prev0 = now - 60 * DAY;
    const earliest = all.length ? Math.min.apply(null, all.map(function (r) { return ts(r.createdAt); })) : now;
    const enough = earliest <= cur0;               // there is at least one full period of history
    const cards = [["Total", ""], ["Submitted", "SUBMITTED"], ["Review", "UNDER REVIEW"], ["Progress", "IN PROGRESS"], ["Resolved", "RESOLVED"], ["Rejected", "REJECTED"]];
    cards.forEach(function (c) {
      const el = $("delta" + c[0]);
      const match = function (r) { return !c[1] || r.status === c[1]; };
      const cur = all.filter(function (r) { return match(r) && ts(r.createdAt) >= cur0; }).length;
      const prev = all.filter(function (r) { return match(r) && ts(r.createdAt) >= prev0 && ts(r.createdAt) < cur0; }).length;
      el.className = "delta";
      if (!enough) { el.textContent = "Not enough history yet"; return; }
      if (!prev) { el.textContent = cur ? cur + " in the last 30 days" : "No data in the last 60 days"; return; }
      const p = pct(cur, prev);
      el.classList.add(p > 0 ? "is-up" : p < 0 ? "is-down" : "is-same");
      el.textContent = (p > 0 ? "▲ " : p < 0 ? "▼ " : "= ") + Math.abs(p) + "% vs previous 30 days";
    });
    $("deltaNote").textContent = enough
      ? "Percentages compare reports submitted in the last 30 days with the 30 days before that."
      : "Percentages appear once the oldest report is at least 30 days old.";

    const days = prefs().attentionDays;
    const needs = all.filter(function (r) {
      return !r.archived && !BC.isFinal(r.status) && (ageDays(r) >= days || r.priority === "High");
    }).sort(function (a, b) { return prioRank(b) - prioRank(a) || ts(a.createdAt) - ts(b.createdAt); }).slice(0, 6);
    $("dashAttention").innerHTML = needs.length
      ? needs.map(function (r) { return miniItem(r, "Waiting " + ageDays(r) + " day" + (ageDays(r) === 1 ? "" : "s"), true); }).join("")
      : '<p class="empty">Nothing is waiting too long. Good job!</p>';

    const recent = all.filter(function (r) { return !r.archived; }).slice(0, 6);
    $("dashRecent").innerHTML = recent.length ? recent.map(function (r) { return miniItem(r, "", true); }).join("") : '<p class="empty">No reports yet.</p>';
    $("livePill").textContent = "Live · updated " + new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // ============================================================
  //  3. Processing Queue
  // ============================================================
  // Newly Submitted: Pending and less than 24 hours old
  // Waiting for Review: Pending for more than 24 hours, or Under Review
  // Currently Being Addressed: In Progress and updated recently
  // Waiting for Follow-up: In Progress with no update for a few days
  function queueGroups() {
    const g = { fresh: [], review: [], active: [], follow: [], total: 0 };
    const followDays = prefs().attentionDays;
    all.forEach(function (r) {
      if (r.archived || BC.isFinal(r.status)) return;
      if (r.status === "SUBMITTED") (Date.now() - ts(r.createdAt) < DAY ? g.fresh : g.review).push(r);
      else if (r.status === "UNDER REVIEW") g.review.push(r);
      else if (r.status === "IN PROGRESS") ((Date.now() - ts(r.updatedAt || r.createdAt)) / DAY < followDays ? g.active : g.follow).push(r);
    });
    ["fresh", "review", "active", "follow"].forEach(function (k) {
      g[k].sort(function (a, b) { return prioRank(b) - prioRank(a) || ts(a.createdAt) - ts(b.createdAt); });
      g.total += g[k].length;
    });
    return g;
  }

  const NEXT_STEP = { "SUBMITTED": ["Start review", "UNDER REVIEW"], "UNDER REVIEW": ["Start work", "IN PROGRESS"], "IN PROGRESS": ["Mark resolved", "RESOLVED"] };

  function renderQueue() {
    const g = queueGroups();
    const limit = prefs().attentionDays;
    $("waitDaysText").textContent = limit + (limit === 1 ? " day" : " days");
    const cols = [
      ["fresh", "Newly Submitted", "Pending, less than 24 hours old"],
      ["review", "Waiting for Review", "Pending for over a day, or Under Review"],
      ["active", "Currently Being Addressed", "In Progress, updated recently"],
      ["follow", "Waiting for Follow-up", "In Progress, no update for " + limit + "+ days"]
    ];
    $("queueGrid").innerHTML = cols.map(function (c) {
      const list = g[c[0]];
      return '<section class="queue-col"><header><h2>' + esc(c[1]) + ' <span class="count-pill">' + list.length + "</span></h2><p>" + esc(c[2]) + "</p></header>" +
        '<div class="queue-cards">' + (list.length ? list.map(queueCard).join("") : '<p class="empty">Nothing here.</p>') + "</div></section>";
    }).join("");
  }

  function queueCard(r) {
    const age = ageDays(r);
    const late = age >= prefs().attentionDays;
    const next = NEXT_STEP[r.status];
    const opts = BC.PRIORITIES.map(function (p) { return '<option value="' + p + '"' + (p === (r.priority || "Medium") ? " selected" : "") + ">" + p + "</option>"; }).join("");
    return '<article class="q-card' + (late ? " is-late" : "") + '">' +
      '<div class="q-top"><span class="q-id"><button type="button" class="id-link" data-timeline="' + esc(r.id) + '">' + esc(r.reportNo) + "</button> " + (r.urgent ? '<span class="prio prio-high">Urgent</span>' : prioTag(r)) + "</span>" + BC.statusBadge(r.status) + "</div>" +
      '<div class="q-type">' + esc(r.type) + "</div>" +
      '<div class="q-sub">' + esc(r.location) + " &middot; " + esc(r.residentName) + "</div>" +
      '<div class="q-wait' + (late ? " is-late" : "") + '">' + (late ? "&#9888; " : "") + "Waiting " + age + " day" + (age === 1 ? "" : "s") + " &middot; submitted " + esc(shortDay(new Date(r.createdAt))) + "</div>" +
      '<div class="q-actions">' +
        '<label class="q-prio">Priority <select data-prio="' + esc(r.id) + '" aria-label="Priority of ' + esc(r.reportNo) + '">' + opts + "</select></label>" +
        '<button type="button" class="btn btn-sm btn-outline" data-open="' + esc(r.id) + '" data-edit="1">Open</button>' +
        (next ? '<button type="button" class="btn btn-sm" data-next="' + esc(r.id) + '" data-to="' + next[1] + '">' + next[0] + "</button>" : "") +
      "</div></article>";
  }

  $("queueGrid").addEventListener("change", function (e) {
    const s = e.target.closest("select[data-prio]");
    if (!s) return;
    const res = BC.setPriority(s.dataset.prio, s.value, BC.adminName());
    if (res.error) return BC.toast(res.error, "error");
    BC.toast("Priority set to " + s.value + ".", "success");
    window.BCAdmin.refresh();
  });
  $("queueGrid").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-next]");
    if (!b) return;
    if (b.dataset.to === "RESOLVED") return window.BCAdmin.openReport(b.dataset.next, true, false, "RESOLVED");   // add the action taken first
    const res = BC.setStatus(b.dataset.next, b.dataset.to, BC.adminName());
    if (res.error) return BC.toast(res.error, "error");
    BC.toast("Moved to " + BC.statusLabel(b.dataset.to) + ".", "success");
    window.BCAdmin.refresh();
  });

  // ============================================================
  //  4. Analytics & Statistics
  // ============================================================
  const an = { gran: "day", from: null, to: null, compare: false };

  function initAnalytics() {
    $("anGran").addEventListener("change", function () { an.gran = $("anGran").value; $("anNote") && ($("anNote").textContent = ""); renderAnalytics(); });
    $("anFrom").addEventListener("change", function () { an.from = parseDay($("anFrom").value); markPreset(null); renderAnalytics(); });
    $("anTo").addEventListener("change", function () { an.to = parseDay($("anTo").value); markPreset(null); renderAnalytics(); });
    $("anCompare").addEventListener("change", function () { an.compare = $("anCompare").checked; renderAnalytics(); });
    $("anPresets").addEventListener("click", function (e) {
      const b = e.target.closest(".chip");
      if (b) setPreset(Number(b.dataset.days));
    });
    setPreset(30);
  }

  function markPreset(days) {
    $("anPresets").querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("is-active", days !== null && Number(c.dataset.days) === days); });
  }

  function setPreset(days) {
    const today = dayStart(new Date());
    an.to = today;
    if (days === 0) {
      const first = all.length ? dayStart(new Date(Math.min.apply(null, all.map(function (r) { return ts(r.createdAt); })))) : today;
      an.from = first;
      an.gran = "month";
    } else {
      an.from = addDays(today, -(days - 1));
      an.gran = days <= 31 ? "day" : days <= 100 ? "week" : "month";
    }
    $("anGran").value = an.gran;
    $("anFrom").value = toInput(an.from);
    $("anTo").value = toInput(an.to);
    markPreset(days);
    renderAnalytics();
  }

  function makeBuckets(from, to, gran) {
    const end = addDays(to, 1), out = [];
    let s = from;
    while (s < end) {
      let e = gran === "day" ? addDays(s, 1) : gran === "week" ? addDays(s, 7)
        : gran === "month" ? new Date(s.getFullYear(), s.getMonth() + 1, 1) : new Date(s.getFullYear() + 1, 0, 1);
      if (e > end) e = end;
      out.push({ start: s, end: e });
      s = e;
      if (out.length > 2000) break;
    }
    return out;
  }

  function bucketLabel(b, gran) {
    if (gran === "day") return shortDay(b.start);
    if (gran === "week") return shortDay(b.start);
    if (gran === "month") return b.start.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
    return String(b.start.getFullYear());
  }
  function bucketFull(b, gran) {
    if (gran === "day") return fullDay(b.start);
    if (gran === "week") return fullDay(b.start) + " – " + fullDay(addDays(b.end, -1));
    return bucketLabel(b, gran);
  }

  function countPerBucket(buckets) {
    const counts = buckets.map(function () { return 0; });
    all.forEach(function (r) {
      const t = ts(r.createdAt);
      for (let i = 0; i < buckets.length; i++) {
        if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) { counts[i]++; break; }
      }
    });
    return counts;
  }

  // The period right before the selected one (same length, calendar-aligned for months / years)
  function previousRange(from, to, gran) {
    if (gran === "month") {
      const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
      const first = new Date(from.getFullYear(), from.getMonth(), 1);
      return { from: new Date(first.getFullYear(), first.getMonth() - months, 1), to: addDays(first, -1) };
    }
    if (gran === "year") {
      const years = to.getFullYear() - from.getFullYear() + 1;
      return { from: new Date(from.getFullYear() - years, 0, 1), to: new Date(from.getFullYear() - 1, 11, 31) };
    }
    const span = Math.round((addDays(to, 1) - from) / DAY);
    return { from: addDays(from, -span), to: addDays(from, -1) };
  }

  function renderAnalytics() {
    if (!an.from) return initAnalytics();
    if (an.to < an.from) { const t = an.from; an.from = an.to; an.to = t; $("anFrom").value = toInput(an.from); $("anTo").value = toInput(an.to); }

    // Too many points make an unreadable chart: group more coarsely
    const order = ["day", "week", "month", "year"];
    let buckets = makeBuckets(an.from, an.to, an.gran), note = "";
    while (buckets.length > 120 && an.gran !== "year") {
      an.gran = order[order.indexOf(an.gran) + 1];
      buckets = makeBuckets(an.from, an.to, an.gran);
      note = "Grouped by " + an.gran + " so the chart stays readable.";
    }
    $("anGran").value = an.gran;

    const labels = buckets.map(function (b) { return bucketLabel(b, an.gran); });
    const fulls = buckets.map(function (b) { return bucketFull(b, an.gran); });
    const counts = countPerBucket(buckets);
    const total = counts.reduce(function (a, b) { return a + b; }, 0);
    const series = [{ name: "Selected period", values: counts, color: "#2563eb", labelsFor: fulls }];

    let totalText = "Total for " + fullDay(an.from) + " – " + fullDay(an.to) + ": <strong>" + total + " report" + (total === 1 ? "" : "s") + "</strong>";
    if (an.compare) {
      const pr = previousRange(an.from, an.to, an.gran);
      const pb = makeBuckets(pr.from, pr.to, an.gran);
      const pc = countPerBucket(pb);
      const prevTotal = pc.reduce(function (a, b) { return a + b; }, 0);
      const aligned = labels.map(function (_, i) { return pc[i] || 0; });
      series.push({ name: "Previous period (" + shortDay(pr.from) + " – " + fullDay(pr.to) + ")", values: aligned, color: "#94a3b8", dashed: true });
      totalText += " &middot; previous period: <strong>" + prevTotal + "</strong>" +
        (prevTotal ? " (" + (total >= prevTotal ? "▲ " : "▼ ") + Math.abs(pct(total, prevTotal)) + "%)" : " (no reports then)");
    }
    $("anTotal").innerHTML = totalText + (note ? ' <span class="muted small">' + esc(note) + "</span>" : "");

    BCCharts.line($("chTrend"), { labels: labels, series: series, title: "Reports submitted over time" });
    $("trendLegend").innerHTML = series.map(function (s) {
      return '<span class="lg"><i style="background:' + s.color + (s.dashed ? ";opacity:.7" : "") + '"></i>' + esc(s.name) + "</span>";
    }).join("");

    // Category, status and performance use the same date range (by the day the report was submitted)
    const t0 = an.from.getTime(), t1 = addDays(an.to, 1).getTime();
    const inRange = all.filter(function (r) { const t = ts(r.createdAt); return t >= t0 && t < t1; });

    BCCharts.bar($("chCategory"), {
      labels: BC.CONCERN_TYPES,
      values: BC.CONCERN_TYPES.map(function (t) { return inRange.filter(function (r) { return r.type === t; }).length; }),
      colors: BC.CONCERN_TYPES.map(function () { return "#2563eb"; }), title: "Reports by category"
    });
    BCCharts.donut($("chStatus"), {
      items: BC.STATUSES.map(function (s) { return { label: BC.statusLabel(s), value: inRange.filter(function (r) { return r.status === s; }).length, color: STATUS_COLORS[s] }; }),
      title: "Reports by status"
    });

    // Resolution performance: real submission + resolution timestamps
    const resolvedAll = all.filter(function (r) { return r.status === "RESOLVED"; });
    const resolvedIn = resolvedAll.filter(function (r) { const t = ts(BC.resolvedAt(r)); return t >= t0 && t < t1; });
    const avg = function (list) {
      const d = list.map(function (r) { return ts(BC.resolvedAt(r)) - ts(r.createdAt); }).filter(function (x) { return x >= 0; });
      return d.length ? d.reduce(function (a, b) { return a + b; }, 0) / d.length : NaN;
    };
    const pending = all.filter(function (r) { return !BC.isFinal(r.status); }).length;
    $("perfGrid").innerHTML = [
      ["Total resolved reports", resolvedAll.length, "all time"],
      ["Resolved in the selected period", resolvedIn.length, fullDay(an.from) + " – " + fullDay(an.to)],
      ["Average resolution time", duration(avg(resolvedIn)), "reports resolved in the selected period" + (resolvedAll.length ? " (all time: " + duration(avg(resolvedAll)) + ")" : "")],
      ["Reports still pending", pending, "Pending, Under Review or In Progress"]
    ].map(function (p) {
      return '<div class="perf"><span class="label">' + esc(p[0]) + '</span><span class="value">' + esc(p[1]) + '</span><span class="small muted">' + esc(p[2]) + "</span></div>";
    }).join("");

    // Officer ratings (from residents, after a report is resolved)
    const rated = all.filter(function (r) { return r.rating && r.rating.stars; });
    const by = {};
    rated.forEach(function (r) {
      const k = (r.assignedTo || r.rating.officer || "").trim() || "Not assigned";
      (by[k] = by[k] || []).push(r.rating.stars);
    });
    const rows = Object.keys(by).map(function (k) {
      const v = by[k];
      return { name: k, n: v.length, avg: v.reduce(function (a, b) { return a + b; }, 0) / v.length };
    }).sort(function (a, b) { return b.avg - a.avg || b.n - a.n; });
    const overall = rated.length ? rated.reduce(function (a, r) { return a + r.rating.stars; }, 0) / rated.length : 0;
    $("rateSummary").textContent = rated.length
      ? "Overall: " + overall.toFixed(1) + " out of 5 from " + rated.length + " rating" + (rated.length === 1 ? "" : "s") + " (" + resolvedAll.length + " resolved report" + (resolvedAll.length === 1 ? "" : "s") + ")."
      : "No ratings yet. Residents can rate the officials from 1 to 5 stars after their report is resolved.";
    fill($("rateRows"), rows.map(function (o) {
      return "<tr><td data-label=\"Officer\">" + esc(o.name) + "</td><td data-label=\"Ratings\">" + o.n + "</td><td data-label=\"Average\"><strong>" + o.avg.toFixed(1) + "</strong> / 5</td><td data-label=\"Score\">" + BC.starsHtml(o.avg) + "</td></tr>";
    }), 4, "No ratings yet.");
  }

  // ============================================================
  //  6. Resolution History
  // ============================================================
  fillTypeSelect($("histType"));
  ["histSearch", "histType", "histFrom", "histTo"].forEach(function (id) {
    $(id).addEventListener(id === "histSearch" ? "input" : "change", renderHistory);
  });
  $("histClear").addEventListener("click", function () {
    ["histSearch", "histType", "histFrom", "histTo"].forEach(function (id) { $(id).value = ""; });
    renderHistory();
  });

  function historyList() {
    const words = $("histSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const from = $("histFrom").value, to = $("histTo").value;
    return all.filter(function (r) {
      if (r.status !== "RESOLVED") return false;
      if ($("histType").value && r.type !== $("histType").value) return false;
      const day = toInput(new Date(BC.resolvedAt(r)));
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!words.length) return true;
      const hay = [r.reportNo, r.residentName, r.type, r.location, r.remarks, r.actionTaken, r.assignedTo].join(" | ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return ts(BC.resolvedAt(b)) - ts(BC.resolvedAt(a)); });
  }

  function renderHistory() {
    const list = historyList();
    const total = all.filter(function (r) { return r.status === "RESOLVED"; }).length;
    $("histCount").textContent = "Showing " + list.length + " of " + total + " resolved report" + (total === 1 ? "" : "s");
    fill($("histRows"), list.map(function (r) {
      return "<tr>" +
        '<td data-label="Report ID"><button type="button" class="id-link" data-timeline="' + esc(r.id) + '">' + esc(r.reportNo) + "</button>" + (r.archived ? ' <span class="tag">Archived</span>' : "") + "</td>" +
        '<td data-label="Resident">' + esc(r.residentName) + "</td>" +
        '<td data-label="Category">' + esc(r.type) + "</td>" +
        '<td data-label="Location">' + esc(r.location) + "</td>" +
        '<td data-label="Submitted">' + esc(BC.fmtDate(r.createdAt)) + "</td>" +
        '<td data-label="Resolved">' + esc(BC.fmtDate(BC.resolvedAt(r))) + "</td>" +
        '<td data-label="Remarks" class="cell-wrap">' + (esc(r.remarks) || '<span class="muted">—</span>') + "</td>" +
        '<td data-label="Action taken" class="cell-wrap">' + (esc(r.actionTaken) || '<span class="muted">—</span>') + "</td>" +
        '<td data-label="Rating">' + (r.rating ? BC.starsHtml(r.rating.stars) : '<span class="muted">Not rated</span>') + "</td>" +
        '<td data-label="Details" class="actions"><button type="button" class="btn btn-sm btn-outline" data-open="' + esc(r.id) + '">View Details</button></td></tr>';
    }), 10, total ? "No resolved report matches the search or filters." : "No report has been resolved yet. Resolved reports appear here automatically.");
  }

  const HIST_HEAD = ["Report ID", "Resident", "Category", "Location", "Date Submitted", "Date Resolved", "Resolution Remarks", "Action Taken", "Resident Rating"];
  function historyRows() {
    return historyList().map(function (r) {
      return [r.reportNo, r.residentName, r.type, r.location, BC.fmtDate(r.createdAt), BC.fmtDate(BC.resolvedAt(r)), r.remarks || "", r.actionTaken || "", r.rating ? r.rating.stars + "/5" : ""];
    });
  }
  $("histCsv").addEventListener("click", function () {
    const rows = historyRows();
    if (!rows.length) return BC.toast("There are no records to export.", "error");
    BC.downloadCsv("resolution-history", HIST_HEAD, rows);
    BC.toast(rows.length + " record(s) exported.", "success");
  });
  $("histPdf").addEventListener("click", function () {
    const rows = historyRows();
    if (!rows.length) return BC.toast("There are no records to export.", "error");
    BC.printTable("Resolution History", HIST_HEAD, rows);
  });

  // ============================================================
  //  7. Report Archive
  // ============================================================
  fillTypeSelect($("arcType"));
  ["arcSearch", "arcYear", "arcType"].forEach(function (id) { $(id).addEventListener(id === "arcSearch" ? "input" : "change", renderArchive); });
  $("arcClear").addEventListener("click", function () { ["arcSearch", "arcYear", "arcType"].forEach(function (id) { $(id).value = ""; }); renderArchive(); });

  function archiveList() {
    const words = $("arcSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(function (r) {
      if (!r.archived) return false;
      if ($("arcYear").value && String(new Date(r.createdAt).getFullYear()) !== $("arcYear").value) return false;
      if ($("arcType").value && r.type !== $("arcType").value) return false;
      if (!words.length) return true;
      const hay = [r.reportNo, r.residentName, r.type, r.location, r.remarks, r.description].join(" | ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return ts(b.archivedAt || b.createdAt) - ts(a.archivedAt || a.createdAt); });
  }

  function renderArchive() {
    // year options from the archived reports
    const years = Array.from(new Set(all.filter(function (r) { return r.archived; }).map(function (r) { return new Date(r.createdAt).getFullYear(); }))).sort().reverse();
    const sel = $("arcYear"), keep = sel.value;
    sel.innerHTML = '<option value="">All years</option>' + years.map(function (y) { return '<option value="' + y + '">' + y + "</option>"; }).join("");
    sel.value = keep;

    const list = archiveList();
    const total = all.filter(function (r) { return r.archived; }).length;
    $("arcCount").textContent = "Showing " + list.length + " of " + total + " archived report" + (total === 1 ? "" : "s");
    fill($("arcRows"), list.map(function (r) {
      return "<tr>" +
        '<td data-label="Report ID"><button type="button" class="id-link" data-timeline="' + esc(r.id) + '">' + esc(r.reportNo) + "</button></td>" +
        '<td data-label="Resident">' + esc(r.residentName) + "</td>" +
        '<td data-label="Category">' + esc(r.type) + "</td>" +
        '<td data-label="Location">' + esc(r.location) + "</td>" +
        '<td data-label="Submitted">' + esc(BC.fmtDate(r.createdAt)) + "</td>" +
        '<td data-label="Status">' + BC.statusBadge(r.status) + "</td>" +
        '<td data-label="Archived on">' + esc(BC.fmtDate(r.archivedAt)) + "</td>" +
        '<td data-label="Action" class="actions"><button type="button" class="btn btn-sm btn-outline" data-open="' + esc(r.id) + '">View</button> ' +
        '<button type="button" class="btn btn-sm" data-restore="' + esc(r.id) + '">Restore</button></td></tr>';
    }), 8, total ? "No archived report matches the search or filters." : "The archive is empty. Use the archive button next to a Resolved or Rejected report in Report Management.");
  }

  $("arcRows").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-restore]");
    if (!b) return;
    const r = all.find(function (x) { return x.id === b.dataset.restore; });
    if (!r || !confirm("Restore report " + r.reportNo + " to Report Management?")) return;
    const res = BC.restoreReport(r.id, BC.adminName());
    if (res.error) return BC.toast(res.error, "error");
    BC.toast(r.reportNo + " restored to active management.", "success");
    window.BCAdmin.refresh();
  });

  const ARC_HEAD = ["Report ID", "Resident", "Category", "Location", "Date Submitted", "Status", "Remarks", "Action Taken", "Archived On"];
  function archiveRows() {
    return archiveList().map(function (r) {
      return [r.reportNo, r.residentName, r.type, r.location, BC.fmtDate(r.createdAt), BC.statusLabel(r.status), r.remarks || "", r.actionTaken || "", BC.fmtDate(r.archivedAt)];
    });
  }
  $("arcCsv").addEventListener("click", function () {
    const rows = archiveRows();
    if (!rows.length) return BC.toast("There are no records to export.", "error");
    BC.downloadCsv("report-archive", ARC_HEAD, rows);
    BC.toast(rows.length + " record(s) exported.", "success");
  });
  $("arcPdf").addEventListener("click", function () {
    const rows = archiveRows();
    if (!rows.length) return BC.toast("There are no records to export.", "error");
    BC.printTable("Report Archive", ARC_HEAD, rows);
  });

  // ============================================================
  //  8. Resident Management
  // ============================================================
  $("resSearch").addEventListener("input", renderResidents);

  // 0917 123 4567 -> 09•• ••• •567  (the full number appears only after "Show")
  function maskPhone(s) {
    const t = String(s || "");
    if (t.length < 6) return "•••";
    return t.slice(0, 2) + t.slice(2, -3).replace(/[0-9]/g, "•") + t.slice(-3);
  }

  function contactCell(g) {
    const on = revealed.has(g.key);
    return '<span class="phone">' + esc(on ? g.contact : maskPhone(g.contact)) + '</span> ' +
      '<button type="button" class="link-btn-sm" data-reveal="' + esc(g.key) + '">' + (on ? "Hide" : "Show") + "</button>";
  }

  function renderResidents() {
    const q = $("resSearch").value.trim().toLowerCase();
    const all2 = BC.getResidents();
    const list = all2.filter(function (g) { return !q || g.names.some(function (n) { return n.toLowerCase().indexOf(q) >= 0; }); });
    $("resCount").textContent = "Showing " + list.length + " of " + all2.length + " resident" + (all2.length === 1 ? "" : "s");
    fill($("resRows"), list.map(function (g) {
      return "<tr>" +
        '<td data-label="Name"><strong>' + esc(g.name) + "</strong>" + (g.names.length > 1 ? '<div class="small muted">Also: ' + esc(g.names.filter(function (n) { return n !== g.name; }).join(", ")) + "</div>" : "") + "</td>" +
        '<td data-label="Contact">' + contactCell(g) + "</td>" +
        '<td data-label="Reports"><span class="count-pill">' + g.count + "</span></td>" +
        '<td data-label="First report">' + esc(BC.fmtDate(g.firstAt)) + "</td>" +
        '<td data-label="Latest report">' + esc(BC.fmtDate(g.lastAt)) + "</td>" +
        '<td data-label="History" class="actions"><button type="button" class="btn btn-sm btn-outline" data-resident="' + esc(g.key) + '">View history</button> <button type="button" class="btn btn-sm btn-outline btn-outline-danger" data-wipe-res="' + esc(g.key) + '" data-name="' + esc(g.name) + '" data-count="' + g.count + '">Delete</button></td></tr>';
    }), 6, all2.length ? "No resident matches that name." : "No residents yet. Residents appear here after they submit a report.");
  }

  function openResident(key) {
    const g = BC.getResidents().find(function (x) { return x.key === key; });
    if (!g) return;
    $("resTitle").textContent = g.name;
    $("resSub").textContent = g.count + " report" + (g.count === 1 ? "" : "s");
    $("resInfo").innerHTML =
      "<div><dt>Name</dt><dd>" + esc(g.names.join(", ")) + "</dd></div>" +
      "<div><dt>Contact number</dt><dd>" + contactCell(g) + "</dd></div>" +
      "<div><dt>Registered (first report)</dt><dd>" + esc(BC.fmtDate(g.firstAt)) + "</dd></div>" +
      "<div><dt>Latest report</dt><dd>" + esc(BC.fmtDate(g.lastAt)) + "</dd></div>" +
      "<div><dt>Account type</dt><dd>No login account (reports only)</dd></div>" +
      "<div><dt>Reports submitted</dt><dd>" + g.count + "</dd></div>";
    $("resReports").innerHTML = g.reports.map(function (r) { return miniItem(r); }).join("");
    $("residentDialog").dataset.key = key;
    if (!$("residentDialog").open) $("residentDialog").showModal();
  }

  document.addEventListener("click", function (e) {
    const rv = e.target.closest("[data-reveal]");
    if (rv) {
      const key = rv.dataset.reveal;
      const g = BC.getResidents().find(function (x) { return x.key === key; });
      if (revealed.has(key)) revealed.delete(key);
      else {
        revealed.add(key);
        if (g) BC.logActivity({ admin: BC.adminName(), action: "Viewed the contact number of resident " + g.name });
      }
      renderResidents();
      if ($("residentDialog").open) openResident($("residentDialog").dataset.key);
      return;
    }
    const b = e.target.closest("[data-resident]");
    if (b) openResident(b.dataset.resident);
  });
  $("resClose").addEventListener("click", function () { $("residentDialog").close(); });
  $("residentDialog").addEventListener("click", function (e) { if (e.target === $("residentDialog")) $("residentDialog").close(); });
  $("residentDialog").addEventListener("close", function () { revealed.clear(); if (currentView === "residents") renderResidents(); });   // numbers hide again

  // ============================================================
  //  9. Notifications
  // ============================================================
  const NOTIF_ICON = { "new": "🆕", "repeat": "🔁", "info": "💬", "attention": "⚠️", "rating": "⭐" };

  function renderNotifs() {
    const list = BC.getNotifs("admin");
    const unread = list.filter(function (n) { return !n.read; });
    const tabs = $("notifTabs").querySelectorAll(".seg-tab");
    tabs[0].querySelector(".tab-count").textContent = list.length;
    tabs[1].querySelector(".tab-count").textContent = unread.length;
    tabs.forEach(function (t) { t.classList.toggle("is-active", t.dataset.n === notifFilter); });
    const shown = notifFilter === "unread" ? unread : list;
    $("notifList").innerHTML = shown.length ? shown.map(function (n) {
      return '<li class="notif' + (n.read ? "" : " is-unread") + '" data-id="' + esc(n.id) + '">' +
        '<span class="notif-ico" aria-hidden="true">' + (NOTIF_ICON[n.kind] || "🔔") + "</span>" +
        '<div class="notif-body"><div class="notif-text">' + esc(n.text) + '</div><div class="small muted">' + esc(BC.fmtDate(n.at)) + "</div></div>" +
        '<div class="notif-actions">' +
          (n.reportId && all.some(function (r) { return r.id === n.reportId; }) ? '<button type="button" class="btn btn-sm btn-outline" data-nopen="' + esc(n.reportId) + '">Open report</button>' : "") +
          (n.read ? "" : '<button type="button" class="btn btn-sm" data-nread="' + esc(n.id) + '">Mark as read</button>') +
        "</div></li>";
    }).join("") : '<li class="empty">' + (notifFilter === "unread" ? "You are all caught up." : "No notifications yet.") + "</li>";
  }

  $("notifTabs").addEventListener("click", function (e) {
    const t = e.target.closest(".seg-tab");
    if (!t) return;
    notifFilter = t.dataset.n;
    renderNotifs();
  });
  $("notifReadAll").addEventListener("click", function () {
    BC.markNotifsRead("admin", null);
    renderView();
  });
  $("notifList").addEventListener("click", function (e) {
    const r = e.target.closest("button[data-nread]");
    if (r) { BC.markNotifsRead("admin", [r.dataset.nread]); return renderView(); }
    const o = e.target.closest("button[data-nopen]");
    if (o) {
      const li = o.closest("li");
      BC.markNotifsRead("admin", [li.dataset.id]);
      renderView();
      openDetails(o.dataset.nopen, true);
    }
  });

  // ============================================================
  //  10. Activity Logs (read-only)
  // ============================================================
  $("logSearch").addEventListener("input", renderLogs);

  function logList() {
    const words = $("logSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return BC.getLog().filter(function (e) {
      if (!words.length) return true;
      const hay = [e.admin, e.action, e.reportNo, e.detail, BC.statusLabel(e.from), BC.statusLabel(e.to)].join(" | ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  function renderLogs() {
    const list = logList();
    const total = BC.getLog().length;
    $("logCount").textContent = "Showing " + list.length + " of " + total + " entr" + (total === 1 ? "y" : "ies") + " (newest first)";
    fill($("logRows"), list.slice(0, 500).map(function (e) {
      return "<tr>" +
        '<td data-label="Date & time">' + esc(BC.fmtDate(e.at)) + "</td>" +
        '<td data-label="Admin">' + esc(e.admin) + "</td>" +
        '<td data-label="Action">' + esc(e.action) + (e.detail ? '<div class="small muted cell-wrap">' + esc(e.detail) + "</div>" : "") + "</td>" +
        '<td data-label="Report ID">' + (e.reportNo ? esc(e.reportNo) : '<span class="muted">—</span>') + "</td>" +
        '<td data-label="Previous status">' + (e.from ? BC.statusBadge(e.from) : '<span class="muted">—</span>') + "</td>" +
        '<td data-label="New status">' + (e.to ? BC.statusBadge(e.to) : '<span class="muted">—</span>') + "</td></tr>";
    }), 6, total ? "No entry matches the search." : "No activity yet.");
  }

  $("logVerify").addEventListener("click", function () {
    const v = BC.verifyLog(), box = $("logIntegrity");
    box.hidden = false;
    box.className = "alert " + (v.ok ? "alert-success" : "alert-error");
    box.textContent = v.ok
      ? "Log verified: all " + v.total + " entries are in order and unchanged."
      : "Warning: entry number " + v.at + " (counting from the oldest) does not match the log chain. The saved log may have been edited outside this page.";
  });
  $("logCsv").addEventListener("click", function () {
    const list = logList();
    if (!list.length) return BC.toast("There are no records to export.", "error");
    BC.downloadCsv("activity-log", ["Date & time", "Admin", "Action", "Details", "Report ID", "Previous status", "New status"],
      list.map(function (e) { return [BC.fmtDate(e.at), e.admin, e.action, e.detail, e.reportNo, BC.statusLabel(e.from), BC.statusLabel(e.to)]; }));
  });

  // ============================================================
  //  11. Settings
  // ============================================================
  function renderSettings() {
    const p = BC.getProfile();
    $("pfUser").value = BC.adminName();
    $("pfName").value = p.displayName;
    $("pfPosition").value = p.position;
    $("pfEmail").value = p.email;
    $("pfPhone").value = p.phone;

    const pr = prefs();
    $("pNew").checked = pr.notifyNew;
    $("pRepeat").checked = pr.notifyRepeat;
    $("pInfo").checked = pr.notifyInfo;
    $("pAttn").checked = pr.notifyAttention;
    $("pToast").checked = pr.toastNew;
    $("pDays").value = pr.attentionDays;

    const used = BC.storageUsage();
    const rows = [
      ["System", "Barangay Complaint & Report System (local edition)"],
      ["Where data is saved", "This browser only (localStorage)"],
      ["Signed in as", BC.adminName()],
      ["Total reports", all.length + " (" + all.filter(function (r) { return r.archived; }).length + " archived)"],
      ["Residents", BC.getResidents().length],
      ["Activity log entries", BC.getLog().length],
      ["Storage used", Math.round(used / 1024) + " KB of about 5,000 KB"],
      ["Passwords / keys", "None are shown here"]
    ];
    $("sysInfo").innerHTML = rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("");
  }

  $("profileForm").addEventListener("submit", function (e) {
    e.preventDefault();
    BC.saveProfile({ displayName: $("pfName").value.trim() || "Barangay Administrator", position: $("pfPosition").value.trim(), email: $("pfEmail").value.trim(), phone: $("pfPhone").value.trim() });
    BC.toast("Profile saved.", "success");
  });

  $("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const box = $("pwMsg");
    function msg(text, ok) { box.textContent = text; box.className = "alert " + (ok ? "alert-success" : "alert-error"); box.hidden = false; }
    if (!$("pwCur").value || !$("pwNew").value) return msg("Please fill in all the password boxes.");
    if ($("pwNew").value !== $("pwNew2").value) return msg("The two new passwords do not match.");
    const res = BC.changePassword($("pwCur").value, $("pwNew").value);
    if (res.error) return msg(res.error);
    $("pwForm").reset();
    msg("Password changed. Use the new password the next time you log in.", true);
  });

  $("prefForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const days = Math.max(1, Math.min(60, parseInt($("pDays").value, 10) || 3));
    BC.savePrefs({ notifyNew: $("pNew").checked, notifyRepeat: $("pRepeat").checked, notifyInfo: $("pInfo").checked, notifyAttention: $("pAttn").checked, toastNew: $("pToast").checked, attentionDays: days });
    BC.toast("Preferences saved.", "success");
    window.BCAdmin.refresh();
  });

  // ---- Testing tools: clearly marked sample reports with past dates ----
  function buildSamples() {
    let seed = 11;
    const rnd = function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    const names = ["Maria Santos", "Juan Dela Cruz", "Ana Reyes", "Pedro Bautista", "Liza Ramos", "Carlo Mendoza", "Rosa Garcia", "Miguel Torres"];
    const places = ["Purok 1, Rizal St.", "Purok 3, near the chapel", "Sitio Riverside", "Mabini St. corner Bonifacio", "Purok 5, covered court", "Road to the barangay hall"];
    const text = {
      "Improper Garbage Disposal": "Garbage is piling up and not being collected.",
      "Clogged Drainage": "The drainage is clogged and water does not flow.",
      "Damaged Road": "There is a large hole in the road.",
      "Flooding": "The street floods whenever it rains.",
      "Noise Complaint": "Loud music late at night.",
      "Other Concerns": "A streetlight has not been working."
    };
    const now = Date.now(), out = [];
    for (let i = 0; i < 48; i++) {
      const daysAgo = Math.floor(Math.pow(rnd(), 1.25) * 200);
      const created = now - daysAgo * DAY - rnd() * DAY * 0.8;
      const type = pick(BC.CONCERN_TYPES), name = pick(names);
      const phone = "0917" + String(1000000 + names.indexOf(name) * 111111).slice(0, 7);
      let status = "SUBMITTED";
      const roll = rnd();
      if (daysAgo > 30) status = roll < 0.72 ? "RESOLVED" : roll < 0.82 ? "REJECTED" : roll < 0.91 ? "IN PROGRESS" : "UNDER REVIEW";
      else if (daysAgo > 5) status = roll < 0.4 ? "RESOLVED" : roll < 0.55 ? "REJECTED" : roll < 0.75 ? "IN PROGRESS" : "UNDER REVIEW";
      else status = roll < 0.5 ? "SUBMITTED" : roll < 0.75 ? "UNDER REVIEW" : roll < 0.9 ? "IN PROGRESS" : "RESOLVED";

      const hist = [{ status: "SUBMITTED", remarks: "Report received.", at: new Date(created).toISOString(), by: "Resident" }];
      let t = created, remarks = "", action = "", resolvedAt;
      const step = function (s, extra) { t = Math.min(now - 60000, t + (0.3 + rnd() * 2) * DAY); hist.push(Object.assign({ status: s, remarks: "", at: new Date(t).toISOString(), by: "admin" }, extra || {})); };
      if (status !== "SUBMITTED") step("UNDER REVIEW");
      if (status === "IN PROGRESS" || status === "RESOLVED") step("IN PROGRESS", { officer: "Barangay Tanod" });
      if (status === "RESOLVED") {
        remarks = "The concern has been addressed.";
        action = "Barangay personnel handled the concern on site.";
        step("RESOLVED", { remarks: remarks, action: action });
        resolvedAt = new Date(t).toISOString();
      }
      if (status === "REJECTED") { remarks = "Not within barangay jurisdiction."; step("REJECTED", { remarks: remarks }); }
      const d = new Date(created);
      const r = {
        id: BC.uid() + i, reportNo: "SMP-" + String(all.filter(function (x) { return x.sample; }).length + i + 1).padStart(3, "0"),
        residentName: name + " [sample]", contact: phone, type: type, location: pick(places), description: text[type],
        photos: [], photo: "", status: status, priority: pick(["Low", "Medium", "Medium", "High"]), remarks: remarks, actionTaken: action,
        assignedTo: status === "IN PROGRESS" || status === "RESOLVED" ? "Barangay Tanod" : "", history: hist,
        createdAt: new Date(created).toISOString(), updatedAt: hist[hist.length - 1].at, sample: true
      };
      if (resolvedAt) r.resolvedAt = resolvedAt;
      if (status === "REJECTED") r.rejectReason = remarks;
      if ((status === "RESOLVED" || status === "REJECTED") && daysAgo > 90) { r.archived = true; r.archivedAt = hist[hist.length - 1].at; }
      out.push(r);
    }
    return out;
  }

  $("sampleAdd").addEventListener("click", function () {
    if (all.some(function (r) { return r.sample; }) && !confirm("Sample reports are already added. Add another set?")) return;
    const res = BC.importReports(buildSamples());
    if (res.error) return BC.toast(res.error, "error");
    BC.logActivity({ admin: BC.adminName(), action: "Added " + res.added + " sample reports (testing tools)" });
    BC.toast(res.added + " sample reports added (marked [sample]).", "success");
    window.BCAdmin.refresh();
  });
  $("sampleRemove").addEventListener("click", function () {
    if (!all.some(function (r) { return r.sample; })) return BC.toast("There are no sample reports to remove.", "info");
    if (!confirm("Remove all sample reports? Your real reports are not touched.")) return;
    const res = BC.removeSampleReports();
    BC.logActivity({ admin: BC.adminName(), action: "Removed " + res.removed + " sample reports (testing tools)" });
    BC.toast(res.removed + " sample reports removed.", "success");
    window.BCAdmin.refresh();
  });

  // ============================================================
  //  11. Data cleanup (Settings card + the delete buttons on each page)
  // ============================================================
  const WIPE_ITEMS = [
    { k: "notifications", title: "Notifications", desc: "Every alert on the Notifications page.", unit: "notification" },
    { k: "log", title: "Activity logs", desc: "The whole activity log. One new entry records that it was cleared.", unit: "entry", plural: "entries" },
    { k: "ratings", title: "Resident ratings", desc: "Star ratings and comments. Residents can rate those reports again.", unit: "rating" },
    { k: "archived", title: "Report archive", desc: "Every archived report (and its Resolution History entry).", unit: "report" },
    { k: "resolved", title: "Resolution history", desc: "Every resolved report, archived ones included.", unit: "report" },
    { k: "rejected", title: "Rejected reports", desc: "Every rejected report, archived ones included.", unit: "report" },
    { k: "reports", title: "All reports", desc: "Every report with its photos, history and ratings. Numbering starts again at BRG-0001.", unit: "report", danger: true }
  ];
  const wipeDialog = $("wipeDialog");
  let pendingWipe = null;

  function plural(it, n) { return n + " " + (n === 1 ? it.unit : (it.plural || it.unit + "s")); }

  function renderWipe() {
    const c = BC.wipeCounts();
    $("wipeList").innerHTML = WIPE_ITEMS.map(function (it) {
      return '<div class="wipe-row' + (it.danger ? " is-danger" : "") + '"><div class="wipe-info"><strong>' + esc(it.title) + '</strong>' +
        '<span class="small muted">' + esc(it.desc) + '</span></div>' +
        '<span class="count-pill">' + esc(plural(it, c[it.k] || 0)) + '</span>' +
        '<button type="button" class="btn btn-sm btn-outline btn-outline-danger" data-wipe="' + it.k + '"' + (c[it.k] ? "" : " disabled") + '>Delete</button></div>';
    }).join("");
  }

  function askWipe(job) {
    pendingWipe = job;
    $("wipeTitle").textContent = job.title;
    $("wipeText").textContent = job.text;
    $("wipeInput").value = "";
    $("wipeOk").disabled = true;
    wipeDialog.showModal();
    $("wipeInput").focus();
  }

  document.addEventListener("click", function (e) {
    const b = e.target.closest("[data-wipe]");
    if (b && !b.disabled) {
      const it = WIPE_ITEMS.find(function (x) { return x.k === b.dataset.wipe; });
      const n = BC.wipeCounts()[it.k] || 0;
      if (!n) return BC.toast("There is nothing to delete here.", "info");
      return askWipe({ kind: it.k, title: "Delete " + it.title.toLowerCase() + "?",
        text: "This permanently deletes " + plural(it, n) + ". " + it.desc + " It cannot be undone." });
    }
    const r = e.target.closest("[data-wipe-res]");
    if (r) {
      askWipe({ resident: r.dataset.wipeRes, title: "Delete this resident's data?",
        text: "This permanently deletes " + r.dataset.count + " report(s) from " + r.dataset.name + ", with their photos and history. It cannot be undone." });
    }
  });
  $("wipeInput").addEventListener("input", function () { $("wipeOk").disabled = $("wipeInput").value.trim() !== "DELETE"; });
  $("wipeInput").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("wipeOk").disabled) $("wipeOk").click(); });
  $("wipeCancel").addEventListener("click", function () { pendingWipe = null; wipeDialog.close(); });
  wipeDialog.addEventListener("click", function (e) { if (e.target === wipeDialog) wipeDialog.close(); });
  $("wipeOk").addEventListener("click", function () {
    const job = pendingWipe;
    if (!job || $("wipeInput").value.trim() !== "DELETE") return;
    const res = job.resident ? BC.wipeResident(job.resident, BC.adminName()) : BC.wipeData(job.kind, BC.adminName());
    pendingWipe = null;
    wipeDialog.close();
    if (res.error) return BC.toast(res.error, "error");
    BC.toast(res.removed ? res.removed + " item(s) permanently deleted." : "Nothing to delete.", res.removed ? "success" : "info");
    window.BCAdmin.refresh();
  });
  renderWipe();
  BC.onChange(renderWipe);
  window.addEventListener("bc:refresh", renderWipe);

  // ---------- Start ----------
  all = BC.getReports();
  showView();
})();
