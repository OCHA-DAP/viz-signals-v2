<script>
  import * as d3 from 'd3';
  import { onMount } from 'svelte';
  import RangeSlider from 'svelte-range-slider-pips'
  import Map from './lib/Map.svelte'
  import { loadAllSignals } from './lib/data.js';
  import { rawData, filters, signalsData } from './lib/stores.js';
  import { isMobile } from './lib/utils.js';

  let headerHeight;
  let errorMsg = '';
  let hasHRP = true;
  let sliderDates = [];
  let regions = [];
  let indicators = [];

  //draft selections - committed to the filters store on Apply/Reset
  let regionChecked = {};
  let indicatorChecked = {};
  let hrpOnly = false;
  let sliderDefault = [];
  let draftDate = [];
  let draftDateValue = [];

  let startDate, endDate, defaultStartDate;
  let commitTimer;

  //delay before a filter change is committed, so a burst of clicks
  //(e.g. several checkboxes) collapses into a single map update
  const commitDelay = 300;

  //set number of months to show
  const numMonths = 12;

  //set slider filter to show last 3 months of data
  sliderDefault = [numMonths-3, numMonths];

  $: numCountries = new Set($signalsData.map(d => d.iso3)).size;

  //committed date range as "Aug – Nov 2026", "Nov 2025 – Feb 2026" or "Sep 2026"
  $: periodLabel = formatPeriod($filters.date_value);

  function formatPeriod(dates) {
    if (!dates || dates.length < 2) return '';
    const [start, end] = dates;
    const monthYear = d3.utcFormat('%b %Y');
    if (monthYear(start) === monthYear(end)) return monthYear(end);
    const startLabel = start.getUTCFullYear() === end.getUTCFullYear() ? d3.utcFormat('%b')(start) : monthYear(start);
    return `${startLabel} – ${monthYear(end)}`;
  }

  loadAllSignals()
    .then(({ signals, namesData }) => dataLoaded(signals, namesData))
    .catch(error => {
      console.error('Error loading files:', error);
      errorMsg = 'Unable to load signals data. Please try again later.';
    });

  function dataLoaded(signals, namesData) {
    //set available date range in whole months, ending with the current month
    createDateSlider(new Date());
    startDate = sliderDates[0];
    endDate = monthEnd(sliderDates[numMonths]);

    //set starting date range - last 3 months by default
    defaultStartDate = sliderDates[numMonths-3];

    //filter full data within available date range
    const data = signals.filter(d => new Date(d.date).getTime() >= startDate.getTime());
    rawData.set(data);

    //build the regions list from the full date range so widening the slider never hides a region
    createFilters(data, namesData);

    draftDate = [defaultStartDate.getTime(), endDate.getTime()];
    draftDateValue = [defaultStartDate, endDate];

    filters.set({
      region: regions.slice(1),
      indicator_title: indicators.slice(1),
      date: draftDate,
      date_value: draftDateValue,
      hrp_location: ''
    });

    checkResults();
  }

  function createFilters(data, namesData) {
    //get list of regions
    let regionArray = data.map(d => d.region);
    regionArray.sort();
    regionArray = [...new Set(regionArray)];
    regionArray.unshift('All regions');
    regions = regionArray;
    regionChecked = Object.fromEntries(regions.map(r => [r, true]));

    //get list of indicators
    let indicatorArray = namesData
      .filter(d => d.indicator_id !== '')
      .map(d => d.indicator_subject);
    indicatorArray.sort();
    indicatorArray.unshift('All datasets');
    indicators = indicatorArray;
    indicatorChecked = Object.fromEntries(indicators.map(i => [i, true]));
  }

  //one slider step per month (1st of the month, UTC), from numMonths before latestDate up to its month
  function createDateSlider(latestDate) {
    const dates = [];
    for(let i = numMonths; i >= 0; i--) {
      dates.push(new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - i, 1)));
    }
    sliderDates = dates;
  }

  //last millisecond of the month, so the end handle includes the whole month
  function monthEnd(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1);
  }

  function onDateSelect(e) {
    const selected = e.detail.values;
    const start = sliderDates[selected[0]];
    const end = monthEnd(sliderDates[selected[1]]);
    draftDate = [start.getTime(), end.getTime()];
    draftDateValue = [start, end];
    scheduleCommit();
  }

  //keep a group's "all" checkbox in sync with its individual checkboxes
  function syncGroupCheck(checkedMap, allLabel, changedKey) {
    if (changedKey === allLabel) {
      const value = checkedMap[allLabel];
      Object.keys(checkedMap).forEach(k => { if (k !== allLabel) checkedMap[k] = value; });
    } else {
      checkedMap[allLabel] = Object.keys(checkedMap)
        .filter(k => k !== allLabel)
        .every(k => checkedMap[k]);
    }
  }

  function onRegionCheck(region) {
    syncGroupCheck(regionChecked, 'All regions', region);
    regionChecked = { ...regionChecked };
    scheduleCommit();
  }

  function onIndicatorCheck(indicator) {
    syncGroupCheck(indicatorChecked, 'All datasets', indicator);
    indicatorChecked = { ...indicatorChecked };
    scheduleCommit();
  }

  function onHRPCheck() {
    scheduleCommit();
  }

  //formatter for date slider
  function formatter(value) {
    return d3.utcFormat('%b %Y')(sliderDates[value]);
  }

  function checkResults() {
    //never disable the checkbox while it's ticked, or the user can't untick it
    hasHRP = hrpOnly || $signalsData.some(d => d['hrp_location'] === 'True');
    errorMsg = $signalsData.length > 0 ? '' : 'There are no signals to display, please widen your selection';
  }

  //debounce so a burst of filter changes (e.g. several checkboxes) commits once
  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitFilters, commitDelay);
  }

  function commitFilters() {
    const selectedRegions = Object.keys(regionChecked).filter(k => k !== 'All regions' && regionChecked[k]);
    const selectedIndicators = Object.keys(indicatorChecked).filter(k => k !== 'All datasets' && indicatorChecked[k]);

    if (selectedRegions.length < 1 || selectedIndicators.length < 1) {
      errorMsg = selectedRegions.length < 1 ? 'Please select at least one region' : 'Please select at least one dataset';
      return;
    }

    const newFilters = {
      region: selectedRegions,
      indicator_title: selectedIndicators,
      date: draftDate,
      date_value: draftDateValue,
      hrp_location: hrpOnly ? 'True' : ''
    };
    filters.set(newFilters);
    checkResults();

    //send mixpanel event with filter values
    mpTrack('map view', 'filtered', newFilters);
  }

  function reset() {
    clearTimeout(commitTimer);

    regionChecked = Object.fromEntries(regions.map(r => [r, true]));
    indicatorChecked = Object.fromEntries(indicators.map(i => [i, true]));
    hrpOnly = false;
    sliderDefault = [numMonths-3, numMonths];
    draftDate = [defaultStartDate.getTime(), endDate.getTime()];
    draftDateValue = [defaultStartDate, endDate];

    const newFilters = {
      region: regions.slice(1),
      indicator_title: indicators.slice(1),
      date: draftDate,
      date_value: draftDateValue,
      hrp_location: ''
    };
    filters.set(newFilters);
    checkResults();

    //send mixpanel event with filter values
    mpTrack('map view', 'filtered', newFilters);
  }

  function initTracking() {
    //initialize mixpanel
    var MIXPANEL_TOKEN = window.location.hostname=='data.humdata.org'? '5cbf12bc9984628fb2c55a49daf32e74' : '99035923ee0a67880e6c05ab92b6cbc0';
    mixpanel.init(MIXPANEL_TOKEN);
    mixpanel.track('page view', {
      'page title': document.title,
      'page type': 'datavis'
    });
  }

  function mpTrack(view, content, filters) {
    //mixpanel event
    let eventObject = {
      'page title': document.title,
      'embedded in': window.location.href,
      'action': 'switch viz',
      'viz type': 'signals map',
      'current view': view,
      'content': content,
    }
    if (filters != undefined) {
      eventObject['region filter'] = filters.region;
      eventObject['indicator filter'] = filters.indicator_title;
      eventObject['is hrp filter'] = (filters.hrp_location === 'True') ? true : false;
      eventObject['date filter'] = formatDate(filters.date_value[0]) + ' - ' + formatDate(filters.date_value[1]);
    }
    mixpanel.track('viz interaction', eventObject);
  }

  function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  onMount(() => {
    d3.select('.filter-list').node().style.height = (isMobile()) ? ((window.innerHeight - headerHeight)*0.4) + 'px' : window.innerHeight - (d3.select('header').node().getBoundingClientRect().height) + 'px';

    initTracking();
  });

</script>

<main>
  <header bind:clientHeight={headerHeight}>
    <div class='grid-container'>
      <div class='col-3 logo'><a href='https://data.humdata.org/signals' target='_blank'><img src='HDXSignalsLogo_white.png' alt='HDX Signals' /></a></div>
      <div class='col-7 description'>
        <p><a href='https://data.humdata.org/signals' target='_blank'>HDX Signals</a> monitors key datasets and generates automated emails when significant, negative changes are detected.</p>
        <p>Explore recent and historical signals in the map below, and click on any country bubble to see signals content and links to the original email. Access all Signals data directly on <a href='https://data.humdata.org/dataset/hdx-signals' target='_blank'>HDX</a>.</p>
      </div>
    </div>
  </header>

  <div class='grid-container'>
    <div class='col-3 filter-list'>
      {#if $signalsData.length && !errorMsg}
        <div class='c-kpi-row'>
          <div class='c-kpi-card'>
            <div class='c-kpi-card__header'><span class='c-kpi-card__label'>Signals</span></div>
            <span class='c-kpi-card__value'>{$signalsData.length}</span>
          </div>
          <div class='c-kpi-card'>
            <div class='c-kpi-card__header'><span class='c-kpi-card__label'>Countries</span></div>
            <span class='c-kpi-card__value'>{numCountries}</span>
          </div>
        </div>
      {/if}
      {#if errorMsg}
        <span class='error-msg'>{errorMsg}</span>
      {/if}

      <div class='date-filter'>
        <h5>Date range{periodLabel ? ':' : ''} <span class='date-filter__period'>{periodLabel}</span></h5>
        <div class='slider-container'>
          {#if sliderDates.length>0}
            <RangeSlider
              all='pips'
              id='dateSlider'
              first='label'
              float
              last='label'
              pips
              max={numMonths}
              range
              step={1}
              bind:values={sliderDefault}
              on:change={onDateSelect}
              {formatter}
            />
          {/if}
        </div>
      </div>

      <h5>Filter by:</h5>
      {#if regions.length}
        <ul>
          {#each regions as region, i}
            <li><label><input type='checkbox' id={region} name={i===0 ? 'selectRegion-all' : 'selectRegion'} bind:checked={regionChecked[region]} on:change={() => onRegionCheck(region)}> {region}</label></li>
          {/each}
        </ul>
      {/if}

      <div class='input-wrapper'>
        <label class={hasHRP ? '' : 'is-disabled'}><input type='checkbox' id='onlyHRP' disabled={!hasHRP} bind:checked={hrpOnly} on:change={onHRPCheck}> Only priority humanitarian locations</label>
      </div>

      {#if indicators.length}
        <ul>
          {#each indicators as indicator, i}
            <li><label><input type='checkbox' id={indicator} name={i===0 ? 'selectIndicator-all' : 'selectIndicator'} bind:checked={indicatorChecked[indicator]} on:change={() => onIndicatorCheck(indicator)}> {indicator}</label></li>
          {/each}
        </ul>
      {/if}

      <div class='buttons'>
        <button type="button" class="c-button c-button--tertiary c-button--size-m" on:click={reset}>
          <span class="c-button__label">Reset</span>
        </button>
      </div>

      <div class='logos'>
        <a href='https://www.unocha.org' target='_blank'><img src='logo-ocha-blue.png' alt='OCHA' width='110'></a>
        <a href='https://centre.humdata.org' target='_blank'><img class='centre' src='logo-centre-green.png' width='150' alt='Centre for Humanitarian Data'></a>
      </div>
    </div>

    <div class='col-9 map'>
      <Map headerHeight={headerHeight} mpTrack={mpTrack} />
    </div>
  </div>

</main>

<style lang='scss'>
  main {
    position: relative;
  }
  .logos {
    align-items: center;
    display: flex;
    margin-bottom: 20px;
    margin-top: auto;
    img {
      &.centre {
        margin-left: 25px;
        margin-top: 12px;
      }
    }
  }
</style>
