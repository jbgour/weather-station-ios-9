# Lyon Weather — iPad iOS 9

A static weather dashboard for Safari on iOS 9.3.5: current conditions, rainfall over the next hour, six hourly forecasts and the next three days. No accounts, application server, tracking or production dependencies. The dashboard and diagnostic interface are in French; documentation and technical messages are in English.

## Run locally

```sh
python3 -m http.server 8000 --directory .
```

Open `http://localhost:8000/`. On an iPad connected to the same Wi-Fi network, replace `localhost` with the computer's local IP address. Keep the computer running during this test.

**First test on the iPad:** open `diagnostic.html` before testing the dashboard. This page checks a real XHR request from the site, the weather response, storage and the available viewport size. Opening the API directly in Safari does not test CORS. The diagnostic only runs when its page is open.

## iOS 9 certificate setup

The physical iPad reported certificate warnings for both Open-Meteo and GitHub Pages despite a correct clock. Both services currently offer certificate chains leading to ISRG Root X1, which is not included in iOS 9's default trust store. See the [official compatibility list](https://letsencrypt.org/docs/certificate-compatibility/).

Before changing the hosting or adding a proxy:

1. Confirm that the iPad's date, year and time are correct.
2. With the local HTTP server running, open `http://<computer-ip>:8000/certificates/isrg-root-x1.cer` in Safari on the iPad.
3. Inspect the certificate installation screen: the certificate must be **ISRG Root X1**, issued by **Internet Security Research Group**. Installing it adds this CA as a system trust anchor. Approve the installation on the iPad if you want to enable that trust.
4. Close and reopen Safari, then revisit the API and GitHub Pages. They should load without a certificate warning if the missing root was the only issue. Reload `diagnostic.html?v=2` and run the test again.

The bundled certificate is an unchanged copy from Let's Encrypt's official download, with a pinned SHA-256 fingerprint checked by the test runner. See [certificate provenance](certificates/README.md). The owner installed it on the physical iPad and confirmed that both the local diagnostic request and the dashboard now work in landscape. Continuing past a browser warning alone is not proof that background XHR requests will work.

## Deploy manually to GitHub Pages

1. Commit and push the files to `jbgour/weather-station-ios-9`.
2. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Under **Actions → Deploy weather dashboard → Run workflow**, select `main` and run the workflow. It tests the code, then publishes only the website files, excluding tests and documentation.
4. Wait for a successful deployment. Expected address: `https://jbgour.github.io/weather-station-ios-9/` (available only after deployment).
5. On the iPad, open `diagnostic.html`, then the dashboard. Test HTTPS using this exact address; certificates from some hosts or custom domains may be incompatible with iOS 9.

Deployment is manual: pushing a commit does not publish anything. The Freebox Révolution only provides network access. The files can also be served unchanged by a local HTTP server.

## Data and compatibility

- [Open-Meteo](https://open-meteo.com/en/docs), fixed coordinates `45.75, 4.85`, `Europe/Paris` timezone, °C, km/h and mm. Conditions are model estimates rather than readings from a local thermometer. Personal use is free under the [service terms](https://open-meteo.com/en/terms).
- One XHR request on startup, every 15 minutes and on resume when needed; 20-second timeout. Failed requests are retried at most once per minute. The refresh button forces an attempt without starting concurrent requests.
- Rainfall totals cover the **15 minutes preceding each timestamp**. Intervals overlapping the next 60 minutes are displayed, even if the first has already started or the last ends beyond that hour. Totals are never prorated. Up to five intervals are visible.
- Hourly cards show a sample every two hours with its hourly precipitation probability, without aggregating probabilities. Daily cards show the maximum hourly probability for that day.
- Current conditions and hourly cards show wind speed in km/h with a colored direction arrow: soft green below 10, yellow from 10 to 24, orange from 25 to 39, and coral from 40 km/h. Only the arrow changes color; the number remains neutral. Thresholds use the rounded speed displayed on screen. These are visual cues for sustained wind, not official warning thresholds or gust measurements. The arrow points **where the wind is blowing**, with north at the top; accessible labels and tooltips state where it comes from. A southerly wind therefore points upward. Calm winds and missing direction values have no arrow; missing speeds appear as **—**.
- Unix timestamps are explicitly converted to Paris time using the European daylight saving rule, without `Intl`, native ISO date parsing or reliance on the device's timezone. Daily dates use the offset declared by the API, whose daily timestamps are spaced 24 hours apart, including across daylight saving transitions.
- The last valid response is saved in `localStorage`, with an in-memory fallback if storage is denied. After one hour without success, the interface flags stale data. Missing values appear as **—**, never zero. There is no service worker: a full page reload without a network connection is not guaranteed to work.
- ES5 JavaScript; CSS without Grid, flexbox, CSS variables or remote fonts; local SVG icons. Reference layout: landscape at 1,024 × 768 CSS pixels, adapting to Safari's toolbars. Portrait and smaller screens may scroll to preserve readability.
- On tablet-sized landscape viewports (at least 850 × 600 CSS pixels), the dashboard locks page scrolling and single-finger rubber-banding in Safari 9. Taps and pinch zoom remain available. Portrait, smaller viewports and the diagnostic page retain scrolling.
- The compact header shows only Lyon. A slim footer keeps the last successful update, a small 22-pixel-high refresh control and source/license links on one row in landscape; connection and stale-data messages appear alongside the timestamp when needed.

## Run checks

```sh
python3 scripts/test.py
```

The runner uses Node.js when available, otherwise JavaScriptCore on macOS. Tests do not access the network. They cover Paris time, midnight, daylight saving transitions, rainfall totals, missing data, storage, XHR errors and recovery. No packages are required.

Acceptance checks on the **physical iPad**, which local tests cannot replace:

The local diagnostic and dashboard have been confirmed working after certificate installation. Tests against the published address and after extended sleep remain to be completed.

- Diagnostic: successful request, HTTPS compatibility and storage status.
- No scrolling in landscape; readable numbers at the intended viewing distance; accessible refresh button.
- Put the iPad to sleep for at least 15 minutes, wake it and check that the data updates.
- Disable Wi-Fi: data remains visible and failed refreshes are reported; after an hour, data is marked stale. Re-enable Wi-Fi and check recovery.
- Try a first load without a network connection, then recovery with a previously saved response. Cached data does not guarantee that the page itself is available offline.
- Check forecasts around midnight and in both dry and rainy conditions.

Attribution: Open-Meteo weather data, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), using models including Météo-France. The repository's icons were drawn for this project.
