import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { actions, roadMode } from "./model.mjs";
import { getTrip, request, runAction } from "./local-api.mjs";

const server = new McpServer({ name: "waypoint", version: "1.0.0" }, {
  instructions: await readFile(new URL("./AGENTS.md", import.meta.url), "utf8")
});

function register(name, description, inputSchema, handler, annotations = {}) {
  server.registerTool(name, { description, inputSchema, annotations }, async (input) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(await handler(input), null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  });
}

const readOnly = { readOnlyHint: true };
register("list_trips", "List trips with IDs, destinations, day counts, and the current revision.", {}, async () => {
  const { revision, trips } = await request("/api/trips");
  return { revision, trips: trips.map(({ id, name, destination, days }) => ({ id, name, destination, days: days.length })) };
}, readOnly);

register("get_trip", "Read a trip's restrictions, notes, ordered days and stops, and the current revision.", { tripId: z.string() },
  ({ tripId }) => getTrip(tripId), readOnly);

register("search_places", "Look up a specific place or address and return names and coordinates. Include the city to disambiguate.", {
  query: z.string().min(2).max(180)
}, ({ query }) => request("/api/places?q=" + encodeURIComponent(query)), { ...readOnly, openWorldHint: true });

register("estimate_leg", "Get a walking, cycling, or driving distance and duration in meters and seconds for two stops in a trip.", {
  tripId: z.string(), fromStopId: z.string(), toStopId: z.string(), mode: roadMode
}, async ({ tripId, fromStopId, toStopId, mode }) => {
  const { trip } = await getTrip(tripId);
  const stops = trip.days.flatMap(day => day.stops);
  const from = stops.find(stop => stop.id === fromStopId);
  const to = stops.find(stop => stop.id === toStopId);
  if (!from || !to) throw new Error("Both stops must be in the trip.");
  const point = ({ lat, lng }) => ({ lat, lng });
  const { duration, distance } = await request("/api/route", { from: point(from), to: point(to), mode });
  return { durationSeconds: duration, distanceMeters: distance, mode, provider: "FOSSGIS OSRM" };
}, { ...readOnly, openWorldHint: true });

const descriptions = {
  create_trip: "Create a trip with a name and optional destination, restrictions, and notes.",
  update_trip: "Edit the trip name, destination, restrictions, or notes.",
  delete_trip: "Delete the trip and all of its days and stops.",
  add_day: "Add a date and optional title. Days are kept in calendar order.",
  update_day: "Set the day date and title.",
  delete_day: "Delete a day and all of its stops.",
  add_stop: "Append a stop to a day with coordinates and optional visit and travel details.",
  update_stop: "Edit selected fields of a stop or move it to another day with targetDayId.",
  move_stop: "Move a stop to a one-based position in its current day.",
  delete_stop: "Delete a stop from a day.",
  update_leg: "Set the mode and travel notes for the leg arriving at the identified stop."
};
for (const [action, schema] of Object.entries(actions)) {
  register(action, descriptions[action], { ...schema.shape, revision: z.number().int().optional().describe("Use the latest revision from a read or edit to guard against concurrent changes.") },
    ({ revision, ...values }) => runAction(action, values, revision),
    { readOnlyHint: false, destructiveHint: !action.startsWith("add_") && action !== "create_trip", openWorldHint: false });
}

await server.connect(new StdioServerTransport());
