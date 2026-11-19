# Planning trips in Waypoint

When the user asks for trip planning, work with the itinerary through the Waypoint MCP tools or `node cli.mjs`. The web app reads the same data. Start the local server with `npm start` if it is down.

1. List trips and read the relevant trip before making edits.
2. Use the latest revision when mutating an existing plan. On a conflict, read the updated trip before retrying. Visit order is the order of the stops within each day.
3. Search for specific places or verify their coordinates before creating map stops. Include the city to resolve ambiguity.
4. Travel mode and travel notes belong to the arriving stop and describe travel from the previous stop. The first stop of a later day can describe an intercity transfer. For transit, ferries, or flights, record verified schedules or useful directions in travel notes if the user needs them.
5. Use the app API or tool operations for writes so the changes are validated and the open app can refresh. Do not edit the stored file while the app is running.

See README.md for the CLI and project setup.
