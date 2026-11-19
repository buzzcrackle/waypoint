import { createServer } from "node:http";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { applyAction, coordinates, PlannerError, roadMode } from "./model.mjs";
import { sample } from "./sample.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const demo = process.argv.includes("--demo");
const database = resolve(process.env.WAYPOINT_DATA_FILE || resolve(root, "data", demo ? "demo-trips.json" : "trips.json"));
const port = Number(process.env.WAYPOINT_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

function save(state) {
  mkdirSync(dirname(database), { recursive: true });
  const temp = `${database}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, database);
}

function load() {
  try {
    return JSON.parse(readFileSync(database, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const state = demo ? structuredClone(sample) : { revision: 0, trips: [] };
    save(state);
    return state;
  }
}

const assets = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/kyoto.jpg": ["public/kyoto.jpg", "image/jpeg"],
  "/leaflet.js": ["node_modules/leaflet/dist/leaflet.js", "text/javascript; charset=utf-8"],
  "/leaflet.css": ["node_modules/leaflet/dist/leaflet.css", "text/css; charset=utf-8"],
  "/images/layers.png": ["node_modules/leaflet/dist/images/layers.png", "image/png"],
  "/images/layers-2x.png": ["node_modules/leaflet/dist/images/layers-2x.png", "image/png"]
};

function json(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    throw new PlannerError("Send an application/json request.", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new PlannerError("Request is too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PlannerError("Invalid JSON.");
  }
}

function externalService() {
  let tail = Promise.resolve();
  let lastRequest = 0;
  const cache = new Map();
  return (url, extract) => {
    const key = url.toString();
    if (cache.has(key)) return cache.get(key);
    const result = tail.then(async () => {
      const delay = lastRequest + 1100 - Date.now();
      if (delay > 0) await new Promise(done => setTimeout(done, delay));
      lastRequest = Date.now();
      const response = await fetch(url, {
        headers: { "User-Agent": "WaypointLocalTripPlanner/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(5500)
      });
      return extract(await response.json(), response.ok);
    });
    tail = result.catch(() => {});
    cache.set(key, result);
    if (cache.size > 150) cache.delete(cache.keys().next().value);
    result.catch(() => cache.delete(key));
    return result;
  };
}

const geocode = externalService();
const route = externalService();
const routeInput = z.object({ from: coordinates, to: coordinates, mode: roadMode });
const mutationInput = z.object({ action: z.string(), values: z.unknown(), revision: z.number().int().optional() });
const profiles = { walking: "foot", cycling: "bike", driving: "car" };

async function searchPlaces(query) {
  const url = new URL("/api/", process.env.WAYPOINT_GEOCODER || "https://photon.komoot.io");
  url.search = new URLSearchParams({ q: query, limit: "6" });
  try {
    return await geocode(url, (data, ok) => {
      if (!ok || !Array.isArray(data.features)) throw new Error("Invalid place results");
      return data.features.flatMap(feature => {
        const [lng, lat] = feature.geometry?.coordinates || [];
        const parsed = coordinates.safeParse({ lat, lng });
        if (!parsed.success) return [];
        const p = feature.properties;
        const street = [p.housenumber, p.street].filter(Boolean).join(" ");
        const name = p.name || street || p.city || p.district || p.state || p.country;
        if (!name) return [];
        const address = [...new Set([street, p.district, p.city, p.state, p.country].filter(part => part && part !== name))].join(", ");
        return [{ name, address, ...parsed.data }];
      });
    });
  } catch {
    throw new PlannerError("Place search is unavailable. You can pin the stop or enter its coordinates.", 502);
  }
}

async function getRoute(body) {
  const parsed = routeInput.safeParse(body);
  if (!parsed.success) throw new PlannerError("Choose a road mode and two valid map points.");
  const { from, to, mode } = parsed.data;
  const points = [from, to].map(point => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
  const url = new URL(`/routed-${profiles[mode]}/route/v1/driving/${points}`,
    process.env.WAYPOINT_ROUTER || "https://routing.openstreetmap.de");
  url.search = new URLSearchParams({ overview: "full", geometries: "geojson" });
  try {
    return await route(url, (data, ok) => {
      if (data.code === "NoRoute" || data.code === "NoSegment") {
        throw new PlannerError("No route was found for this travel mode.", 422);
      }
      const result = data.routes?.[0];
      if (!ok || !result?.geometry?.coordinates?.length) throw new Error("Invalid route");
      return { distance: result.distance, duration: result.duration, coordinates: result.geometry.coordinates };
    });
  } catch (error) {
    if (error instanceof PlannerError) throw error;
    throw new PlannerError("The route service is unavailable. You can still open directions in Google Maps.", 502);
  }
}

createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  try {
    if (!allowedHosts.has(request.headers.host)) throw new PlannerError("Open the app on its local address.", 403);
    if (request.headers.origin && ![origin, `http://localhost:${port}`].includes(request.headers.origin)) {
      throw new PlannerError("Only the local app can access this server.", 403);
    }
    const url = new URL(request.url, origin);
    if (request.method === "GET") {
      if (url.pathname === "/api/trips") return json(response, load());
      if (url.pathname === "/api/places") {
        const query = url.searchParams.get("q")?.trim();
        if (!query || query.length < 2 || query.length > 180) throw new PlannerError("Enter a place or address (2–180 characters).");
        return json(response, await searchPlaces(query));
      }
      if (Object.hasOwn(assets, url.pathname)) {
        const [path, type] = assets[url.pathname];
        response.writeHead(200, { "Content-Type": type });
        return response.end(readFileSync(resolve(root, path)));
      }
    }
    if (request.method === "POST") {
      if (url.pathname === "/api/route") return json(response, await getRoute(await readBody(request)));
      if (url.pathname === "/api/actions") {
        const parsed = mutationInput.safeParse(await readBody(request));
        if (!parsed.success) throw new PlannerError("Invalid itinerary action.");
        const { action, values, revision } = parsed.data;
        const state = load();
        if (revision !== undefined && revision !== state.revision) {
          throw new PlannerError("The itinerary changed. Reload the latest version and try again.", 409);
        }
        const tripId = applyAction(state, action, values);
        state.revision += 1;
        save(state);
        return json(response, { state, tripId });
      }
    }
    throw new PlannerError("Page not found.", 404);
  } catch (error) {
    if (response.headersSent) return response.end();
    if (error instanceof PlannerError) return json(response, { error: error.message }, error.status);
    console.error(error);
    return json(response, { error: "Waypoint could not complete this request." }, 500);
  }
}).listen(port, "127.0.0.1", () => console.log(`Waypoint is ready at ${origin}`));
