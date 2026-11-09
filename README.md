# Barangay Complaint & Report System - Local (localStorage) Version

No Firebase, no setup, **no resident login**. Unzip the folder and **double-click `index.html`**.
Residents land straight on the report form. Only barangay officials log in.

> Data is saved in the browser you use. A report made on a phone will NOT show on a computer.
> Two tabs of the SAME browser update each other live (resident page in one tab, admin in another).
> The admin password is visible in `storage.js`. Use this for demos and learning only.
> GitHub only shows these files. To use the system, open `index.html` from your computer
> (or turn on GitHub Pages in the repo Settings > Pages).

## Files (keep them all in ONE folder)
`index.html`, `admin-login.html`, `admin-dashboard.html`, `style.css`, `storage.js`, `resident.js`, `admin.js`

## Pages
The left sidebar has three items: **Report an Incident**, **Track My Report** (both on `index.html`) and **Barangay Admin** (`admin-login.html`). On phones the sidebar hides behind the ☰ button.

## Sidebar tools (bottom of the left menu)
A small row of icon buttons, on every page:
| Button | What it does |
|---|---|
| Six-square grid | Collapse the menu to icons only / expand it again (computers). Keyboard: **[** |
| Sun / moon | Light / dark mode |
| Corner arrows | Full screen on / off (hidden on browsers that do not support it) |
| **Aa** | Text size: Normal, Large, Extra large |

All choices are remembered in the browser (`bc_side_collapsed`, `bc_theme`, `bc_text_size`). Code: `initSideTools` in `storage.js`.

## Light / dark mode
- The **Light mode / Dark mode** button is in the sidebar (top bar on phones). The choice is remembered in the browser.
- The first time, it follows the device setting (light or dark).
- Light mode uses a soft **pearl white** instead of pure white.

## Report form keyboard shortcuts
| Key | What it does |
|---|---|
| **Enter** in Full name / Contact number / Location | Checks the field, then moves to the next one |
| **Enter** on Type of concern | Confirms the choice and moves on |
| **Enter** in Description | Moves to **Add Photo** (**Shift + Enter** = new line). Press Enter there to browse, or Tab to Submit Report |

- An empty or invalid required field shows a red message and the cursor goes back to it.
- Pressing Enter in an earlier field never submits the form by accident.

## Incident Photos
- Up to **3 photos** per report (JPG, JPEG, PNG or WebP, **5 MB** each). Click **Add Photo** or drag and drop images onto the box.
- Each photo shows a live preview with a small **X** to remove it. The counter shows `0 / 3 photos`.
- Photos are shrunk automatically so they fit in browser storage. Residents see them in **Track My Report**; officials see them in the report dialog (click a photo to open it full size).

## Admin dashboard tools
- **Status tabs**: All / Pending / Under Review / In Progress / Resolved, each with a live counter. The summary cards at the top work the same way and stay in sync with the tabs.
- **Search + filters**: type a report ID, name, category, location or any keyword; pick a category. Combine with a tab.
- **Quick status dropdown**: the status badge in the table is a dropdown. Pick a new status and it is saved immediately (no edit page), the counters update, and the change is added to the report's history.
- **Report ID link = Activity timeline**: click an ID (e.g. `BRG-0007`) to see who submitted it, when it was reviewed, who it was assigned to and when it was resolved, as a progress track plus a dated activity log. The button inside opens the details / update dialog.
- **View / Update**: opens details with photos, assigned barangay officer, map preview (needs internet; loads on click), the update form and the full history.
- **Delete**: trash icon on each row asks for confirmation first ("Confirm Delete"), fades the row out, updates storage and shows a toast. Tick rows (or the select-all box) and use **Delete Selected** for bulk delete.
- **Batch status**: tick rows, pick a status in "Change status to...", press **Apply**.
- **Export CSV** (button next to the search bar) and **Export Data > Save as PDF (print)**: both use only the rows currently shown (current tab + search + category).
- Everything (new reports, status changes, deletions) is saved in the browser's `localStorage`, so it survives a refresh.

## Try it
1. Open `index.html`, fill in the form (use Enter to move), and submit. Note the report number.
2. Open `admin-login.html` in a **second tab** (same browser). Login: `admin` / `admin123`.
3. Submit another report in the first tab: it appears in the admin tab by itself.
4. In the admin tab click **Update**, change the status and add remarks. The first tab updates by itself.

## How residents follow their report (no account)
- Reports sent from this browser are listed under **Track My Reports**.
- A resident can also type a report number (like `BRG-0007` (also `7` or `brg 7`)) into **Find Report**.

## Where to edit things
| I want to change... | Edit this file |
|---|---|
| Admin username / password | `storage.js` (top, `CONFIG`) |
| Concern types, statuses | `storage.js` (`CONCERN_TYPES`, `STATUSES`) |
| Status wording (e.g. show "Submitted" instead of "Pending") | `storage.js` (`STATUS_LABELS`) |
| How data is saved / loaded, theme toggle | `storage.js` |
| Home page form, Enter-key navigation, Track My Reports | `resident.js` (`initFormNav`) |
| Admin table, tabs, inline status, timeline, export | `admin.js` (numbered sections at the top) |
| Sidebar menu links (names, order, icons) | the `<aside class="sidebar">` block at the top of each `.html` file |
| Light colors (pearl white) / dark colors | `style.css`, top: `:root` (light) and `:root[data-theme="dark"]` (dark) |
| Dark glass look, animations, status pill, timeline styles | `style.css`, last section "V2 UPGRADE" |
| Sidebar width / phone menu | `style.css`, `--sidebar-w` |
| Page text and form fields | the three `.html` files |

If you add or rename a form field in an HTML file, add the same `id` in the matching `.js` file
(and in the `FIELDS` list inside `initFormNav` if it should be part of the Enter-key order).

## Reset all data
Open the browser's developer tools (F12) > Application > Local Storage, and delete keys starting with `bc_`.

## Want it to work across devices?
That needs a shared online database. See the Firebase version (`barangay-complaint-system` folder), which still has resident login.


---

## Admin dashboard (v4)

Log in at `admin-login.html` (`admin` / `admin123`, or the password you set in Settings). The left menu has 10 pages (use **Log Out** at the bottom of the sidebar to sign out):

| Page | What it does |
|---|---|
| Dashboard | 6 cards (Total, New, Under Review, In Progress, Resolved, Rejected) with % vs the previous 30 days, "needs attention" and latest reports |
| Report Management | Search by name/ID, filter by status, category and date, update status, remarks, action taken, officer and priority. Reject needs a reason. Archive / delete / export |
| Processing Queue | 4 groups, long-waiting reports in red, Low/Medium/High priority, one-click next step |
| Analytics & Statistics | Line graph (daily/weekly/monthly/yearly, date range, compare with previous period), category bar chart, status pie chart, resolution performance |
| Resolution History | Every Resolved report (even archived ones). Search, filters, details, photos, CSV / PDF |
| Report Archive | Archived Resolved/Rejected reports. Search, year + category filter, Restore, export |
| Resident Management | Residents grouped by name + contact (there are no resident accounts). Numbers are hidden until "Show" |
| Notifications | New complaint, repeat reporter, extra information, needs attention. Mark as read |
| Activity Logs | Who did what, previous and new status. Read-only and hash-chained ("Verify log integrity") |
| Settings | Profile, change password, notification preferences, system info, testing tools |

Residents see a **Notifications** box on *Track My Report* when a status changes or an official adds an update (a red badge on the sidebar's *Track My Report* link shows how many are new, and a pop-up appears if the page is open). They can **Add more information** to an open report.

### Rating the officials
- When a report becomes **Resolved**, the resident gets a notification and the report card shows **How did we do?**: 1 to 5 stars (5 = best) and an optional comment. One rating per report; it cannot be changed afterwards.
- Admin sees it in the report dialog (*Resident rating*), in **Resolution History** (new *Rating* column, also in the CSV), in **Notifications** (a star alert) and in **Analytics & Statistics > Officer ratings** (average per assigned officer).
- Code: `rateReport` and `starsHtml` in `storage.js`, `rateSection` in `resident.js`.

### Summary cards
The six cards at the top of the Dashboard use a small tinted icon instead of a colored side line.

### How to test
1. Submit a report on `index.html`, keep the admin page open in another tab: the card numbers, queue and notification badge update by themselves.
2. Report Management > **Update**: choose *Rejected* and press Save without a reason (blocked). Then add a reason. Resolve another one with "Action taken": it appears in **Resolution History**.
3. Press the archive icon next to a Resolved row: it leaves Report Management, stays in Resolution History and shows in **Report Archive**; press Restore to bring it back.
4. Settings > **Testing tools** > *Add sample reports* to fill the graphs with past months. Remove them any time with *Remove sample reports*.
5. Activity Logs > *Verify log integrity*.

Note: everything is saved inside one browser (localStorage). The password, the log chain and the hidden phone numbers make accidents harder but are **not real security**; use the Firebase version for that.


---

## Report numbers
New reports get short sequential numbers: **BRG-0001, BRG-0002, BRG-0003...** A number is never reused, even after reports are deleted (deleting *All reports* restarts at BRG-0001). In *Find Report* a resident can type `BRG-0007`, `brg 7` or just `7`. Older long numbers still work. Sample reports are called `SMP-001`, `SMP-002`...

## Data cleanup (admin)
**Settings > Data cleanup** lists each feature with how much data it holds and a **Delete** button: Notifications, Activity logs, Resident ratings, Report archive, Resolution history, Rejected reports and All reports. The same delete buttons are on those pages (Notifications: *Delete all*, Activity Logs: *Clear log*, Report Archive: *Delete all archived*, Resolution History: *Delete all resolved*), and each row of **Resident Management** has a *Delete* button for that resident's reports. Every one asks you to type `DELETE` first and writes a line in the Activity Logs. Deleted data cannot be recovered.


---

## Resident Home page (new)
`index.html` now opens on **Home** (sidebar: Home, Report an Incident, Track My Report, Barangay Admin).
- Greeting + two quick buttons, and 4 number cards (My reports, Open, Resolved, My ratings).
- **How did we do?** box lists resolved reports that still need stars; **Rate now** jumps to that report in Track My Report.
- **My reports**: filter All / Open / Resolved / Rejected, progress bar per report, stars (or Rate now), **Download list (CSV)**.
- **Latest updates** from the officials, **Emergency hotlines** (edit `CONFIG.HOTLINES` in `storage.js`), **Barangay snapshot**, and a short "Good to know" FAQ.
- The description box on the report form shows a character counter.
- Code: `renderHome` in `resident.js`, styles at the end of `style.css`.

## Processing Queue
The colored line on the left of each card is gone. The stage is shown by the status badge (Pending, Under Review, In Progress) and the priority by a small tag next to the report number.
