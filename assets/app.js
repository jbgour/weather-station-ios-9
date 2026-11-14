(function () {
  "use strict";
  var W = window.LyonWeather;
  var doc = window.document;
  var storage = null;
  var client;
  function syncViewport() {
    var root = doc.documentElement;
    var height = window.innerHeight || (root && root.clientHeight);
    if (root && root.style && height > 0) {
      /* One rem is 1% of the visible height; Safari 9's vh can include toolbars. */
      var unit = (height / 100) + "px";
      if (root.style.fontSize !== unit) { root.style.fontSize = unit; }
    }
  }
  syncViewport();
  function relayout() {
    syncViewport();
    /* The temperature curve is drawn in pixels: redraw it for the new sheet size. */
    if (sheet && sheet.open) { renderCurve(); }
  }
  window.addEventListener("resize", relayout, false);
  window.addEventListener("orientationchange", relayout, false);
  function element(id) { return doc.getElementById(id); }
  function text(id, value) { element(id).textContent = value; }
  text("city-name", W.LOCATION.name);
  doc.title = W.LOCATION.name + " · Météo";
  function escape(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function icon(condition, className) {
    return '<img class="' + className + '" src="assets/' + condition.icon + '.svg" alt="' + escape(condition.label) + '">';
  }
  /* compact drops the visible " max." suffix (kept for screen readers) where space is tight. */
  function chance(value, daily, compact) {
    return '<span class="probability" aria-label="' + (daily ? 'Probabilité horaire maximale de pluie : ' : 'Probabilité de pluie : ') + escape(W.probability(value)) + '"><img class="drop" src="assets/drop.svg" alt="">' + W.probability(value) + (daily && !compact ? ' max.' : '') + '</span>';
  }
  function windReading(speed, direction) {
    var available = W.number(speed) && speed >= 0;
    var rotation = W.windRotation(speed, direction);
    var label = available ? "Vent : " + Math.round(speed) + " km/h" : "Vent indisponible";
    if (available && Math.round(speed) === 0) { label = "Vent calme · 0 km/h"; }
    else if (rotation !== null) { label += " · venant du " + W.wind(speed, direction).split(" · ")[1]; }
    else if (available) { label += " · direction indisponible"; }
    return '<span class="wind-reading" role="img" aria-label="' + escape(label) + '" title="' + escape(label) + '">' +
      (rotation === null ? '' : '<svg class="wind-arrow" viewBox="0 0 24 24" fill="' + W.windColor(speed) + '" aria-hidden="true" focusable="false"><g transform="rotate(' + rotation + ' 12 12)"><path d="M12 1L21 23L12 17L3 23Z"/></g></svg>') +
      (available ? Math.round(speed) + '<span class="wind-unit"> km/h</span>' : '—') + '</span>';
  }
  function renderRain(data, now) {
    var slots = W.rainSlots(data, now), html = "", i, slot, height;
    for (i = 0; i < slots.length; i += 1) {
      slot = slots[i];
      /* Fixed 0–2 mm visual scale; numbers retain the full value above it. */
      height = slot.value === null ? 0 : Math.min(100, slot.value / 2 * 100);
      html += '<div class="rain-slot"><div class="rain-chart' + (slot.value === null ? ' missing' : '') + '" aria-hidden="true">' +
        (slot.value === null ? '' : '<span class="rain-bar" style="height:' + height + '%"></span>') + '</div>' +
        '<span class="rain-amount" aria-label="' + escape(W.amount(slot.value)) + ' millimètres">' + W.amount(slot.value) + '</span>' +
        '<span class="rain-interval">' + W.time(slot.start) + '–' + W.time(slot.end) + '</span></div>';
    }
    element("rain-slots").innerHTML = html;
  }
  function renderHours(data, now) {
    var slots = W.hourSlots(data, now), html = "", i, slot, nextDay;
    for (i = 0; i < slots.length; i += 1) {
      slot = slots[i];
      nextDay = W.calendarDay(slot.time) > W.calendarDay(now);
      html += '<div class="hour-card"><p class="hour-label">' + W.time(slot.time) + (nextDay ? ' · dem.' : '') + '</p>' +
        icon(slot.condition, "hour-icon") + '<span class="hour-temperature">' + W.temperature(slot.temperature) + '</span>' +
        '<div class="hour-details">' + chance(slot.probability, false) + windReading(slot.windSpeed, slot.windDirection) + '</div></div>';
    }
    element("hourly-cards").innerHTML = html;
  }
  function renderDays(data, now) {
    var slots = W.daySlots(data, now), html = "", i, slot;
    for (i = 0; i < slots.length; i += 1) {
      slot = slots[i];
      html += '<div class="day-card" role="button" tabindex="0" data-day="' + slot.offset + '"><div class="day-content"><span class="day-identity">' + icon(slot.condition, "day-icon") + '<span class="day-name">' + slot.label + '</span></span>' +
        '<span class="day-temperatures"><span aria-label="Maximum ' + escape(W.temperature(slot.max)) + '">' + W.temperature(slot.max) + '</span>' +
        '<span class="day-min" aria-label="Minimum ' + escape(W.temperature(slot.min)) + '">' + W.temperature(slot.min) + '</span></span>' +
        '<span class="day-chance">' + chance(slot.probability, true, true) + '</span></div></div>';
    }
    /* A narrow fourth card opens the ten-day list. */
    if (slots.length) {
      html += '<div class="day-card more-card" role="button" tabindex="0" aria-haspopup="dialog" data-day="list">' +
        '<span class="more-title">10 jours</span><span class="more-chevron" aria-hidden="true">›</span></div>';
    }
    element("daily-cards").innerHTML = html;
  }

  /* Detail sheet: an in-page overlay (no navigation, so it also works in home-screen mode)
     showing either the 10-day list or one day's detail. */
  var sheet = { open: false, view: "list", offset: 0, fromList: false, day: null, now: 0 };
  var latest = null;
  function setClass(id, value) { element(id).className = value; }
  function stat(label, value, sub) {
    return '<div class="detail-stat"><span class="detail-label">' + label + '</span><strong class="detail-value">' + value + '</strong>' +
      '<span class="detail-sub">' + sub + '</span></div>';
  }
  function curveSvg(day, now, width, height) {
    var points = [], i, sample, x, y, min = null, max = null, html, line = "", area, top = 26, bottom = 12, slot, nowHour;
    for (i = 0; i < day.curve.length; i += 1) {
      sample = day.curve[i];
      if (sample.temperature === null) { continue; }
      if (min === null || sample.temperature < min) { min = sample.temperature; }
      if (max === null || sample.temperature > max) { max = sample.temperature; }
    }
    if (min === null) { return '<p class="empty-message">Courbe des températures indisponible.</p>'; }
    /* A minimum 8° span keeps small daily variations from looking dramatic. */
    if (max - min < 8) { min -= (8 - (max - min)) / 2; max = min + 8; }
    /* Hour h sits above the centre of its three-hour column: (h + 1.5) / 24 of the width. */
    function px(hour) { return Math.round((hour + 1.5) / 24 * width * 10) / 10; }
    function py(value) { return Math.round((top + (max - value) / (max - min) * (height - top - bottom)) * 10) / 10; }
    for (i = 0; i < day.curve.length; i += 1) {
      sample = day.curve[i];
      if (sample.temperature !== null) { points.push([px(sample.hour), py(sample.temperature)]); }
    }
    for (i = 0; i < points.length; i += 1) { line += (i ? " " : "") + points[i][0] + "," + points[i][1]; }
    area = "M" + points[0][0] + "," + height + " L" + line.replace(/ /g, " L") + " L" + points[points.length - 1][0] + "," + height + " Z";
    html = '<svg class="curve-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5cf86" stop-opacity=".26"/><stop offset="1" stop-color="#e5cf86" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#curve-fill)"/>';
    if (day.offset === 0) {
      nowHour = (now - W.calendarDay(now) + W.parisOffset(now)) / 3600;
      if (nowHour >= 0 && nowHour < 24) {
        x = px(nowHour);
        html += '<line x1="' + x + '" y1="' + (top - 8) + '" x2="' + x + '" y2="' + height + '" stroke="#b8d9bd" stroke-width="1.5" stroke-dasharray="3 4"/>';
      }
    }
    html += '<polyline points="' + line + '" fill="none" stroke="#e5cf86" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    for (i = 0; i < day.slots.length; i += 1) {
      slot = day.slots[i];
      if (slot.temperature === null) { continue; }
      x = px(slot.hour); y = py(slot.temperature);
      html += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#e5cf86" stroke="#10191d" stroke-width="2"/>' +
        '<text x="' + x + '" y="' + (y - 10) + '" text-anchor="middle" class="curve-label">' + escape(W.temperature(slot.temperature)) + '</text>';
    }
    return html + '</svg>';
  }
  function renderCurve() {
    var box = element("detail-curve"), day = sheet.day;
    if (!box || !day) { return; }
    /* Draw in real pixels so text and dots are not stretched; fall back when layout is unknown. */
    box.innerHTML = curveSvg(day, sheet.now, box.offsetWidth > 0 ? box.offsetWidth : 900, box.offsetHeight > 40 ? box.offsetHeight : 150);
  }
  function renderDetail(data, now) {
    var day = W.dayDetail(data, now, sheet.offset), html, i, h, slot, slots = {}, sun, uv, past, classes;
    sheet.day = day;
    sheet.now = now;
    if (!day) {
      text("sheet-title", "Détail indisponible");
      text("sheet-subtitle", "");
      element("sheet-body").innerHTML = '<p class="empty-message sheet-empty">Les prévisions de ce jour ne sont pas disponibles.</p>';
      return;
    }
    text("sheet-title", day.title);
    text("sheet-subtitle", day.offset <= 1 ? day.label : "Prévisions du jour");
    uv = W.uv(day.uv);
    sun = '<span class="detail-sun">' + W.time(day.sunrise) + '<span class="detail-dash">–</span>' + W.time(day.sunset) + '</span>';
    html = '<div class="detail"><div class="detail-summary">' +
      '<div class="detail-hero">' + icon(day.condition, "detail-icon") + '<span class="detail-temps"><span class="detail-max" aria-label="Maximum ' + escape(W.temperature(day.max)) + '">' + W.temperature(day.max) + '</span>' +
      '<span class="detail-min" aria-label="Minimum ' + escape(W.temperature(day.min)) + '">' + W.temperature(day.min) + '</span>' +
      '<span class="detail-condition">' + escape(day.condition.label) + '</span></span></div>' +
      stat("Pluie", chance(day.probability, true), (day.precipitation === null ? "Cumul indisponible" : escape(W.amount(day.precipitation)) + " mm au total")) +
      stat("Vent max.", windReading(day.windMax, day.windDirection), "Rafales " + (day.gustMax === null ? "—" : Math.round(day.gustMax) + " km/h")) +
      stat("Indice UV max.", escape(uv.value), escape(uv.label)) +
      stat("Soleil", sun, day.daylight === null ? "Durée du jour indisponible" : escape(W.duration(day.daylight)) + " de jour") +
      '</div><div class="detail-timeline"><div class="section-top"><h2>Au fil de la journée</h2><span class="unit-label">pluie en mm sur 3 h</span></div>' +
      '<div id="detail-curve" class="detail-curve"></div><div class="detail-slots">';
    for (i = 0; i < day.slots.length; i += 1) { slots[day.slots[i].hour] = day.slots[i]; }
    /* Always eight columns (00h to 21h) so the curve stays aligned, even on a partial day. */
    for (h = 0; h < 24; h += 3) {
      slot = slots[h];
      past = slot && day.offset === 0 && slot.end <= now;
      classes = "detail-slot" + (past ? " past" : "");
      html += '<div class="' + classes + '"><p class="hour-label">' + (h < 10 ? "0" : "") + h + ' h</p>' +
        (slot ? icon(slot.condition, "detail-slot-icon") + '<span class="detail-slot-rain">' + chance(slot.probability, false) +
          '<span class="detail-rain" aria-label="' + escape(W.amount(slot.rain)) + ' millimètres sur 3 heures">' + W.amount(slot.rain) + ' mm</span></span>' +
          windReading(slot.windSpeed, slot.windDirection)
          : '<span class="detail-missing">—</span>') + '</div>';
    }
    element("sheet-body").innerHTML = html + '</div></div></div>';
    renderCurve();
  }
  function renderList(data, now) {
    var days = W.dayList(data, now), html = "", i, day, low = null, high = null, left, width;
    text("sheet-title", days.length + (days.length > 1 ? " jours" : " jour"));
    text("sheet-subtitle", W.LOCATION.name + " · touche un jour pour le détail");
    if (!days.length) {
      element("sheet-body").innerHTML = '<p class="empty-message sheet-empty">Prévisions indisponibles pour le moment.</p>';
      return;
    }
    for (i = 0; i < days.length; i += 1) {
      if (days[i].min !== null && (low === null || days[i].min < low)) { low = days[i].min; }
      if (days[i].max !== null && (high === null || days[i].max > high)) { high = days[i].max; }
    }
    for (i = 0; i < days.length; i += 1) {
      day = days[i];
      left = 0; width = 0;
      /* Each bar spans the day's min to max on a shared scale across the listed days. */
      if (day.min !== null && day.max !== null && high > low) {
        left = Math.round((day.min - low) / (high - low) * 1000) / 10;
        width = Math.max(4, Math.round((day.max - day.min) / (high - low) * 1000) / 10);
        left = Math.min(left, 100 - width);
      }
      html += '<div class="list-row" role="button" tabindex="0" data-day="' + day.offset + '">' +
        '<span class="list-cell list-day"><strong>' + escape(day.label) + '</strong><span class="list-date">' + escape(day.date) + '</span></span>' +
        '<span class="list-cell list-condition">' + icon(day.condition, "list-icon") + '<span class="list-label">' + escape(day.condition.label) + '</span></span>' +
        '<span class="list-cell list-rain">' + chance(day.probability, false) + '<span class="list-amount">' + (day.precipitation === null ? "—" : escape(W.amount(day.precipitation)) + " mm") + '</span></span>' +
        '<span class="list-cell list-temps"><span class="list-min">' + W.temperature(day.min) + '</span><span class="range-track" aria-hidden="true">' +
        (width ? '<span class="range-bar" style="left:' + left + '%;width:' + width + '%"></span>' : '') + '</span><span class="list-max">' + W.temperature(day.max) + '</span></span>' +
        '<span class="list-cell list-wind">' + windReading(day.windMax, day.windDirection) + '</span>' +
        '<span class="list-cell list-chevron" aria-hidden="true">›</span></div>';
    }
    element("sheet-body").innerHTML = '<div class="list-panel"><div class="day-list">' + html + '</div></div>';
  }
  function renderSheet() {
    if (!sheet.open) { return; }
    var now = new Date().getTime() / 1000;
    setClass("sheet", "sheet sheet-" + sheet.view);
    setClass("sheet-back", "sheet-back" + (sheet.view === "detail" && sheet.fromList ? "" : " is-hidden"));
    if (!latest || !latest.data) {
      text("sheet-title", "Prévisions");
      text("sheet-subtitle", "");
      element("sheet-body").innerHTML = '<p class="empty-message sheet-empty">Les prévisions arrivent…</p>';
    } else if (sheet.view === "list") {
      renderList(latest.data, now);
    } else {
      renderDetail(latest.data, now);
    }
  }
  function openSheet(view, offset, fromList) {
    sheet.open = true;
    sheet.view = view;
    sheet.offset = offset;
    sheet.fromList = !!fromList;
    renderSheet();
    if (element("sheet-body").scrollTop) { element("sheet-body").scrollTop = 0; }
    setClass("overlay", "overlay open");
    element("overlay").setAttribute("aria-hidden", "false");
    element("dashboard").setAttribute("aria-hidden", "true");
    /* Move VoiceOver to the title; focusing a button would leave a focus ring on touch screens. */
    if (element("sheet-title").focus) { element("sheet-title").focus(); }
  }
  function closeSheet() {
    if (!sheet.open) { return; }
    sheet.open = false;
    sheet.day = null;
    setClass("overlay", "overlay");
    element("overlay").setAttribute("aria-hidden", "true");
    element("dashboard").setAttribute("aria-hidden", "false");
  }
  /* Find the nearest element carrying a valid data-day offset, from the tapped node up to the container. */
  function dayTarget(event, container) {
    var node = event && event.target, value;
    while (node) {
      value = node.getAttribute ? node.getAttribute("data-day") : null;
      if (value !== null && value !== undefined && /^([0-9]|list)$/.test(value)) { return node; }
      if (node === container) { break; }
      node = node.parentNode;
    }
    return null;
  }
  function delegate(id, handler) {
    function run(event) {
      var target = dayTarget(event, element(id));
      if (target) { handler(Number(target.getAttribute("data-day")), target); }
    }
    element(id).addEventListener("click", run, false);
    element(id).addEventListener("keydown", function (event) {
      if (event.keyCode === 13 || event.keyCode === 32) { if (event.preventDefault) { event.preventDefault(); } run(event); }
    }, false);
  }

  function render(state) {
    latest = state;
    var now = new Date().getTime(), seconds = now / 1000, current, condition;
    var stale = state.data && W.isStale(state.receivedAt, now);
    doc.body.className = (stale ? "stale " : "") + (state.error ? "failed" : "");
    element("refresh").disabled = state.loading;
    element("refresh").setAttribute("aria-busy", state.loading ? "true" : "false");
    if (state.data) {
      current = state.data.current;
      condition = W.weather(current.weather_code, current.is_day);
      element("current-temperature").innerHTML = W.number(current.temperature_2m) ? Math.round(current.temperature_2m) + '<span class="degree">°</span>' : '—';
      text("current-condition", condition.label);
      element("current-icon").src = "assets/" + condition.icon + ".svg";
      text("current-feels", W.temperature(current.apparent_temperature));
      element("current-wind").innerHTML = windReading(current.wind_speed_10m, current.wind_direction_10m);
      renderRain(state.data, seconds);
      renderHours(state.data, seconds);
      renderDays(state.data, seconds);
      text("updated-at", "Mis à jour le " + W.updatedLabel(state.receivedAt) + " · heure de Paris");
    } else if (state.error) {
      text("current-condition", "Météo indisponible");
      element("rain-slots").innerHTML = '<p class="empty-message">Connexion impossible. Réessaie avec le bouton Actualiser.</p>';
    }
    if (stale) {
      text("connection-status", "Données anciennes" + (state.loading ? " · actualisation…" : ""));
    } else if (state.loading) {
      text("connection-status", state.data ? "Actualisation…" : "Chargement…");
    } else if (state.error) {
      text("connection-status", state.data ? "Échec de l’actualisation" : "Connexion impossible");
    } else {
      text("connection-status", "");
    }
    renderSheet();
  }
  try { storage = window.localStorage; } catch (ignore) { /* Safari private mode. */ }
  client = W.createClient({ storage: storage, now: function () { return new Date().getTime(); },
    XMLHttpRequest: window.XMLHttpRequest, setTimeout: function (fn, delay) { return window.setTimeout(fn, delay); },
    clearTimeout: function (id) { window.clearTimeout(id); }, changed: render });
  element("refresh").addEventListener("click", function () { client.refresh(true); }, false);
  /* Home-screen web apps on iOS open tapped links in Safari; navigating from script stays in the app. */
  element("radar-link").addEventListener("click", function (event) {
    if (window.navigator && window.navigator.standalone) {
      event.preventDefault();
      window.location.href = element("radar-link").href;
    }
  }, false);
  /* Safari 9 can rubber-band even with overflow:hidden. Keep taps and pinch zoom.
     Must match the full-height landscape and tablet-portrait media queries in style.css. */
  var FULL_HEIGHT_LAYOUT = "(min-width: 850px) and (min-height: 600px) and (orientation: landscape), " +
    "(min-width: 700px) and (max-width: 849px) and (min-height: 860px) and (orientation: portrait)";
  element("dashboard").addEventListener("touchmove", function (event) {
    if (event.touches && event.touches.length === 1 &&
        window.matchMedia(FULL_HEIGHT_LAYOUT).matches &&
        window.innerWidth >= doc.documentElement.clientWidth) {
      event.preventDefault();
    }
  }, false);
  /* Taps on a day card or the current panel open that day's detail; hourly cards are display only. */
  delegate("daily-cards", function (offset, target) {
    if (target.getAttribute("data-day") === "list") { openSheet("list", 0, false); } else { openSheet("detail", offset, false); }
  });
  delegate("current-panel", function (offset) { openSheet("detail", offset, false); });
  delegate("sheet-body", function (offset) { if (sheet.view === "list" && !isNaN(offset)) { openSheet("detail", offset, true); } });
  element("sheet-back").addEventListener("click", function () { openSheet("list", 0, false); }, false);
  element("sheet-close").addEventListener("click", closeSheet, false);
  element("overlay").addEventListener("click", function (event) {
    if (event && event.target === element("overlay")) { closeSheet(); }
  }, false);
  doc.addEventListener("keydown", function (event) { if (event && event.keyCode === 27) { closeSheet(); } }, false);
  /* The sheet lives outside #dashboard: block page rubber-banding unless its body really scrolls. */
  element("overlay").addEventListener("touchmove", function (event) {
    var body = element("sheet-body");
    if (event.touches && event.touches.length === 1 && window.matchMedia(FULL_HEIGHT_LAYOUT).matches &&
        window.innerWidth >= doc.documentElement.clientWidth && !(body.scrollHeight > body.clientHeight + 1)) {
      event.preventDefault();
    }
  }, false);
  /* Lets :active styles show feedback on iOS taps. */
  doc.addEventListener("touchstart", function () {}, false);
  function resume() { if (!doc.hidden) { syncViewport(); client.tick(); } }
  doc.addEventListener("visibilitychange", resume, false);
  window.addEventListener("pageshow", resume, false);
  window.addEventListener("focus", resume, false);
  window.addEventListener("online", resume, false);
  window.setInterval(resume, 30000);
  render(client.state);
  client.refresh(true);
}());
