let time = [], lat = [], lon = [], altitude = [], voltage = [], speed = [], events = [];
let map, marker, polyline, viewer, cesiumPoints = [];

document.getElementById("logFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function () {
    const lines = reader.result.trim().split("\n").slice(1); // skip header
    time = [], lat = [], lon = [], altitude = [], voltage = [], speed = [];

    lines.forEach(line => {
      const [t, la, lo, alt, volt] = line.split(",").map(parseFloat);
      time.push(t);
      lat.push(la);
      lon.push(lo);
      altitude.push(alt);
      voltage.push(volt);
    });

    // Show interface
    document.getElementById("viewerContent").style.display = "block";

    // Speed Calculation
    speed.push(0);
    for (let i = 1; i < lat.length; i++) {
      const dist = haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
      const dt = time[i] - time[i - 1];
      speed.push(dt > 0 ? dist / dt : 0);
    }

    // Custom Events or Auto Events
    events = [];

    if (!window.customEventData) {
      for (let i = 1; i < time.length; i++) {
        if (altitude[i - 1] < 1 && altitude[i] >= 1) {
          events.push({ type: "Takeoff", index: i });
        }
        if (voltage[i] < 10.5 && !events.find(e => e.type === "Battery Low")) {
          events.push({ type: "Battery Low", index: i });
        }
      }
      events.push({ type: "Landing", index: time.length - 1 });
    } else {
      window.customEventData.forEach(ev => {
        const idx = time.findIndex(t => t >= ev.time);
        if (idx !== -1) events.push({ type: ev.type, index: idx });
      });
    }

    // Plots
    drawGraphs();
    updateSlider();
    updateSummary();
    setupMap();
    setupCesium();
  };

  reader.readAsText(file);
});

// Event CSV
document.getElementById("eventFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function () {
    const lines = reader.result.trim().split("\n").slice(1);
    window.customEventData = [];

    lines.forEach(line => {
      const [type, t] = line.split(",");
      window.customEventData.push({ type: type.trim(), time: parseFloat(t) });
    });

    alert("📌 Custom events loaded! Now upload the main log file.");
  };

  reader.readAsText(file);
});

function drawGraphs() {
  const shapes = events.map(e => ({
    type: 'line',
    x0: time[e.index],
    x1: time[e.index],
    y0: 0,
    y1: 1,
    yref: 'paper',
    line: { color: 'red', dash: 'dot', width: 1 }
  }));

  Plotly.newPlot("altitudePlot", [{
    x: time, y: altitude, type: 'scatter', name: 'Altitude'
  }], {
    title: 'Altitude vs Time', xaxis: { title: 'Time (s)' }, yaxis: { title: 'Altitude (m)' },
    shapes: shapes
  });

  Plotly.newPlot("batteryPlot", [{
    x: time, y: voltage, type: 'scatter', name: 'Voltage'
  }], {
    title: 'Battery Voltage vs Time', xaxis: { title: 'Time (s)' }, yaxis: { title: 'Voltage (V)' },
    shapes: shapes
  });

  // Speed plot (create if not exists)
  let speedDiv = document.getElementById("speedPlot");
  if (!speedDiv) {
    speedDiv = document.createElement("div");
    speedDiv.id = "speedPlot";
    speedDiv.style.width = "48%";
    speedDiv.style.height = "300px";
    document.getElementById("charts").appendChild(speedDiv);
  }

  Plotly.newPlot("speedPlot", [{
    x: time, y: speed, type: 'scatter', name: 'Speed'
  }], {
    title: 'Speed vs Time', xaxis: { title: 'Time (s)' }, yaxis: { title: 'Speed (m/s)' },
    shapes: shapes
  });
}

function setupMap() {
  if (map) map.remove(); // reset if already exists
  map = L.map('map').setView([lat[0], lon[0]], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  polyline = L.polyline(lat.map((v, i) => [v, lon[i]]), { color: 'blue' }).addTo(map);
  marker = L.circleMarker([lat[0], lon[0]], { radius: 6, color: 'red' }).addTo(map);

  // Start/End markers
  L.marker([lat[0], lon[0]]).addTo(map).bindPopup("Start");
  L.marker([lat[lat.length - 1], lon[lon.length - 1]]).addTo(map).bindPopup("End");

  // Event markers
  events.forEach(ev => {
    const m = L.marker([lat[ev.index], lon[ev.index]], { title: ev.type }).addTo(map);
    m.bindPopup(`📌 ${ev.type} @ ${time[ev.index]}s`);
  });
}

function setupCesium() {
  Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmNDljNjQ5NC00OTEyLTRiOWMtYjg2Mi01MDRiYzAzODhmYzIiLCJpZCI6MzE3ODMwLCJpYXQiOjE3NTE0NjE3NzF9.UzdFpgUGaKdnrVdwaZU30XDW5yng_AqF-tTTX_UCdQs"; 

  if (viewer) viewer.destroy();

  viewer = new Cesium.Viewer('cesiumContainer', {
    timeline: false,
    animation: false,
    baseLayerPicker: false
  });

  cesiumPoints = lat.map((v, i) =>
    Cesium.Cartesian3.fromDegrees(lon[i], lat[i], altitude[i])
  );

  const entity = viewer.entities.add({
    name: "Flight Path",
    polyline: {
      positions: cesiumPoints,
      width: 3,
      material: Cesium.Color.YELLOW
    }
  });

  viewer.zoomTo(entity);
}

function updateSlider() {
  const slider = document.getElementById("timeSlider");
  slider.max = time.length - 1;
  slider.oninput = function () {
    const i = parseInt(slider.value);
    document.getElementById("timeDisplay").innerText = time[i];
    marker.setLatLng([lat[i], lon[i]]);
  };
}

function updateSummary() {
  const maxAlt = Math.max(...altitude);
  const minVolt = Math.min(...voltage);
  const flightTime = time[time.length - 1] - time[0];
  let totalDist = 0;

  for (let i = 1; i < lat.length; i++) {
    totalDist += haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
  }

  document.getElementById("maxAlt").innerText = maxAlt.toFixed(2);
  document.getElementById("minVolt").innerText = minVolt.toFixed(2);
  document.getElementById("flightTime").innerText = flightTime.toFixed(1);
  document.getElementById("distance").innerText = totalDist.toFixed(1);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radius of Earth in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

// CSV Export
document.getElementById("downloadBtn").addEventListener("click", () => {
  let csv = "time,lat,lon,altitude,voltage,speed\n";
  for (let i = 0; i < time.length; i++) {
    csv += `${time[i]},${lat[i]},${lon[i]},${altitude[i]},${voltage[i]},${speed[i].toFixed(2)}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "processed_uav_log.csv";
  a.click();
});


// Show sidebar and toggle after upload
function showUIAfterUpload() {
  document.getElementById("viewerContent").style.display = "block";
  document.getElementById("sidebarToggle").style.display = "block";
}

// Call this at end of file load
document.getElementById("logFile").addEventListener("change", function () {
  // Inside your reader.onload in script.js, call this:
  setTimeout(showUIAfterUpload, 300);
});

// Sidebar toggle
document.getElementById("sidebarToggle").addEventListener("click", function () {
  const sidebar = document.getElementById("sidebar");
  const main = document.getElementById("mainContent");
  sidebar.classList.toggle("show");
  main.classList.toggle("shift");
});

// PX4-style drag-and-drop logic
const uploadScreen = document.getElementById("uploadScreen");
const dropZone = document.getElementById("dropZone");
const logInput = document.getElementById("logFile");
const browseBtn = document.getElementById("browseBtn");

browseBtn.addEventListener("click", () => logInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.style.borderColor = "#3b82f6";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "#ccc";
});

dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.style.borderColor = "#ccc";
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".csv")) {
    logInput.files = e.dataTransfer.files;
    handleLogFile(file);  // manually trigger file load
  }
});

logInput.addEventListener("change", e => {
  const file = e.target.files[0];
  handleLogFile(file);
});

function handleLogFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    const lines = reader.result.trim().split("\n").slice(1);
    time = [], lat = [], lon = [], altitude = [], voltage = [], speed = [];

    lines.forEach(line => {
      const [t, la, lo, alt, volt] = line.split(",").map(parseFloat);
      time.push(t); lat.push(la); lon.push(lo);
      altitude.push(alt); voltage.push(volt);
    });

    speed.push(0);
    for (let i = 1; i < lat.length; i++) {
      const dist = haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
      const dt = time[i] - time[i - 1];
      speed.push(dt > 0 ? dist / dt : 0);
    }

    // Custom events if loaded
    events = [];
    if (!window.customEventData) {
      for (let i = 1; i < time.length; i++) {
        if (altitude[i - 1] < 1 && altitude[i] >= 1)
          events.push({ type: "Takeoff", index: i });
        if (voltage[i] < 10.5 && !events.find(e => e.type === "Battery Low"))
          events.push({ type: "Battery Low", index: i });
      }
      events.push({ type: "Landing", index: time.length - 1 });
    } else {
      window.customEventData.forEach(ev => {
        const idx = time.findIndex(t => t >= ev.time);
        if (idx !== -1) events.push({ type: ev.type, index: idx });
      });
    }

    drawGraphs();
    updateSlider();
    updateSummary();
    setupMap();
    setupCesium();

    document.getElementById("viewerContent").style.display = "block";
    document.getElementById("sidebarToggle").style.display = "block";
    uploadScreen.style.display = "none";
  };
  reader.readAsText(file);
}

// Optional event file handler remains same
document.getElementById("eventFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function () {
    const lines = reader.result.trim().split("\n").slice(1);
    window.customEventData = [];
    lines.forEach(line => {
      const [type, t] = line.split(",");
      window.customEventData.push({ type: type.trim(), time: parseFloat(t) });
    });
    alert("📌 Events loaded! Now upload log file.");
  };
  reader.readAsText(file);
});



