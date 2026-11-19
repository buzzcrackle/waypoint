import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyAction, plannerFile, PlannerError } from "./model.mjs";
import { committedTrips, pullRepository } from "./git-sync.mjs";

function save(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, file);
}

function readLocal(file, initialState) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const state = structuredClone(initialState);
    save(file, state);
    return state;
  }
}

function cacheRepository(repository, text) {
  if (text === repository.text) return;
  const data = JSON.parse(text);
  if (!plannerFile.safeParse(data).success) throw new Error("Invalid planner data");
  repository.data = data;
  repository.text = text;
}

function readRepository(repository) {
  if (repository.syncing || repository.issue?.type === "conflict") return;
  try {
    if (!lstatSync(repository.file).isFile()) throw new Error("Expected a regular file");
    cacheRepository(repository, readFileSync(repository.file, "utf8"));
    repository.fileIssue = null;
  } catch (error) {
    const missing = error.code === "ENOENT";
    if (missing) {
      repository.data = null;
      repository.text = null;
    }
    repository.fileIssue = {
      type: "error",
      message: missing ? "Add a Waypoint trips.json file to the root of this repository."
        : "The repository’s trips.json could not be read as a Waypoint trip file. Check it in the checkout."
    };
  }
}

export function createTripStore({ database, initialState, repositoryDirectory }) {
  const local = { file: database };
  let repositories = new Map();
  let directoryIssue = null;
  let activePull;
  let revision = Date.now();
  let previousTrips;

  function discover() {
    try {
      mkdirSync(repositoryDirectory, { recursive: true });
      const next = new Map();
      const entries = readdirSync(repositoryDirectory, { withFileTypes: true });
      for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
        const directory = join(repositoryDirectory, entry.name);
        if (entry.isDirectory() && existsSync(join(directory, ".git"))) {
          next.set(entry.name, repositories.get(entry.name) || {
            name: entry.name, directory, file: join(directory, "trips.json")
          });
        }
      }
      repositories = next;
      directoryIssue = null;
    } catch {
      directoryIssue = { repository: "Trip repositories folder", type: "error", message: "Waypoint could not read the trip repositories folder." };
    }
  }

  function snapshot() {
    const state = readLocal(database, initialState);
    if (!repositoryDirectory) return { state, owners: new Map() };

    const trips = new Map(state.trips.map(trip => [trip.id, trip]));
    const owners = new Map();
    const issues = directoryIssue ? [directoryIssue] : [];
    for (const repository of repositories.values()) {
      readRepository(repository);
      const issue = repository.issue || repository.fileIssue;
      if (issue) issues.push({ repository: repository.name, ...issue });
      for (const trip of repository.data?.trips || []) {
        if (owners.has(trip.id)) continue;
        trips.set(trip.id, trip);
        owners.set(trip.id, repository);
      }
    }
    const list = [...trips.values()];
    const signature = JSON.stringify([state.revision, list, [...owners].map(([id, repo]) => [id, repo.name])]);
    if (signature !== previousTrips) {
      previousTrips = signature;
      revision = Math.max(revision + 1, Date.now());
    }
    return { state: { revision, trips: list, syncIssues: issues }, owners };
  }

  function change(action, values, expectedRevision) {
    const { state, owners } = snapshot();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new PlannerError("The itinerary changed. Reload the latest version and try again.", 409);
    }
    const source = action === "create_trip" ? local : owners.get(values?.tripId) || local;
    if (source.syncing) throw new PlannerError("Waypoint is pulling updates for this trip. Try again shortly.", 409);
    if (source.issue?.type === "conflict" || source.fileIssue) {
      throw new PlannerError("Resolve this trip repository’s sync issue before editing it.", 409);
    }
    const stored = source === local
      ? (repositoryDirectory ? readLocal(database, initialState) : state)
      : structuredClone(source.data);
    const tripId = applyAction(stored, action, values);
    if (source === local) stored.revision += 1;
    save(source.file, stored);
    return { state: snapshot().state, tripId };
  }

  function sync() {
    if (!repositoryDirectory) return Promise.resolve();
    if (activePull) return activePull;
    discover();
    activePull = Promise.all([...repositories.values()].map(async repository => {
      readRepository(repository);
      repository.syncing = true;
      try {
        repository.issue = await pullRepository(repository.directory);
        if (repository.issue?.type === "conflict" && !repository.data) {
          const text = await committedTrips(repository.directory).catch(() => null);
          if (text) {
            try {
              cacheRepository(repository, text);
            } catch {
              // A repo with no valid committed planner can still report its Git conflict.
            }
          }
        }
      } finally {
        repository.syncing = false;
        readRepository(repository);
      }
    })).finally(() => { activePull = null; });
    return activePull;
  }

  return { read: () => snapshot().state, change, sync };
}
