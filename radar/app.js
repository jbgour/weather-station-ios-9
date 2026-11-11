(function () {
  "use strict";
  var R = window.LyonRadar, W = window.LyonWeather;
  var frames = [], images = {}, selected = -1, playing = false, animation = null;
  var loading = false, generation = 0, coverageZoom = null, lastAttempt = 0;
  /* Geographic magnification is continuous between the extreme levels; the buttons step through them. */
  var zoomLevels = [0.25, 0.5, 1, 2, 4, 6], zoomNames = ["Vue large", "Grande région", "Région", "Autour de Lyon", "Métropole", "Lyon proche"];
  var MIN_SCALE = zoomLevels[0], MAX_SCALE = zoomLevels[zoomLevels.length - 1];
  var scale = 2, pan = { x: 0, y: 0 }, tileZoom = 7, gesture = null, frameRequest = null, live = null;
  /* Stage geometry in CSS pixels: square side and the visible map area inside it. */
  var mapSize = 512, viewWidth = 512, viewHeight = 512;
  function imageKey(frame) { return frame.path + "@" + tileZoom; }
  function el(id) { return document.getElementById(id); }
  function text(id, value) { el(id).textContent = value; }
  function now() { return new Date().getTime() / 1000; }
  function svgNode(tag, attributes, content) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag), key;
    for (key in attributes) { if (attributes.hasOwnProperty(key)) { node.setAttribute(key, attributes[key]); } }
    if (content !== undefined) { node.textContent = content; }
    return node;
  }
  function renderLabels() {
    var svg = el("map-labels"), boxes = [], i, j;
    /* k converts screen pixels to 512-unit SVG coordinates; labels keep a fixed on-screen size. */
    var k = 512 / mapSize, ox = (mapSize - viewWidth) / 2, oy = (mapSize - viewHeight) / 2;
    function ux(px) { return (px + ox) * k; }
    function uy(px) { return (px + oy) * k; }
    var bounds = { left: ux(8), right: ux(viewWidth - 8), top: uy(8), bottom: uy(viewHeight - 8) };
    /* Areas covered by floating controls, in screen pixels from the map's corners. */
    var blocked = [
      { left: ux(0), right: ux(120), top: uy(0), bottom: uy(64) },
      { left: ux(viewWidth - 64), right: ux(viewWidth), top: uy(0), bottom: uy(112) },
      { left: ux(0), right: ux(140), top: uy(viewHeight - 70), bottom: uy(viewHeight) },
      { left: ux(viewWidth - 300), right: ux(viewWidth), top: uy(viewHeight - 24), bottom: uy(viewHeight) }
    ];
    function overlaps(a, b, gap) { return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top; }
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }
    var places = window.RadarPlaces || [];
    for (i = 0; i < places.length; i += 1) {
      var place = places[i], strong = place.priority === 0;
      if ((place.local && scale <= 1) || (place.wide && scale > 0.5)) { continue; }
      var p = R.project(place.latitude, place.longitude, scale);
      var x = p[0] + pan.x * k, y = p[1] + pan.y * k;
      if (x < bounds.left || y < bounds.top || x > bounds.right || y > bounds.bottom) { continue; }
      var font = (strong ? 17 : 13) * k, width = place.name.length * font * .58;
      var choices = [[8, -9, false], [-8, -9, true], [8, 20, false], [-8, 20, true], [8, -24, false], [-8, -24, true], [8, 34, false], [-8, 34, true]];
      var chosen = null;
      for (j = 0; j < choices.length; j += 1) {
        var c = choices[j], tx = x + c[0] * k, ty = y + c[1] * k;
        var box = { left: c[2] ? tx - width : tx, right: c[2] ? tx : tx + width, top: ty - font, bottom: ty + 3 * k };
        if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) { continue; }
        var collision = false, m;
        for (m = 0; m < blocked.length && !collision; m += 1) { collision = overlaps(box, blocked[m], 0); }
        for (m = 0; m < boxes.length && !collision; m += 1) { collision = overlaps(box, boxes[m], 5 * k); }
        if (!collision) { chosen = { x: tx, y: ty, anchor: c[2] ? "end" : "start", box: box }; break; }
      }
      if (!chosen) { continue; }
      boxes.push(chosen.box);
      svg.appendChild(svgNode("circle", { cx: x, cy: y, r: (strong ? 5 : 3) * k, fill: strong ? "#f0e7bf" : "#c3d6d9", stroke: "#10191d", "stroke-width": 1.5 * k }));
      var attrs = { x: chosen.x, y: chosen.y, "text-anchor": chosen.anchor, "font-family": "Helvetica Neue,Arial,sans-serif", "font-size": font, "font-weight": strong ? 600 : 400, fill: "none", stroke: "#10191d", "stroke-width": 3 * k, "stroke-linejoin": "round" };
      svg.appendChild(svgNode("text", attrs, place.name));
      attrs.fill = strong ? "#f0e7bf" : "#e3edeb";
      attrs.stroke = "none";
      svg.appendChild(svgNode("text", attrs, place.name));
    }
  }
  function renderScale() {
    var metersPerPixel = Math.cos(R.CENTER.latitude * Math.PI / 180) * 2 * Math.PI * 6378137 / (256 * Math.pow(2, R.CENTER.zoom));
    var pixelsPerKm = 1000 / (256 * metersPerPixel) * mapSize * scale, options = [1, 2, 5, 10, 20, 50, 100, 200], km = options[0], i;
    for (i = 0; i < options.length; i += 1) { if (options[i] * pixelsPerKm <= 110) { km = options[i]; } }
    document.querySelector(".scale span").style.width = Math.round(km * pixelsPerKm) + "px";
    text("scale-label", km + " km");
    el("scale").setAttribute("aria-label", "Échelle " + km + " kilomètres");
  }
  /* The radar tile is a fixed square around Lyon; its on-screen magnification depends on the provider zoom. */
  function tileMagnification(value, zoom) { return value / Math.pow(2, zoom - 7); }
  function clampScale(value) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }
  /* Keep the radar square covering the view; pan offsets are screen pixels from the view center. */
  function clampPan(offset, magnification) {
    var maxX = Math.max(0, (mapSize * magnification - viewWidth) / 2), maxY = Math.max(0, (mapSize * magnification - viewHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, offset.x)), y: Math.max(-maxY, Math.min(maxY, offset.y)) };
  }
  function setTransform(node, value) { node.style.webkitTransform = value; node.style.transform = value; }
  function nearestLevel(value) {
    var best = 0, i;
    for (i = 1; i < zoomLevels.length; i += 1) { if (Math.abs(Math.log(zoomLevels[i] / value)) < Math.abs(Math.log(zoomLevels[best] / value))) { best = i; } }
    return best;
  }
  function applyZoom() {
    scale = clampScale(scale);
    var nextZoom = R.providerZoom(scale), changed = nextZoom !== tileZoom, magnification;
    tileZoom = nextZoom;
    magnification = tileMagnification(scale, tileZoom);
    pan = clampPan(pan, magnification);
    setTransform(el("map-content"), "translate(" + pan.x + "px," + pan.y + "px) scale(" + magnification + ")");
    setTransform(el("map-labels"), "none");
    el("zoom-in").disabled = scale >= MAX_SCALE * 0.99;
    el("zoom-out").disabled = scale <= MIN_SCALE * 1.01;
    text("zoom-label", zoomNames[nearestLevel(scale)]);
    renderScale();
    renderLabels();
    if (changed) {
      pause();
      el("basemap").src = tileZoom === 7 ? "basemap.svg" : "basemap-z" + tileZoom + ".svg";
      el("radar-image").style.display = "none";
      el("coverage").style.display = "none";
      text("map-message", "Chargement du cadrage…");
      el("map-message").style.display = "block";
      checkCoverage();
      if (frames.length) {
        loading = true;
        loadFrames(frames);
      }
    }
  }
  function fitMap() {
    if (gesture) { return; }
    /* Use innerHeight: Safari 9's 100% height can include toolbars. */
    var viewer = document.querySelector(".viewer"), stage = el("stage");
    if (window.innerHeight > 0) { viewer.style.height = window.innerHeight + "px"; }
    viewWidth = el("map").clientWidth;
    viewHeight = el("map").clientHeight;
    /* The square map covers the area; the excess is cropped evenly around Lyon. */
    mapSize = Math.max(240, viewWidth, viewHeight);
    stage.style.width = mapSize + "px";
    stage.style.height = mapSize + "px";
    stage.style.left = Math.round((viewWidth - mapSize) / 2) + "px";
    stage.style.top = Math.round((viewHeight - mapSize) / 2) + "px";
    applyZoom();
  }
  function ready(index) { return index >= 0 && index < frames.length && images[imageKey(frames[index])] && images[imageKey(frames[index])].loaded; }
  function available() {
    var result = [], i;
    for (i = 0; i < frames.length; i += 1) { if (ready(i)) { result.push(i); } }
    return result;
  }
  function pause() {
    playing = false;
    window.clearTimeout(animation);
    el("play").className = "play";
    el("play").setAttribute("aria-label", "Lecture");
    el("play").setAttribute("aria-pressed", "false");
  }
  function buildTimeline() {
    var strip = el("timeline"), i, button;
    while (strip.firstChild) { strip.removeChild(strip.firstChild); }
    for (i = 0; i < frames.length; i += 1) {
      button = document.createElement("button");
      button.type = "button";
      button.style.width = (100 / frames.length) + "%";
      button.textContent = W.time(frames[i].time);
      button.setAttribute("aria-label", "Image de " + W.time(frames[i].time));
      button.setAttribute("data-index", String(i));
      strip.appendChild(button);
    }
    /* The track runs from the first tick to the last, i.e. between the outer cells' centers. */
    el("timeline-track").style.left = el("timeline-track").style.right = (50 / Math.max(1, frames.length)) + "%";
  }
  function updateControls() {
    var buttons = el("timeline").childNodes, i;
    el("play").disabled = available().length < 2;
    for (i = 0; i < buttons.length; i += 1) {
      buttons[i].disabled = !ready(i);
      buttons[i].className = i === selected ? "selected" : "";
      buttons[i].setAttribute("aria-pressed", i === selected ? "true" : "false");
    }
    el("timeline-thumb").style.display = selected >= 0 ? "block" : "none";
    if (selected >= 0) {
      el("timeline-thumb").style.left = ((selected + 0.5) / frames.length * 100) + "%";
      el("timeline-fill").style.width = (frames.length > 1 ? selected / (frames.length - 1) * 100 : 0) + "%";
    }
  }
  function show(index) {
    if (!ready(index)) { return; }
    selected = index;
    el("radar-image").src = R.tileURL(frames[index], tileZoom);
    el("radar-image").style.display = "block";
    el("map-message").style.display = "none";
    var age = Math.max(0, Math.floor((now() - frames[index].time) / 60));
    text("frame-time", W.time(frames[index].time));
    text("frame-age", age < 1 ? "À l’instant" : "Il y a " + age + " min");
    el("frame-time").title = "Mosaïque du " + W.updatedLabel(frames[index].time * 1000) + " · les mesures locales peuvent être antérieures";
    el("map").setAttribute("aria-label", "Radar observé autour de Lyon · mosaïque de " + W.time(frames[index].time));
    updateControls();
  }
  function showNextAvailable() {
    var list = available();
    if (list.length) { show(list[(list.indexOf(selected) + 1) % list.length]); }
  }
  function animate() {
    if (!playing) { return; }
    showNextAvailable();
    var list = available();
    animation = window.setTimeout(animate, selected === list[list.length - 1] ? 1800 : 700);
  }
  function report(message, failed, busy) {
    text("status", message);
    document.body.className = (failed ? "failed " : "") + (busy ? "loading" : "");
  }
  function loadFrames(nextFrames) {
    var old = images, batch = ++generation, queue = [], active = 0, failed = 0;
    var previousTime = selected >= 0 && frames[selected] ? frames[selected].time : null;
    frames = nextFrames;
    images = {};
    selected = -1;
    var i;
    for (i = 0; i < frames.length; i += 1) {
      var key = imageKey(frames[i]);
      if (old[key] && old[key].loaded) { images[key] = old[key]; }
      if (frames[i].time === previousTime) { selected = i; }
    }
    for (i = frames.length - 1; i >= 0; i -= 1) { if (!ready(i)) { queue.push(i); } }
    buildTimeline();
    if (ready(frames.length - 1)) { show(frames.length - 1); }
    updateControls();
    function finishStatus() {
      var list = available();
      if (queue.length || active) {
        report("Chargement des images radar : " + list.length + "/" + frames.length, false, true);
        return;
      }
      loading = false;
      if (!list.length) {
        report("Images radar inaccessibles. Vérifie la connexion ou les certificats.", true, false);
        text("map-message", "Aucune image radar disponible.");
        el("map-message").style.display = "block";
        return;
      }
      var age = now() - frames[list[list.length - 1]].time;
      if (age > 1800) { report("Dernière image radar ancienne (" + W.time(frames[list[list.length - 1]].time) + ")", true, false); }
      else if (failed) { report(failed + " image" + (failed > 1 ? "s" : "") + " indisponible" + (failed > 1 ? "s" : ""), true, false); }
      else { report("", false, false); }
    }
    function start(index) {
      var image = new window.Image(), done = false, timer;
      var key = imageKey(frames[index]), zoom = tileZoom;
      images[key] = { image: image, loaded: false };
      active += 1;
      function complete(success) {
        if (done) { return; }
        done = true;
        window.clearTimeout(timer);
        image.onload = image.onerror = null;
        if (batch !== generation) { return; }
        active -= 1;
        images[key].loaded = success;
        if (!success) { failed += 1; }
        if (success && (!ready(selected) || index === frames.length - 1)) { show(index); }
        updateControls();
        pump();
      }
      image.onload = function () { complete(true); };
      image.onerror = function () { complete(false); };
      timer = window.setTimeout(function () { complete(false); }, 15000);
      image.src = R.tileURL(frames[index], zoom);
    }
    function pump() {
      while (active < 2 && queue.length) { start(queue.shift()); }
      finishStatus();
    }
    pump();
  }
  function checkCoverage() {
    if (coverageZoom === tileZoom) { return; }
    var image = el("coverage"), zoom = tileZoom;
    image.onload = function () {
      if (zoom !== tileZoom) { return; }
      coverageZoom = zoom;
      image.style.display = "block";
    };
    image.onerror = function () { /* The mask is optional; the radar remains usable. */ };
    image.src = R.coverageURL(zoom);
  }
  function refresh() {
    if (loading) { return; }
    pause();
    loading = true;
    lastAttempt = now();
    report("Connexion à RainViewer…", false, true);
    checkCoverage();
    var xhr = new window.XMLHttpRequest(), finished = false, timer;
    function fail(message) {
      if (finished) { return; }
      finished = true;
      window.clearTimeout(timer);
      loading = false;
      report(message + (available().length ? " · images précédentes conservées" : ""), true, false);
      if (!available().length) {
        text("map-message", "Radar inaccessible. Vérifie le Wi-Fi et les certificats HTTPS.");
        el("map-message").style.display = "block";
      }
    }
    try {
      xhr.open("GET", R.MANIFEST_URL, true);
      xhr.timeout = 15000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || finished) { return; }
        if (xhr.status !== 200) { fail("Radar indisponible (HTTP " + xhr.status + ")"); return; }
        var parsed;
        try { parsed = R.framesFrom(JSON.parse(xhr.responseText), now()); }
        catch (ignore) { fail("Réponse radar invalide ou vide"); return; }
        finished = true;
        window.clearTimeout(timer);
        loadFrames(parsed);
      };
      xhr.onerror = function () { fail("Échec réseau ou certificat HTTPS"); };
      xhr.ontimeout = function () { fail("Le service radar ne répond pas"); };
      timer = window.setTimeout(function () { fail("Le service radar ne répond pas"); xhr.abort(); }, 15000);
      xhr.send();
    } catch (ignore) { fail("Safari n’a pas pu lancer la requête radar"); }
  }
  el("play").addEventListener("click", function () {
    if (playing) { pause(); return; }
    playing = true;
    el("play").className = "play playing";
    el("play").setAttribute("aria-label", "Pause");
    el("play").setAttribute("aria-pressed", "true");
    animate();
  }, false);
  /* Tap a time, or drag a finger along the strip to scrub through frames. */
  function frameAt(clientX) {
    var strip = el("timeline"), rect = strip.getBoundingClientRect();
    if (!frames.length || rect.width <= 0) { return -1; }
    return Math.max(0, Math.min(frames.length - 1, Math.floor((clientX - rect.left) / rect.width * frames.length)));
  }
  function scrubTo(index) {
    if (index < 0) { return; }
    pause();
    if (ready(index)) { show(index); }
  }
  el("timeline").addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.getAttribute && target.getAttribute("data-index") !== null) { scrubTo(parseInt(target.getAttribute("data-index"), 10)); }
  }, false);
  function touchScrub(event) {
    if (!event.touches || event.touches.length !== 1) { return; }
    event.preventDefault();
    scrubTo(frameAt(event.touches[0].clientX));
  }
  el("timeline").addEventListener("touchstart", touchScrub, false);
  el("timeline").addEventListener("touchmove", touchScrub, false);
  el("retry").addEventListener("click", refresh, false);
  /* Home-screen web apps on iOS open tapped links in Safari; navigating from script stays in the app. */
  el("back").addEventListener("click", function (event) {
    if (window.navigator && window.navigator.standalone) {
      event.preventDefault();
      window.location.href = el("back").href;
    }
  }, false);
  el("map-message").addEventListener("click", function () { if (!available().length) { refresh(); } }, false);
  /* Buttons zoom around the view center to the next named level. */
  function zoomTo(value) {
    var next = clampScale(value), factor = next / scale;
    pan = { x: pan.x * factor, y: pan.y * factor };
    scale = next;
    applyZoom();
  }
  el("zoom-in").addEventListener("click", function () {
    var i;
    for (i = 0; i < zoomLevels.length; i += 1) { if (zoomLevels[i] > scale * 1.01) { zoomTo(zoomLevels[i]); return; } }
  }, false);
  el("zoom-out").addEventListener("click", function () {
    var i;
    for (i = zoomLevels.length - 1; i >= 0; i -= 1) { if (zoomLevels[i] < scale / 1.01) { zoomTo(zoomLevels[i]); return; } }
  }, false);
  /* One finger pans, two fingers pinch around their midpoint. During the gesture only CSS
     transforms change; labels and provider tiles are recomputed when the fingers lift. */
  function touchPoints(event) {
    var rect = el("map").getBoundingClientRect(), list = event.touches, result = [], i;
    for (i = 0; i < list.length && i < 2; i += 1) { result.push({ x: list[i].clientX - rect.left - viewWidth / 2, y: list[i].clientY - rect.top - viewHeight / 2 }); }
    return result;
  }
  function midpoint(points) { return points.length >= 2 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0]; }
  function spread(points) { return points.length >= 2 ? Math.max(1, Math.sqrt(Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2))) : 0; }
  function beginGesture(points, from) {
    gesture = { scale: from.scale, pan: { x: from.pan.x, y: from.pan.y }, mid: midpoint(points), distance: spread(points) };
  }
  function drawLive() {
    frameRequest = null;
    if (!live) { return; }
    var factor = live.scale / scale;
    setTransform(el("map-content"), "translate3d(" + live.pan.x + "px," + live.pan.y + "px,0) scale(" + tileMagnification(live.scale, tileZoom) + ")");
    /* Moves the committed labels with the map: p -> live.pan + factor * (p - pan). */
    setTransform(el("map-labels"), "translate3d(" + (live.pan.x - factor * pan.x) + "px," + (live.pan.y - factor * pan.y) + "px,0) scale(" + factor + ")");
  }
  function isControl(node) {
    while (node && node !== el("map")) {
      if (node.tagName === "BUTTON" || node.tagName === "A" || node.id === "map-message") { return true; }
      node = node.parentNode;
    }
    return false;
  }
  function gestureMove(event) {
    if (!gesture) { return; }
    event.preventDefault();
    var points = touchPoints(event), next = { scale: gesture.scale }, mid, factor;
    if (!points.length) { return; }
    mid = midpoint(points);
    if (points.length >= 2 && gesture.distance) { next.scale = clampScale(gesture.scale * spread(points) / gesture.distance); }
    /* Keep the map point under the starting midpoint under the fingers' current midpoint (pure pan when factor is 1). */
    factor = next.scale / gesture.scale;
    next.pan = { x: mid.x - factor * (gesture.mid.x - gesture.pan.x), y: mid.y - factor * (gesture.mid.y - gesture.pan.y) };
    next.pan = clampPan(next.pan, Math.max(tileMagnification(next.scale, R.providerZoom(next.scale)), tileMagnification(next.scale, tileZoom)));
    live = next;
    if (frameRequest === null) { frameRequest = (window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); })(drawLive); }
  }
  /* The page never scrolls: block one-finger rubber-banding everywhere, in both orientations.
     Pinch (two fingers) stays available outside the map, and an already zoomed page can still pan. */
  document.addEventListener("touchmove", function (event) {
    if (event.touches && event.touches.length === 1 && window.innerWidth >= document.documentElement.clientWidth) { event.preventDefault(); }
  }, false);
  el("map").addEventListener("touchstart", function (event) {
    if (isControl(event.target)) { return; }
    event.preventDefault();
    pause();
    beginGesture(touchPoints(event), live || { scale: scale, pan: pan });
  }, false);
  el("map").addEventListener("touchmove", gestureMove, false);
  function gestureEnd(event) {
    if (!gesture) { return; }
    if (event.touches && event.touches.length) {
      /* A finger lifted mid-pinch: continue panning from the current position. */
      beginGesture(touchPoints(event), live || { scale: scale, pan: pan });
      return;
    }
    gesture = null;
    if (live) {
      scale = live.scale;
      pan = live.pan;
      live = null;
      applyZoom();
    }
  }
  el("map").addEventListener("touchend", gestureEnd, false);
  el("map").addEventListener("touchcancel", gestureEnd, false);
  function resume() {
    if (document.hidden) { pause(); return; }
    fitMap();
    if (now() - lastAttempt >= 300) { refresh(); }
    else if (selected >= 0) { show(selected); }
  }
  document.addEventListener("visibilitychange", resume, false);
  window.addEventListener("pageshow", resume, false);
  window.addEventListener("online", resume, false);
  window.addEventListener("resize", fitMap, false);
  window.addEventListener("orientationchange", fitMap, false);
  window.setInterval(resume, 30000);
  fitMap();
  refresh();
}());
