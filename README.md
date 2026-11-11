# Weather dashboard for old iPads

A lightweight, French-language weather dashboard for Safari on **iOS 9.3.5**: current conditions, rain over the next hour, six hourly forecasts, three upcoming days and a full-screen rain radar of the past hour, extended by an estimated forecast for the next hour. Plain HTML, CSS and ES5 JavaScript, with no build step, accounts, API keys or production dependencies.

**[Open the dashboard](https://jbgour.github.io/weather-station-ios-9/)** · Designed for a landscape iPad, including full-screen mode. In Safari, use **Share → Add to Home Screen**.

## Run locally

Clone or download this repository, then run inside its directory:

```sh
python3 -m http.server 8000 --directory .
```

Open `http://localhost:8000/`. On an iPad on the same Wi-Fi, use `http://<computer-ip>:8000/`. Keep the computer awake while testing; this development server is for your local network, not public hosting.

Open `diagnostic.html` to check the weather connection, storage and viewport size. Internet access is still required for fresh forecasts.

## Change the city

Edit **`LOCATION` at the top of [assets/weather.js](assets/weather.js)**:

```js
var LOCATION = { name: "Paris", latitude: 48.8566, longitude: 2.3522 };
```

This updates the heading, weather requests, diagnostic links and cache key. The [rain radar](radar/README.md) stays centered on Lyon: it uses prebuilt basemaps and places. Use decimal coordinates. After editing JavaScript or CSS, bump the corresponding `?v=` suffixes in the HTML pages so an old iPad loads the new files.

**The clock is intentionally fixed to `Europe/Paris`.** Other cities in metropolitan France work with this change alone. Other timezones require adapting the API timezone and the time/DST helpers; changing the API parameter alone is insufficient. The 15-minute precipitation coverage also varies by region.

## Deploy your own copy

1. Fork the repository into a public GitHub repository.
2. In **Settings → Pages → Source**, select **GitHub Actions**.
3. Enable Actions if prompted. In **Actions → Deploy weather dashboard → Run workflow**, select **main** and launch it.
4. After the deployment succeeds, open `https://<your-username>.github.io/<repository-name>/`.

Publishing is manual; pushing a commit does not deploy. The workflow tests first and publishes only the website assets and public certificate, excluding repository metadata, tests and documentation. Other static web servers work too.

## Old Safari, data and privacy

- If HTTPS fails, first check the iPad's date and time. iOS 9 may lack **ISRG Root X1**. See the [certificate provenance and fingerprint](certificates/README.md). To install the official bundled copy, open `http://<computer-ip>:8000/certificates/isrg-root-x1.cer`, inspect its identity, approve installation and restart Safari. Installing a root adds a system trust authority; the site never installs it automatically.
- Refreshes run every 15 minutes and on resume when needed. Failed updates retain the last valid data; after an hour it is marked stale. Storage-denied mode works in memory. A full page reload offline is not guaranteed.
- Rain values are model forecasts for the **15 minutes preceding each timestamp**, not minute-precise radar predictions. Wind arrows show where the wind blows; speeds are sustained wind, not gusts. Their colors are visual cues, not official alerts.
- The radar shows observed RainViewer mosaics from the past hour, then an estimate for the next hour made on the device by moving the latest rain along its recent motion (no growth or decay). Clear areas do not prove dry weather; darkened areas lack radar coverage.
- The site and source are public. There is no analytics code or login. GitHub, Open-Meteo and RainViewer (radar page) receive network requests; do not put secrets or sensitive data in the repository. An old browser remains an old browser, even with HTTPS.

Weather data: [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Check its [terms](https://open-meteo.com/en/terms) for your intended use. Radar: [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) (personal/educational use with attribution). Basemap: [Natural Earth](https://www.naturalearthdata.com/), public domain.

## Check changes

```sh
python3 scripts/test.py
```

Requires Python 3 and either Node.js or macOS JavaScriptCore; no packages to install. Tests cover time/DST, rain intervals, wind, storage failures, network recovery, layout sizing, radar manifest and tile validation, the radar nowcast motion estimate, radar page behavior (timeline, forecast, gestures) with a fake DOM, weather icon files, the Pages file allowlist and the certificate fingerprint.

For visual changes, test landscape at **1024 × 600, 748 and 768 CSS pixels** and portrait at **768 × 870 to 1024**; both must fit without scrolling. On the physical iPad, check full-screen mode, refresh after 15 minutes asleep and recovery after losing Wi-Fi. See [AGENTS.md](AGENTS.md) for development constraints.
