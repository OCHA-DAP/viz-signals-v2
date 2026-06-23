<script>
	import mapboxgl from 'mapbox-gl';
	import * as d3 from 'd3';
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
  import Legend from './Legend.svelte';
  import Popup from './Popup.svelte';
  import { filters, signalsData } from './stores.js';
  import { isMobile } from './utils.js';
	import '../../node_modules/mapbox-gl/dist/mapbox-gl.css'

	//data.humdata.org/mapbox proxies real Mapbox requests in production, but its
	//WAF issues a JS challenge to any browser-originated request that isn't part
	//of a page navigation on that domain - unsolvable from localhost. For local
	//dev, use a real Mapbox token directly against the default api.mapbox.com
	//instead (set VITE_MAPBOX_TOKEN in .env.local).
	const devToken = import.meta.env.VITE_MAPBOX_TOKEN;
	if (import.meta.env.DEV && devToken) {
		mapboxgl.accessToken = devToken;
	} else {
		mapboxgl.baseApiUrl = 'https://data.humdata.org/mapbox';
		mapboxgl.accessToken = 'cacheToken';
	}

	const styleId = 'humdata/cl3lpk27k001k15msafr9714b';

	export let center = [20, 10];
	export let zoom = 2;
	export let headerHeight = 0;
  export let mpTrack = () => {}

	$: maxCount = 0;

	let map, mapContainer, signalsGeoData, currentSignals, countByCountry, hoveredStateId;
	let numFormat = d3.format(',');
	let minMarkerSize = 8;
	let maxMarkerSize = 20;
	let minZoom = 1;
	let panelOpen = false;
	let mapLoadError = false;
	let data = [];
	let unsubscribeSignals;
	let filtersInitialized = false;

	let popupOpen = false;
	let popupSignals = [];
	let popupNumAlerts = 0;

	$: if (mapContainer) {
		mapContainer.style.height = (isMobile()) ? ((window.innerHeight - headerHeight)*0.6) + 'px' : (window.innerHeight - headerHeight) + 'px';
	}

	//close the popup whenever the committed filters change (skip the very first value)
	$: if ($filters) {
		if (filtersInitialized) closePopup();
		filtersInitialized = true;
	}

	function showPopup(signals, numAlerts) {
		popupSignals = signals;
		popupNumAlerts = numAlerts;
		popupOpen = true;
	}

	function closePopup() {
		popupOpen = false;
	}

	//the style proxy occasionally answers with an empty body (bot-mitigation
	//interstitial) instead of JSON; fetch it ourselves with retries so we can
	//hand mapbox-gl a validated style object instead of a URL it can't recover from
	async function fetchStyle(attempts = 3, delayMs = 600) {
	  const url = `${mapboxgl.baseApiUrl}/styles/v1/${styleId}?access_token=${mapboxgl.accessToken}`;
	  for (let i = 0; i < attempts; i++) {
	    try {
	      const res = await fetch(url);
	      const text = await res.text();
	      if (res.ok && text) {
	        return JSON.parse(text);
	      }
	    } catch (e) {
	      //retry below
	    }
	    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
	  }
	  return null;
	}

	onMount(async () => {
		mapContainer.style.height = (isMobile()) ? ((window.innerHeight - headerHeight)*0.6) + 'px' : (window.innerHeight - headerHeight) + 'px';

		const style = await fetchStyle();
		if (!style) {
			mapLoadError = true;
			return;
		}

		//init map
	  map = new mapboxgl.Map({
	    container: mapContainer,
	    style: style,
	    center: center,
	    zoom: zoom,
	    minZoom: minZoom,
	    maxZoom: 5.5
	  });

	  map.addControl(new mapboxgl.NavigationControl({showCompass: false}))
	     .addControl(new mapboxgl.AttributionControl(), 'bottom-left');


	  map.on('load', function() {
		  data = get(signalsData);
		  loadFeatures();

		  //react to filter changes once the map is ready
		  unsubscribeSignals = signalsData.subscribe(value => {
		  	if (value !== data) {
		  		data = value;
		  		updateFeatures();
		  	}
		  });
	  });

	  map.on('click', (e) => {
	  	//close the popup if clicked on anywhere outside of signal-dots layer
      let featureSelected = map.queryRenderedFeatures(e.point, {layers: ['signals-dots']});
	  	if (featureSelected.length<=0) {
	  		closePopup();
	  	}
	  });
	});

	function loadFeatures() {
	  //get alert count by country
    countByCountry = Object.values(data.reduce((a, {iso3, lat, lon}) => {
		  a[iso3] = a[iso3] || {iso3, alert_count: 0, lat, lon};
		  a[iso3].alert_count++;
		  return a;
		}, Object.create(null)));
		let signals = [];

		countByCountry.forEach(function(signal, i) {
			signals.push({
				'type': 'Feature',
				'geometry': {
					'type': 'Point',
					'coordinates': [signal.lon, signal.lat]
				},
				'properties': signal
			});
		});

		//create geojson
		signalsGeoData = {
			'type': 'FeatureCollection',
			'features': signals
		}
		map.addSource('signals-source', {
	    type: 'geojson',
	    data: signalsGeoData,
	    generateId: true
	  });

		//create size scale for markers
		maxCount = d3.max(countByCountry, d => d.alert_count);
    let sizeScale = (maxCount <= 1) ? minMarkerSize : [
		  'interpolate',
		  ['linear'],
		  ['sqrt', ['get', 'alert_count']],
		  Math.sqrt(1), minMarkerSize,
		  Math.sqrt(maxCount), maxMarkerSize
		];

    let signalColor = '#007CE0';

		//add signal markers
	  map.addLayer({
	    id: 'signals-dots',
	    type: 'circle',
	    source: 'signals-source',
	    paint: {
	      'circle-color': signalColor,
	      'circle-stroke-color': signalColor,
	      'circle-opacity': 0.6,
	      'circle-radius': sizeScale,
	      'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          5,
          1
        ]
	    }
	  });

	  //mouse events

	  let hoveredStateId = null;

		map.on('mousemove', 'signals-dots', mousemove);
    map.on('mouseout', 'signals-dots', mouseout);
	  map.on('click', 'signals-dots', (e) => {
	  	mouseclick(e);
	  });

	  //zoom map to marker bounds
	  zoomToBounds();
	}

	function updateFeatures() {
		if (map && map.getSource('signals-source')) {
			map.removeLayer('signals-dots');
			map.removeSource('signals-source');
			loadFeatures();
		}
	}

	function zoomToBounds() {
		//zoom map to bounds
		let mapPadding = (isMobile()) ? {top: 20, right: 20, bottom: 20, left: 20} : {top: 100, right: 80, bottom: 150, left: 80};
		if (signalsGeoData !== undefined) {
		  let bounds = new mapboxgl.LngLatBounds();
			signalsGeoData.features.forEach(function(feature) {
			  bounds.extend(feature.geometry.coordinates);
			});
			map.fitBounds(bounds, {padding: mapPadding, duration: 500});
		}
	}

	function getNumAlerts(iso3) {
		return countByCountry.filter(d => d.iso3 == iso3);
	}

	function getAlerts(iso3) {
		//get all alerts for a country and sort by date
		let alerts = data.filter(d => d.iso3 == iso3);
		alerts.sort((a,b) => {
			return new Date(b.date) - new Date(a.date);
		});
		return alerts;
	}


	function mousemove(e) {
	  map.getCanvas().style.cursor = 'pointer';
	  if (e.features.length > 0) {
	    if (hoveredStateId) {
	      map.setFeatureState({
	        source: 'signals-source',
	        id: hoveredStateId
	      }, {
	        hover: false
	      });
	    }

	    hoveredStateId = e.features[0].id;
	    map.setFeatureState({
	      source: 'signals-source',
	      id: hoveredStateId
	    }, {
	      hover: true
	    });
	  }
  }

  function mouseout() {
		map.getCanvas().style.cursor = '';
		map.setFeatureState({
      source: 'signals-source',
      id: hoveredStateId
    }, {
      hover: false
    });
  }

  function mouseclick(e) {
  	if (panelOpen) return;

		let iso3 = e.features[0].properties.iso3;
		currentSignals = getAlerts(iso3);

    let numSignals = getNumAlerts(currentSignals[0].iso3)[0].alert_count;

    //set popup content
    showPopup(currentSignals, numSignals);

    //track click
  	panelOpen = true;
	  mpTrack('popup view', currentSignals[0].location);

    //disable click for 1s to prevent multiple events
		setTimeout(() => {
			panelOpen = false;
		}, 1000);
  }

	onDestroy(() => {
	  if (unsubscribeSignals) unsubscribeSignals();
	  if (map) map.remove();
	});
</script>


<div bind:this={mapContainer} />
{#if mapLoadError}
	<div class='map-error'>Unable to load the map right now. Please refresh the page or try again later.</div>
{/if}
{#if maxCount}
	<Legend {minMarkerSize} {maxMarkerSize} {maxCount} />
{/if}

<Popup open={popupOpen} signals={popupSignals} numAlerts={popupNumAlerts} onClose={closePopup} />


<style lang='scss'>
  .map-error {
    align-items: center;
    color: #555;
    display: flex;
    height: 100%;
    justify-content: center;
    position: absolute;
    text-align: center;
    top: 0;
    width: 100%;
  }
</style>
