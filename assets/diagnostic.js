(function () {
  "use strict";
  var result = document.getElementById("diagnostic-result");
  var button = document.getElementById("retry-diagnostic");
  document.getElementById("full-api-request").href = window.LyonWeather.API_URL;
  document.getElementById("basic-api-request").href = window.LyonWeather.BASIC_API_URL;
  function failure(details) {
    var messages = {
      network: "Aucune réponse HTTP accessible : réseau, HTTPS ou CORS à vérifier.",
      http: "Le service météo a renvoyé une erreur HTTP.",
      json: "La réponse reçue n’est pas du JSON valide.",
      schema: "La réponse reçue ne contient pas les données météo attendues.",
      timeout: "Le service n’a pas répondu dans le délai de 20 secondes.",
      abort: "La requête a été interrompue.",
      exception: "Safari n’a pas pu exécuter la requête."
    };
    if (!details) { return "Détails indisponibles : recharge cette page pour mettre à jour le diagnostic."; }
    return (messages[details.kind] || "Erreur inconnue.") + "\nCode HTTP : " + details.status +
      (details.detail ? "\nDétail : " + details.detail : "");
  }
  function run() {
    var storage = "disponible", lines, client;
    try {
      window.localStorage.setItem("lyon-diagnostic", "1");
      if (window.localStorage.getItem("lyon-diagnostic") !== "1") { throw new Error("Storage denied"); }
      window.localStorage.removeItem("lyon-diagnostic");
    } catch (ignore) { storage = "indisponible (la météo fonctionnera en mémoire)"; }
    lines = "Diagnostic v2\nJavaScript : OK\nAffichage : " + document.documentElement.clientWidth + " × " + document.documentElement.clientHeight +
      "\nStockage : " + storage + "\nDate de l’appareil (UTC) : " + new Date().toUTCString() + "\n";
    client = window.LyonWeather.createClient({ storage: null,
      now: function () { return new Date().getTime(); }, XMLHttpRequest: window.XMLHttpRequest,
      setTimeout: function (fn, delay) { return window.setTimeout(fn, delay); },
      clearTimeout: function (id) { window.clearTimeout(id); },
      changed: function (state) {
        button.disabled = state.loading;
        result.textContent = lines + (state.loading ? "Requête météo : en cours…" : state.error ?
          "Requête météo : ÉCHEC\n" + failure(state.errorDetails) :
          "Requête météo : OK (HTTPS et XHR/CORS)\nTempérature · " + window.LyonWeather.LOCATION.name + " : " + window.LyonWeather.temperature(state.data.current.temperature_2m));
      }
    });
    client.refresh(true);
  }
  button.addEventListener("click", run, false);
  run();
}());
