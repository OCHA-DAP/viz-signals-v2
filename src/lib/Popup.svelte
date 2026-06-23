<script>
  import * as d3 from 'd3';
  import { isValid } from './utils.js';

  export let signals = [];
  export let numAlerts = 0;
  export let open = false;
  export let onClose = () => {};

  let dateFormat = d3.utcFormat('%b %d, %Y');
</script>

<div class='popup' style:display={open ? 'block' : 'none'} style:opacity={open ? 1 : 0}>
  <i class='close-btn humanitarianicons-Exit-Cancel' on:click={onClose} />
  <div class='popup-content'>
    {#if signals.length > 0}
      <h2>{signals[0].location} <span>({numAlerts} {numAlerts > 1 ? 'signals' : 'signal'})</span></h2>
      <div class='signal-container'>
        {#each signals as signal}
          <div class='signal'>
            <h3>{dateFormat(new Date(signal.date))}: {signal.indicator_title}</h3>
            {#if isValid(signal.summary_short)}<p>{signal.summary_short}</p>{/if}
            {#if isValid(signal.plot)}<img class='plot' src={signal.plot} alt='' />{/if}
            {#if isValid(signal.map)}<img class='map' src={signal.map} alt='' />{/if}
            {#if isValid(signal.campaign_url)}<p><a href={signal.campaign_url} target='_blank'>Go to the email</a></p>{/if}
            {#if isValid(signal.further_information)}{@html signal.further_information}{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
