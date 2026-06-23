# HDX Signals Map

An interactive map visualizing [HDX Signals](https://data.humdata.org/signals) — automated alerts generated when significant, negative changes are detected in key humanitarian datasets.

Signal, location, and indicator data are loaded at runtime from CSVs published in the [hdx-signals-alerts](https://github.com/OCHA-DAP/hdx-signals-alerts) repo (`src/lib/data.js`) and plotted on a Mapbox GL map (`src/lib/Map.svelte`) as bubbles sized by alert count per country. Users can filter signals by region, indicator/dataset, date range, and HRP (priority humanitarian) location from the side panel (`src/App.svelte`), and click a country bubble to view its individual signals in a popup (`src/lib/Popup.svelte`), each linking back to the original alert email. Filter and viz interactions are tracked via Mixpanel.

Built with Svelte + Vite.

## Development

```
npm install
npm run dev
```

Map tiles are served via a `data.humdata.org` proxy in production. For local development, set a real Mapbox token in `.env.local`:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
```