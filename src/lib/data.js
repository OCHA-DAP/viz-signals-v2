import Papa from 'papaparse';

export const coordsURL = 'https://raw.githubusercontent.com/OCHA-DAP/hdx-signals-alerts/main/metadata/location_metadata.csv';
export const signalsURL = 'https://raw.githubusercontent.com/OCHA-DAP/hdx-signals-alerts/main/metadata/signals.csv';
export const indicatorsURL = 'https://raw.githubusercontent.com/OCHA-DAP/hdx-signals-alerts/main/metadata/signals_indicators.csv';

function loadCSV(filePath) {
  return new Promise((resolve, reject) => {
    Papa.parse(filePath, {
      download: true,
      header: true,
      complete: results => resolve(results.data),
      error: reject
    });
  });
}

export async function loadAllSignals() {
  const [coords, rawSignals, indicatorTitles] = await Promise.all([
    loadCSV(coordsURL),
    loadCSV(signalsURL),
    loadCSV(indicatorsURL)
  ]);

  const signals = rawSignals.filter(d => d.iso3 !== '');

  //sort newest first
  signals.sort((a, b) => new Date(b.date) - new Date(a.date));

  //O(1) lookups instead of per-signal .find()
  const coordsByIso3 = new Map(coords.map(row => [row['Alpha-3 code'], row]));
  const nameByIndicatorId = new Map(
    indicatorTitles.map(row => [row['indicator_id'], row['indicator_subject']])
  );

  signals.forEach(signal => {
    const match = coordsByIso3.get(signal.iso3);
    const hasCoords = match && (match.Latitude !== 'NA' || match.Longitude !== 'NA');
    signal.lat = hasCoords ? +match.Latitude : null;
    signal.lon = hasCoords ? +match.Longitude : null;
    signal.indicator_title = nameByIndicatorId.get(signal.indicator_id) ?? null;
  });

  return { signals, coordsData: coords, namesData: indicatorTitles };
}
