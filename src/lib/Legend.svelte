<script>
  import * as d3 from 'd3';

  export let maxCount;
  export let maxMarkerSize;
  export let minMarkerSize;

  let height = 175;
  let width = 125;
  let data;

  let cy = 34; // Initial y-coordinate for the first circle
  const cx = 25; // x-coordinate for all circles
  const lineX1 = 31; // Initial x-coordinate for line start
  const lineX2 = 75; // x-coordinate for line end
  const textX = 75; // x-coordinate for text
  const yOffset = 6; // Offset for y-coordinate between elements


  $: if (maxCount==1) {
      data = [1];
    }
    else if (maxCount > 1 && maxCount < 3) {
      data = [1, maxCount];
    }
    else {
      data = [1, round(maxCount/2), round(maxCount)];
    }


  //marker scale
  $: size = d3.scaleSqrt()
    .domain([1, maxCount])
    .range([minMarkerSize, maxMarkerSize]);

  //round to nearest 10
  function round(num) {
    let roundedVal = (num>10) ? Math.round(num/10)*10 : Math.round(num);
    return roundedVal;
  }

  function inc(radius, i) {
    cy = radius + yOffset;
    return cy;
  }
</script>

<div class='legend-container'>
  <h4>Number of Signals</h4>
  <svg {width} {height} transform={`translate(0, -5)`}>
    {#each data as d, i}
      <circle cx={cx} cy={inc(size(d))} r={data.length===1 ? minMarkerSize : size(d)}></circle>
      <line x1={cx + size(d)} x2={lineX2} y1={inc(size(d))+(yOffset*i)} y2={inc(size(d))+(yOffset*i)}></line>
      <text x={textX} y={inc(size(d))+(yOffset*i)}>{d}</text>
    {/each}
  </svg>
</div>


<style lang='scss'>
</style>