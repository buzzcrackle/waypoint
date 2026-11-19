# Waypoint

Waypoint is a local trip planner with an itinerary, interactive map, and route cards.

## Run it

Requires Node.js 20 or newer.

```sh
git clone https://github.com/buzzcrackle/waypoint.git
cd waypoint
npm ci
npm start
```

Open [Waypoint](http://127.0.0.1:4173) and select **New trip**. A fresh clone opens with an empty planner. The server listens on loopback and saves changes immediately to `data/trips.json`. The `data/` directory is ignored by Git. Copy the file to back up your trips.

To try the Kyoto itinerary, stop the server and run `npm run demo`. Demo edits live in `data/demo-trips.json`. Run `npm start` to return to your own trips. To start another blank planner in the same checkout, choose a new file with `WAYPOINT_DATA_FILE`, such as `WAYPOINT_DATA_FILE=data/new-planner.json npm start` on macOS or Linux.

Add a day and search for a place, pick it on the map, or enter coordinates. Use a stop’s edit dialog to move it to another day or move it earlier or later. Select a day to filter the itinerary and map.

The **Routes** view includes consecutive stops and transfers across days. Each leg has a travel mode and optional notes. Calculate walking, cycling, and driving estimates and display the route on the map. For transit and ferries, open Google Maps to look for directions. Use travel notes for reservations and schedule details. Flight legs support notes and straight-line visualization. Calculated paths are kept for the open browser tab.

## Plan with Codex

Install Codex and register Waypoint's local MCP server. On macOS or Linux, run this command from the cloned folder.

```sh
codex mcp add waypoint -- "$(command -v node)" "$PWD/mcp.mjs"
```

In Windows PowerShell, run this command from the cloned folder.

```powershell
$nodePath = (Get-Command node).Source
$serverPath = Join-Path $PWD 'mcp.mjs'
codex mcp add waypoint -- $nodePath $serverPath
```

Start Waypoint, then open a new Codex conversation with the clone as your workspace. For example, “Create a trip called Lisbon Weekend and help me plan how to get between stops.” If you move the clone or change your Node.js installation, rerun the registration command from the new location.

Codex can also use the workspace CLI.

```sh
node cli.mjs list
node cli.mjs show TRIP_ID
node cli.mjs search "Rossio Station, Lisbon"
```

For writes, run `node cli.mjs act ACTION REVISION` and supply the action fields as JSON on stdin. Read the current revision before writing. The available actions and fields are in `model.mjs`. Codex and the browser make writes through the same local API. The browser checks for changes while the app is open.

## Internet services

Map tiles come from [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Place search sends submitted queries to the [Photon demo service](https://github.com/komoot/photon#demo-server). Route calculations send the two coordinates to [FOSSGIS](https://routing.openstreetmap.de/about.html) when requested. Google Maps receives coordinates when you open a directions link. The app can still edit trips, show map pins, and accept coordinates if those services are unavailable.

The Kyoto cover is [Kyoto by Moyan Brenn](https://commons.wikimedia.org/wiki/File:Kyoto_(16042885718).jpg), licensed [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), resized, cropped, and darkened.
