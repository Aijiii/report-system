// ============================================================
//  admin.js  -  Admin side.
//  Used by admin-login.html and admin-dashboard.html.
//  Needs storage.js to be loaded first (it provides window.BC).
//  Admin username/password are set in storage.js (CONFIG).
//
//  The dashboard code is split into small numbered sections:
//     1. State + setup              6. Delete (single + bulk, with confirmation)
//     2. Status tabs + filters      7. Batch status updater
//     3. Table rendering            8. Export (CSV / PDF)
//     4. Inline status dropdown     9. Details modal + update form
//     5. Row selection             10. Activity timeline (audit log) modal
//
//  This file runs the "Report Management" page. The other admin pages
//  (dashboard cards, queue, analytics, history, archive, residents,
//  notifications, logs, settings) are in admin-pages.js, which uses
//  window.BCAdmin (set near the bottom of this file) to open the same
//  details and timeline windows.
//
//  Everything is saved with BC.* (localStorage), so new reports, status
//  changes and deletions survive a page refresh.
// ============================================================

(function () {
  const $ = function (id) { return document.getElementById(id); };
  const page = document.body.dataset.page;
  BC.initNav();

  if (page === "admin-login") initLogin();
  if (page === "admin-dashboard") initDashboard();

  // ============================================================
  //  ADMIN LOGIN
  // ============================================================
  function initLogin() {
    const msg = $("adminMsg");
    if (BC.isAdmin()) {
      location.replace("admin-dashboard.html");
      return;
    }
    $("adminLoginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const username = $("adminUser").value;
      const password = $("adminPassword").value;
      if (!username || !password) {
        msg.textContent = "Please enter your username and password.";
        msg.className = "alert alert-error";
        msg.hidden = false;
        return;
      }
      const res = BC.loginAdmin(username, password);
      if (res.error) {
        msg.textContent = res.error;
        msg.className = "alert alert-error";
        msg.hidden = false;
        return;
      }
      location.replace("admin-dashboard.html");
    });
  }

  // ============================================================
  //  ADMIN DASHBOARD
  // ============================================================
  function initDashboard() {
    if (!BC.isAdmin()) {
      location.replace("admin-login.html");
      return;
    }

    // ---------- 1. State + setup ----------
    let allReports = [];               // every report in storage (archived ones too)
    let reports = [];                  // the ACTIVE reports (not archived): what this page works with
    let visible = [];                  // the reports currently shown in the table (after tab/search/filter)
    let current = null;                // report open in the details dialog
    let currentPhotos = [];            // its pictures
    let currentActionPhotos = [];      // photos attached to its "Action taken"
    let actionPics = [];               // photos in the update form (data URLs)
    let timelineId = null;             // report open in the timeline dialog
    let pendingDelete = [];            // reports waiting for "Confirm Delete"
    let activeTab = "";                // "" = All, otherwise a status value such as "RESOLVED"
    let firstLoad = true;
    const knownIds = {};
    const flashIds = {};               // rows to highlight briefly (new report / status just changed)
    const selected = new Set();        // ids of the ticked rows

    const dialog = $("reportDialog");
    const confirmDialog = $("confirmDialog");
    const timelineDialog = $("timelineDialog");
    const rowsEl = $("reportRows");
    const dateFrom = $("dateFrom");
    const dateTo = $("dateTo");
    const searchBox = $("searchBox");
    const typeFilter = $("typeFilter");
    const tabsEl = $("statusTabs");

    $("adminEmailLabel").textContent = BC.adminName();
    $("adminApp").hidden = false;

    // Dropdowns use the friendly names (Pending, Under Review...) but keep the saved values
    BC.STATUSES.forEach(function (s) {
      $("uStatus").add(new Option(BC.statusLabel(s), s));
      if (s !== "REJECTED") $("bulkStatus").add(new Option(BC.statusLabel(s), s));   // a rejection needs its own reason
    });
    BC.PRIORITIES.forEach(function (p) { $("uPriority").add(new Option(p, p)); });
    BC.CONCERN_TYPES.forEach(function (t) { typeFilter.add(new Option(t, t)); });

    // Summary card titles come from the same names
    document.querySelectorAll(".stat[data-filter]").forEach(function (btn) {
      const lab = btn.querySelector(".label");
      if (btn.dataset.filter && !lab.dataset.fixed) lab.textContent = BC.statusLabel(btn.dataset.filter);
    });

    function logout() {
      BC.logoutAdmin();
      location.replace("admin-login.html");
    }
    $("adminLogoutBtn").addEventListener("click", logout);

    // Marks a row to flash for a few seconds
    function flash(id) {
      flashIds[id] = true;
      setTimeout(function () { delete flashIds[id]; }, 6000);
    }

    // Reload from storage and redraw everything
    function refresh() {
      BC.checkAttention();
      allReports = BC.getReports();
      reports = allReports.filter(function (r) { return !r.archived; });

      // Announce reports that showed up since the last refresh
      const fresh = [];
      allReports.forEach(function (r) {
        if (!firstLoad && !knownIds[r.id]) { flash(r.id); fresh.push(r); }
        knownIds[r.id] = true;
      });
      if (fresh.length && BC.getPrefs().toastNew) {
        BC.toast(fresh.length === 1 ? "New report: " + fresh[0].type + " (" + fresh[0].reportNo + ")" : fresh.length + " new reports arrived.", "success", 8000);
      }
      firstLoad = false;

      // Forget ticked rows that no longer exist
      const existing = new Set(reports.map(function (r) { return r.id; }));
      Array.from(selected).forEach(function (id) { if (!existing.has(id)) selected.delete(id); });

      $("livePill").textContent = "Live · updated " + new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      updateStats();
      updateTabs();
      fillOfficerList();
      renderTable();
      window.dispatchEvent(new CustomEvent("bc:refresh", { detail: { all: allReports, active: reports } }));   // admin-pages.js redraws the other pages
    }

    function countOf(status) {
      return reports.filter(function (r) { return r.status === status; }).length;
    }

    function updateStats() {
      $("statTotal").textContent = reports.length;
      $("statSubmitted").textContent = countOf("SUBMITTED");
      $("statReview").textContent = countOf("UNDER REVIEW");
      $("statProgress").textContent = countOf("IN PROGRESS");
      $("statResolved").textContent = countOf("RESOLVED");
      $("statRejected").textContent = countOf("REJECTED");
    }

    // Suggest officers that were already used on other reports
    function fillOfficerList() {
      const base = ["Barangay Captain", "Barangay Kagawad", "Barangay Tanod", "Barangay Secretary", "SK Chairperson"];
      const used = reports.map(function (r) { return r.assignedTo; }).filter(Boolean);
      const all = Array.from(new Set(used.concat(base)));
      $("officerList").innerHTML = all.map(function (n) { return '<option value="' + BC.esc(n) + '"></option>'; }).join("");
    }

    // Reload the data and the cards without redrawing the table (the caller redraws it)
    function refreshQuiet() {
      allReports = BC.getReports();
      reports = allReports.filter(function (r) { return !r.archived; });
      updateStats();
      updateTabs();
      window.dispatchEvent(new CustomEvent("bc:refresh", { detail: { all: allReports, active: reports } }));
    }

    // ---------- 2. Status tabs + search + filters ----------
    // Tabs are built from BC.STATUSES, so renaming a status in storage.js renames the tab too.
    tabsEl.innerHTML = [{ value: "", label: "All" }]
      .concat(BC.STATUSES.map(function (s) { return { value: s, label: BC.statusLabel(s) }; }))
      .map(function (t) {
        return '<button type="button" role="tab" class="seg-tab" data-tab="' + BC.esc(t.value) + '" aria-selected="false">' +
          BC.esc(t.label) + ' <span class="tab-count">0</span></button>';
      }).join("");

    // Highlights the active tab / summary card and refreshes the counters
    function updateTabs() {
      tabsEl.querySelectorAll(".seg-tab").forEach(function (b) {
        const on = b.dataset.tab === activeTab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        b.querySelector(".tab-count").textContent = b.dataset.tab ? countOf(b.dataset.tab) : reports.length;
      });
      document.querySelectorAll(".stat[data-filter]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.dataset.filter === activeTab);
      });
    }

    function setTab(value) {
      activeTab = value;
      updateTabs();
      renderTable(true);                       // true = replay the fade-in animation
    }

    tabsEl.addEventListener("click", function (e) {
      const b = e.target.closest(".seg-tab");
      if (b) setTab(b.dataset.tab);
    });
    // Left / Right arrow keys move between tabs
    tabsEl.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const list = Array.from(tabsEl.querySelectorAll(".seg-tab"));
      const i = list.findIndex(function (b) { return b.dataset.tab === activeTab; });
      const next = list[(i + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
      setTab(next.dataset.tab);
      next.focus();
    });

    document.querySelectorAll(".stat").forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.dataset.filter); });
    });

    searchBox.addEventListener("input", function () { renderTable(); });
    dateFrom.addEventListener("change", function () { renderTable(true); });
    dateTo.addEventListener("change", function () { renderTable(true); });
    typeFilter.addEventListener("change", function () { renderTable(true); });
    $("clearFilters").addEventListener("click", function () {
      searchBox.value = "";
      typeFilter.value = "";
      dateFrom.value = "";
      dateTo.value = "";
      setTab("");
    });

    // "2026-11-08" for the local calendar day (so the date filters match what the admin sees)
    function localDay(iso) {
      const d = new Date(iso);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    // Searches report ID, name, category, location, officer, status and the description keywords.
    function filteredReports() {
      const words = searchBox.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return reports.filter(function (r) {
        if (activeTab && r.status !== activeTab) return false;
        if (typeFilter.value && r.type !== typeFilter.value) return false;
        if (dateFrom.value && localDay(r.createdAt) < dateFrom.value) return false;
        if (dateTo.value && localDay(r.createdAt) > dateTo.value) return false;
        if (!words.length) return true;
        const hay = [r.reportNo, r.residentName, r.location, r.type, r.contact, r.description, r.assignedTo, r.status, BC.statusLabel(r.status)]
          .map(function (v) { return String(v || "").toLowerCase(); }).join(" | ");
        return words.every(function (w) { return hay.indexOf(w) >= 0; });   // every typed word must match
      });
    }

    // ---------- 3. Table rendering ----------
    const ICON_TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

    // Replays the soft fade-in (used when switching tabs / filters)
    function replayFade() {
      const wrap = $("tableWrap");
      wrap.classList.remove("fade-in");
      void wrap.offsetWidth;                   // forces the browser to restart the animation
      wrap.classList.add("fade-in");
    }

    // The status badge as a clickable dropdown "pill" (section 4 handles the change)
    const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>';

    function statusPill(r) {
      const options = BC.STATUSES.map(function (s) {
        return '<option value="' + BC.esc(s) + '"' + (s === r.status ? " selected" : "") + ">" + BC.esc(BC.statusLabel(s)) + "</option>";
      }).join("");
      return '<span class="status-pill badge badge-' + BC.statusSlug(r.status) + '">' +
        '<select class="status-select" data-id="' + BC.esc(r.id) + '" aria-label="Change status of report ' + BC.esc(r.reportNo) + '">' + options + "</select></span>";
    }

    function renderTable(animate) {
      visible = filteredReports();

      // Only rows you can see can stay ticked (so bulk actions never touch hidden rows)
      const shown = new Set(visible.map(function (r) { return r.id; }));
      Array.from(selected).forEach(function (id) { if (!shown.has(id)) selected.delete(id); });

      $("countLine").textContent = "Showing " + visible.length + " of " + reports.length + " report" + (reports.length === 1 ? "" : "s");
      if (animate) replayFade();

      if (!visible.length) {
        rowsEl.innerHTML = '<tr><td colspan="8" class="empty">' +
          (reports.length ? "No reports match this tab, search or filter." : "No reports yet. New reports will appear here automatically.") + "</td></tr>";
        updateSelectionUI();
        return;
      }

      rowsEl.innerHTML = visible.map(function (r) {
        const id = BC.esc(r.id);
        const isSel = selected.has(r.id);
        return '' +
          '<tr data-id="' + id + '" class="' + (flashIds[r.id] ? "row-new " : "") + (isSel ? "is-selected" : "") + '">' +
            '<td data-label="Select" class="col-check"><input type="checkbox" class="row-check" data-id="' + id + '"' + (isSel ? " checked" : "") + ' aria-label="Select report ' + BC.esc(r.reportNo) + '"></td>' +
            '<td data-label="Report ID"><button type="button" class="id-link" data-act="timeline" data-id="' + id + '" title="Open the activity timeline">' + BC.esc(r.reportNo) + '</button>' +
              (r.urgent || r.priority === "High" ? ' <span class="prio prio-high" title="' + (r.urgent ? "Marked urgent by the resident" : "High priority") + '">' + (r.urgent ? "Urgent" : "High") + "</span>" : "") + '</td>' +
            '<td data-label="Resident">' + BC.esc(r.residentName) + '</td>' +
            '<td data-label="Concern Type">' + BC.esc(r.type) + '</td>' +
            '<td data-label="Location">' + BC.esc(r.location) + '</td>' +
            '<td data-label="Date Submitted">' + BC.esc(BC.fmtDate(r.createdAt)) + '</td>' +
            '<td data-label="Status">' + statusPill(r) + '</td>' +
            '<td data-label="Action" class="actions">' +
              '<button class="btn btn-sm btn-outline" type="button" data-act="view" data-id="' + id + '">View</button> ' +
              '<button class="btn btn-sm" type="button" data-act="update" data-id="' + id + '">Update</button> ' +
              (BC.isFinal(r.status) ? '<button class="icon-action icon-neutral" type="button" data-act="archive" data-id="' + id + '" aria-label="Archive report ' + BC.esc(r.reportNo) + '" title="Move to the archive">' + ICON_ARCHIVE + '</button> ' : '') +
              '<button class="icon-action" type="button" data-act="delete" data-id="' + id + '" aria-label="Delete report ' + BC.esc(r.reportNo) + '" title="Delete report">' + ICON_TRASH + '</button>' +
            '</td>' +
          '</tr>';
      }).join("");
      updateSelectionUI();
    }

    // One click handler for every button in the table
    rowsEl.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-id]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "delete") askDelete([btn.dataset.id]);
      else if (act === "archive") archive([btn.dataset.id]);
      else if (act === "timeline") openTimeline(btn.dataset.id);
      else openReport(btn.dataset.id, act === "update");
    });

    // One change handler for the checkboxes (section 5) and the status dropdowns (section 4)
    rowsEl.addEventListener("change", function (e) {
      const sel = e.target.closest(".status-select");
      if (sel) return inlineStatus(sel);

      const cb = e.target.closest(".row-check");
      if (!cb) return;
      if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
      cb.closest("tr").classList.toggle("is-selected", cb.checked);
      updateSelectionUI();
    });

    // ---------- 4. Inline status dropdown ----------
    // Picking a new status in the table saves it straight away (no edit page needed).
    function inlineStatus(sel) {
      const id = sel.dataset.id;
      const status = sel.value;
      const before = reports.find(function (r) { return r.id === id; });
      if (status === "REJECTED") {               // a rejection needs a reason: open the update form instead
        renderTable();
        openReport(id, true, false, "REJECTED");
        return;
      }
      const res = BC.setStatus(id, status, BC.adminName());
      if (res.error) {
        BC.toast(res.error, "error");
        renderTable();                          // put the old value back
        return;
      }
      if (res.unchanged) return;

      BC.toast((before ? before.reportNo : "Report") + " is now " + BC.statusLabel(status) + ".", "success");
      refreshQuiet();

      // If the row no longer belongs in the current tab, fade it out first, then redraw
      const stays = filteredReports().some(function (r) { return r.id === id; });
      if (stays) {
        flash(id);
        renderTable();
      } else {
        const tr = sel.closest("tr");
        if (tr) tr.classList.add("row-removing");
        setTimeout(renderTable, 320);
      }
    }

    // ---------- 5. Row selection (checkboxes) ----------
    // "Select all" ticks / unticks every row that is currently shown
    $("selectAll").addEventListener("change", function () {
      const on = $("selectAll").checked;
      visible.forEach(function (r) { if (on) selected.add(r.id); else selected.delete(r.id); });
      rowsEl.querySelectorAll(".row-check").forEach(function (cb) {
        cb.checked = on;
        cb.closest("tr").classList.toggle("is-selected", on);
      });
      updateSelectionUI();
    });

    // Updates the bulk bar, the counter and the "select all" box
    function updateSelectionUI() {
      const n = selected.size;
      const all = $("selectAll");
      all.disabled = !visible.length;
      all.checked = n > 0 && n === visible.length;
      all.indeterminate = n > 0 && n < visible.length;

      $("bulkBar").classList.toggle("has-selection", n > 0);
      $("bulkCount").textContent = n ? n + " report" + (n === 1 ? "" : "s") + " selected" : "Tick rows to use bulk actions";
      $("bulkDelete").disabled = !n;
      $("bulkArchive").disabled = !n;
      $("bulkApply").disabled = !n || !$("bulkStatus").value;
      $("bulkStatus").disabled = !n;
    }
    $("bulkStatus").addEventListener("change", updateSelectionUI);

    // Archive: moves Resolved / Rejected reports to the Report Archive (nothing is deleted)
    function archive(ids) {
      const res = BC.archiveReports(ids, BC.adminName());
      if (res.error) return BC.toast(res.error, "error");
      if (res.archived) BC.toast(res.archived + " report" + (res.archived === 1 ? "" : "s") + " moved to the archive.", "success");
      if (res.skipped) BC.toast(res.skipped + " report" + (res.skipped === 1 ? " was" : "s were") + " not archived: only Resolved or Rejected reports can be archived.", "info", 8000);
      if (!res.archived && !res.skipped) BC.toast("Nothing to archive.", "info");
      ids.forEach(function (id) { selected.delete(id); });
      refresh();
    }
    $("bulkArchive").addEventListener("click", function () { archive(Array.from(selected)); });

    // ---------- 6. Delete (single + bulk) ----------
    // Step 1: ask. Nothing is deleted until "Confirm Delete" is pressed.
    function askDelete(ids) {
      pendingDelete = ids.map(function (id) {
        return reports.find(function (r) { return r.id === id; });
      }).filter(Boolean);
      if (!pendingDelete.length) return;

      $("confirmText").textContent = pendingDelete.length === 1
        ? "Are you sure you want to delete report " + pendingDelete[0].reportNo + "? This action cannot be undone."
        : "Are you sure you want to delete these " + pendingDelete.length + " selected reports? This action cannot be undone.";
      $("confirmTitle").textContent = pendingDelete.length === 1 ? "Delete report?" : "Delete " + pendingDelete.length + " reports?";
      confirmDialog.showModal();
      $("confirmCancel").focus();             // the safe choice is focused first
    }

    $("bulkDelete").addEventListener("click", function () { askDelete(Array.from(selected)); });
    $("confirmCancel").addEventListener("click", function () { pendingDelete = []; confirmDialog.close(); });
    confirmDialog.addEventListener("click", function (e) { if (e.target === confirmDialog) confirmDialog.close(); });
    confirmDialog.addEventListener("close", function () { if (!$("confirmOk").dataset.busy) pendingDelete = []; });

    // Step 2: delete for real (fade the rows out, then remove them from storage)
    $("confirmOk").addEventListener("click", function () {
      const list = pendingDelete.slice();
      if (!list.length) return confirmDialog.close();
      $("confirmOk").dataset.busy = "1";
      confirmDialog.close();
      delete $("confirmOk").dataset.busy;
      pendingDelete = [];

      const ids = list.map(function (r) { return r.id; });
      const idSet = new Set(ids);
      rowsEl.querySelectorAll("tr[data-id]").forEach(function (tr) {
        if (idSet.has(tr.dataset.id)) tr.classList.add("row-removing");     // smooth fade-out
      });

      setTimeout(function () {
        const res = BC.deleteReports(ids, BC.adminName());
        if (res.error) return BC.toast(res.error, "error");
        ids.forEach(function (id) { selected.delete(id); });
        if (current && idSet.has(current.id)) { dialog.close(); current = null; }
        BC.toast(list.length === 1
          ? "Report " + list[0].reportNo + " deleted successfully."
          : list.length + " reports deleted successfully.", "success");
        refresh();
      }, 320);
    });

    // ---------- 7. Batch status updater ----------
    $("bulkApply").addEventListener("click", function () {
      const status = $("bulkStatus").value;
      const ids = Array.from(selected);
      if (!status || !ids.length) return;
      const res = BC.bulkUpdateStatus(ids, status, "Status changed in a bulk update.", BC.adminName());
      if (res.error) return BC.toast(res.error, "error");
      BC.toast(res.changed
        ? res.changed + " report" + (res.changed === 1 ? "" : "s") + " set to " + BC.statusLabel(status) + "."
        : "The selected reports already have the status " + BC.statusLabel(status) + ".", res.changed ? "success" : "info");
      selected.clear();
      $("bulkStatus").value = "";
      refresh();
    });

    // ---------- 8. Export (CSV / PDF) ----------
    // Both exports use exactly the rows that are visible in the table right now
    // (current tab + search + category).
    const exportBtn = $("exportBtn");
    const exportMenu = $("exportMenu");
    function toggleExportMenu(open) {
      exportMenu.hidden = !open;
      exportBtn.setAttribute("aria-expanded", String(open));
    }
    exportBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleExportMenu(exportMenu.hidden); });
    document.addEventListener("click", function (e) { if (!exportMenu.contains(e.target)) toggleExportMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggleExportMenu(false); });

    function exportRows() {
      return visible.map(function (r) {
        return [r.reportNo, r.residentName, r.contact, r.type, r.location, r.description, BC.statusLabel(r.status), r.priority || "Medium", r.urgent ? "Yes" : "No",
          r.assignedTo || "", r.remarks || "", r.actionTaken || "", BC.getPhotos(r).length, BC.fmtDate(r.createdAt), BC.fmtDate(BC.resolvedAt(r)), BC.fmtDate(r.updatedAt)];
      });
    }
    const EXPORT_HEAD = ["Report ID", "Resident", "Contact", "Concern Type", "Location", "Description", "Status", "Priority", "Urgent",
                         "Assigned Officer", "Remarks", "Action Taken", "Photos", "Date Submitted", "Date Resolved", "Last Updated"];

    function exportCsv() {
      toggleExportMenu(false);
      if (!visible.length) return BC.toast("There are no records to export.", "error");
      BC.downloadCsv("barangay-reports", EXPORT_HEAD, exportRows());
      BC.toast(visible.length + " record" + (visible.length === 1 ? "" : "s") + " exported to CSV.", "success");
    }

    // PDF: opens the browser's print window with a clean table (choose "Save as PDF" as the printer)
    function exportPdf() {
      toggleExportMenu(false);
      if (!visible.length) return BC.toast("There are no records to export.", "error");
      $("printHead").textContent = "Barangay Complaint & Report System - Incident Records (" + visible.length + ") - " +
        new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
      window.print();
    }
    $("exportCsv").addEventListener("click", exportCsv);
    $("exportCsvBtn").addEventListener("click", exportCsv);       // the button next to the search bar
    $("exportPdf").addEventListener("click", exportPdf);

    // ---------- 9. Details modal + update form ----------
    // readOnly = true hides the update form (used by Resolution History, Archive and Residents).
    // presetStatus = a status to select in the form (used when a rejection needs a reason).
    function openReport(id, focusUpdate, readOnly, presetStatus) {
      const r = allReports.find(function (x) { return x.id === id; });
      if (!r) return;
      current = r;
      $("updateForm").hidden = !!readOnly;
      $("uError").hidden = true;

      $("dlgTitle").textContent = r.reportNo;
      $("dlgBadge").innerHTML = BC.statusBadge(r.status);
      $("dResident").textContent = r.residentName || "";
      $("dContact").textContent = r.contact || "";
      $("dType").textContent = r.type || "";
      $("dOfficer").textContent = r.assignedTo || "Not assigned yet";
      $("dPriority").textContent = r.priority || "Medium";
      $("dResolved").textContent = r.status === "RESOLVED" ? BC.fmtDate(BC.resolvedAt(r)) : "Not resolved";
      $("dOutcome").hidden = !(r.remarks || r.actionTaken || (r.actionPhotos || []).length);
      $("dRemarksTitle").textContent = r.status === "REJECTED" ? "Reason for rejection" : "Official remarks";
      $("dRemarks").textContent = r.remarks || "None";
      $("dAction").textContent = r.actionTaken || "None recorded";
      $("dRating").innerHTML = r.rating
        ? BC.starsHtml(r.rating.stars) + ' <strong>' + r.rating.stars + ' / 5</strong>' + (r.rating.comment ? '<br><span class="small">&ldquo;' + BC.esc(r.rating.comment) + '&rdquo;</span>' : '')
        : (r.status === "RESOLVED" ? '<span class="muted">Not rated yet</span>' : '<span class="muted">Available after the report is resolved</span>');
      $("dLocation").textContent = r.location || "";
      $("dCreated").textContent = BC.fmtDate(r.createdAt);
      $("dUpdated").textContent = BC.fmtDate(r.updatedAt);
      $("dDescription").textContent = r.description || "";

      // All photos the resident attached (click one to open it full size)
      currentPhotos = BC.getPhotos(r);
      $("dPhotoWrap").hidden = !currentPhotos.length;
      $("dPhotos").innerHTML = currentPhotos.map(function (p, i) {
        return '<img src="' + BC.esc(p) + '" alt="Photo evidence ' + (i + 1) + '" title="Click to open" data-photo="' + i + '" tabindex="0" role="button">';
      }).join("");

      // Photos attached to "Action taken"
      currentActionPhotos = BC.getPhotos({ photos: r.actionPhotos });
      $("dActionPhotoWrap").hidden = !currentActionPhotos.length;
      $("dActionPhotos").innerHTML = currentActionPhotos.map(function (p, i) {
        return '<img src="' + BC.esc(p) + '" alt="Action taken photo ' + (i + 1) + '" title="Click to open" data-photo="' + i + '" tabindex="0" role="button">';
      }).join("");

      // Map preview: loaded only when asked (it needs internet and contacts Google)
      $("mapFrame").hidden = true;
      $("mapFrame").src = "about:blank";
      $("mapShow").hidden = false;
      $("mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.location || "");

      $("uStatus").value = presetStatus || r.status;
      $("uOfficer").value = r.assignedTo || "";
      $("uPriority").value = r.priority || "Medium";
      $("uRemarks").value = r.remarks || "";
      $("uAction").value = r.actionTaken || "";
      actionPics = currentActionPhotos.slice();
      $("uPhotoError").hidden = true;
      renderActionPics();
      syncReasonLabel();

      // Timeline: newest first
      const history = (r.history || []).slice().reverse();
      $("dHistory").innerHTML = history.length
        ? history.map(function (h) {
            return '<li>' + BC.statusBadge(h.status) + '<div class="when">' + BC.esc(BC.fmtDate(h.at)) + ' &middot; ' + BC.esc(h.by || "") + '</div>' +
              (h.officer ? '<p class="note"><strong>Assigned officer:</strong> ' + BC.esc(h.officer) + '</p>' : '') +
              (h.action ? '<p class="note"><strong>Action taken:</strong> ' + BC.esc(h.action) + '</p>' : '') +
              (h.photos ? '<p class="note"><strong>Action photos:</strong> ' + h.photos + ' attached</p>' : '') +
              (h.info ? '<p class="note"><em>Information added by the resident</em></p>' : '') +
              (h.remarks ? '<p class="note">' + BC.esc(h.remarks) + '</p>' : '') + '</li>';
          }).join("")
        : '<li class="muted">No history yet.</li>';

      dialog.showModal();
      dialog.querySelector(".modal-body").scrollTop = 0;
      if (focusUpdate && !readOnly) {
        $("uStatus").focus();
        if (presetStatus === "REJECTED") $("uRemarks").focus();
      }
    }

    // When "Rejected" is chosen the remarks box becomes the (required) reason
    function syncReasonLabel() {
      const rej = $("uStatus").value === "REJECTED";
      $("uRemarksLabel").textContent = rej ? "Reason for rejection (required, the resident can read this)" : "Official remarks (the resident can read this)";
      $("uRemarks").placeholder = rej ? "Example: Duplicate of report BRG-0003." : "Example: Garbage collection scheduled for Monday morning.";
    }
    $("uStatus").addEventListener("change", syncReasonLabel);

    $("mapShow").addEventListener("click", function () {
      if (!current) return;
      $("mapFrame").src = "https://maps.google.com/maps?q=" + encodeURIComponent(current.location || "") + "&z=16&output=embed";
      $("mapFrame").hidden = false;
      $("mapShow").hidden = true;
    });

    // Open a photo full size
    function openPhoto(e) {
      const img = e.target.closest("img[data-photo]");
      if (img) BC.openImage(currentPhotos[Number(img.dataset.photo)]);
    }
    function openActionPhoto(e) {
      const img = e.target.closest("img[data-photo]");
      if (img) BC.openImage(currentActionPhotos[Number(img.dataset.photo)]);
    }
    $("dActionPhotos").addEventListener("click", openActionPhoto);
    $("dActionPhotos").addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openActionPhoto(ev); } });
    $("dPhotos").addEventListener("click", openPhoto);
    $("dPhotos").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPhoto(e); } });

    $("dlgClose").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", function () { $("mapFrame").src = "about:blank"; });   // stop loading the map

    // Save status + officer + remarks
    $("updateForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!current) return;
      const status = $("uStatus").value;
      const remarks = $("uRemarks").value.trim();
      const officer = $("uOfficer").value.trim();
      const action = $("uAction").value.trim();
      const priority = $("uPriority").value;
      $("uError").hidden = true;
      if (status === "REJECTED" && !remarks) {
        $("uError").textContent = "Please type the reason for rejecting this report.";
        $("uError").hidden = false;
        return $("uRemarks").focus();
      }
      if (status === current.status && remarks === (current.remarks || "") && officer === (current.assignedTo || "") &&
          action === (current.actionTaken || "") && priority === (current.priority || "Medium") &&
          JSON.stringify(actionPics) === JSON.stringify(currentActionPhotos)) {
        return BC.toast("Nothing changed yet.", "info");
      }
      const res = BC.updateReport(current.id, status, remarks, BC.adminName(), officer, { actionTaken: action, priority: priority, actionPhotos: actionPics });
      if (res.error) return BC.toast(res.error, "error");
      BC.toast(current.reportNo + " updated.", "success");
      dialog.close();
      refresh();
    });

    // ---------- 9b. Photos attached to "Action taken" ----------
    // Up to 3 pictures. They are shrunk (BC.compressImage) and saved with the report;
    // the resident can see them under "Action taken" in Track My Report.
    const AP_MAX = 3, AP_MAX_MB = 5, AP_TYPES = ["image/jpeg", "image/png", "image/webp"], AP_EXT = /\.(jpe?g|png|webp)$/i;
    const AP_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const AP_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    const AP_EMPTY = '<div class="photo-slot photo-empty" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>';

    function apError(lines) {
      const box = $("uPhotoError");
      box.innerHTML = lines.map(BC.esc).join("<br>");
      box.hidden = !lines.length;
    }

    function renderActionPics() {
      $("uPhotoCount").textContent = actionPics.length + " / " + AP_MAX + " photos";
      let html = actionPics.map(function (src, i) {
        return '<div class="photo-slot is-filled"><img src="' + BC.esc(src) + '" alt="Action taken photo ' + (i + 1) + '">' +
          '<button type="button" class="photo-remove" data-ap-remove="' + i + '" aria-label="Remove photo ' + (i + 1) + '">' + AP_X + '</button></div>';
      }).join("");
      let empties = AP_MAX - actionPics.length;
      if (actionPics.length < AP_MAX) {
        html += '<button type="button" class="photo-slot photo-add" id="uPhotoAdd" aria-label="Add photo">' + AP_PLUS + '<span>Add Photo</span></button>';
        empties--;
      }
      for (let k = 0; k < empties; k++) html += AP_EMPTY;
      $("uPhotoSlots").innerHTML = html;
    }

    async function addActionPics(files) {
      const problems = [];
      const ok = [];
      Array.prototype.forEach.call(files, function (f) {
        const allowed = AP_TYPES.indexOf(f.type) >= 0 || (!f.type && AP_EXT.test(f.name));
        if (!allowed) problems.push('"' + f.name + '" is not supported. Please use JPG, JPEG, PNG or WebP.');
        else if (f.size > AP_MAX_MB * 1048576) problems.push('"' + f.name + '" is too large (' + (f.size / 1048576).toFixed(1) + " MB). Each photo must be " + AP_MAX_MB + " MB or smaller.");
        else if (actionPics.length + ok.length >= AP_MAX) problems.push("You can attach up to " + AP_MAX + " photos only.");
        else ok.push(f);
      });
      for (const f of ok) {
        try { actionPics.push(await BC.compressImage(f)); }
        catch (err) { problems.push('"' + f.name + '" could not be read as an image.'); }
      }
      apError(Array.from(new Set(problems)));
      renderActionPics();
    }

    $("uPhotoSlots").addEventListener("click", function (e) {
      if (e.target.closest("#uPhotoAdd")) return $("uPhotoFile").click();
      const x = e.target.closest("[data-ap-remove]");
      if (x) { actionPics.splice(Number(x.dataset.apRemove), 1); apError([]); renderActionPics(); }
    });
    $("uPhotoFile").addEventListener("change", function () {
      const files = Array.from($("uPhotoFile").files);
      $("uPhotoFile").value = "";                 // lets the same file be picked again
      addActionPics(files);
    });
    const apDrop = $("uPhotoDrop");
    function apHasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
    apDrop.addEventListener("dragover", function (e) { if (!apHasFiles(e)) return; e.preventDefault(); apDrop.classList.add("is-dragging"); });
    apDrop.addEventListener("dragleave", function () { apDrop.classList.remove("is-dragging"); });
    apDrop.addEventListener("drop", function (e) {
      if (!apHasFiles(e)) return;
      e.preventDefault();
      apDrop.classList.remove("is-dragging");
      addActionPics(e.dataTransfer.files);
    });

    // ---------- 10. Activity timeline (audit log) modal ----------
    // Opens when a Report ID is clicked. BC.buildTimeline() (storage.js) turns the saved
    // history into events: who submitted it, when it was reviewed, who it was assigned to,
    // and when it was resolved.
    const TL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">';
    const TL_ICONS = {
      submitted: TL_SVG + '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
      pending:   TL_SVG + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      review:    TL_SVG + '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
      progress:  TL_SVG + '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
      rejected:  TL_SVG + '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
      resolved:  TL_SVG + '<path d="M20 6 9 17l-5-5"/></svg>',
      assigned:  TL_SVG + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      note:      TL_SVG + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    };
    const TL_CHECK = TL_SVG + '<path d="M20 6 9 17l-5-5"/></svg>';

    function openTimeline(id) {
      const r = allReports.find(function (x) { return x.id === id; });
      if (!r) return;
      timelineId = id;
      const events = BC.buildTimeline(r);

      $("tlTitle").textContent = r.reportNo;
      $("tlSub").innerHTML = BC.statusBadge(r.status) +
        '<span class="tl-sub-text">' + BC.esc(r.type) + ' &middot; ' + BC.esc(r.location) +
        (r.assignedTo ? ' &middot; Assigned to ' + BC.esc(r.assignedTo) : "") + '</span>';

      // Progress track: Pending -> Under Review -> In Progress -> Resolved (the last step reads "Rejected" for rejected reports)
      const reachedAt = {};
      events.forEach(function (ev) { if (ev.status) reachedAt[ev.status] = ev.at; });
      const steps = r.status === "REJECTED" ? ["SUBMITTED", "UNDER REVIEW", "IN PROGRESS", "REJECTED"] : BC.WORKFLOW;
      const now = r.status === "REJECTED" ? 3 : Math.max(0, BC.WORKFLOW.indexOf(r.status));
      $("tlSteps").innerHTML = steps.map(function (s, i) {
        const state = i < now ? "done" : i === now ? "current" : "todo";
        return '<li class="tl-step is-' + state + (s === "REJECTED" ? " is-rejected" : "") + '"' + (state === "current" ? ' aria-current="step"' : "") + '>' +
          '<span class="tl-dot">' + (state === "done" ? TL_CHECK : i + 1) + '</span>' +
          '<span class="tl-step-name">' + BC.esc(BC.statusLabel(s)) + '</span>' +
          '<span class="tl-step-time">' + (state !== "todo" && reachedAt[s] ? BC.esc(BC.fmtDate(reachedAt[s])) : "") + '</span>' +
        '</li>';
      }).join("");

      // The activity log itself, oldest first
      $("tlFeed").innerHTML = events.map(function (ev, i) {
        return '<li class="tl-item tl-' + ev.kind + '" style="--i:' + Math.min(i, 10) + '">' +
          '<span class="tl-node" aria-hidden="true">' + (TL_ICONS[ev.kind] || TL_ICONS.note) + '</span>' +
          '<div class="tl-card">' +
            '<div class="tl-title">' + BC.esc(ev.title) + '</div>' +
            '<div class="tl-meta">' + BC.esc(BC.fmtDate(ev.at)) + ' &middot; by ' + BC.esc(ev.by) + '</div>' +
            (ev.detail ? '<p class="tl-detail">' + BC.esc(ev.detail) + '</p>' : "") +
          '</div></li>';
      }).join("");

      timelineDialog.showModal();
      timelineDialog.querySelector(".modal-body").scrollTop = 0;
    }

    $("tlClose").addEventListener("click", function () { timelineDialog.close(); });
    timelineDialog.addEventListener("click", function (e) { if (e.target === timelineDialog) timelineDialog.close(); });
    $("tlOpenDetails").addEventListener("click", function () {
      const id = timelineId;
      timelineDialog.close();
      if (id) openReport(id, true);
    });

    // ---------- Start ----------
    // Lets admin-pages.js open the same windows and refresh this page
    window.BCAdmin = {
      openReport: openReport,
      openTimeline: openTimeline,
      refresh: refresh,
      setTab: setTab
    };
    refresh();
    BC.onChange(refresh);   // a resident (in another tab) added a report, or another admin tab changed one
  }
})();
