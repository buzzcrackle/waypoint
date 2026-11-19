const $ = (selector, element = document) => element.querySelector(selector);
const header = $("#trip-header");
const body = $("#itinerary-body");
const editor = $("#editor");
const syncDialog = $("#sync-dialog");
const syncAlert = $("#sync-alert");
const syncRetry = $("#sync-retry");
const overlay = $("#map-overlay");
const itinerary = $("#itinerary");
const palette = [
  ["#6544cc", "#eee9fc"], ["#21766d", "#e2f3ee"], ["#ac5427", "#fbeee3"],
  ["#285da7", "#e9f0fd"], ["#ac3873", "#fae8f2"], ["#647024", "#ecf1df"]
];
const modes = {
  walking: ["Walk", "walk"], cycling: ["Bike", "bike"], driving: ["Drive", "car"],
  transit: ["Transit", "train"], flight: ["Flight", "plane"], ferry: ["Ferry", "ship"]
};
const categories = { sight: ["Sight", "camera"], food: ["Food", "food"], stay: ["Stay", "bed"], transport: ["Transport", "train"], other: ["Other", "pin"] };
const shapes = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/><circle cx="12" cy="12" r="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 1 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  pencil: '<path d="m14 6 4 4M4 20l4-.8L20 7l-4-4L4.8 15.2 4 20Z"/>',
  camera: '<path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3"/>',
  food: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18m10 0V3c-4 2-5 6-5 10h5"/>',
  bed: '<path d="M3 18V6m18 12v-6a2 2 0 0 0-2-2H9v6m-6 0h18"/><circle cx="6" cy="11.5" r="2"/>',
  train: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M9 18l-2 3m8-3 2 3M9 14h.01m6 0h.01"/>',
  car: '<path d="m4 11 2-5a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l2 5M4 18v2m16-2v2M3 11h18v7H3zm4 3h.01m10 0h.01"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="m8 21 3-6 4 2 1 4m-5-6 1-6m-6 5 3-4 3-1 3 4h4"/>',
  bike: '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17l4-7 4 7H5m14 0-3-10h-3m-6 3h4"/>',
  plane: '<path d="M17 21v-8l-7-4V4a2 2 0 0 1 4 0v5l7 4v3l-7-2v5l3 2M7 21l3-2v-5l-7 2v-3l7-4"/>',
  ship: '<path d="M4 17 2 11l10-4 10 4-2 6M6 9V5h12v4M2 20c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>'
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const dateFormat = (iso, options) => new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...options }).format(new Date(iso + "T12:00:00Z"));
const dayDate = (iso) => dateFormat(iso, { weekday: "long", month: "long", day: "numeric" });
const shortDate = (iso) => dateFormat(iso, { month: "short", day: "numeric" });

document.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = icon(element.dataset.icon); });

let state = { revision: -1, trips: [] };
let tripId = localStorage.getItem("waypoint-trip") || "";
let dayFilter = "";
let view = "itinerary";
let activeStop = "";
let activeLeg = "";
let editing = null;
let picking = false;
let placeResults = [];
let toastTimer;
let pendingMutation = false;
let publishingTrip = "";
let acknowledgedSyncIssues = new Set();
const routeResults = new Map();
const markers = new Map();
const map = L.map("map", { zoomControl: false, maxZoom: 19 }).setView([20, 0], 2);
L.control.zoom({ position: "topright" }).addTo(map);
const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
const routingAttribution = 'Routing: <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>';
const layers = L.layerGroup().addTo(map);
new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($("#map"));

function trip() {
  return state.trips.find(value => value.id === tripId);
}

function tripStops() {
  return trip()?.days.flatMap((day, dayIndex) => day.stops.map((stop, index) => ({
    ...stop, day, dayIndex, index, color: palette[dayIndex % palette.length]
  }))) || [];
}

function tripLegs() {
  const stops = tripStops();
  return stops.slice(1).map((to, index) => {
    const from = stops[index];
    const key = [from.id, to.id, to.arrivalMode, from.lat, from.lng, to.lat, to.lng].join("|");
    return { from, to, key };
  });
}

const inScope = (stop) => !dayFilter || stop.day.id === dayFilter;
const dayStyle = ([color, soft]) => `style="--day-color:${color};--day-soft:${soft}"`;
const dayIndexOf = (id) => trip().days.findIndex(day => day.id === id);
const count = (value, singular, plural = singular + "s") => `${value} ${value === 1 ? singular : plural}`;
const canRoute = (leg) => ["walking", "cycling", "driving"].includes(leg.to.arrivalMode);
const canOpenDirections = (leg) => modes[leg.to.arrivalMode] && leg.to.arrivalMode !== "flight";
const airDistance = (leg) => map.distance([leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]);
const distanceText = (meters) => meters >= 1000 ? `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`;
function durationText(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return [`${Math.floor(minutes / 60)} h`, minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ");
}

async function api(path, payload) {
  const response = await fetch(path, payload === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Waypoint could not finish this request."), { status: response.status });
  return result;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 4200);
}

async function refresh({ fit = false, silent = false } = {}) {
  const before = state;
  try {
    const next = await api("/api/trips");
    if (state === before) receiveState(next, fit);
  } catch {
    if (!silent) {
      if (state.revision < 0) body.innerHTML = '<p class="empty">Waypoint could not load. Check that the local server is running, then reload.</p>';
      else toast("Could not refresh the itinerary.");
    }
  }
}

function receiveState(next, fit = false) {
  if (next.revision !== state.revision) {
    const previousPoints = mapPointsKey();
    state = next;
    syncTripSelection();
    if (!editor.open && !picking) render(fit || mapPointsKey() !== previousPoints);
  }
  showSyncIssues(next.syncIssues || []);
}

function showSyncIssues(issues) {
  syncAlert.hidden = !issues.length;
  const conflicts = issues.filter(issue => issue.type === "conflict" || issue.type === "blocked");
  const keys = conflicts.map(issue => JSON.stringify([issue.repository, issue.type, issue.files]));
  acknowledgedSyncIssues = new Set(keys.filter(key => acknowledgedSyncIssues.has(key)));
  if (!issues.length) {
    if (syncDialog.open) syncDialog.close();
    return;
  }
  $("#sync-title").textContent = conflicts.some(issue => issue.type === "conflict") ? "Trip repository conflict"
    : conflicts.length ? "Trip pull blocked" : "Trip sync issues";
  $("#sync-details").innerHTML = issues.map(issue => `<section class="sync-issue">
    <strong>${escape(issue.repository)}</strong>
    <p>${escape(issue.message)}</p>
    ${issue.files?.length ? `<ul>${issue.files.map(file => `<li><code>${escape(file)}</code></li>`).join("")}</ul>` : ""}
  </section>`).join("");
  if (!syncDialog.open && !editor.open && !picking && keys.some(key => !acknowledgedSyncIssues.has(key))) {
    syncDialog.showModal();
  }
  if (syncDialog.open) acknowledgedSyncIssues = new Set(keys);
}

syncAlert.addEventListener("click", () => syncDialog.showModal());
syncRetry.addEventListener("click", async () => {
  syncRetry.disabled = true;
  syncRetry.textContent = "Pulling…";
  $("#sync-retry-status").textContent = "";
  try {
    const next = await api("/api/sync", {});
    receiveState(next);
    if (!next.syncIssues?.length) toast("Trip repositories are up to date.");
  } catch (error) {
    $("#sync-retry-status").textContent = error.message;
  } finally {
    syncRetry.disabled = false;
    syncRetry.textContent = "Pull again";
  }
});

function syncTripSelection() {
  if (!trip()) {
    tripId = state.trips[0]?.id || "";
    dayFilter = "";
    activeStop = "";
    activeLeg = "";
  }
  if (!trip()?.days.some(day => day.id === dayFilter)) dayFilter = "";
  localStorage.setItem("waypoint-trip", tripId);
}

function renderHeader() {
  const current = trip();
  $("#trip-select").innerHTML = state.trips.length
    ? state.trips.map(value => `<option value="${escape(value.id)}">${escape(value.name)}</option>`).join("")
    : '<option value="">No trips yet</option>';
  $("#trip-select").value = tripId;
  $("#trip-select").disabled = !state.trips.length;
  if (!current) {
    header.innerHTML = '<div class="trip-cover"><div></div><div><h1>Plan a trip</h1><p>Add places and see how they connect.</p></div></div>';
    return;
  }
  const first = current.days[0]?.date;
  const last = current.days.at(-1)?.date;
  const year = first?.slice(0, 4);
  let dates = "Dates to be decided";
  if (first) {
    dates = first === last ? dateFormat(first, { month: "long", day: "numeric", year: "numeric" })
      : `${year === last.slice(0, 4) ? shortDate(first) : dateFormat(first, { month: "short", day: "numeric", year: "numeric" })} – ${dateFormat(last, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  const photo = current.cover === "kyoto";
  header.innerHTML = `<div class="trip-cover ${photo ? "kyoto" : ""}">
    <div class="cover-actions">
      ${current.destination ? `<span class="cover-location">${icon("pin")}${escape(current.destination)}</span>` : "<span></span>"}
      <div class="cover-buttons">
        ${state.repositoryTripIds?.includes(current.id) ? `<button class="button on-cover" data-action="publish-trip" ${publishingTrip ? "disabled" : ""}>
          ${publishingTrip === current.id ? "Saving…" : "Save to GitHub"}
        </button>` : ""}
        <button class="button icon-button on-cover" data-action="edit-trip" title="Edit trip" aria-label="Edit trip">${icon("pencil")}</button>
      </div>
    </div>
    <div><h1>${escape(current.name)}</h1><p>${escape(dates)}${current.days.length ? ` · ${count(current.days.length, "day")}` : ""}</p></div>
    ${photo ? '<a class="photo-credit" href="https://commons.wikimedia.org/wiki/File:Kyoto_(16042885718).jpg" target="_blank" rel="noopener noreferrer" title="Moyan Brenn, CC BY 2.0. Cropped and darkened.">Photo credit</a>' : ""}
  </div>`;
}

async function saveTripToGitHub() {
  const current = trip();
  if (publishingTrip || !current) return;
  publishingTrip = current.id;
  renderHeader();
  try {
    const { pushed } = await api("/api/publish-trip", { tripId: current.id, revision: state.revision });
    toast(pushed ? `${current.name} saved to GitHub.` : `${current.name} is already up to date.`);
  } catch (error) {
    toast(error.message);
  } finally {
    publishingTrip = "";
    await refresh({ silent: true });
    renderHeader();
  }
}

function renderBody() {
  const current = trip();
  if (!current) {
    body.innerHTML = `<div class="empty"><p>Give your trip a name to start building an itinerary.</p>
      <button class="button primary" data-action="new-trip">${icon("plus")}Create trip</button></div>`;
    return;
  }
  const filters = current.days.length > 1 ? `<div class="day-filters" aria-label="Filter by day">
    <button class="chip" data-action="filter" aria-pressed="${!dayFilter}">All days</button>
    ${current.days.map((day, index) => `<button class="chip" data-action="filter" data-day="${escape(day.id)}" aria-pressed="${dayFilter === day.id}">Day ${index + 1}</button>`).join("")}
  </div>` : "";
  const legList = tripLegs();
  const days = current.days.filter(day => !dayFilter || day.id === dayFilter);
  body.innerHTML = `<nav class="view-bar" aria-label="Trip views">
    <button class="tab" data-action="show-itinerary" aria-pressed="${view === "itinerary"}">${icon("calendar")}Itinerary</button>
    <button class="tab" data-action="show-routes" aria-pressed="${view === "routes"}">${icon("route")}Routes</button>
    <button class="button secondary add-day" data-action="new-day">${icon("plus")} Add day</button>
  </nav>${filters}${view === "itinerary"
    ? days.map(day => dayHtml(day, legList)).join("") || '<div class="empty"><h3>Add your first day</h3><p>Pick a date, then add places in the order you want to visit them.</p></div>'
    : legList.filter(leg => inScope(leg.to)).map(routeHtml).join("") || '<div class="empty"><h3>No routes yet</h3><p>Add two or more stops to see how they connect.</p></div>'}`;
}

function dayHtml(day, legList) {
  const index = dayIndexOf(day.id);
  const stops = day.stops.map((stop, stopIndex) => {
    const leg = legList.find(value => value.to.id === stop.id);
    const [category, glyph] = categories[stop.category];
    const summary = stop.notes || stop.address || category;
    return `<li class="stop-row" data-stop-row="${escape(stop.id)}">
      <span class="stop-number" aria-label="Stop ${stopIndex + 1}">${stopIndex + 1}</span>
      <div class="stop-card ${activeStop === stop.id ? "selected" : ""}">
        <button class="stop-main" data-action="focus-stop" data-stop="${escape(stop.id)}">
          <span class="place-icon ${escape(stop.category)}">${icon(glyph)}</span>
          <span><strong>${escape(stop.name)}</strong><small>${escape(summary)}</small></span>
        </button>
        ${stop.time ? `<time class="stop-time">${escape(stop.time)}</time>` : ""}
        <button class="button icon-button" title="Edit stop" aria-label="Edit ${escape(stop.name)}" data-action="edit-stop" data-day="${escape(day.id)}" data-stop="${escape(stop.id)}">${icon("pencil")}</button>
      </div>
      ${leg ? `<button class="leg-inline" data-action="open-leg" data-stop="${escape(stop.id)}">${icon(modes[stop.arrivalMode][1])}
        ${escape(modes[stop.arrivalMode][0])} from ${escape(leg.from.name)}
      </button>` : ""}
    </li>`;
  }).join("");
  const label = day.title || `Day ${index + 1}`;
  const date = dayDate(day.date);
  return `<section class="day-section" ${dayStyle(palette[index % palette.length])}>
    <div class="day-heading">
      <span class="date-square" aria-hidden="true"><small>${escape(dateFormat(day.date, { month: "short" }))}</small>${escape(Number(day.date.slice(-2)))}</span>
      <div><h2>${escape(label)}</h2><p>${escape(date)} · ${count(day.stops.length, "stop")}</p></div>
      <button class="button icon-button" title="Edit day" aria-label="Edit ${escape(label)}" data-action="edit-day" data-day="${escape(day.id)}">${icon("pencil")}</button>
    </div>
    <ol class="stops">${stops}</ol>
    <button class="button subtle place-add" data-action="new-stop" data-day="${escape(day.id)}">${icon("plus")} Add a stop</button>
  </section>`;
}

function googleDirections(leg) {
  const params = new URLSearchParams({
    api: "1", origin: `${leg.from.lat},${leg.from.lng}`, destination: `${leg.to.lat},${leg.to.lng}`,
    travelmode: leg.to.arrivalMode === "ferry" ? "transit" : leg.to.arrivalMode
  });
  return "https://www.google.com/maps/dir/?" + params;
}

function routeHtml(leg) {
  const { from, to, key } = leg;
  const result = routeResults.get(key);
  const [mode, glyph] = modes[to.arrivalMode];
  const metrics = result?.data ? `Estimated ${durationText(result.data.duration)} · ${distanceText(result.data.distance)}`
    : `${distanceText(airDistance(leg))} straight-line`;
  return `<article class="route-card ${activeLeg === to.id ? "selected" : ""}" data-leg-card="${escape(to.id)}">
    <div class="route-card-heading">
      <div><strong><small>From</small> ${escape(from.name)}</strong><strong><small>To</small> ${escape(to.name)}</strong></div>
      <button class="button secondary" data-action="edit-leg" data-stop="${escape(to.id)}" title="Edit travel mode and notes">${icon(glyph)} ${mode} ${icon("pencil")}</button>
    </div>
    <p>${escape(metrics)}${from.day.id !== to.day.id ? ` · Day ${from.dayIndex + 1} to ${to.dayIndex + 1}` : ""}</p>
    ${to.travelNotes ? `<p>${escape(to.travelNotes)}</p>` : ""}
    ${result?.error ? `<p role="status">${escape(result.error)}</p>` : ""}
    <div class="route-actions">
      <button class="button subtle" data-action="focus-leg" data-stop="${escape(to.id)}">${icon("focus")} Show on map</button>
      ${canRoute(leg) && !result?.data ? `<button class="button secondary" data-action="calculate" data-stop="${escape(to.id)}" ${result?.loading ? "disabled" : ""}>${result?.loading ? "Calculating…" : "Calculate route"}</button>` : ""}
      ${canOpenDirections(leg) ? `<a class="button secondary" href="${escape(googleDirections(leg))}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ""}
    </div>
  </article>`;
}

function mapStops() {
  const stops = tripStops();
  const incoming = view === "routes" ? tripLegs().filter(leg => inScope(leg.to)) : [];
  const ids = new Set(incoming.map(leg => leg.from.id));
  return stops.filter(stop => inScope(stop) || ids.has(stop.id));
}

function mapPointsKey() {
  return mapStops().map(({ lat, lng }) => `${lat},${lng}`).sort().join(";");
}

function drawMap() {
  const stops = mapStops();
  const stopsOnMap = new Set(stops.map(stop => stop.id));
  const list = tripLegs().filter(leg => stopsOnMap.has(leg.from.id) && stopsOnMap.has(leg.to.id) &&
    (view === "itinerary" || inScope(leg.to)));
  layers.clearLayers();
  markers.clear();
  map.attributionControl.removeAttribution(routingAttribution);
  if (list.some(leg => routeResults.get(leg.key)?.data)) map.attributionControl.addAttribution(routingAttribution);

  for (const leg of list) {
    const [color] = leg.to.color;
    const selected = leg.to.id === activeLeg;
    const result = routeResults.get(leg.key)?.data;
    const points = result ? result.coordinates.map(([lng, lat]) => [lat, lng])
      : [[leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]];
    const line = L.polyline(points, {
      color, weight: selected ? 5 : 3, opacity: selected ? .96 : .68,
      dashArray: result ? "" : "6 8", bubblingMouseEvents: false
    }).addTo(layers);
    line.on("click", () => {
      if (picking) return;
      showLeg(leg.to.id);
    });
  }

  for (const stop of stops) {
    const marker = L.marker([stop.lat, stop.lng], {
      alt: `${stop.name}, day ${stop.dayIndex + 1}, stop ${stop.index + 1}`,
      title: stop.name,
      icon: L.divIcon({
        className: `map-marker ${activeStop === stop.id ? "selected" : ""}`,
        html: `<span>${stop.index + 1}</span>`, iconSize: [27, 27]
      }),
      zIndexOffset: activeStop === stop.id ? 1000 : 0
    }).addTo(layers);
    marker.getElement().style.setProperty("--day-color", stop.color[0]);
    marker.bindPopup(`<div class="map-popup"><strong>${escape(stop.name)}</strong>
      <p>Day ${stop.dayIndex + 1}${stop.time ? ` · ${escape(stop.time)}` : ""}</p>
      ${stop.address ? `<p>${escape(stop.address)}</p>` : ""}
      <button class="button secondary" data-action="edit-stop" data-day="${escape(stop.day.id)}" data-stop="${escape(stop.id)}">${icon("pencil")} Edit stop</button></div>`, { autoPanPadding: [22, 22] });
    marker.on("click", () => {
      if (picking) {
        marker.closePopup();
        choosePin(marker.getLatLng());
        return;
      }
      activeStop = stop.id;
      activeLeg = "";
      markSelectedStop(stop.id);
    });
    markers.set(stop.id, marker);
  }

  const legend = $("#map-legend");
  const visibleDays = new Set(stops.map(stop => stop.dayIndex));
  legend.innerHTML = [...visibleDays].map(index =>
    `<span class="legend-entry" ${dayStyle(palette[index % palette.length])}><i></i>Day ${index + 1}</span>`).join("");
  legend.hidden = !visibleDays.size;
  $("#map-description").textContent = stops.length ? `${count(stops.length, "stop")} · ${count(visibleDays.size, "day")}`
    : "Add stops to see them on the map.";
  if (!picking) showTileNotice();
}

let tileError = false;
function showTileNotice() {
  overlay.hidden = !tileError;
  if (tileError) overlay.textContent = "Map tiles are unavailable. Your stops and routes are still shown.";
}
tiles.on("tileerror", () => { tileError = true; if (!picking) showTileNotice(); });
tiles.on("tileload", () => { tileError = false; if (!picking) showTileNotice(); });

function fitMap(stops = mapStops()) {
  map.invalidateSize({ pan: false });
  if (!stops.length) map.setView([20, 0], 2);
  else if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 15);
  else map.fitBounds(stops.map(stop => [stop.lat, stop.lng]), { padding: [65, 65], maxZoom: 16 });
}

function render(fit = false) {
  renderHeader();
  renderBody();
  drawMap();
  if (fit) fitMap();
}

function markSelectedStop(id) {
  for (const [key, marker] of markers) {
    marker.getElement().classList.toggle("selected", key === id);
    marker.setZIndexOffset(key === id ? 1000 : 0);
  }
  for (const row of body.querySelectorAll("[data-stop-row]")) {
    $(".stop-card", row).classList.toggle("selected", row.dataset.stopRow === id);
  }
}

function focusStop(id) {
  const marker = markers.get(id);
  if (!marker) return;
  activeStop = id;
  activeLeg = "";
  markSelectedStop(id);
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
  marker.openPopup();
  if (window.matchMedia("(max-width: 680px)").matches) $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
}

function locateLeg(id) {
  return tripLegs().find(leg => leg.to.id === id);
}

function showLeg(id, scroll = true) {
  const leg = locateLeg(id);
  if (!leg) return;
  view = "routes";
  if (!inScope(leg.to)) dayFilter = leg.to.day.id;
  activeLeg = id;
  activeStop = "";
  renderBody();
  drawMap();
  const result = routeResults.get(leg.key)?.data;
  if (result) map.fitBounds(result.coordinates.map(([lng, lat]) => [lat, lng]), { padding: [55, 55], maxZoom: 17 });
  else fitMap([leg.from, leg.to]);
  if (scroll) {
    const card = [...body.querySelectorAll("[data-leg-card]")].find(value => value.dataset.legCard === id);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else if (window.matchMedia("(max-width: 680px)").matches) {
    $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function calculateRoute(id) {
  const leg = locateLeg(id);
  if (!leg || routeResults.get(leg.key)?.loading || !canRoute(leg)) return;
  routeResults.set(leg.key, { loading: true });
  renderBody();
  try {
    const point = ({ lat, lng }) => ({ lat, lng });
    const data = await api("/api/route", { from: point(leg.from), to: point(leg.to), mode: leg.to.arrivalMode });
    routeResults.set(leg.key, { data });
    if (view === "routes" && (!activeLeg || activeLeg === id) && inScope(leg.to) && locateLeg(id)?.key === leg.key) {
      showLeg(id, false);
    } else {
      renderBody();
      drawMap();
    }
  } catch (error) {
    routeResults.set(leg.key, { error: error.message });
    renderBody();
  }
}

const field = (label, name, value = "", options = "") =>
  `<label>${label}<input name="${name}" value="${escape(value)}" ${options}></label>`;
const textarea = (label, name, value = "", limit = 2000) =>
  `<label>${label}<textarea name="${name}" rows="2" maxlength="${limit}">${escape(value)}</textarea></label>`;
const select = (label, name, options, selected) =>
  `<label>${label}<span class="select-wrap"><select name="${name}">${Object.entries(options).map(([key, option]) =>
    `<option value="${escape(key)}" ${key === selected ? "selected" : ""}>${escape(option)}</option>`).join("")}</select></span></label>`;
const modeNames = Object.fromEntries(Object.entries(modes).map(([key, value]) => [key, value[0]]));
const categoryNames = Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value[0]]));

function openEditor(title, fields, action, ids, options = {}) {
  editing = { action, ids, revision: state.revision, remove: options.remove };
  placeResults = [];
  editor.innerHTML = `<div class="dialog-heading"><h2 id="editor-title">${title}</h2>
    <button class="button icon-button" data-action="close-editor" aria-label="Close">${icon("close")}</button></div>
    <form id="edit-form">
      <div class="form-fields">${fields}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions">
        ${options.remove ? '<button type="button" class="button danger" data-action="remove">Delete</button>' : ""}
        ${options.reorder || ""}
        <button type="button" class="button secondary" data-action="close-editor">Cancel</button>
        <button type="submit" class="button primary">${options.submit || "Save"}</button>
      </div>
    </form>`;
  $("#edit-form").addEventListener("submit", submitEditor);
  const query = $("#place-query");
  query?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      findPlace();
    }
  });
  editor.showModal();
}

function editTrip(current) {
  openEditor(current ? "Edit trip" : "New trip",
    field("Trip name", "name", current?.name, 'required maxlength="120" placeholder="e.g. Spring in Japan" autofocus') +
    field("Destination", "destination", current?.destination, 'maxlength="180" placeholder="e.g. Tokyo and Kyoto"'),
    current ? "update_trip" : "create_trip", current ? { tripId } : {},
    current ? { remove: { action: "delete_trip", message: `Delete “${current.name}” and all of its days and stops?` } } : { submit: "Create trip" });
}

function nextDate() {
  const last = trip().days.at(-1)?.date;
  if (last) {
    const date = new Date(last + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function editDay(day) {
  openEditor(day ? "Edit day" : "Add day",
    field("Date", "date", day?.date || nextDate(), 'type="date" required autofocus') +
    field("Day title", "title", day?.title, 'maxlength="120" placeholder="e.g. Old town and the market"'),
    day ? "update_day" : "add_day", { tripId, ...(day ? { dayId: day.id } : {}) },
    day ? { remove: { action: "delete_day", message: `Delete this day and its ${count(day.stops.length, "stop")}?` } } : { submit: "Add day" });
}

function editStop(day, stop) {
  if (!day) return;
  const reorder = stop ? `<button class="button icon-button secondary" type="button" data-action="move-stop" data-offset="-1" aria-label="Move stop earlier" title="Move earlier" ${day.stops[0] === stop ? "disabled" : ""}>${icon("up")}</button>
    <button class="button icon-button secondary" type="button" data-action="move-stop" data-offset="1" aria-label="Move stop later" title="Move later" ${day.stops.at(-1) === stop ? "disabled" : ""}>${icon("down")}</button>` : "";
  const dayOptions = Object.fromEntries(trip().days.map((value, index) => [value.id, `Day ${index + 1} · ${value.title || shortDate(value.date)}`]));
  openEditor(stop ? "Edit stop" : "Add a stop",
    `<div class="search-row"><label>Find a place<input id="place-query" placeholder="Name or address" maxlength="180" ${stop ? "" : "autofocus"}></label>
      <button type="button" class="button secondary" data-action="search-place">Search</button></div>
    <div class="search-results" aria-live="polite"></div>` +
    field("Stop name", "name", stop?.name, `required maxlength="120" ${stop ? "autofocus" : ""}`) +
    field("Address", "address", stop?.address, 'maxlength="250"') +
    `<div class="form-grid">${select("Category", "category", categoryNames, stop?.category || "sight")}${field("Visit time", "time", stop?.time, 'type="time"')}</div>
    <div class="form-grid">${field("Latitude", "lat", stop?.lat, 'type="number" step="any" min="-85" max="85" required')}${field("Longitude", "lng", stop?.lng, 'type="number" step="any" min="-180" max="180" required')}</div>
    <div><button type="button" class="button secondary" data-action="pick-pin">${icon("pin")} Pick on map</button></div>` +
    (stop && trip().days.length > 1 ? select("Day", "targetDayId", dayOptions, day.id) : "") +
    textarea("Stop notes", "notes", stop?.notes) +
    select("Travel from previous stop", "arrivalMode", modeNames, stop?.arrivalMode || "walking") +
    textarea("Travel notes", "travelNotes", stop?.travelNotes, 1200),
    stop ? "update_stop" : "add_stop", { tripId, dayId: day.id, ...(stop ? { stopId: stop.id } : {}) },
    stop ? { remove: { action: "delete_stop", message: `Delete “${stop.name}”?` }, reorder } : { submit: "Add stop" });
}

function editLeg(id) {
  const leg = locateLeg(id);
  if (!leg) return;
  openEditor("Edit travel leg", `<p class="dialog-copy">${escape(leg.from.name)} to ${escape(leg.to.name)}</p>` +
    select("Travel mode", "arrivalMode", modeNames, leg.to.arrivalMode) +
    textarea("Travel notes", "travelNotes", leg.to.travelNotes, 1200),
    "update_leg", { tripId, dayId: leg.to.day.id, stopId: id });
}

function editError(message) {
  const error = $(".form-error", editor);
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

async function findPlace() {
  const query = $("#place-query")?.value.trim();
  const results = $(".search-results", editor);
  if (!query || query.length < 2) {
    results.textContent = "Enter a name or address to search.";
    return;
  }
  const button = $('[data-action="search-place"]', editor);
  if (button.disabled) return;
  button.disabled = true;
  results.textContent = "Searching…";
  try {
    const next = await api("/api/places?q=" + encodeURIComponent(query));
    if (!results.isConnected) return;
    placeResults = next;
    results.innerHTML = next.length ? next.map((place, index) =>
      `<button type="button" data-action="use-place" data-index="${index}">${escape(place.name)}<small>${escape(place.address)}</small></button>`).join("")
      : "No matches. Try adding the city, or pick a point on the map.";
  } catch (error) {
    results.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function choosePlace(index) {
  const place = placeResults[index];
  const { elements } = $("#edit-form");
  for (const key of ["name", "address", "lat", "lng"]) elements[key].value = place[key];
  $(".search-results", editor).textContent = "";
  elements.name.focus();
}

function startPicking() {
  picking = true;
  editor.close();
  map.closePopup();
  $("#map").classList.add("picking");
  overlay.innerHTML = `<span>Click the map to place your stop.</span><button class="button secondary" data-action="cancel-pin">Cancel</button>`;
  overlay.hidden = false;
  $("#map").scrollIntoView({ block: "nearest" });
}

function endPicking() {
  picking = false;
  $("#map").classList.remove("picking");
  showTileNotice();
  editor.showModal();
}

function choosePin({ lat, lng }) {
  const { elements } = $("#edit-form");
  elements.lat.value = Math.max(-85, Math.min(85, lat)).toFixed(6);
  elements.lng.value = L.Util.wrapNum(lng, [-180, 180], true).toFixed(6);
  endPicking();
  elements.name.focus();
}

map.on("click", event => {
  if (picking) choosePin(event.latlng);
});

function showCodex() {
  editing = null;
  const prompt = trip()
    ? `Read my Waypoint trip “${trip().name}”. Review the order of stops and help me work out how to get between them.`
    : "Help me plan a trip in Waypoint. Ask where I want to go and when.";
  editor.innerHTML = `<div class="dialog-heading"><h2 id="editor-title">Plan with Codex</h2>
    <button class="button icon-button" data-action="close-editor" aria-label="Close">${icon("close")}</button></div>
    <div class="dialog-copy">
      <p>Open a new Codex conversation with this Waypoint project folder as its workspace. Give Codex a planning instruction and keep Waypoint open to see its edits.</p>
      <pre id="codex-prompt">${escape(prompt)}</pre>
    </div>
    <div class="dialog-actions"><button class="button primary" data-action="copy-prompt">Copy prompt</button></div>`;
  editor.showModal();
}

async function mutate(action, values, revision = state.revision) {
  if (pendingMutation) return;
  pendingMutation = true;
  const controls = [...editor.querySelectorAll("button:not(:disabled)")];
  controls.forEach(button => { button.disabled = true; });
  try {
    const result = await api("/api/actions", { action, values, revision });
    if (result.state.revision >= state.revision) state = result.state;
    const switching = action === "create_trip" || action === "delete_trip";
    if (action === "create_trip") tripId = result.tripId;
    if (switching) {
      dayFilter = "";
      view = "itinerary";
    }
    if (action === "add_day") {
      const createdDay = trip()?.days.find(day => day.date === values.date);
      if (createdDay) dayFilter = createdDay.id;
      view = "itinerary";
    }
    if (action === "update_stop" && dayFilter && values.targetDayId) dayFilter = values.targetDayId;
    syncTripSelection();
    closeEditor();
    const currentDay = trip()?.days.find(day => day.id === (values.targetDayId || values.dayId));
    if (action === "add_stop") activeStop = currentDay?.stops.at(-1)?.id || "";
    render(switching || ["add_stop", "delete_stop", "delete_day", "update_stop", "add_day"].includes(action));
    toast(action.startsWith("delete") ? "Deleted." : "Trip saved.");
  } catch (error) {
    if (error.status === 409 && error.message.startsWith("The itinerary changed")) {
      await refresh({ silent: true });
      if (editor.open) {
        editError("This trip changed while you were editing. Close and reopen this editor to see the latest version.");
      } else {
        toast(error.message);
      }
    } else if (editor.open) editError(error.message);
    else toast(error.message);
  } finally {
    pendingMutation = false;
    controls.forEach(button => { button.disabled = false; });
  }
}

function submitEditor(event) {
  event.preventDefault();
  if (!editing) return;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  if ("lat" in fields) {
    fields.lat = Number(fields.lat);
    fields.lng = Number(fields.lng);
  }
  mutate(editing.action, { ...fields, ...editing.ids }, editing.revision);
}

function closeEditor() {
  if (editor.open) editor.close();
  editing = null;
  if (!picking) render();
}

editor.addEventListener("cancel", event => {
  event.preventDefault();
  if (!pendingMutation) closeEditor();
});

$("#trip-select").addEventListener("change", event => {
  tripId = event.target.value;
  dayFilter = "";
  activeStop = "";
  activeLeg = "";
  itinerary.scrollTop = 0;
  view = "itinerary";
  syncTripSelection();
  render(true);
});

document.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const { action, day: dayId, stop: stopId, index, offset } = button.dataset;
  const day = trip()?.days.find(value => value.id === dayId);
  if (action === "new-trip") editTrip();
  else if (action === "edit-trip") editTrip(trip());
  else if (action === "publish-trip") saveTripToGitHub();
  else if (action === "new-day") editDay();
  else if (action === "edit-day") editDay(day);
  else if (action === "new-stop") editStop(day);
  else if (action === "edit-stop") editStop(day, day?.stops.find(stop => stop.id === stopId));
  else if (action === "edit-leg") editLeg(stopId);
  else if (action === "show-itinerary" || action === "show-routes") {
    view = action === "show-itinerary" ? "itinerary" : "routes";
    activeLeg = "";
    render(true);
  } else if (action === "filter") {
    dayFilter = dayId || "";
    activeLeg = "";
    activeStop = "";
    render(true);
  } else if (action === "focus-stop") focusStop(stopId);
  else if (action === "open-leg") showLeg(stopId);
  else if (action === "focus-leg") showLeg(stopId, false);
  else if (action === "calculate") calculateRoute(stopId);
  else if (action === "fit") fitMap();
  else if (action === "search-place") findPlace();
  else if (action === "use-place") choosePlace(Number(index));
  else if (action === "pick-pin") startPicking();
  else if (action === "cancel-pin") endPicking();
  else if (action === "close-editor") closeEditor();
  else if (action === "codex") showCodex();
  else if (action === "copy-prompt") {
    try {
      await navigator.clipboard.writeText($("#codex-prompt").textContent);
      button.textContent = "Copied";
    } catch {
      toast("Select and copy the prompt above.");
    }
  } else if (action === "remove" && editing?.remove && window.confirm(editing.remove.message)) {
    mutate(editing.remove.action, editing.ids, editing.revision);
  } else if (action === "move-stop" && editing) {
    const { dayId, stopId } = editing.ids;
    const sourceDay = trip().days.find(value => value.id === dayId);
    const index = sourceDay?.stops.findIndex(stop => stop.id === stopId) ?? -1;
    if (index >= 0) mutate("move_stop", { ...editing.ids, position: index + 1 + Number(offset) }, editing.revision);
  }
});

refresh({ fit: true });
setInterval(() => {
  if (!editor.open && !picking && !pendingMutation && !document.hidden) refresh({ silent: true });
}, 2500);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !editor.open && !picking) refresh({ silent: true });
});
