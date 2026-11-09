// ============================================================
//  storage.js  -  the "database" (localStorage) + shared helpers.
//  Loaded FIRST on every page. Edit the CONFIG block below to
//  change the admin login.
//
//  Also holds the admin features: archive, priorities, the activity log,
//  notifications, residents (grouped from reports), settings and exports.
//
//  IMPORTANT: localStorage lives inside ONE browser on ONE device.
//  Reports do NOT travel between a phone and a computer. Two tabs
//  of the same browser DO update each other live.
//  Residents do NOT log in. Only the admin has a login (CONFIG below),
//  and its password is visible in this file - this is a demo, not secure.
// ============================================================

(function () {
  // ---------- CONFIG (edit me) ----------
  const CONFIG = {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "admin123",
    // Emergency numbers shown on the resident Home page. Edit, add or delete lines here.
    // (Add your own Barangay Hall number, for example: { name: "Barangay Hall", number: "0917 000 0000", note: "Office hours" })
    HOTLINES: [
      { name: "National Emergency Hotline", number: "911", note: "Police, fire, medical" },
      { name: "Philippine National Police", number: "117", note: "Report a crime" },
      { name: "Philippine Red Cross", number: "143", note: "Medical help, disaster" }
    ]
  };

  const KEYS = {
    reports: "bc_reports",
    myReports: "bc_my_reports",       // ids of reports sent from THIS browser
    lastContact: "bc_last_contact",   // remembers the resident's name + number for next time
    adminSession: "bc_session_admin",
    activity: "bc_activity_log",      // admin activity log (append-only, hash-chained)
    notifs: "bc_notifications",       // admin + resident notifications
    adminProfile: "bc_admin_profile",
    adminPrefs: "bc_admin_prefs",
    adminPw: "bc_admin_pw",           // hash of a changed admin password (if the admin changed it)
    reportSeq: "bc_report_seq"        // last report number handed out (so numbers are never reused)
  };

  const STATUSES = ["SUBMITTED", "UNDER REVIEW", "IN PROGRESS", "RESOLVED", "REJECTED"];
  // The normal workflow (REJECTED is a side exit that needs a reason)
  const WORKFLOW = ["SUBMITTED", "UNDER REVIEW", "IN PROGRESS", "RESOLVED"];
  const PRIORITIES = ["Low", "Medium", "High"];

  // How each status is SHOWN on screen. The saved value (left) never changes;
  // only the wording (right) does. Edit the right-hand side to rename a status everywhere.
  const STATUS_LABELS = {
    "SUBMITTED": "Pending",
    "UNDER REVIEW": "Under Review",
    "IN PROGRESS": "In Progress",
    "RESOLVED": "Resolved",
    "REJECTED": "Rejected"
  };

  const STATUS_INFO = {
    "SUBMITTED": "The resident has successfully sent the report.",
    "UNDER REVIEW": "A barangay official is reviewing the report.",
    "IN PROGRESS": "Barangay personnel are addressing the concern.",
    "RESOLVED": "The reported concern has been addressed.",
    "REJECTED": "The report could not be acted upon. The reason is shown below."
  };

  const CONCERN_TYPES = [
    "Improper Garbage Disposal",
    "Clogged Drainage",
    "Damaged Road",
    "Flooding",
    "Noise Complaint",
    "Other Concerns"
  ];

  // ---------- low-level storage ----------
  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false; // storage full or blocked
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Short, easy-to-remember report numbers: BRG-0001, BRG-0002, BRG-0003 ...
  // The counter is saved, so a number is never used twice (even after reports are deleted).
  function makeReportNo() {
    let n = parseInt(read(KEYS.reportSeq, 0), 10) || 0;
    read(KEYS.reports, []).forEach(function (r) {
      const m = /^BRG-(\d{1,6})$/.exec(r.reportNo || "");
      if (m) n = Math.max(n, parseInt(m[1], 10));
    });
    n += 1;
    write(KEYS.reportSeq, n);
    return "BRG-" + String(n).padStart(4, "0");
  }

  // Lets people type "BRG-0007", "brg 7", "BRG7" or just "7" (older long numbers still work too).
  function normalizeReportNo(no) {
    const raw = String(no || "").trim().toUpperCase().replace(/\s+/g, "-");
    const m = /^(?:BRG-?)?0*(\d{1,6})$/.exec(raw);
    return m ? "BRG-" + m[1].padStart(4, "0") : raw;
  }

  // ---------- this browser's own reports (no resident login) ----------
  function getMyIds() {
    return read(KEYS.myReports, []);
  }

  function rememberReport(id) {
    const ids = getMyIds();
    if (ids.indexOf(id) < 0) {
      ids.unshift(id);
      write(KEYS.myReports, ids);
    }
  }

  function getMyReports() {
    const ids = getMyIds();
    return getReports().filter(function (r) { return ids.indexOf(r.id) >= 0; });
  }

  // Lets a resident look up a report by its number, e.g. BRG-0007
  function findByReportNo(no) {
    const raw = String(no || "").trim().toUpperCase();
    const n = normalizeReportNo(no);
    return getReports().find(function (r) { return r.reportNo === raw || r.reportNo === n; }) || null;
  }

  function getLastContact() {
    return read(KEYS.lastContact, { fullName: "", contact: "" });
  }

  function saveLastContact(fullName, contact) {
    write(KEYS.lastContact, { fullName: fullName, contact: contact });
  }

  // ---------- admin ----------
  // A small non-cryptographic hash (used for the password check and the tamper-evident log).
  // This is a DEMO: browser storage cannot be truly secured.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function passwordOk(pw) {
    const stored = read(KEYS.adminPw, null);
    return stored ? hash("bc:" + pw) === stored : pw === CONFIG.ADMIN_PASSWORD;
  }

  function loginAdmin(username, password) {
    if (username.trim() === CONFIG.ADMIN_USERNAME && passwordOk(password)) {
      write(KEYS.adminSession, { username: CONFIG.ADMIN_USERNAME, at: Date.now() });
      logActivity({ admin: CONFIG.ADMIN_USERNAME, action: "Logged in" });
      return { ok: true };
    }
    return { error: "Incorrect admin username or password." };
  }

  function isAdmin() {
    return !!read(KEYS.adminSession, null);
  }

  function adminName() {
    const s = read(KEYS.adminSession, null);
    return s ? s.username : "";
  }

  function logoutAdmin() {
    if (isAdmin()) logActivity({ admin: adminName(), action: "Logged out" });
    localStorage.removeItem(KEYS.adminSession);
  }

  function changePassword(current, next) {
    if (!passwordOk(current)) return { error: "Your current password is not correct." };
    if (String(next).length < 6) return { error: "The new password must have at least 6 characters." };
    if (next === current) return { error: "The new password must be different from the current one." };
    write(KEYS.adminPw, hash("bc:" + next));
    logActivity({ admin: adminName(), action: "Changed the admin password" });
    return { ok: true };
  }

  function getProfile() {
    return Object.assign({ displayName: "Barangay Administrator", position: "", email: "", phone: "" }, read(KEYS.adminProfile, {}));
  }
  function saveProfile(p) {
    write(KEYS.adminProfile, p);
    logActivity({ admin: adminName(), action: "Updated admin profile" });
  }

  const PREF_DEFAULTS = { attentionDays: 3, notifyNew: true, notifyRepeat: true, notifyInfo: true, notifyAttention: true, toastNew: true };
  function getPrefs() { return Object.assign({}, PREF_DEFAULTS, read(KEYS.adminPrefs, {})); }
  function savePrefs(p) {
    write(KEYS.adminPrefs, p);
    logActivity({ admin: adminName(), action: "Changed notification preferences" });
  }

  // ---------- Activity log ----------
  // Append-only: there is no edit or delete function. Every entry stores a hash of the
  // previous entry, so verifyLog() can detect if someone edits the saved data by hand.
  function logCore(e) {
    return [e.id, e.at, e.admin, e.action, e.reportId, e.reportNo, e.from, e.to, e.detail].join("\u001f");
  }

  function logActivity(e) {
    const log = read(KEYS.activity, []);
    const entry = {
      id: uid(), at: new Date().toISOString(), admin: e.admin || "Admin", action: e.action || "",
      reportId: e.reportId || "", reportNo: e.reportNo || "", from: e.from || "", to: e.to || "", detail: e.detail || ""
    };
    entry.prev = log.length ? log[log.length - 1].hash : "0";
    entry.hash = hash(entry.prev + logCore(entry));
    log.push(entry);
    if (log.length > 1500) log.splice(0, log.length - 1500);
    write(KEYS.activity, log);
  }

  function getLog() {
    return read(KEYS.activity, []).slice().reverse();      // newest first
  }

  // Returns { ok: true } or { ok: false, at: <entry number that does not match> }
  function verifyLog() {
    const log = read(KEYS.activity, []);
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (i > 0 && e.prev !== log[i - 1].hash) return { ok: false, at: i + 1, total: log.length };
      if (e.hash !== hash(e.prev + logCore(e))) return { ok: false, at: i + 1, total: log.length };
    }
    return { ok: true, total: log.length };
  }

  // ---------- Notifications ----------
  // audience: "admin" or "resident". `key` (optional) stops the same alert being created twice.
  function pushNotif(n) {
    const list = read(KEYS.notifs, []);
    if (n.key && list.some(function (x) { return x.key === n.key; })) return;
    list.unshift({ id: uid(), at: new Date().toISOString(), read: false, audience: n.audience, kind: n.kind || "info",
      reportId: n.reportId || "", reportNo: n.reportNo || "", text: n.text, key: n.key || "" });
    if (list.length > 400) list.length = 400;
    write(KEYS.notifs, list);
  }

  // reportIds (optional) limits the list to those reports (used for the resident's own reports)
  function getNotifs(audience, reportIds) {
    return read(KEYS.notifs, []).filter(function (n) {
      return n.audience === audience && (!reportIds || reportIds.indexOf(n.reportId) >= 0);
    });
  }

  // ids = list of notification ids, or null for "all of this audience"
  function markNotifsRead(audience, ids, reportIds) {
    const list = read(KEYS.notifs, []);
    list.forEach(function (n) {
      if (n.audience !== audience) return;
      if (reportIds && reportIds.indexOf(n.reportId) < 0) return;
      if (!ids || ids.indexOf(n.id) >= 0) n.read = true;
    });
    write(KEYS.notifs, list);
  }

  // Creates "needs attention" alerts for reports that waited too long (runs when the admin page loads / refreshes)
  function checkAttention() {
    const prefs = getPrefs();
    if (!prefs.notifyAttention) return;
    const now = Date.now();
    read(KEYS.reports, []).forEach(function (r) {
      if (r.archived || isFinal(r.status)) return;
      const days = Math.floor((now - new Date(r.createdAt).getTime()) / 864e5);
      if (days >= prefs.attentionDays) {
        pushNotif({ audience: "admin", kind: "attention", reportId: r.id, reportNo: r.reportNo, key: "wait-" + r.id,
          text: r.reportNo + " has been waiting " + days + " days (" + statusLabel(r.status) + ") and needs attention." });
      }
      if (r.priority === "High" && (r.status === "SUBMITTED" || r.status === "UNDER REVIEW")) {
        pushNotif({ audience: "admin", kind: "attention", reportId: r.id, reportNo: r.reportNo, key: "high-" + r.id,
          text: "High priority report " + r.reportNo + " is still " + statusLabel(r.status) + "." });
      }
    });
  }

  function isFinal(status) { return status === "RESOLVED" || status === "REJECTED"; }

  // When a report was resolved (also works for older reports that have no resolvedAt saved)
  function resolvedAt(r) {
    if (r.status !== "RESOLVED") return "";
    if (r.resolvedAt) return r.resolvedAt;
    const h = (r.history || []).slice().reverse().find(function (x) { return x.status === "RESOLVED"; });
    return (h && h.at) || r.updatedAt || "";
  }

  // ---------- reports ----------
  function getReports() {
    return read(KEYS.reports, []).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }

  function addReport(r) {
    const reports = read(KEYS.reports, []);
    const now = new Date().toISOString();
    const photos = getPhotos({ photos: r.photos, photo: r.photo }).slice(0, 3);
    const report = {
      id: uid(),
      reportNo: makeReportNo(),
      residentName: r.residentName,
      contact: r.contact,
      type: r.type,
      location: r.location,
      description: r.description,
      photos: photos,                 // up to 3 pictures (data URLs)
      photo: photos[0] || "",         // first picture, kept for older code / old reports
      status: "SUBMITTED",
      urgent: !!r.urgent,             // the resident ticked "urgent"
      priority: r.urgent ? "High" : "Medium",
      remarks: "",
      history: [{ status: "SUBMITTED", remarks: "Report received.", at: now, by: "Resident" }],
      createdAt: now,
      updatedAt: now
    };
    reports.push(report);
    if (!write(KEYS.reports, reports)) {
      return { error: "Browser storage is full. Try again with fewer photos (or none), or clear old reports." };
    }
    rememberReport(report.id);

    // Tell the admin: new complaint, and "another report" when this resident reported before
    const prefs = getPrefs();
    const key = contactKey(r.contact, r.residentName);
    const earlier = reports.filter(function (x) { return x.id !== report.id && contactKey(x.contact, x.residentName) === key; }).length;
    if (prefs.notifyNew) {
      pushNotif({ audience: "admin", kind: "new", reportId: report.id, reportNo: report.reportNo,
        text: (report.urgent ? "URGENT complaint: " : "New complaint: ") + report.type + " at " + report.location + " (" + report.reportNo + ")." });
    }
    if (earlier && prefs.notifyRepeat) {
      pushNotif({ audience: "admin", kind: "repeat", reportId: report.id, reportNo: report.reportNo,
        text: report.residentName + " submitted another report (" + (earlier + 1) + " in total)." });
    }
    return { report: report };
  }

  const ACTION_TEXT = {
    "SUBMITTED": "Set the status back to Pending",
    "UNDER REVIEW": "Reviewed the report (Under Review)",
    "IN PROGRESS": "Changed the status to In Progress",
    "RESOLVED": "Marked the report as Resolved",
    "REJECTED": "Rejected the report"
  };

  // Keeps resolvedAt / rejectReason in step with the status
  function applyStatus(r, before, status, now, remarks) {
    if (status === "RESOLVED" && before !== "RESOLVED") r.resolvedAt = now;
    if (status !== "RESOLVED") delete r.resolvedAt;
    if (status === "REJECTED") r.rejectReason = remarks || r.rejectReason || "";
    else delete r.rejectReason;
    r.status = status;
  }

  // Writes the audit log entry + the resident notification for a status change
  function statusChanged(r, before, status, by) {
    logActivity({ admin: by || "Admin", action: ACTION_TEXT[status] || "Changed the status", reportId: r.id, reportNo: r.reportNo, from: before, to: status });
    pushNotif({ audience: "resident", kind: status === "RESOLVED" ? "rate" : "status", reportId: r.id, reportNo: r.reportNo,
      text: "Your report " + r.reportNo + " is now " + statusLabel(status) + "." +
        (status === "REJECTED" && r.rejectReason ? " Reason: " + r.rejectReason : "") +
        (status === "RESOLVED" ? " Please rate how the barangay officials handled it (1 to 5 stars)." : "") });
  }

  // `assignedTo` (optional) = the barangay officer handling the report.
  // `extra` (optional) = { actionTaken, priority }
  function updateReport(id, status, remarks, by, assignedTo, extra) {
    extra = extra || {};
    if (STATUSES.indexOf(status) < 0) return { error: "Unknown status." };
    const reports = read(KEYS.reports, []);
    const r = reports.find((x) => x.id === id);
    if (!r) return { error: "Report not found." };
    const now = new Date().toISOString();
    const before = r.status;
    const officer = typeof assignedTo === "string" ? assignedTo.trim() : null;
    const officerChanged = officer !== null && officer !== (r.assignedTo || "");
    const remarkChanged = remarks !== (r.remarks || "");   // so the audit log does not repeat old remarks
    const action = typeof extra.actionTaken === "string" ? extra.actionTaken.trim() : null;
    const actionChanged = action !== null && action !== (r.actionTaken || "");
    const prio = PRIORITIES.indexOf(extra.priority) >= 0 ? extra.priority : null;
    const prioChanged = !!prio && prio !== (r.priority || "Medium");
    // photos attached to "Action taken" (up to 3, data URLs). null = leave them as they are
    const photosIn = Array.isArray(extra.actionPhotos) ? extra.actionPhotos.map(safePhoto).filter(Boolean).slice(0, 3) : null;
    const photosChanged = photosIn !== null && JSON.stringify(photosIn) !== JSON.stringify(r.actionPhotos || []);

    r.remarks = remarks;
    applyStatus(r, before, status, now, remarks);
    if (officer !== null) r.assignedTo = officer;
    if (action !== null) r.actionTaken = action;
    if (photosChanged) { if (photosIn.length) r.actionPhotos = photosIn; else delete r.actionPhotos; }
    if (prio) r.priority = prio;
    r.updatedAt = now;
    r.history = r.history || [];
    const entry = { status: status, remarks: remarkChanged ? remarks : "", at: now, by: by || "Admin" };
    if (officerChanged) entry.officer = officer || "(unassigned)";
    if (actionChanged) entry.action = action || "(cleared)";
    if (photosChanged) entry.photos = photosIn.length;
    r.history.push(entry);
    if (!write(KEYS.reports, reports)) return { error: "Could not save the update." };

    const who = by || "Admin";
    const base = { admin: who, reportId: r.id, reportNo: r.reportNo };
    if (status !== before) statusChanged(r, before, status, who);
    if (remarkChanged && remarks) logActivity(Object.assign({ action: status === "REJECTED" ? "Recorded the rejection reason" : "Added a remark", detail: remarks }, base));
    if (officerChanged) logActivity(Object.assign({ action: officer ? "Assigned the report to " + officer : "Removed the assigned officer" }, base));
    if (actionChanged && action) logActivity(Object.assign({ action: "Recorded the action taken", detail: action }, base));
    if (photosChanged) logActivity(Object.assign({ action: photosIn.length ? "Attached " + photosIn.length + " photo(s) to the action taken" : "Removed the action-taken photos" }, base));
    if (prioChanged) logActivity(Object.assign({ action: "Changed the priority to " + prio, detail: (r.priority === prio ? "" : "") }, base));
    if (status === before && (remarkChanged || actionChanged || officerChanged || photosChanged)) {
      pushNotif({ audience: "resident", kind: "update", reportId: r.id, reportNo: r.reportNo,
        text: "An official added an update to your report " + r.reportNo + "." });
    }
    return { report: r };
  }

  // Changes the status of MANY reports at once (batch status updater).
  function bulkUpdateStatus(ids, status, remarks, by) {
    if (status === "REJECTED") return { error: "A rejection needs a reason. Open the report and use Update." };
    const set = new Set(ids);
    const reports = read(KEYS.reports, []);
    const now = new Date().toISOString();
    const done = [];
    reports.forEach(function (r) {
      if (!set.has(r.id) || r.status === status) return;
      const before = r.status;
      applyStatus(r, before, status, now, "");
      r.updatedAt = now;
      r.history = r.history || [];
      r.history.push({ status: status, remarks: remarks || "", at: now, by: by || "Admin" });
      done.push([r, before]);
    });
    if (done.length && !write(KEYS.reports, reports)) return { error: "Could not save the update." };
    done.forEach(function (d) { statusChanged(d[0], d[1], status, by); });
    return { changed: done.length, total: set.size };
  }

  // Changes ONLY the status of one report (used by the inline status dropdown in the table).
  // The resident-facing remarks are left untouched.
  function setStatus(id, status, by) {
    if (STATUSES.indexOf(status) < 0) return { error: "Unknown status." };
    if (status === "REJECTED") return { error: "A rejection needs a reason. Open the report and use Update." };
    const reports = read(KEYS.reports, []);
    const r = reports.find(function (x) { return x.id === id; });
    if (!r) return { error: "Report not found." };
    if (r.status === status) return { report: r, unchanged: true };
    const now = new Date().toISOString();
    const before = r.status;
    applyStatus(r, before, status, now, "");
    r.updatedAt = now;
    r.history = r.history || [];
    r.history.push({ status: status, remarks: "", at: now, by: by || "Admin" });
    if (!write(KEYS.reports, reports)) return { error: "Could not save the update." };
    statusChanged(r, before, status, by);
    return { report: r };
  }

  // Priority: Low / Medium / High
  function setPriority(id, priority, by) {
    if (PRIORITIES.indexOf(priority) < 0) return { error: "Unknown priority." };
    const reports = read(KEYS.reports, []);
    const r = reports.find(function (x) { return x.id === id; });
    if (!r) return { error: "Report not found." };
    const old = r.priority || "Medium";
    if (old === priority) return { report: r, unchanged: true };
    r.priority = priority;
    if (!write(KEYS.reports, reports)) return { error: "Could not save the update." };
    logActivity({ admin: by || "Admin", action: "Changed the priority to " + priority, reportId: r.id, reportNo: r.reportNo, detail: old + " to " + priority });
    return { report: r };
  }

  // A resident rates how the barangay handled a RESOLVED report: 1 (poor) to 5 (best). One rating per report.
  function rateReport(id, stars, comment) {
    stars = parseInt(stars, 10);
    if (!(stars >= 1 && stars <= 5)) return { error: "Please choose 1 to 5 stars." };
    const reports = read(KEYS.reports, []);
    const r = reports.find(function (x) { return x.id === id; });
    if (!r) return { error: "Report not found." };
    if (r.status !== "RESOLVED") return { error: "You can rate a report after it has been resolved." };
    if (r.rating) return { error: "You already rated this report. Thank you!" };
    r.rating = { stars: stars, comment: String(comment || "").trim().slice(0, 500), at: new Date().toISOString(), officer: r.assignedTo || "" };
    if (!write(KEYS.reports, reports)) return { error: "Could not save: browser storage problem." };
    pushNotif({ audience: "admin", kind: "rating", reportId: r.id, reportNo: r.reportNo, key: "rate-" + r.id,
      text: r.residentName + " rated " + (r.assignedTo || "the barangay officials") + " " + stars + " out of 5 stars for " + r.reportNo + "." });
    return { report: r };
  }

  // Five small stars (filled = rating). Safe HTML, used on the admin pages and the resident page.
  function starsHtml(n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '<span class="stars" role="img" aria-label="' + n + ' out of 5 stars"><span class="on">' + "\u2605".repeat(n) + '</span><span class="off">' + "\u2605".repeat(5 - n) + "</span></span>";
  }

  // A resident adds more information to their own open report
  function addResidentInfo(id, text) {
    text = String(text || "").trim();
    if (!text) return { error: "Please type the information first." };
    const reports = read(KEYS.reports, []);
    const r = reports.find(function (x) { return x.id === id; });
    if (!r) return { error: "Report not found." };
    if (isFinal(r.status)) return { error: "This report is already closed." };
    const now = new Date().toISOString();
    r.history = r.history || [];
    r.history.push({ status: r.status, remarks: text.slice(0, 1000), at: now, by: "Resident", info: true });
    r.updatedAt = now;
    if (!write(KEYS.reports, reports)) return { error: "Could not save: browser storage problem." };
    if (getPrefs().notifyInfo) {
      pushNotif({ audience: "admin", kind: "info", reportId: r.id, reportNo: r.reportNo,
        text: r.residentName + " added more information to " + r.reportNo + "." });
    }
    return { report: r };
  }

  // ---------- Archive (nothing is deleted) ----------
  // Only Resolved or Rejected reports can be archived.
  function archiveReports(ids, by) {
    const set = new Set(ids);
    const reports = read(KEYS.reports, []);
    const now = new Date().toISOString();
    const done = [];
    let skipped = 0;
    reports.forEach(function (r) {
      if (!set.has(r.id) || r.archived) return;
      if (!isFinal(r.status)) { skipped++; return; }
      r.archived = true;
      r.archivedAt = now;
      done.push(r);
    });
    if (done.length && !write(KEYS.reports, reports)) return { error: "Could not save the update." };
    done.forEach(function (r) {
      logActivity({ admin: by || "Admin", action: "Moved the report to the archive", reportId: r.id, reportNo: r.reportNo, from: r.status, to: r.status });
    });
    return { archived: done.length, skipped: skipped };
  }

  function restoreReport(id, by) {
    const reports = read(KEYS.reports, []);
    const r = reports.find(function (x) { return x.id === id; });
    if (!r) return { error: "Report not found." };
    delete r.archived;
    delete r.archivedAt;
    if (!write(KEYS.reports, reports)) return { error: "Could not save the update." };
    logActivity({ admin: by || "Admin", action: "Restored the report to active management", reportId: r.id, reportNo: r.reportNo, from: r.status, to: r.status });
    return { report: r };
  }

  // ---------- Residents (grouped from their reports; residents have no accounts) ----------
  function contactKey(contact, name) {
    const digits = String(contact || "").replace(/\D/g, "");
    return digits.length >= 7 ? "tel:" + digits.slice(-10) : "name:" + String(name || "").trim().toLowerCase();
  }

  function getResidents() {
    const map = {};
    getReports().forEach(function (r) {            // newest first
      const k = contactKey(r.contact, r.residentName);
      const g = map[k] || (map[k] = { key: k, name: r.residentName, contact: r.contact, reports: [] });
      g.reports.push(r);
    });
    return Object.keys(map).map(function (k) {
      const g = map[k];
      g.count = g.reports.length;
      g.lastAt = g.reports[0].createdAt;
      g.firstAt = g.reports[g.reports.length - 1].createdAt;
      g.names = Array.from(new Set(g.reports.map(function (r) { return r.residentName; })));
      return g;
    }).sort(function (a, b) { return a.lastAt < b.lastAt ? 1 : -1; });
  }

  // ---------- Sample data (Settings > Testing tools). Every sample report is marked sample:true ----------
  function importReports(list) {
    const reports = read(KEYS.reports, []);
    list.forEach(function (r) { reports.push(r); });
    return write(KEYS.reports, reports) ? { added: list.length } : { error: "Browser storage is full." };
  }
  function removeSampleReports() {
    const reports = read(KEYS.reports, []);
    const left = reports.filter(function (r) { return !r.sample; });
    write(KEYS.reports, left);
    return { removed: reports.length - left.length };
  }

  // Characters used by this app's saved data (browser limit is about 5 million)
  function storageUsage() {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("bc_") === 0) n += k.length + (localStorage.getItem(k) || "").length;
      }
    } catch (e) {}
    return n;
  }

  // ---------- Activity timeline (audit log) ----------
  // Turns a report's saved history into readable events, OLDEST FIRST:
  //   { kind, status, title, detail, at, by }
  // kind = submitted | pending | review | progress | resolved | assigned | note
  // It works for old reports too, because it compares each history entry with the one before it.
  function buildTimeline(r) {
    const events = [];
    const hist = Array.isArray(r.history) ? r.history : [];
    const resident = r.residentName || "Resident";
    const residentBy = resident + " (resident)";

    if (!hist.length) {
      events.push({ kind: "submitted", status: "SUBMITTED", title: "Incident reported", detail: "", at: r.createdAt, by: residentBy });
      return events;
    }

    const STATUS_EVENT = {
      "SUBMITTED":    { kind: "pending",  title: "Set back to Pending" },
      "UNDER REVIEW": { kind: "review",   title: "Moved to Under Review" },
      "IN PROGRESS":  { kind: "progress", title: "Work started (In Progress)" },
      "RESOLVED":     { kind: "resolved", title: "Marked as Resolved" },
      "REJECTED":     { kind: "rejected", title: "Report rejected" }
    };

    let prevStatus = null;
    hist.forEach(function (h, i) {
      if (i === 0) {
        events.push({
          kind: "submitted", status: h.status || "SUBMITTED", title: "Incident reported",
          detail: "Submitted by " + resident + (r.contact ? " (" + r.contact + ")" : ""),
          at: h.at || r.createdAt, by: residentBy
        });
        prevStatus = h.status;
        return;
      }

      const by = h.by && h.by !== "Resident" ? h.by : residentBy;
      const parts = [];
      if (h.info) {
        parts.push({ kind: "note", title: "Resident added information", detail: h.remarks });
      } else {
        if (h.status !== prevStatus && STATUS_EVENT[h.status]) {
          parts.push({ kind: STATUS_EVENT[h.status].kind, status: h.status, title: STATUS_EVENT[h.status].title });
        }
        if (h.officer) {
          parts.push({ kind: "assigned", title: h.officer === "(unassigned)" ? "Officer unassigned" : "Assigned to " + h.officer });
        }
        if (!parts.length && !h.action && !h.photos) {
          parts.push({ kind: "note", title: "Remarks updated" });
          if (!h.remarks) parts[0].detail = "Remarks were cleared.";
        }
        if (parts.length && h.remarks) parts[0].detail = h.remarks;      // the remark belongs to the first event of the entry
        if (h.action) parts.push({ kind: "note", title: "Action taken recorded", detail: h.action });
        if (h.photos) parts.push({ kind: "note", title: "Action photos updated", detail: h.photos + " photo(s) attached" });
      }

      parts.forEach(function (p) {
        events.push({ kind: p.kind, status: p.status || null, title: p.title, detail: p.detail || "", at: h.at, by: by });
      });
      prevStatus = h.status;
    });
    return events;
  }

  // Permanently deletes reports (also forgets them in this browser's "my reports" list).
  function deleteReports(ids, by) {
    const set = new Set(ids);
    const reports = read(KEYS.reports, []);
    const gone = reports.filter(function (r) { return set.has(r.id); });
    const left = reports.filter(function (r) { return !set.has(r.id); });
    if (!write(KEYS.reports, left)) return { error: "Could not delete: browser storage problem." };
    write(KEYS.myReports, getMyIds().filter(function (id) { return !set.has(id); }));
    gone.forEach(function (r) {
      logActivity({ admin: by || "Admin", action: "Permanently deleted the report", reportId: r.id, reportNo: r.reportNo, from: r.status });
    });
    return { removed: reports.length - left.length };
  }

  // ---------- Data cleanup (Admin > Settings, and the buttons on each page) ----------
  // kind: notifications | log | ratings | archived | resolved | rejected | reports
  const WIPE_LABEL = { archived: "archived reports", resolved: "resolved reports", rejected: "rejected reports", reports: "reports (all data)" };
  const WIPE_TEST = {
    archived: function (r) { return !!r.archived; },
    resolved: function (r) { return r.status === "RESOLVED"; },
    rejected: function (r) { return r.status === "REJECTED"; },
    reports: function () { return true; }
  };

  function wipeCounts() {
    const reports = read(KEYS.reports, []);
    const c = { notifications: read(KEYS.notifs, []).length, log: read(KEYS.activity, []).length,
      ratings: reports.filter(function (r) { return r.rating; }).length };
    Object.keys(WIPE_TEST).forEach(function (k) { c[k] = reports.filter(WIPE_TEST[k]).length; });
    return c;
  }

  // Removes reports that match `test`, their alerts, and this browser's saved links to them
  function removeReportsWhere(test, label, by, detail) {
    const reports = read(KEYS.reports, []);
    const gone = reports.filter(test), left = reports.filter(function (r) { return !test(r); });
    if (!gone.length) return { removed: 0 };
    if (!write(KEYS.reports, left)) return { error: "Could not delete: browser storage problem." };
    const ids = new Set(gone.map(function (r) { return r.id; }));
    write(KEYS.myReports, getMyIds().filter(function (id) { return !ids.has(id); }));
    write(KEYS.notifs, read(KEYS.notifs, []).filter(function (n) { return !ids.has(n.reportId); }));
    logActivity({ admin: by || "Admin", action: "Permanently deleted " + gone.length + " " + label, detail: detail || "" });
    return { removed: gone.length };
  }

  function wipeData(kind, by) {
    by = by || "Admin";
    if (kind === "notifications") {
      const n = read(KEYS.notifs, []).length;
      if (!write(KEYS.notifs, [])) return { error: "Could not delete: browser storage problem." };
      if (n) logActivity({ admin: by, action: "Deleted all notifications (" + n + ")" });
      return { removed: n };
    }
    if (kind === "log") {
      const n = read(KEYS.activity, []).length;
      if (!write(KEYS.activity, [])) return { error: "Could not clear the log: browser storage problem." };
      logActivity({ admin: by, action: "Cleared the activity log (" + n + " entries removed)" });   // the new first entry
      return { removed: n };
    }
    if (kind === "ratings") {
      const reports = read(KEYS.reports, []);
      let n = 0;
      reports.forEach(function (r) { if (r.rating) { delete r.rating; n++; } });
      if (n && !write(KEYS.reports, reports)) return { error: "Could not delete: browser storage problem." };
      if (n) logActivity({ admin: by, action: "Deleted " + n + " resident ratings" });
      return { removed: n };
    }
    if (!WIPE_TEST[kind]) return { error: "Unknown option." };
    const res = removeReportsWhere(WIPE_TEST[kind], WIPE_LABEL[kind], by);
    if (kind === "reports" && !res.error) write(KEYS.reportSeq, 0);        // numbering starts again at BRG-0001
    return res;
  }

  // Deletes every report of one resident (a row in Resident Management)
  function wipeResident(key, by) {
    return removeReportsWhere(function (r) { return contactKey(r.contact, r.residentName) === key; }, "report(s) of one resident", by);
  }

  // Runs your function whenever ANOTHER tab of this browser changes the data.
  function onChange(callback) {
    window.addEventListener("storage", function (e) {
      if (e.key === KEYS.reports || e.key === KEYS.notifs || e.key === KEYS.activity || e.key === KEYS.adminPrefs || e.key === null) callback();
    });
  }

  // ---------- small helpers ----------
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  }

  function statusBadge(status) {
    const s = STATUSES.indexOf(status) >= 0 ? status : "SUBMITTED";
    return '<span class="badge badge-' + statusSlug(s) + '">' + esc(statusLabel(s)) + "</span>";
  }

  // Text shown for a status ("SUBMITTED" -> "Pending")
  function statusLabel(status) {
    return STATUS_LABELS[status] || status || "";
  }

  // CSS-friendly name ("UNDER REVIEW" -> "under-review")
  function statusSlug(status) {
    const s = STATUSES.indexOf(status) >= 0 ? status : "SUBMITTED";
    return s.toLowerCase().replace(/\s+/g, "-");
  }

  function safePhoto(src) {
    return typeof src === "string" && src.indexOf("data:image/") === 0 ? src : "";
  }

  // All pictures of a report as a clean list (works for new reports AND old ones with a single `photo`)
  function getPhotos(r) {
    const list = r && Array.isArray(r.photos) && r.photos.length ? r.photos : (r && r.photo ? [r.photo] : []);
    return list.map(safePhoto).filter(Boolean);
  }

  // Opens a saved picture full size in a new tab (browsers block direct links to data: images)
  function openImage(src) {
    const s = safePhoto(src);
    if (!s) return;
    try {
      const parts = s.split(",");
      const mime = parts[0].match(/data:(.*?);/)[1];
      const bin = atob(parts[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      window.open(url, "_blank", "noopener");
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { /* ignore */ }
  }

  function toast(message, type, ms) {
    let wrap = document.getElementById("toasts");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toasts";
      wrap.className = "toast-wrap";
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    const t = document.createElement("div");
    t.className = "toast toast-" + (type || "info");
    t.textContent = message;
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 6000);
  }

  // ---------- Exports (CSV download / print as PDF) ----------
  // One CSV cell: quotes escaped, line breaks removed, and a leading = + - @ neutralised
  // so a spreadsheet never runs text typed by a resident as a formula.
  function csvCell(value) {
    let v = String(value == null ? "" : value).replace(/\r?\n/g, " ");
    if (/^[=+\-@\t]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  function stamp() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // head = array of column names, rows = array of arrays
  function downloadCsv(name, head, rows) {
    const lines = [head.map(csvCell).join(",")].concat(rows.map(function (r) { return r.map(csvCell).join(","); }));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });   // BOM: Excel reads accents correctly
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + "-" + stamp() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // Opens the print window with a clean table (choose "Save as PDF" as the printer)
  function printTable(title, head, rows) {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      'body{font:11px Arial,sans-serif;margin:14px;color:#000}h1{font-size:15px;margin:0 0 4px}p{margin:0 0 10px;color:#444}' +
      'table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e5e5e5}tr{page-break-inside:avoid}' +
      '</style></head><body><h1>' + esc(title) + '</h1><p>Barangay Complaint &amp; Report System &middot; ' + esc(new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })) + ' &middot; ' + rows.length + ' record(s)</p>' +
      '<table><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table></body></html>');
    d.close();
    setTimeout(function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {}
      setTimeout(function () { f.remove(); }, 3000);
    }, 300);
    return f;
  }

  // ---------- Light / dark theme ----------
  // The theme is saved in localStorage ("bc_theme") and applied as
  // <html data-theme="light|dark">. Every button with data-theme-toggle switches it.
  const THEME_KEY = "bc_theme";

  function currentTheme() {
    let t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (t === "dark" || t === "light") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    const SUN = SVG + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const MOON = SVG + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      const icon = btn.querySelector(".theme-icon");
      // One-color line icon that shows what you get when you click it
      if (icon) icon.innerHTML = theme === "dark" ? SUN : MOON;
      const text = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      btn.setAttribute("aria-label", text);
      btn.setAttribute("title", text);
      btn.setAttribute("aria-pressed", String(theme === "dark"));
    });
  }

  function initTheme() {
    applyTheme(currentTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const next = currentTheme() === "dark" ? "light" : "dark";
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
      });
    });
    // Keep other open tabs in step
    window.addEventListener("storage", function (e) {
      if (e.key === THEME_KEY) applyTheme(currentTheme());
    });
  }

  // Sidebar tools row (bottom of the menu): collapse, light/dark, fullscreen, text size.
  // Computers: the collapse button shrinks the menu to icons only ("[" on the keyboard does the same).
  // Everything is remembered in localStorage (bc_side_collapsed, bc_text_size). Phones keep the slide-in menu.
  function initSideTools(side) {
    if (!side || document.getElementById("sideCollapse")) return;
    const ICON = function (path, w) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    };
    const ICONS = {
      // Six-square grid (2 x 3). Right column fades slightly when the menu is collapsed.
      panel: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<rect x="5" y="2.5" width="6" height="5" rx="1.3"/><rect class="gi-r" x="13" y="2.5" width="6" height="5" rx="1.3"/>' +
        '<rect x="5" y="9.5" width="6" height="5" rx="1.3"/><rect class="gi-r" x="13" y="9.5" width="6" height="5" rx="1.3"/>' +
        '<rect x="5" y="16.5" width="6" height="5" rx="1.3"/><rect class="gi-r" x="13" y="16.5" width="6" height="5" rx="1.3"/></svg>',
      expand: ICON('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
      shrink: ICON('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>')
    };
    function tool(id, cls) {
      const b = document.createElement("button");
      b.type = "button"; b.id = id; b.className = "theme-btn side-tool " + (cls || "");
      return b;
    }

    // The row sits where the theme button already is; the theme button moves into it.
    const foot = side.querySelector(".side-foot");
    if (!foot) return;
    const row = document.createElement("div");
    row.className = "side-tools";
    row.setAttribute("role", "toolbar");
    row.setAttribute("aria-label", "Display tools");
    const themeBtn = foot.querySelector("[data-theme-toggle]");
    foot.insertBefore(row, themeBtn || foot.firstChild);

    // 1. Collapse / expand the menu (computers only)
    const collapse = tool("sideCollapse", "side-collapse");
    collapse.innerHTML = ICONS.panel;
    row.appendChild(collapse);

    // 2. Light / dark (existing button, listeners kept)
    if (themeBtn) row.appendChild(themeBtn);

    // 3. Fullscreen
    let full = null;
    if (document.fullscreenEnabled) {
      full = tool("sideFull");
      row.appendChild(full);
      const syncFull = function () {
        const on = !!document.fullscreenElement;
        full.innerHTML = on ? ICONS.shrink : ICONS.expand;
        const lbl = on ? "Exit full screen" : "Full screen";
        full.title = lbl; full.setAttribute("aria-label", lbl);
        full.classList.toggle("is-on", on);
      };
      full.addEventListener("click", function () {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(function () {});
      });
      document.addEventListener("fullscreenchange", syncFull);
      syncFull();
    }

    // 4. Text size: Normal -> Large -> Extra large
    const SIZES = [{ pct: 100, name: "Normal" }, { pct: 112.5, name: "Large" }, { pct: 125, name: "Extra large" }];
    const TS_KEY = "bc_text_size";
    const size = tool("sideText");
    size.innerHTML = '<span class="ts-glyph" aria-hidden="true">A<small>A</small></span>';
    row.appendChild(size);
    let level = 0;
    try { level = Math.max(0, Math.min(2, parseInt(localStorage.getItem(TS_KEY), 10) || 0)); } catch (e) {}
    function applySize() {
      document.documentElement.style.fontSize = SIZES[level].pct + "%";
      const next = SIZES[(level + 1) % SIZES.length].name;
      const lbl = "Text size: " + SIZES[level].name + " (click for " + next.toLowerCase() + ")";
      size.title = lbl; size.setAttribute("aria-label", lbl);
      size.classList.toggle("is-on", level > 0);
      window.dispatchEvent(new Event("resize"));
    }
    size.addEventListener("click", function () {
      level = (level + 1) % SIZES.length;
      try { localStorage.setItem(TS_KEY, String(level)); } catch (e) {}
      applySize();
    });
    applySize();

    // hover tooltips for the icon-only menu
    side.querySelectorAll(".side-nav a").forEach(function (a) { a.title = a.textContent.replace(/\s+/g, " ").trim(); });

    // Collapse behaviour
    const KEY = "bc_side_collapsed";
    function apply(on) {
      document.body.classList.toggle("side-collapsed", on);
      collapse.setAttribute("aria-expanded", String(!on));
      const t = (on ? "Expand the menu" : "Collapse the menu") + "  ( [ )";
      collapse.setAttribute("aria-label", t); collapse.title = t;
      collapse.classList.toggle("is-on", on);
      window.dispatchEvent(new Event("resize"));      // charts redraw to the new width
    }
    function toggleCollapse() {
      const on = !document.body.classList.contains("side-collapsed");
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      apply(on);
    }
    let saved = false;
    try { saved = localStorage.getItem(KEY) === "1"; } catch (e) {}
    apply(saved);
    collapse.addEventListener("click", toggleCollapse);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey || window.innerWidth <= 900) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      toggleCollapse();
    });
  }

  // Opens / closes the sidebar on small screens (the menu button in the top bar).
  // Also switches on the light / dark toggle buttons.
  function initNav() {
    initTheme();
    const toggle = document.getElementById("navToggle");
    const overlay = document.getElementById("navOverlay");
    const side = document.getElementById("sidebar");
    initSideTools(side);
    if (!toggle || !side) return;
    function close() {
      document.body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    toggle.addEventListener("click", function () {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    if (overlay) overlay.addEventListener("click", close);
    side.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  // Shrinks a photo to a small JPEG "data URL" so it fits in localStorage (~5 MB total).
  function compressImage(file, maxSize, quality) {
    maxSize = maxSize || 800;
    quality = quality || 0.6;
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";                       // PNG / WebP with transparency would turn black as JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("That file is not a valid image."));
      };
      img.src = url;
    });
  }

  // Everything other files can use lives on window.BC
  window.BC = {
    CONFIG: CONFIG, STATUSES: STATUSES, STATUS_LABELS: STATUS_LABELS, STATUS_INFO: STATUS_INFO, CONCERN_TYPES: CONCERN_TYPES,
    getMyReports: getMyReports, findByReportNo: findByReportNo, rememberReport: rememberReport,
    getLastContact: getLastContact, saveLastContact: saveLastContact,
    loginAdmin: loginAdmin, isAdmin: isAdmin, adminName: adminName, logoutAdmin: logoutAdmin,
    getReports: getReports, addReport: addReport, updateReport: updateReport, onChange: onChange,
    setStatus: setStatus, buildTimeline: buildTimeline, statusLabel: statusLabel, statusSlug: statusSlug,
    bulkUpdateStatus: bulkUpdateStatus, deleteReports: deleteReports,
    WORKFLOW: WORKFLOW, PRIORITIES: PRIORITIES, isFinal: isFinal, resolvedAt: resolvedAt,
    setPriority: setPriority, addResidentInfo: addResidentInfo, rateReport: rateReport, starsHtml: starsHtml, wipeData: wipeData, wipeCounts: wipeCounts, wipeResident: wipeResident, normalizeReportNo: normalizeReportNo, archiveReports: archiveReports, restoreReport: restoreReport,
    getResidents: getResidents, contactKey: contactKey,
    logActivity: logActivity, getLog: getLog, verifyLog: verifyLog,
    pushNotif: pushNotif, getNotifs: getNotifs, markNotifsRead: markNotifsRead, checkAttention: checkAttention,
    getProfile: getProfile, saveProfile: saveProfile, getPrefs: getPrefs, savePrefs: savePrefs, changePassword: changePassword,
    importReports: importReports, removeSampleReports: removeSampleReports, storageUsage: storageUsage, uid: uid,
    downloadCsv: downloadCsv, printTable: printTable, csvCell: csvCell,
    esc: esc, fmtDate: fmtDate, statusBadge: statusBadge, safePhoto: safePhoto, getPhotos: getPhotos, openImage: openImage,
    toast: toast, initNav: initNav, compressImage: compressImage
  };
})();
