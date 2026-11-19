import { readFileSync } from "node:fs";
import { actions } from "./model.mjs";
import { getTrip, request, runAction } from "./local-api.mjs";

const [command, arg, revision] = process.argv.slice(2);
try {
  let result;
  if (command === "list") {
    const { revision, trips } = await request("/api/trips");
    result = { revision, trips: trips.map(({ id, name, destination, days }) => ({ id, name, destination, days: days.length })) };
  } else if (command === "show") {
    result = await getTrip(arg);
  } else if (command === "search") {
    result = await request("/api/places?q=" + encodeURIComponent(arg || ""));
  } else if (command === "act") {
    if (!Object.hasOwn(actions, arg)) throw new Error("Action must be one of: " + Object.keys(actions).join(", "));
    result = await runAction(arg, JSON.parse(readFileSync(0, "utf8")), revision === undefined ? undefined : Number(revision));
  } else {
    console.log("Usage: node cli.mjs list | show TRIP_ID | search QUERY | act ACTION [REVISION]\nSupply action values as JSON on stdin. See model.mjs for fields.");
    process.exit(command ? 1 : 0);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
