(function () {
  "use strict";
  var W = window.LyonWeather;
  var doc = window.document;
  var storage = null;
  var client;
  function element(id) { return doc.getElementById(id); }
  function text(id, value) { element(id).textContent = value; }
  function escape(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function icon(condition, className) {
    return '<img class="' + className + '" src="assets/' + condition.icon + '.svg" alt="' + escape(condition.label) + '">';
  }
  function chance(value, daily) {
    return '<span class="probability" aria-label="' + (daily ? 'Probabilité horaire maximale de pluie : ' : 'Probabilité de pluie : ') + escape(W.probability(value)) + '"><img class="drop" src="assets/drop.svg" alt="">' + W.probability(value) + (daily ? ' max.' : '') + '</span>';
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
      html += '<div class="day-card"><div class="day-top"><span class="day-name">' + slot.label + '</span>' +
        '<span class="day-temperatures"><span aria-label="Maximum ' + escape(W.temperature(slot.max)) + '">' + W.temperature(slot.max) + '</span>' +
        '<span class="day-min" aria-label="Minimum ' + escape(W.temperature(slot.min)) + '">' + W.temperature(slot.min) + '</span></span></div>' +
        '<div class="day-bottom">' + icon(slot.condition, "day-icon") + chance(slot.probability, true) + '</div></div>';
    }
    element("daily-cards").innerHTML = html;
  }
  function render(state) {
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
  }
  try { storage = window.localStorage; } catch (ignore) { /* Safari private mode. */ }
  client = W.createClient({ storage: storage, now: function () { return new Date().getTime(); },
    XMLHttpRequest: window.XMLHttpRequest, setTimeout: function (fn, delay) { return window.setTimeout(fn, delay); },
    clearTimeout: function (id) { window.clearTimeout(id); }, changed: render });
  element("refresh").addEventListener("click", function () { client.refresh(true); }, false);
  /* Safari 9 can rubber-band even with overflow:hidden. Keep taps and pinch zoom. */
  element("dashboard").addEventListener("touchmove", function (event) {
    if (event.touches && event.touches.length === 1 &&
        window.matchMedia("(min-width: 850px) and (min-height: 600px) and (orientation: landscape)").matches &&
        window.innerWidth >= doc.documentElement.clientWidth) {
      event.preventDefault();
    }
  }, false);
  function resume() { if (!doc.hidden) { client.tick(); } }
  doc.addEventListener("visibilitychange", resume, false);
  window.addEventListener("pageshow", resume, false);
  window.addEventListener("focus", resume, false);
  window.addEventListener("online", resume, false);
  window.setInterval(resume, 30000);
  render(client.state);
  client.refresh(true);
}());
