const origin = `http://127.0.0.1:${Number(process.env.WAYPOINT_PORT || 4173)}`;

export async function request(path, input) {
  let response;
  try {
    response = await fetch(origin + path, input === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch {
    throw new Error(`Waypoint is not reachable at ${origin}. Start it with npm start in the trip-planner folder.`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Waypoint returned HTTP ${response.status}.`);
  return result;
}

export async function getTrip(tripId) {
  const { trips, revision } = await request("/api/trips");
  const trip = trips.find(value => value.id === tripId);
  if (!trip) throw new Error("Trip not found. List trips to get its ID.");
  return { trip, revision };
}

export async function runAction(action, values, revision) {
  const result = await request("/api/actions", { action, values, revision });
  return { revision: result.state.revision, tripId: result.tripId, trip: result.state.trips.find(trip => trip.id === result.tripId) };
}
