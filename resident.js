// ============================================================
//  resident.js  -  the public home page (index.html): the two sidebar
//  views (Report an Incident, Track My Report).
//  Residents do NOT log in: they fill in the form, submit, and
//  follow their reports below.
//  Needs storage.js to be loaded first.
//
//  Also contains the form's keyboard navigation (Enter = next field)
//  and validation: see initFormNav() below.
// ============================================================

(function () {
  const $ = function (id) { return document.getElementById(id); };
  BC.initNav();

  const known = {};        // report id -> last seen status/remarks (to announce changes)
  let firstRender = true;
  let focusId = null;       // report to scroll to when the Track page opens (from the Home page)

  // ---------- Sidebar views: "Report an Incident" / "Track My Report" ----------
  function showView() {
    const view = location.hash === "#track" ? "track" : location.hash === "#report" ? "report" : "home";
    $("home").hidden = view !== "home";
    $("submit").hidden = view !== "report";
    $("my-reports").hidden = view !== "track";
    document.querySelectorAll("[data-view]").forEach(function (a) {
      a.classList.toggle("active", a.dataset.view === view);
    });
    window.scrollTo(0, 0);
    if (view === "track" && focusId) {            // coming from "Rate now" / a report number on Home
      const card = $("rep-" + focusId);
      focusId = null;
      if (card) {
        card.scrollIntoView({ block: "center" });
        card.classList.add("is-focus");
        setTimeout(function () { card.classList.remove("is-focus"); }, 2600);
      }
    }
  }
  window.addEventListener("hashchange", showView);
  showView();

  // Fill the "type of concern" dropdown
  BC.CONCERN_TYPES.forEach(function (t) { $("type").add(new Option(t, t)); });

  // The form always starts blank (nothing from a previous report is kept).
  // Stop the browser from re-filling the name / number, and wipe anything it restores.
  $("fullName").setAttribute("autocomplete", "off");
  $("contact").setAttribute("autocomplete", "off");
  function blankForm() {
    $("reportForm").reset();
  }
  blankForm();
  window.addEventListener("pageshow", function (e) { if (e.persisted) blankForm(); });

  // ============================================================
  //  FORM NAVIGATION + VALIDATION
  //  Enter moves to the next field, an empty required field shows an
  //  error and returns the cursor to it, and Enter on the last field
  //  presses "Submit Report". This MUST run before the submit handler
  //  below is added, so it can block a submit with missing fields.
  // ============================================================
  function initFormNav() {
    const form = $("reportForm");
    const errBox = $("formError");
    const okBox = $("successMsg");
    const submitBtn = $("submitBtn");

    // Field order (top to bottom). Change this list if you add fields.
    const FIELDS = [
      { id: "fullName",    label: "full name",               required: true },
      { id: "contact",     label: "contact number",          required: true },
      { id: "type",        label: "type of concern",         required: true },
      { id: "location",    label: "location of the problem", required: true },
      { id: "description", label: "description",             required: true },
      { id: "photoAdd",    label: "incident photos",         required: false }
    ].map(function (f) { f.el = $(f.id); return f; })
     .filter(function (f) { return f.el; });

    function problemWith(f) {
      const v = (f.el.value || "").trim();
      if (f.required && !v) {
        return f.el.tagName === "SELECT"
          ? "Please select the " + f.label + "."
          : "Please fill in the " + f.label + ".";
      }
      if (f.id === "contact" &&
          (!/^[0-9+\-\s()]{7,30}$/.test(v) || v.replace(/\D/g, "").length < 7)) {
        return "Please enter a valid contact number (numbers only, for example 0917 123 4567).";
      }
      return "";
    }

    function clearErrors() {
      errBox.hidden = true;
      FIELDS.forEach(function (f) {
        f.el.classList.remove("field-invalid");
        f.el.removeAttribute("aria-invalid");
      });
    }

    // Move the cursor to a field with a smooth scroll
    function goTo(el) {
      if (!el.isConnected) el = submitBtn;   // "Add Photo" is hidden once 3 photos are chosen
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el.tagName === "INPUT" && el.type !== "file" && el.select) el.select();
    }

    function fail(f, message) {
      clearErrors();
      okBox.hidden = true;
      errBox.textContent = message;
      errBox.hidden = false;
      f.el.classList.add("field-invalid");
      f.el.setAttribute("aria-invalid", "true");
      goTo(f.el);
    }

    // Check fields 0..count-1 in order. On the first problem: show the
    // message, put the cursor in that field and return false.
    function validateUpTo(count) {
      for (let i = 0; i < count; i++) {
        const msg = problemWith(FIELDS[i]);
        if (msg) { fail(FIELDS[i], msg); return false; }
      }
      return true;
    }

    FIELDS.forEach(function (f, i) {
      // Phone keyboards show "Next" / "Go" instead of a plain return key
      if (f.el.tagName === "INPUT" && f.el.type !== "file") {
        f.el.setAttribute("enterkeyhint", i === FIELDS.length - 1 ? "go" : "next");
      }

      f.el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" || e.isComposing) return;
        if (f.id === "photoAdd") return;          // Enter on "Add Photo" opens the file browser
        if (f.el.tagName === "TEXTAREA" && e.shiftKey) return;   // Shift+Enter = new line

        e.preventDefault();                       // never submit by accident

        if (!validateUpTo(i + 1)) return;         // earlier fields must be OK too
        clearErrors();

        if (i < FIELDS.length - 1) goTo(FIELDS[i + 1].el);   // next field
        else submitBtn.click();                               // last field: Submit Report
      });

      // Remove the red outline as soon as the resident fixes the field
      f.el.addEventListener("input", function () {
        f.el.classList.remove("field-invalid");
        f.el.removeAttribute("aria-invalid");
      });
      f.el.addEventListener("change", function () {
        f.el.classList.remove("field-invalid");
        f.el.removeAttribute("aria-invalid");
      });
    });

    // Clicking "Submit Report" is checked the same way
    form.addEventListener("submit", function (e) {
      if (!validateUpTo(FIELDS.length)) {
        e.preventDefault();
        e.stopImmediatePropagation();   // the submit handler below will not run
      } else {
        clearErrors();
      }
    });

    // Start on the first field (computers only, so phones don't pop the keyboard)
    if (location.hash === "#report" && window.matchMedia("(min-width: 901px)").matches) {
      FIELDS[0].el.focus({ preventScroll: true });
    }
  }
  initFormNav();

  // Character counter under the description box
  const descBox = $("description"), descCount = $("descCount");
  function updateDescCount() { descCount.textContent = descBox.value.length + " / " + descBox.maxLength; }
  descBox.addEventListener("input", updateDescCount);
  $("reportForm").addEventListener("reset", function () { setTimeout(updateDescCount, 0); });
  updateDescCount();

  // ============================================================
  //  INCIDENT PHOTOS: up to 3 images, drag & drop, live preview
  //  Edit the limits here. Chosen files are kept in `chosen` until
  //  the report is submitted (then they are shrunk and saved).
  // ============================================================
  const PHOTO_MAX = 3;
  const PHOTO_MAX_MB = 5;
  const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;
  const chosen = [];                           // { file, url }
  const photoInput = $("photo");
  const slotsBox = $("photoSlots");
  const addBtn = $("photoAdd");
  const emptyTpl = slotsBox.querySelector(".photo-empty").cloneNode(true);

  function photoError(lines) {
    const box = $("photoError");
    box.innerHTML = lines.map(BC.esc).join("<br>");
    box.hidden = !lines.length;
  }

  function isAllowed(file) {
    // Some systems leave file.type empty, so fall back to the file extension.
    return PHOTO_TYPES.indexOf(file.type) >= 0 || (!file.type && PHOTO_EXT.test(file.name));
  }

  function renderPhotos() {
    $("photoCount").textContent = chosen.length + " / " + PHOTO_MAX + " photos";
    const hadFocus = slotsBox.contains(document.activeElement) ? document.activeElement : null;
    slotsBox.innerHTML = "";
    chosen.forEach(function (p, i) {
      const slot = document.createElement("div");
      slot.className = "photo-slot is-filled" + (p.fresh ? " is-new" : "");
      p.fresh = false;
      const img = document.createElement("img");
      img.src = p.url;
      img.alt = "Selected photo " + (i + 1) + ": " + p.file.name;
      img.addEventListener("error", function () {
        removePhoto(p);
        photoError([p.file.name + " could not be read as an image."]);
      });
      const x = document.createElement("button");
      x.type = "button";
      x.className = "photo-remove";
      x.setAttribute("aria-label", "Remove photo " + (i + 1));
      x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      x.addEventListener("click", function () { removePhoto(p); photoError([]); });
      slot.appendChild(img);
      slot.appendChild(x);
      slotsBox.appendChild(slot);
    });
    let empties = PHOTO_MAX - chosen.length;
    if (chosen.length < PHOTO_MAX) { slotsBox.appendChild(addBtn); empties--; }
    for (let k = 0; k < empties; k++) slotsBox.appendChild(emptyTpl.cloneNode(true));
    // keep keyboard focus somewhere sensible after a re-draw
    if (hadFocus && !hadFocus.isConnected) {
      const target = chosen.length < PHOTO_MAX ? addBtn : slotsBox.querySelector(".photo-remove");
      if (target) target.focus();
    }
  }

  function removePhoto(p) {
    const i = chosen.indexOf(p);
    if (i < 0) return;
    URL.revokeObjectURL(p.url);
    chosen.splice(i, 1);
    renderPhotos();
  }

  function clearPhotos() {
    chosen.forEach(function (p) { URL.revokeObjectURL(p.url); });
    chosen.length = 0;
    photoInput.value = "";
    photoError([]);
    renderPhotos();
  }

  function addPhotos(fileList) {
    const problems = [];
    let skippedForLimit = 0;
    Array.prototype.forEach.call(fileList, function (file) {
      if (!isAllowed(file)) {
        problems.push('"' + file.name + '" is not supported. Please use JPG, JPEG, PNG or WebP.');
      } else if (file.size > PHOTO_MAX_MB * 1024 * 1024) {
        problems.push('"' + file.name + '" is too large (' + (file.size / 1048576).toFixed(1) + " MB). Each photo must be " + PHOTO_MAX_MB + " MB or smaller.");
      } else if (chosen.length >= PHOTO_MAX) {
        skippedForLimit++;
      } else {
        chosen.push({ file: file, url: URL.createObjectURL(file), fresh: true });
      }
    });
    if (skippedForLimit) {
      problems.push("You can add up to " + PHOTO_MAX + " photos only. " + skippedForLimit + (skippedForLimit === 1 ? " photo was" : " photos were") + " not added. Remove one first to add another.");
    }
    photoError(problems);
    renderPhotos();
  }

  addBtn.addEventListener("click", function () { photoInput.click(); });
  photoInput.addEventListener("change", function () {
    addPhotos(photoInput.files);
    photoInput.value = "";                      // lets the same file be picked again
  });

  // Drag & drop onto the whole upload box
  const drop = $("photoDrop");
  let dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
  drop.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.classList.add("is-dragging"); });
  drop.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  drop.addEventListener("dragleave", function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove("is-dragging"); });
  drop.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove("is-dragging");
    addPhotos(e.dataTransfer.files);
  });

  // A form reset (also used after a successful submit) clears the photos too
  $("reportForm").addEventListener("reset", clearPhotos);
  renderPhotos();

  // ---------- Submit a report ----------
  $("reportForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const ok = $("successMsg");
    const bad = $("formError");
    ok.hidden = true;
    bad.hidden = true;

    const fullName = $("fullName").value.trim();
    const contact = $("contact").value.trim();
    const type = $("type").value;
    const place = $("location").value.trim();
    const description = $("description").value.trim();
    const files = chosen.map(function (p) { return p.file; });

    function showError(text) {
      bad.textContent = text;
      bad.hidden = false;
      bad.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (!fullName || !contact || !type || !place || !description) return showError("Please fill in all the required fields.");
    if (!/^[0-9+\-\s()]{7,30}$/.test(contact) || contact.replace(/\D/g, "").length < 7) {
      return showError("Please enter a valid contact number (numbers only, for example 0917 123 4567).");
    }

    const btn = $("submitBtn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Submitting...";

    try {
      const photos = [];
      let failed = 0;
      for (const f of files) {
        try { photos.push(await BC.compressImage(f)); } catch (err) { failed++; }
      }
      if (failed && !confirm(failed + (failed === 1 ? " photo" : " photos") + " could not be processed.\n\nSubmit the report without " + (failed === 1 ? "it" : "them") + "?")) return;
      const res = BC.addReport({
        residentName: fullName, contact: contact, type: type,
        location: place, description: description, photos: photos, urgent: $("urgent").checked
      });
      if (res.error) return showError(res.error);

      $("successNo").textContent = "Report No.: " + res.report.reportNo + " (write this number down: you can use it to look up your report later)";
      ok.hidden = false;
      ok.scrollIntoView({ behavior: "smooth", block: "center" });

      // Clear EVERY field so the form is ready for a new report
      $("reportForm").reset();
      clearPhotos();
      document.querySelectorAll("#reportForm .field-invalid").forEach(function (el) {
        el.classList.remove("field-invalid");
        el.removeAttribute("aria-invalid");
      });
      // On computers, put the cursor back in the first box (not on phones: it would pop the keyboard)
      if (window.matchMedia("(min-width: 901px)").matches) $("fullName").focus({ preventScroll: true });
      render();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  // ---------- Look up a report by number ----------
  $("trackBtn").addEventListener("click", lookup);
  $("trackNo").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); lookup(); }
  });

  function lookup() {
    const msg = $("trackMsg");
    msg.hidden = true;
    $("trackResult").innerHTML = "";
    const no = $("trackNo").value.trim();
    if (!no) {
      msg.textContent = "Type your report number first.";
      msg.hidden = false;
      return;
    }
    const r = BC.findByReportNo(no);
    if (!r) {
      msg.textContent = "No report found with that number in this browser. Check the number and try again.";
      msg.hidden = false;
      return;
    }
    BC.rememberReport(r.id);      // keep it in the list below
    $("trackNo").value = "";
    render();
  }

  // ---------- My reports ----------
  function render() {
    const reports = BC.getMyReports();

    // Tell the resident when an official changes something.
    reports.forEach(function (r) {
      const prev = known[r.id];
      if (!firstRender && prev && (prev.status !== r.status || prev.remarks !== (r.remarks || ""))) {
        BC.toast("Update on " + r.reportNo + ": now " + BC.statusLabel(r.status), "success");
      }
      known[r.id] = { status: r.status, remarks: r.remarks || "" };
    });
    firstRender = false;

    const counts = {};
    BC.STATUSES.forEach(function (s) { counts[s] = 0; });
    reports.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
    $("miniStats").innerHTML = reports.length
      ? "<span>Total: " + reports.length + "</span>" + BC.STATUSES.map(function (s) { return "<span>" + BC.esc(BC.statusLabel(s)) + ": " + counts[s] + "</span>"; }).join("")
      : "";

    // Keep what the resident is typing (and which "add information" boxes are open) while the list redraws
    const typed = {}, opened = {};
    document.querySelectorAll("#reportList textarea[data-info-text]").forEach(function (t) { typed[t.dataset.infoText] = t.value; });
    document.querySelectorAll("#reportList details.more-info[open]").forEach(function (d) { opened[d.dataset.id] = true; });

    const rateDraft = {};
    document.querySelectorAll('#reportList input[name^="rate-"]:checked').forEach(function (i) { rateDraft[i.name] = { v: i.value }; });
    document.querySelectorAll("#reportList textarea[data-rate-comment]").forEach(function (t) {
      const k = "rate-" + t.dataset.rateComment; rateDraft[k] = rateDraft[k] || {}; rateDraft[k].c = t.value;
    });

    $("reportList").innerHTML = reports.length
      ? reports.map(reportCard).join("")
      : '<p class="empty">No reports yet. Use the form above to send your first one.</p>';

    document.querySelectorAll("#reportList textarea[data-info-text]").forEach(function (t) { if (typed[t.dataset.infoText]) t.value = typed[t.dataset.infoText]; });
    document.querySelectorAll("#reportList details.more-info").forEach(function (d) { if (opened[d.dataset.id]) d.open = true; });
    Object.keys(rateDraft).forEach(function (k) {
      const d = rateDraft[k];
      if (d.v) { const i = document.querySelector('#reportList input[name="' + k + '"][value="' + d.v + '"]'); if (i) { i.checked = true; showRateHint(i); } }
      if (d.c) { const t = document.querySelector('#reportList textarea[data-rate-comment="' + k.slice(5) + '"]'); if (t) t.value = d.c; }
    });
    renderNotifs(reports);
    renderHome(reports);
  }


  // ============================================================
  //  HOME (default page): greeting, my numbers, reports waiting for stars,
  //  my reports with a filter, latest updates, hotlines, snapshot.
  // ============================================================
  const HOME_FILTERS = [["all", "All"], ["open", "Open"], ["resolved", "Resolved"], ["rejected", "Rejected"]];
  let homeFilter = "all";

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }

  function duration(ms) {
    if (!isFinite(ms) || ms <= 0) return "-";
    const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : m + "m";
  }

  function avgStars(list) {
    const rated = list.filter(function (r) { return r.rating && r.rating.stars; });
    return rated.length ? { n: rated.length, avg: rated.reduce(function (a, r) { return a + r.rating.stars; }, 0) / rated.length } : null;
  }

  // Four small segments: Pending > Under Review > In Progress > Resolved (last one reads "Rejected" for rejected reports)
  function stepper(r) {
    const rej = r.status === "REJECTED";
    const steps = rej ? ["SUBMITTED", "UNDER REVIEW", "IN PROGRESS", "REJECTED"] : BC.WORKFLOW;
    const now = rej ? 3 : Math.max(0, BC.WORKFLOW.indexOf(r.status));
    return '<ol class="mini-steps' + (rej ? " is-rejected" : "") + '" aria-label="Progress of this report">' + steps.map(function (s, i) {
      const cls = (i < now || r.status === "RESOLVED") ? "is-done" : i === now ? "is-current" : "";
      return '<li class="' + cls + '"><span>' + BC.esc(BC.statusLabel(s)) + "</span></li>";
    }).join("") + "</ol>";
  }

  function homeItem(r) {
    const rate = r.status === "RESOLVED"
      ? (r.rating ? BC.starsHtml(r.rating.stars) : '<button type="button" class="btn btn-sm" data-goto="' + BC.esc(r.id) + '">Rate now</button>')
      : "";
    return '<div class="hm-item"><div class="hm-item-top"><button type="button" class="mi-id hm-link" data-goto="' + BC.esc(r.id) + '" title="Open this report">' + BC.esc(r.reportNo) + "</button>" +
      (r.urgent ? '<span class="prio prio-high">Urgent</span>' : "") + BC.statusBadge(r.status) + '<span class="hm-rate-slot">' + rate + "</span></div>" +
      '<div class="mi-sub">' + BC.esc(r.type) + " &middot; " + BC.esc(r.location) + "</div>" +
      stepper(r) +
      '<div class="mi-when">Sent ' + BC.esc(BC.fmtDate(r.createdAt)) + (r.assignedTo ? " &middot; Handled by " + BC.esc(r.assignedTo) : "") + "</div></div>";
  }

  function renderHome(reports) {
    reports = reports || BC.getMyReports();
    const open = reports.filter(function (r) { return !BC.isFinal(r.status); });
    const resolved = reports.filter(function (r) { return r.status === "RESOLVED"; });
    const toRate = resolved.filter(function (r) { return !r.rating; });
    const mine = avgStars(reports);

    // Greeting (uses the name on the latest report)
    const first = reports.length ? String(reports[0].residentName || "").trim().split(/\s+/)[0] : "";
    $("hmGreet").textContent = greeting() + (first ? ", " + first : "") + "!";
    $("hmSub").textContent = reports.length
      ? (open.length ? "You have " + open.length + " open report" + (open.length === 1 ? "" : "s") + ". Here is where they stand." : "All your reports are closed. Thank you for helping the barangay.")
      : "Report a concern, follow its progress and tell us how we did.";

    // Numbers
    const cards = [
      ["My reports", reports.length, "sent from this browser", "#2563eb"],
      ["Open", open.length, "still being handled", "#d97706"],
      ["Resolved", resolved.length, toRate.length ? toRate.length + " waiting for your stars" : "thank you!", "#16a34a"],
      ["My ratings", mine ? mine.avg.toFixed(1) + " / 5" : "-", mine ? mine.n + " rating" + (mine.n === 1 ? "" : "s") + " given" : "none given yet", "#f59e0b"]
    ];
    $("hmStats").innerHTML = cards.map(function (c) {
      return '<div class="hm-stat" style="--tone:' + c[3] + '"><span class="hm-stat-label">' + BC.esc(c[0]) + '</span><span class="hm-stat-value">' + BC.esc(c[1]) + '</span><span class="hm-stat-note">' + BC.esc(c[2]) + "</span></div>";
    }).join("");

    // Waiting for stars
    $("hmRate").hidden = !toRate.length;
    $("hmRateList").innerHTML = toRate.map(function (r) {
      return '<div class="hm-rate-row"><span><strong>' + BC.esc(r.reportNo) + "</strong> &middot; " + BC.esc(r.type) + '</span><button type="button" class="btn btn-sm" data-goto="' + BC.esc(r.id) + '">Rate now</button></div>';
    }).join("");

    // My reports with filter
    const test = { all: function () { return true; }, open: function (r) { return !BC.isFinal(r.status); },
      resolved: function (r) { return r.status === "RESOLVED"; }, rejected: function (r) { return r.status === "REJECTED"; } };
    $("hmFilters").innerHTML = HOME_FILTERS.map(function (f) {
      return '<button type="button" class="chip' + (f[0] === homeFilter ? " is-active" : "") + '" data-hfilter="' + f[0] + '">' + f[1] + " (" + reports.filter(test[f[0]]).length + ")</button>";
    }).join("");
    const shown = reports.filter(test[homeFilter]);
    $("hmReports").innerHTML = shown.length ? shown.slice(0, 6).map(homeItem).join("")
      + (shown.length > 6 ? '<a class="small" href="#track">See all ' + shown.length + " reports &rarr;</a>" : "")
      : '<p class="empty">' + (reports.length ? "No reports in this group." : 'No reports yet. <a href="#report">Send your first report</a> or <a href="#track">look one up by its number</a>.') + "</p>";
    $("hmCsv").disabled = !reports.length;

    // Latest updates from the barangay
    const ids = reports.map(function (r) { return r.id; });
    const notes = ids.length ? BC.getNotifs("resident", ids) : [];
    $("hmReadAll").hidden = !notes.some(function (n) { return !n.read; });
    $("hmNotifs").innerHTML = notes.length ? notes.slice(0, 3).map(function (n) {
      return '<div class="res-notif' + (n.read ? "" : " is-unread") + '"><span aria-hidden="true">' + (n.kind === "rate" ? "⭐" : n.kind === "status" ? "🔔" : "💬") + '</span><div>' +
        BC.esc(n.text) + '<div class="when">' + BC.esc(BC.fmtDate(n.at)) + "</div></div></div>";
    }).join("") : '<p class="empty small">No updates yet. You will see them here when the officials act on your report.</p>';

    // Hotlines (edit in storage.js > CONFIG.HOTLINES)
    $("hmHotlines").innerHTML = (BC.CONFIG.HOTLINES || []).map(function (h) {
      return '<li><span><strong>' + BC.esc(h.name) + "</strong>" + (h.note ? '<small>' + BC.esc(h.note) + "</small>" : "") + '</span><a class="hotline-no" href="tel:' + BC.esc(String(h.number).replace(/[^0-9+]/g, "")) + '">' + BC.esc(h.number) + "</a></li>";
    }).join("");

    // Snapshot of everything saved in this browser
    const all = BC.getReports();
    const done = all.filter(function (r) { return r.status === "RESOLVED"; });
    const times = done.map(function (r) { return new Date(BC.resolvedAt(r)) - new Date(r.createdAt); }).filter(function (x) { return x >= 0; });
    const overall = avgStars(all);
    const snap = [
      ["Reports received", all.length],
      ["Resolved", done.length + (all.length ? " (" + Math.round((done.length / all.length) * 100) + "%)" : "")],
      ["Average time to resolve", times.length ? duration(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : "-"],
      ["Residents' rating", overall ? overall.avg.toFixed(1) + " / 5" : "-"]
    ];
    $("hmSnap").innerHTML = snap.map(function (s) { return '<div><span>' + BC.esc(s[0]) + "</span><strong>" + BC.esc(s[1]) + "</strong></div>"; }).join("");
    $("hmStatusInfo").innerHTML = BC.STATUSES.map(function (s) { return "<li>" + BC.statusBadge(s) + " " + BC.esc(BC.STATUS_INFO[s] || "") + "</li>"; }).join("");
  }

  $("home").addEventListener("click", function (e) {
    const f = e.target.closest("[data-hfilter]");
    if (f) { homeFilter = f.dataset.hfilter; return renderHome(); }
    const g = e.target.closest("[data-goto]");
    if (g) {
      focusId = g.dataset.goto;
      if (location.hash === "#track") showView(); else location.hash = "#track";
      return;
    }
    if (e.target.closest("#hmReadAll")) {
      BC.markNotifsRead("resident", null, BC.getMyReports().map(function (r) { return r.id; }));
      renderNotifs();
      return renderHome();
    }
    if (e.target.closest("#hmCsv")) {
      const list = BC.getMyReports();
      if (!list.length) return;
      BC.downloadCsv("my-reports", ["Report No.", "Concern", "Location", "Status", "Urgent", "Submitted", "Remarks", "Action taken", "My rating"],
        list.map(function (r) { return [r.reportNo, r.type, r.location, BC.statusLabel(r.status), r.urgent ? "Yes" : "No", BC.fmtDate(r.createdAt), r.remarks || "", r.actionTaken || "", r.rating ? r.rating.stars + "/5" : ""]; }));
      BC.toast("Your list was downloaded.", "success");
    }
  });

  // ---------- Notifications from the barangay (status changed / official added an update) ----------
  function renderNotifs(reports) {
    const ids = (reports || BC.getMyReports()).map(function (r) { return r.id; });
    const list = ids.length ? BC.getNotifs("resident", ids) : [];
    const unread = list.filter(function (n) { return !n.read; }).length;
    $("notifCard").hidden = !list.length;
    const badge = $("badge-track");
    if (badge) { badge.hidden = !unread; badge.textContent = unread > 9 ? "9+" : unread; }
    $("notifCount").textContent = unread ? unread + " new" : list.length;
    $("resNotifs").innerHTML = list.slice(0, 8).map(function (n) {
      return '<div class="res-notif' + (n.read ? "" : " is-unread") + '"><span aria-hidden="true">' + (n.kind === "rate" ? "⭐" : n.kind === "status" ? "🔔" : "💬") + '</span><div>' +
        BC.esc(n.text) + '<div class="when">' + BC.esc(BC.fmtDate(n.at)) + "</div></div></div>";
    }).join("");
  }
  $("notifReadAll").addEventListener("click", function () {
    BC.markNotifsRead("resident", null, BC.getMyReports().map(function (r) { return r.id; }));
    renderNotifs();
    renderHome();
  });

  // ---------- "Add more information" on an open report ----------
  $("reportList").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-info-send]");
    if (!b) return;
    const id = b.dataset.infoSend;
    const box = document.querySelector('#reportList textarea[data-info-text="' + id + '"]');
    const res = BC.addResidentInfo(id, box ? box.value : "");
    if (res.error) return BC.toast(res.error, "error");
    BC.toast("Your information was sent to the barangay.", "success");
    if (box) box.value = "";
    render();
  });

  // ---------- Rate the officials after a report is resolved (5 stars = best) ----------
  const RATE_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  function showRateHint(input) {
    const box = input.closest(".rate-box");
    const hint = box && box.querySelector(".rate-hint");
    if (hint) hint.textContent = RATE_WORDS[+input.value] + " (" + input.value + " of 5)";
  }
  $("reportList").addEventListener("change", function (e) {
    if (e.target.matches('input[name^="rate-"]')) showRateHint(e.target);
  });
  $("reportList").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-rate-send]");
    if (!b) return;
    const id = b.dataset.rateSend;
    const picked = document.querySelector('#reportList input[name="rate-' + id + '"]:checked');
    const box = document.querySelector('#reportList textarea[data-rate-comment="' + id + '"]');
    const res = BC.rateReport(id, picked ? picked.value : 0, box ? box.value : "");
    if (res.error) return BC.toast(res.error, "error");
    BC.toast("Thank you! Your rating was sent to the barangay.", "success");
    render();
  });

  function rateSection(r) {
    if (r.status !== "RESOLVED") return "";
    if (r.rating) {
      return '<div class="rate-box is-done"><strong>Your rating</strong> ' + BC.starsHtml(r.rating.stars) +
        ' <span class="small muted">' + BC.esc(RATE_WORDS[r.rating.stars]) + " &middot; " + BC.esc(BC.fmtDate(r.rating.at)) + "</span>" +
        (r.rating.comment ? '<p class="small">' + BC.esc(r.rating.comment) + "</p>" : "") + "</div>";
    }
    const who = r.assignedTo ? BC.esc(r.assignedTo) : "the barangay officials";
    let stars = "";
    for (let n = 5; n >= 1; n--) {
      stars += '<input type="radio" id="rate-' + BC.esc(r.id) + "-" + n + '" name="rate-' + BC.esc(r.id) + '" value="' + n + '">' +
        '<label for="rate-' + BC.esc(r.id) + "-" + n + '" title="' + n + " star" + (n > 1 ? "s" : "") + '"><span class="visually-hidden">' + n + " star" + (n > 1 ? "s" : "") + "</span>\u2605</label>";
    }
    return '<div class="rate-box"><strong>How did we do?</strong>' +
      '<p class="small muted">Your report is resolved. Please rate how ' + who + " handled it. 5 stars is the best.</p>" +
      '<fieldset class="rate-stars"><legend class="visually-hidden">Rating from 1 to 5 stars</legend>' + stars + "</fieldset>" +
      '<span class="rate-hint small muted" aria-live="polite">Choose 1 to 5 stars</span>' +
      '<textarea data-rate-comment="' + BC.esc(r.id) + '" maxlength="500" placeholder="Optional: tell us what went well or what could be better." aria-label="Comment about the officials for ' + BC.esc(r.reportNo) + '"></textarea>' +
      '<button type="button" class="btn btn-sm" data-rate-send="' + BC.esc(r.id) + '">Send rating</button></div>';
  }

  function reportCard(r) {
    const photos = BC.getPhotos(r);
    const history = (r.history || []).slice().reverse();
    return '' +
      '<article class="card report" id="rep-' + BC.esc(r.id) + '">' +
        '<div class="report-head"><span class="id">' + BC.esc(r.reportNo) + '</span>' + (r.urgent ? '<span class="prio prio-high">Urgent</span>' : '') + BC.statusBadge(r.status) + '</div>' +
        '<div class="report-meta">' +
          '<span><strong>' + BC.esc(r.type) + '</strong></span>' +
          '<span>Location: ' + BC.esc(r.location) + '</span>' +
          '<span>Submitted: ' + BC.esc(BC.fmtDate(r.createdAt)) + '</span>' +
        '</div>' +
        '<p class="desc">' + BC.esc(r.description) + '</p>' +
        (photos.length ? '<div class="photo-gallery">' + photos.map(function (src, i) {
          return '<img src="' + src + '" alt="Photo evidence ' + (i + 1) + '" onclick="BC.openImage(this.src)">';
        }).join("") + '</div>' : '') +
        '<p class="small muted">' + BC.esc(BC.STATUS_INFO[r.status] || "") + '</p>' +
        (r.remarks ? '<div class="remarks-box"><strong>' + (r.status === "REJECTED" ? "Reason for rejection" : "Latest remarks from barangay officials") + '</strong>' + BC.esc(r.remarks) + '</div>' : '') +
        ((r.actionTaken || BC.getPhotos({ photos: r.actionPhotos }).length) ? '<div class="remarks-box"><strong>Action taken</strong>' + BC.esc(r.actionTaken || "") +
          (BC.getPhotos({ photos: r.actionPhotos }).length ? '<div class="photo-gallery">' + BC.getPhotos({ photos: r.actionPhotos }).map(function (src, i) {
            return '<img src="' + src + '" alt="Action taken photo ' + (i + 1) + '" onclick="BC.openImage(this.src)">';
          }).join("") + '</div>' : '') + '</div>' : '') +
        rateSection(r) +
        (BC.isFinal(r.status) ? '' :
          '<details class="more-info" data-id="' + BC.esc(r.id) + '"><summary>Add more information</summary>' +
          '<textarea data-info-text="' + BC.esc(r.id) + '" maxlength="1000" placeholder="Anything new the officials should know (for example, the problem got worse)." aria-label="More information for ' + BC.esc(r.reportNo) + '"></textarea>' +
          '<button type="button" class="btn btn-sm" data-info-send="' + BC.esc(r.id) + '">Send to barangay</button></details>') +
        (history.length ?
          '<details class="history"><summary>Status timeline (' + history.length + ')</summary><ol class="timeline">' +
          history.map(function (h) {
            return '<li>' + BC.statusBadge(h.status) + '<div class="when">' + BC.esc(BC.fmtDate(h.at)) + '</div>' +
              (h.remarks ? '<p class="note">' + BC.esc(h.remarks) + '</p>' : '') + '</li>';
          }).join("") + '</ol></details>' : '') +
      '</article>';
  }

  render();
  BC.onChange(render);   // another tab (the admin) changed something
})();
