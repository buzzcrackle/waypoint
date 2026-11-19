import { randomUUID } from "node:crypto";
import { z } from "zod";

const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(120);
const optionalText = (limit) => z.string().trim().max(limit).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine(value => {
    const parsed = new Date(value);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

export const coordinates = z.object({
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180)
});
export const roadMode = z.enum(["walking", "cycling", "driving"]);
const mode = z.enum(["walking", "cycling", "driving", "transit", "flight", "ferry"]);
const tripFields = { name: label, destination: optionalText(180) };
const dayFields = { date, title: optionalText(120) };
const stopFields = {
  ...coordinates.shape,
  name: label,
  address: optionalText(250),
  category: z.enum(["sight", "food", "stay", "transport", "other"]).optional(),
  time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional(),
  notes: optionalText(2000),
  arrivalMode: mode.optional(),
  travelNotes: optionalText(1200)
};

const storedStop = z.object({
  ...stopFields, id, category: stopFields.category.unwrap(), arrivalMode: mode
});
const storedDay = z.object({ ...dayFields, id, stops: z.array(storedStop) });
const storedTrip = z.object({ ...tripFields, id, days: z.array(storedDay) });
export const plannerFile = z.object({ revision: z.number().int().nonnegative(), trips: z.array(storedTrip) });

export const actions = {
  create_trip: z.object(tripFields),
  update_trip: z.object({ tripId: id, ...z.object(tripFields).partial().shape }),
  delete_trip: z.object({ tripId: id }),
  add_day: z.object({ tripId: id, ...dayFields }),
  update_day: z.object({ tripId: id, dayId: id, ...z.object(dayFields).partial().shape }),
  delete_day: z.object({ tripId: id, dayId: id }),
  add_stop: z.object({ tripId: id, dayId: id, ...stopFields }),
  update_stop: z.object({ tripId: id, dayId: id, stopId: id, targetDayId: id.optional(), ...z.object(stopFields).partial().shape }),
  move_stop: z.object({ tripId: id, dayId: id, stopId: id, position: z.number().int().min(1) }),
  delete_stop: z.object({ tripId: id, dayId: id, stopId: id }),
  update_leg: z.object({
    tripId: id, dayId: id, stopId: id, arrivalMode: mode, travelNotes: optionalText(1200)
  })
};

export class PlannerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function lookup(records, key, kind) {
  const value = records.find(record => record.id === key);
  if (!value) throw new PlannerError(`That ${kind} could not be found.`, 404);
  return value;
}

export function applyAction(state, action, values) {
  if (!Object.hasOwn(actions, action)) throw new PlannerError("Unknown itinerary action.");
  const parsed = actions[action].safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PlannerError(`${issue.path.join(".") || "Input"}: ${issue.message}`);
  }
  const { tripId, dayId, stopId, targetDayId, position, ...fields } = parsed.data;

  if (action === "create_trip") {
    const trip = { id: randomUUID(), destination: "", ...fields, days: [] };
    state.trips.push(trip);
    return trip.id;
  }
  const trip = lookup(state.trips, tripId, "trip");
  if (action === "update_trip") Object.assign(trip, fields);
  else if (action === "delete_trip") state.trips.splice(state.trips.indexOf(trip), 1);
  else if (action === "add_day" || action === "update_day") {
    if (trip.days.some(day => day.date === fields.date && day.id !== dayId)) {
      throw new PlannerError("This trip already has a day on that date.", 409);
    }
    if (action === "add_day") trip.days.push({ id: randomUUID(), title: "", ...fields, stops: [] });
    else Object.assign(lookup(trip.days, dayId, "day"), fields);
    trip.days.sort((first, second) => first.date.localeCompare(second.date));
  } else {
    const day = lookup(trip.days, dayId, "day");
    if (action === "delete_day") trip.days.splice(trip.days.indexOf(day), 1);
    else if (action === "add_stop") {
      day.stops.push({
        id: randomUUID(), address: "", category: "sight", time: "", notes: "",
        arrivalMode: "walking", travelNotes: "", ...fields
      });
    }
    else {
      const stop = lookup(day.stops, stopId, "stop");
      const index = day.stops.indexOf(stop);
      if (action === "update_stop" || action === "update_leg") {
        const target = targetDayId ? lookup(trip.days, targetDayId, "day") : day;
        Object.assign(stop, fields);
        if (target !== day) target.stops.push(...day.stops.splice(index, 1));
      } else if (action === "delete_stop") {
        day.stops.splice(index, 1);
      } else if (action === "move_stop") {
        if (position > day.stops.length) throw new PlannerError("Position is outside this day.");
        day.stops.splice(index, 1);
        day.stops.splice(position - 1, 0, stop);
      }
    }
  }
  return trip.id;
}
