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

  let labels = [`<strong>${title}</strong>`];

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
  const layer = e.target;
  layer.setStyle({
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
    ${label}: ${props.value || 0}
  `).openPopup();
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
  document.getElementById('date-label').innerText = `Week of ${week}`;

  const dataset = currentDataset === "cases"
    ? timeDataCases
    : timeDataDeaths;

  const formattedDate = new Date(week).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  document.getElementById('map-title').innerText =
    `${currentDataset === "cases" ? "Cases" : "Deaths"} — Week of ${formattedDate}`;

  geojsonLayer.eachLayer(layer => {
    const countyName = layer.feature.properties.NAME;

    const value = dataset[week]?.[countyName] || 0;
    layer.feature.properties.value = value;

    layer.setStyle({
      fillColor: currentDataset === "cases"
        ? getCasesColor(value)
        : getDeathsColor(value),
      fillOpacity: 0.7,
      weight: 1,
      color: 'white'
    });
  });

  const currentWeekData = dataset[week] || {};

  const top = Object.entries(currentWeekData)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

  const label = currentDataset === "cases" ? "Cases" : "Deaths";

  document.getElementById('top-counties').innerHTML =
  `<strong>Top 5 Counties (${label})</strong>` +
  top.map(([county, val]) =>
    `<div>${county}: ${val.toLocaleString()}</div>`
  ).join('');
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

  weeks = Object.keys(timeDataCases).sort((a, b) => new Date(a) - new Date(b));

  geojsonLayer = L.geoJSON(ncFeatures, {
    style: style,
    onEachFeature: onEachFeature
  }).addTo(map);

  map.fitBounds(geojsonLayer.getBounds());

  legend.addTo(map);
  updateLegend();

  document.getElementById('slider').max = weeks.length - 1;

  updateMap(0);
});

// Slider
document.getElementById('slider').addEventListener('input', (e) => {
  updateMap(e.target.value);
});

document.getElementById('dataset-select').addEventListener('change', (e) => {
  currentDataset = e.target.value;

  const sliderValue = document.getElementById('slider').value;
  updateMap(sliderValue);
  updateLegend();
});
