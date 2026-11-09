// ============================================================
//  charts.js  -  tiny chart library (no internet needed, no extras to install).
//  Draws SVG charts that resize with their box and show a tooltip on hover.
//
//    BCCharts.line(box, { labels, series: [{ name, values, color, dashed }] })
//    BCCharts.bar(box,  { labels, values, colors })
//    BCCharts.donut(box,{ items: [{ label, value, color }] })
//
//  `box` is an empty <div>. Call the same function again to redraw with new data.
// ============================================================

(function () {
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#2563eb", "#d97706", "#7c3aed", "#16a34a", "#dc2626", "#0891b2", "#64748b"];

  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  // A floating tooltip that belongs to the chart box
  function tip(box) {
    let t = box.querySelector(".ch-tip");
    if (!t) {
      t = document.createElement("div");
      t.className = "ch-tip";
      t.hidden = true;
      box.appendChild(t);
    }
    return t;
  }
  function showTip(box, html, x, y) {
    const t = tip(box);
    t.innerHTML = html;
    t.hidden = false;
    const w = box.clientWidth;
    const left = Math.min(Math.max(8, x + 12), Math.max(8, w - t.offsetWidth - 8));
    t.style.left = left + "px";
    t.style.top = Math.max(0, y - t.offsetHeight - 10) + "px";
  }
  function hideTip(box) { tip(box).hidden = true; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // Round axis maximum + tick values (0 .. max)
  function niceScale(max) {
    if (max <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
    const target = 4;
    const rough = max / target;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map(function (m) { return m * pow; }).find(function (s) { return s >= rough; });
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { max: top, ticks: ticks };
  }

  // Redraws a chart whenever its box changes size
  function mount(box, draw) {
    box._draw = draw;
    box.classList.add("ch-box");
    draw();
    if (!box._ro && window.ResizeObserver) {
      let last = box.clientWidth;
      box._ro = new ResizeObserver(function () {
        if (Math.abs(box.clientWidth - last) < 2) return;
        last = box.clientWidth;
        if (box._draw) box._draw();
      });
      box._ro.observe(box);
    }
  }

  function clear(box) {
    Array.prototype.slice.call(box.children).forEach(function (c) { if (!c.classList.contains("ch-tip")) c.remove(); });
    hideTip(box);
  }

  function emptyNote(box, text) {
    const p = document.createElement("p");
    p.className = "ch-empty";
    p.textContent = text;
    box.insertBefore(p, box.firstChild);
  }

  // ---------- Line chart (one or more series) ----------
  function line(box, data) {
    mount(box, function () { drawLine(box, data); });
  }

  function drawLine(box, data) {
    clear(box);
    const labels = data.labels || [];
    const series = data.series || [];
    const all = [].concat.apply([], series.map(function (s) { return s.values; }));
    if (!labels.length) return emptyNote(box, "No data for this period.");

    const W = Math.max(280, box.clientWidth), H = 300;
    const m = { t: 16, r: 18, b: 46, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const sc = niceScale(Math.max.apply(null, all.concat([0])));
    const n = labels.length;
    const x = function (i) { return m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); };
    const y = function (v) { return m.t + ih - (v / sc.max) * ih; };

    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": data.title || "Line chart" });
    sc.ticks.forEach(function (tv) {
      svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: "ch-grid" }));
      svg.appendChild(el("text", { x: m.l - 8, y: y(tv) + 4, class: "ch-tick", "text-anchor": "end" }, tv));
    });

    // x labels: show about 8 at most so they never overlap
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    labels.forEach(function (lb, i) {
      if (i % every === 0 || i === n - 1 && every === 1) {
        svg.appendChild(el("text", { x: x(i), y: H - m.b + 18, class: "ch-tick", "text-anchor": n === 1 ? "middle" : (i === 0 ? "start" : (i === n - 1 ? "end" : "middle")) }, lb));
      }
    });

    series.forEach(function (s, si) {
      const color = s.color || PALETTE[si % PALETTE.length];
      const pts = s.values.map(function (v, i) { return x(i) + "," + y(v); });
      if (!s.dashed && n > 1) {   // soft area under the main line
        svg.appendChild(el("polygon", { points: x(0) + "," + y(0) + " " + pts.join(" ") + " " + x(n - 1) + "," + y(0), fill: color, opacity: ".10" }));
      }
      svg.appendChild(el("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": s.dashed ? 2 : 2.6, "stroke-dasharray": s.dashed ? "6 5" : "", "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (n <= 40) {
        s.values.forEach(function (v, i) {
          svg.appendChild(el("circle", { cx: x(i), cy: y(v), r: s.dashed ? 2.5 : 3.5, fill: color, class: "ch-dot", "data-s": si, "data-i": i }));
        });
      }
    });

    // hover guide + invisible hit area
    const guide = el("line", { y1: m.t, y2: m.t + ih, class: "ch-guide", visibility: "hidden" });
    svg.appendChild(guide);
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    function at(ev) {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.setAttribute("visibility", "visible");
      const rows = series.map(function (s, si) {
        return '<div><span class="ch-sw" style="background:' + (s.color || PALETTE[si % PALETTE.length]) + '"></span>' + esc(s.name) + ': <strong>' + s.values[i] + "</strong></div>";
      }).join("");
      const lab = (series[0] && series[0].labelsFor && series[0].labelsFor[i]) || labels[i];
      showTip(box, "<b>" + esc(lab) + "</b>" + rows, x(i), y(Math.max.apply(null, series.map(function (s) { return s.values[i]; }))) + 0);
    }
    hit.addEventListener("mousemove", at);
    hit.addEventListener("touchstart", function (ev) { if (ev.touches[0]) at(ev.touches[0]); }, { passive: true });
    hit.addEventListener("mouseleave", function () { guide.setAttribute("visibility", "hidden"); hideTip(box); });
    box.insertBefore(svg, box.firstChild);
  }

  // ---------- Bar chart ----------
  function bar(box, data) {
    mount(box, function () { drawBar(box, data); });
  }

  function drawBar(box, data) {
    clear(box);
    const labels = data.labels || [], values = data.values || [];
    if (!labels.length) return emptyNote(box, "No data for this period.");
    const W = Math.max(280, box.clientWidth), narrow = W < 460;
    // horizontal bars on narrow screens so long category names stay readable
    const longest = Math.max.apply(null, labels.map(function (l) { return l.length; }));
    const total = values.reduce(function (a, b) { return a + b; }, 0);
    const sc = niceScale(Math.max.apply(null, values.concat([0])));
    const colors = data.colors || [];
    const colorOf = function (i) { return colors[i] || PALETTE[0]; };

    let svg;
    if (narrow) {
      const rowH = 38, m = { t: 8, r: 36, b: 8, l: Math.min(150, Math.max(90, longest * 6.2)) };
      const H = m.t + m.b + rowH * labels.length;
      svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": data.title || "Bar chart" });
      const iw = W - m.l - m.r;
      labels.forEach(function (lb, i) {
        const yy = m.t + i * rowH, w = (values[i] / sc.max) * iw;
        svg.appendChild(el("text", { x: m.l - 8, y: yy + rowH / 2 + 4, class: "ch-tick", "text-anchor": "end" }, lb.length > 22 ? lb.slice(0, 21) + "…" : lb));
        const r = el("rect", { x: m.l, y: yy + 6, width: Math.max(w, values[i] ? 2 : 0), height: rowH - 14, rx: 4, fill: colorOf(i), class: "ch-bar" });
        bindTip(r, lb, values[i], total);
        svg.appendChild(r);
        svg.appendChild(el("text", { x: m.l + w + 6, y: yy + rowH / 2 + 4, class: "ch-val" }, values[i]));
      });
    } else {
      const m = { t: 22, r: 14, b: 58, l: 40 };
      const H = 320, iw = W - m.l - m.r, ih = H - m.t - m.b;
      svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": data.title || "Bar chart" });
      sc.ticks.forEach(function (tv) {
        const yy = m.t + ih - (tv / sc.max) * ih;
        svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: "ch-grid" }));
        svg.appendChild(el("text", { x: m.l - 8, y: yy + 4, class: "ch-tick", "text-anchor": "end" }, tv));
      });
      const slot = iw / labels.length, bw = Math.min(64, slot * 0.6);
      labels.forEach(function (lb, i) {
        const h = (values[i] / sc.max) * ih, bx = m.l + i * slot + (slot - bw) / 2, by = m.t + ih - h;
        const r = el("rect", { x: bx, y: by, width: bw, height: Math.max(h, values[i] ? 2 : 0), rx: 5, fill: colorOf(i), class: "ch-bar" });
        bindTip(r, lb, values[i], total);
        svg.appendChild(r);
        svg.appendChild(el("text", { x: bx + bw / 2, y: by - 6, class: "ch-val", "text-anchor": "middle" }, values[i]));
        // wrap the label into two lines at a space
        const words = lb.split(" "), mid = Math.ceil(words.length / 2);
        [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].forEach(function (line, li) {
          if (line) svg.appendChild(el("text", { x: bx + bw / 2, y: H - m.b + 18 + li * 14, class: "ch-tick", "text-anchor": "middle" }, line));
        });
      });
    }
    function bindTip(node, lb, v, tot) {
      node.addEventListener("mousemove", function (ev) {
        const r = box.getBoundingClientRect();
        showTip(box, "<b>" + esc(lb) + "</b><div><strong>" + v + "</strong> report" + (v === 1 ? "" : "s") + (tot ? " (" + Math.round((v / tot) * 100) + "%)" : "") + "</div>", ev.clientX - r.left, ev.clientY - r.top);
      });
      node.addEventListener("mouseleave", function () { hideTip(box); });
    }
    box.insertBefore(svg, box.firstChild);
  }

  // ---------- Donut (pie) chart with legend ----------
  function donut(box, data) {
    mount(box, function () { drawDonut(box, data); });
  }

  function drawDonut(box, data) {
    clear(box);
    const items = data.items || [];
    const total = items.reduce(function (a, b) { return a + b.value; }, 0);
    const wrap = document.createElement("div");
    wrap.className = "ch-donut-wrap";
    if (!total) {
      box.insertBefore(wrap, box.firstChild);
      wrap.innerHTML = '<p class="ch-empty">No reports in this period.</p>';
      return;
    }
    const S = 200, c = S / 2, R = 92, r = 56;
    const svg = el("svg", { viewBox: "0 0 " + S + " " + S, width: S, height: S, role: "img", "aria-label": data.title || "Pie chart", class: "ch-donut" });
    let a0 = -Math.PI / 2;
    const live = items.filter(function (i) { return i.value > 0; });
    live.forEach(function (it) {
      const frac = it.value / total;
      if (live.length === 1) {
        const ring = el("circle", { cx: c, cy: c, r: (R + r) / 2, fill: "none", stroke: it.color, "stroke-width": R - r, class: "ch-slice" });
        bind(ring, it);
        svg.appendChild(ring);
        return;
      }
      const a1 = a0 + frac * Math.PI * 2, large = frac > 0.5 ? 1 : 0;
      const p = function (rad, ang) { return (c + rad * Math.cos(ang)) + " " + (c + rad * Math.sin(ang)); };
      const d = "M " + p(R, a0) + " A " + R + " " + R + " 0 " + large + " 1 " + p(R, a1) + " L " + p(r, a1) + " A " + r + " " + r + " 0 " + large + " 0 " + p(r, a0) + " Z";
      const path = el("path", { d: d, fill: it.color, class: "ch-slice", stroke: "var(--surface)", "stroke-width": 2 });
      bind(path, it);
      svg.appendChild(path);
      a0 = a1;
    });
    svg.appendChild(el("text", { x: c, y: c - 2, class: "ch-center", "text-anchor": "middle" }, total));
    svg.appendChild(el("text", { x: c, y: c + 16, class: "ch-tick", "text-anchor": "middle" }, "reports"));
    function bind(node, it) {
      node.addEventListener("mousemove", function (ev) {
        const rc = box.getBoundingClientRect();
        showTip(box, "<b>" + esc(it.label) + "</b><div><strong>" + it.value + "</strong> (" + Math.round((it.value / total) * 100) + "%)</div>", ev.clientX - rc.left, ev.clientY - rc.top);
      });
      node.addEventListener("mouseleave", function () { hideTip(box); });
    }

    const legend = document.createElement("ul");
    legend.className = "ch-legend";
    legend.innerHTML = items.map(function (it) {
      return '<li><span class="ch-sw" style="background:' + it.color + '"></span><span class="ch-lname">' + esc(it.label) + '</span>' +
        '<span class="ch-lval"><strong>' + it.value + '</strong> &middot; ' + Math.round((it.value / total) * 100) + '%</span></li>';
    }).join("");
    wrap.appendChild(svg);
    wrap.appendChild(legend);
    box.insertBefore(wrap, box.firstChild);
  }

  window.BCCharts = { line: line, bar: bar, donut: donut, PALETTE: PALETTE };
})();
