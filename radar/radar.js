(function (root) {
  "use strict";
  var CENTER = { latitude: 45.75, longitude: 4.85, zoom: 7 };
  var HOST = "https://tilecache.rainviewer.com";
  function validNumber(value) { return typeof value === "number" && isFinite(value); }
  function framesFrom(data, now) {
    if (!data || data.host !== HOST || !data.radar || Object.prototype.toString.call(data.radar.past) !== "[object Array]") { throw new Error("Invalid radar manifest"); }
    var result = [], i, f, previous = 0;
    for (i = 0; i < data.radar.past.length; i += 1) {
      f = data.radar.past[i];
      if (!f || !validNumber(f.time) || f.time <= previous || f.time > now + 300 || !/^\/v2\/radar\/[a-zA-Z0-9]+$/.test(f.path)) { throw new Error("Invalid radar frame"); }
      previous = f.time;
      result.push({ time: f.time, path: f.path });
    }
    if (!result.length) { throw new Error("No past radar frames"); }
    return result.slice(-7);
  }
  function providerZoom(scale) { return scale < 0.5 ? 5 : scale < 1 ? 6 : 7; }
  function tileURL(frame, zoom) {
    if (!frame || !/^\/v2\/radar\/[a-zA-Z0-9]+$/.test(frame.path)) { throw new Error("Invalid tile path"); }
    zoom = zoom === undefined ? 7 : zoom;
    if (zoom !== 5 && zoom !== 6 && zoom !== 7) { throw new Error("Unsupported provider zoom"); }
    return HOST + frame.path + "/512/" + zoom + "/45.75/4.85/2/1_0.png";
  }
  function coverageURL(zoom) {
    if (zoom !== 5 && zoom !== 6 && zoom !== 7) { throw new Error("Unsupported coverage zoom"); }
    return HOST + "/v2/coverage/0/512/" + zoom + "/45.75/4.85/0/0_0.png";
  }
  function project(latitude, longitude, scale) {
    var world = 256 * Math.pow(2, CENTER.zoom);
    function xy(lat, lon) {
      var radians = lat * Math.PI / 180;
      return [(lon + 180) / 360 * world, (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * world];
    }
    var p = xy(latitude, longitude), c = xy(CENTER.latitude, CENTER.longitude);
    scale = scale || 1;
    return [256 + 2 * (p[0] - c[0]) * scale, 256 + 2 * (p[1] - c[1]) * scale];
  }
  root.LyonRadar = { CENTER: CENTER, HOST: HOST, framesFrom: framesFrom, tileURL: tileURL, project: project, providerZoom: providerZoom, coverageURL: coverageURL,
    MANIFEST_URL: "https://api.rainviewer.com/public/weather-maps.json" };
}(typeof window !== "undefined" ? window : this));
