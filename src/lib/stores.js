import { writable, derived } from 'svelte/store';

//full signal set within the available date window (set once data loads)
export const rawData = writable([]);

//committed filters (updated only on Apply/Reset, not on every checkbox toggle)
export const filters = writable({ region: [], indicator_title: [], date: [], hrp_location: '' });

//signals matching the committed filters - recomputes whenever rawData or filters change
export const signalsData = derived([rawData, filters], ([$rawData, $filters]) => {
  return $rawData.filter(d => {
    let validSignal = true;

    for (const [key, value] of Object.entries($filters)) {
      if (Array.isArray(value)) {
        if (key === 'region' || key === 'indicator_title') {
          if (!value.includes(d[key])) validSignal = false;
        }
        if (key === 'date') {
          const signalTime = new Date(d[key]).getTime();
          if (signalTime < value[0] || signalTime > value[1]) validSignal = false;
        }
      } else if (value !== '' && value.toLowerCase() !== d[key].toLowerCase()) {
        validSignal = false;
      }
    }

    return validSignal;
  });
});
