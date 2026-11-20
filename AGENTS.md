# Planning trips in Waypoint

When the user asks for trip planning, work with the itinerary through the Waypoint MCP tools or `node cli.mjs`. The web app reads the same data. Start the local server with `npm start` if it is down.

1. List trips and read the relevant trip before planning or making edits. Use its `restrictions` as trip-wide constraints and its `notes` as planning context. Surface any conflict with the user's request before changing the plan.
2. Use the latest revision for each edit, including successive actions. On a conflict, read the updated trip and check that the plan still fits before retrying.
3. Search for specific places or verify their coordinates before creating map stops. Include the city to resolve ambiguity.
4. Visit order follows the stop order on each day. Travel mode and travel notes belong to the arriving stop and describe travel from the previous stop, including across dates.
5. Use the app API or tool operations for writes so the changes are validated and the open app can refresh. Do not edit the stored file while the app is running.

## Checking travel between stops

For a new itinerary or a route change, work out how the traveler gets between each affected pair of stops, within a city and between cities. Choose a usable mode and estimate door-to-door time. For scheduled transport, check the operator for the travel date and identify the stations or terminals, first and last connections when relevant, and time for access, waits, transfers, or check-in. Check that the traveler can leave the previous stop, make the connection, and arrive before the next commitment. Use local dates and times for overnight or time-zone changes. When a schedule is unpublished or a route is uncertain, mark it provisional and record what to recheck. If a leg is infeasible, look for another route, time, or day.

## Adding a destination

- Start with the user's preferred place and date. Read the surrounding days and identify the stop before and the stop after, including across dates. Check both routes against booked transport, timed entries, and other commitments. If the preferred slot is tight, look for a better time or day, a shorter visit, or a day trip versus an overnight stay.
- Choose a realistic visit window. For a local stop, check opening hours, last entry, reservation needs, and how long the user is likely to spend there. For a city, recommend enough usable time for the things the user wants to do and count nights and transfer time separately.
- When asked to add a destination, save the best workable placement within the user's constraints. If no option fits, explain the constraint and give the closest workable alternative. Ask before changing a fixed commitment or making a material trade-off the user has not delegated.
- Set the stop's local visit start in `time` when appropriate and record its expected duration or window in `notes`. `add_stop` appends, so use `move_stop` to insert it in the intended position. Put the inbound mode and directions in the new stop's `arrivalMode` and `travelNotes`. Update the next stop's incoming leg for the route from the new stop, even if the next stop falls on another day. Re-read the saved trip to confirm the order and both legs, then summarize the placement, visit length, travel on each side, and any schedule checks still needed.

See `README.md` in the Waypoint checkout for CLI commands and setup.
