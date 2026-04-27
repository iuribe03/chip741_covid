console.log('JS File Loaded');

const map = L.map('map').setView([35.5, -79], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
}).addTo(map);

let geojsonLayer;
let currentDataset = "cases";
let timeDataCases = {};
let timeDataDeaths = {};
let weeks = [];

let trendChart;
let countyNames = [];

function getCasesColor(d) {
  return d > 100000 ? '#800026' :
         d > 50000  ? '#BD0026' :
         d > 20000  ? '#E31A1C' :
         d > 10000  ? '#FC4E2A' :
         d > 5000   ? '#FD8D3C' :
         d > 1000   ? '#FEB24C' :
         d > 0      ? '#FED976' :
                      '#FFEDA0';
}

function getDeathsColor(d) {
  return d > 2000 ? '#4a1486' :
         d > 1000 ? '#6a51a3' :
         d > 500  ? '#807dba' :
         d > 200  ? '#9e9ac8' :
         d > 100  ? '#bcbddc' :
         d > 50   ? '#dadaeb' :
         d > 0    ? '#efedf5' :
                    '#f7f4f9';
}

const caseGrades = [0, 1000, 5000, 10000, 20000, 50000, 100000];
const deathGrades = [0, 50, 100, 200, 500, 1000, 2000];

// Legend
const legend = L.control({ position: 'bottomright' });

legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'info legend');
  div.id = 'map-legend';
  return div;
};

function updateLegend() {
  const legendDiv = document.getElementById('map-legend');
  if (!legendDiv) return;

  const isCases = currentDataset === 'cases';
  const grades = isCases ? caseGrades : deathGrades;
  const colorFunction = isCases ? getCasesColor : getDeathsColor;
  const title = isCases ? 'Weekly Cases' : 'Weekly Deaths';

  const labels = [`<strong>${title}</strong>`];

  for (let i = 0; i < grades.length; i++) {
    const from = grades[i];
    const to = grades[i + 1];

    labels.push(`
      <div class="legend-item">
        <span style="background:${colorFunction(from + 1)}"></span>
        ${from.toLocaleString()}${to ? `–${to.toLocaleString()}` : '+'}
      </div>
    `);
  }

  legendDiv.innerHTML = labels.join('');
}

function style(feature) {
  const value = feature.properties.value || 0;

  return {
    fillColor: currentDataset === "cases"
      ? getCasesColor(value)
      : getDeathsColor(value),
    weight: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}

function onEachFeature(feature, layer) {
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: showInfo
  });
}

function highlightFeature(e) {
  e.target.setStyle({
    weight: 2,
    color: '#666',
    fillOpacity: 0.9
  });
}

function resetHighlight(e) {
  geojsonLayer.resetStyle(e.target);
}

function showInfo(e) {
  const props = e.target.feature.properties;
  const label = currentDataset === "cases" ? "Cases" : "Deaths";

  e.target.bindPopup(`
    <strong>${props.NAME} County</strong><br>
    ${label}: ${(props.value || 0).toLocaleString()}
  `).openPopup();

  const countySelect = document.getElementById('county-select');
  if (countySelect) {
    countySelect.value = props.NAME;
    updateTrendChart(props.NAME);
  }
}

function reshapeData(data) {
  const result = {};

  data.forEach(row => {
    const week = row.week;
    const county = row.county.replace(" County", "");
    const value = +(row.cases ?? row.deaths);

    if (!result[week]) {
      result[week] = {};
    }

    result[week][county] = value;
  });

  return result;
}

function updateMap(index) {
  const week = weeks[index];

  const dataset = currentDataset === "cases"
    ? timeDataCases
    : timeDataDeaths;

  const colorFunction = currentDataset === "cases"
    ? getCasesColor
    : getDeathsColor;

  const label = currentDataset === "cases" ? "Cases" : "Deaths";

  const formattedDate = new Date(week + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  document.getElementById('date-label').innerText = `Week of ${week}`;

  document.getElementById('map-title').innerText =
    `${label} — Week of ${formattedDate}`;

  geojsonLayer.eachLayer(layer => {
    const countyName = layer.feature.properties.NAME;
    const value = dataset[week]?.[countyName] || 0;

    layer.feature.properties.value = value;

    layer.setStyle({
      fillColor: colorFunction(value),
      fillOpacity: 0.7,
      weight: 1,
      color: 'white'
    });
  });

  updateTopCounties(dataset, label, week);
}

function updateTopCounties(dataset, label, week) {
  const currentWeekData = dataset[week] || {};

  const top = Object.entries(currentWeekData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  document.getElementById('top-counties').innerHTML =
    `<strong>Top 5 Counties (${label})</strong>` +
    top.map(([county, val]) =>
      `<div>${county}: ${val.toLocaleString()}</div>`
    ).join('');
}

// HighCharts functions
function buildCountyList() {
  const countySet = new Set();

  Object.values(timeDataCases).forEach(weekData => {
    Object.keys(weekData).forEach(county => countySet.add(county));
  });

  Object.values(timeDataDeaths).forEach(weekData => {
    Object.keys(weekData).forEach(county => countySet.add(county));
  });

  countyNames = Array.from(countySet).sort();

  const countySelect = document.getElementById('county-select');
  if (!countySelect) return;

  countySelect.innerHTML = '';

  countyNames.forEach(county => {
    const option = document.createElement('option');
    option.value = county;
    option.textContent = county;
    countySelect.appendChild(option);
  });
}

function getCountySeries(county, dataset) {
  return weeks.map(week => {
    const value = dataset[week]?.[county] || 0;

    return [
      new Date(week + 'T00:00:00').getTime(),
      value
    ];
  });
}

function createTrendChart(county) {
  trendChart = Highcharts.chart('trend-chart', {
    chart: {
      type: 'line'
    },

    title: {
      text: `${county} County COVID-19 Trends`
    },

    xAxis: {
      type: 'datetime',
      title: {
        text: 'Week'
      }
    },

    yAxis: [
      {
        title: {
          text: 'Cases'
        }
      },
      {
        title: {
          text: 'Deaths'
        },
        opposite: true
      }
    ],

    tooltip: {
      shared: true,
      xDateFormat: '%B %e, %Y'
    },

    series: [
      {
        name: 'Cases',
        data: getCountySeries(county, timeDataCases),
        yAxis: 0,
        color: '#E31A1C'
      },
      {
        name: 'Deaths',
        data: getCountySeries(county, timeDataDeaths),
        yAxis: 1,
        color: '#6a51a3'
      }
    ],

    credits: {
      enabled: false
    }
  });
}

function updateTrendChart(county) {
  if (!county) return;

  if (!trendChart) {
    createTrendChart(county);
    return;
  }

  trendChart.setTitle({
    text: `${county} County COVID-19 Trends`
  });

  trendChart.series[0].setData(getCountySeries(county, timeDataCases), false);
  trendChart.series[1].setData(getCountySeries(county, timeDataDeaths), false);
  trendChart.redraw();
}

Promise.all([
  fetch('data/geojson-counties-fips.json').then(res => res.json()),
  fetch('data/nc-cases.json').then(res => res.json()),
  fetch('data/nc-deaths.json').then(res => res.json())
])
.then(([geoData, casesData, deathsData]) => {
  const ncFeatures = geoData.features.filter(f =>
    f.id.startsWith("37")
  );

  timeDataCases = reshapeData(casesData);
  timeDataDeaths = reshapeData(deathsData);

  weeks = Object.keys(timeDataCases).sort((a, b) =>
    new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')
  );

  geojsonLayer = L.geoJSON(ncFeatures, {
    style: style,
    onEachFeature: onEachFeature
  }).addTo(map);

  map.fitBounds(geojsonLayer.getBounds());

  legend.addTo(map);
  updateLegend();

  document.getElementById('slider').max = weeks.length - 1;

  updateMap(0);

  buildCountyList();

  const defaultCounty = countyNames.includes('Wake')
    ? 'Wake'
    : countyNames[0];

  const countySelect = document.getElementById('county-select');

  if (countySelect && defaultCounty) {
    countySelect.value = defaultCounty;
    createTrendChart(defaultCounty);
  }
})
.catch(error => {
  console.error('Error loading data:', error);
});

// Slider
document.getElementById('slider').addEventListener('input', (e) => {
  updateMap(e.target.value);
});

// Dataset toggle
document.getElementById('dataset-select').addEventListener('change', (e) => {
  currentDataset = e.target.value;

  const sliderValue = document.getElementById('slider').value;
  updateMap(sliderValue);
  updateLegend();
});

// County chart toggle
document.getElementById('county-select').addEventListener('change', (e) => {
  updateTrendChart(e.target.value);
});
