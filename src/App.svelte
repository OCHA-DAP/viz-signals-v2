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

  loadAllSignals()
    .then(({ signals, namesData }) => dataLoaded(signals, namesData))
    .catch(error => {
      console.error('Error loading files:', error);
      errorMsg = 'Unable to load signals data. Please try again later.';
    });

  function dataLoaded(signals, namesData) {
    //set available date range
    endDate = new Date();
    startDate = new Date(endDate);
    startDate.setMonth(endDate.getMonth() - numMonths);

    //set starting date range - 3 months prior to latest date by default
    defaultStartDate = new Date(endDate);
    defaultStartDate.setMonth(endDate.getMonth() - 3);

    //filter full data within available date range
    const data = signals.filter(d => new Date(d.date).getTime() >= startDate.getTime());
    rawData.set(data);

    //filter set of data within starting date range, for building the regions list
    const initialSignalsData = signals.filter(d => new Date(d.date).getTime() >= defaultStartDate.getTime());

    createFilters(initialSignalsData, namesData);
    createDateSlider();

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

  function createFilters(initialSignalsData, namesData) {
    //get list of regions
    let regionArray = initialSignalsData.map(d => d.region);
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

  function createDateSlider() {
    const listLength = numMonths + 1; // months
    const dates = [];
    for(let i = 0; i < listLength; i++) {
      const itemDate = new Date(startDate);
      itemDate.setMonth(itemDate.getMonth() + i);
      dates.push(itemDate);
    }
    sliderDates = dates;
  }

  function onDateSelect(e) {
    const selected = e.detail.values;
    draftDate = [new Date(sliderDates[selected[0]]).getTime(), new Date(sliderDates[selected[1]]).getTime()];
    draftDateValue = [sliderDates[selected[0]], sliderDates[selected[1]]];
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
    hasHRP = $signalsData.some(d => d['hrp_location'] === 'True');
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
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

      <span class='error-msg'>{errorMsg}</span>

      <div class='buttons'>
        <button class='btn-reset' on:click={reset}>Reset</button>
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
