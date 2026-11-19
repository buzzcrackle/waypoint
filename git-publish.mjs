import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { runGit } from "./git-sync.mjs";
import { plannerFile, PlannerError } from "./model.mjs";

const file = "trips.json";
const unrelatedCommits = "This branch has unpublished changes outside the selected trip. Review them in Git before saving to GitHub.";

function replaceTrip(state, trip) {
  const trips = [...state.trips];
  const index = trips.findIndex(item => item.id === trip.id);
  if (index < 0) trips.push(trip);
  else trips[index] = trip;
  return { ...state, trips };
}

async function readCommit(git, commit) {
  const entry = await git("ls-tree", commit, "--", file);
  if (!entry) return { mode: null, state: { revision: 0, trips: [] } };
  const mode = /^(100644|100755) blob /.exec(entry)?.[1];
  try {
    const state = JSON.parse(await git("show", `${commit}:${file}`));
    if (mode && plannerFile.safeParse(state).success && new Set(state.trips.map(trip => trip.id)).size === state.trips.length) {
      return { mode, state };
    }
  } catch {
    // Report a usable error without exposing Git's output or itinerary contents.
  }
  throw new PlannerError("The committed trips.json is invalid. Check this checkout in Git.", 409);
}

async function selectedTripHistory(git, upstream, head, tripId) {
  let previous = upstream;
  let committed = await readCommit(git, upstream);
  const commits = await git("rev-list", "--reverse", "--parents", `${upstream}..${head}`);
  for (const line of commits.split("\n").filter(Boolean)) {
    const [commit, parent, ...otherParents] = line.split(" ");
    if (parent !== previous || otherParents.length) throw new PlannerError(unrelatedCommits, 409);
    const paths = await git("diff-tree", "--no-commit-id", "--name-only", "-r", "-z", parent, commit);
    const next = await readCommit(git, commit);
    const trip = next.state.trips.find(item => item.id === tripId);
    if (paths !== `${file}\0` || (committed.mode && next.mode !== committed.mode) || !trip ||
        !isDeepStrictEqual(next.state, replaceTrip(committed.state, trip))) {
      throw new PlannerError(unrelatedCommits, 409);
    }
    committed = next;
    previous = commit;
  }
  if (previous !== head) throw new PlannerError("Pull upstream changes before saving this trip to GitHub.", 409);
  return committed;
}

async function commitTrip(directory, git, branch, head, mode, state) {
  if (await git("diff", "--cached", "--name-only", head, "--", file)) {
    throw new PlannerError("trips.json has staged changes. Review the staging area in Git before saving this trip.", 409);
  }
  // Build the commit in a temporary index so other staged files and worktree edits stay local.
  const temporary = await mkdtemp(join(tmpdir(), "waypoint-publish-"));
  try {
    const data = join(temporary, file);
    const index = { GIT_INDEX_FILE: join(temporary, "index") };
    const staged = (...args) => runGit(directory, args, index);
    await writeFile(data, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
    const blob = (await git("hash-object", "-w", "--no-filters", "--", data)).trim();
    await staged("read-tree", head);
    await staged("update-index", "--add", "--cacheinfo", `${mode || "100644"},${blob},${file}`);
    const tree = (await staged("write-tree")).trim();
    const commit = (await git("commit-tree", tree, "-p", head, "-m", "Save Waypoint trip")).trim();
    if ((await git("symbolic-ref", "HEAD")).trim() !== branch) {
      throw new PlannerError("The checkout switched branches while saving. Try again on the intended branch.", 409);
    }
    await git("update-ref", "-m", "Save Waypoint trip", branch, commit, head);
    try {
      // Merge the two index versions without writing the worktree. Git preserves unrelated staged entries.
      await git("read-tree", "-i", "-m", head, commit);
    } catch {
      throw new PlannerError("A trip commit was created locally. Review the staging area in Git before publishing it.", 409);
    }
    return commit;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function publishTrip(directory, trip) {
  const git = (...args) => runGit(directory, args);
  try {
    const states = await git("rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD", "--git-path", "CHERRY_PICK_HEAD",
      "--git-path", "REVERT_HEAD", "--git-path", "rebase-merge", "--git-path", "rebase-apply");
    if (states.trim().split("\n").some(existsSync) || await git("ls-files", "--unmerged")) {
      throw new PlannerError("Finish the Git operation in this checkout before saving to GitHub.", 409);
    }
    const branch = (await git("symbolic-ref", "--quiet", "HEAD").catch(() => "")).trim();
    const tracking = branch && (await git("for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", branch)).trim();
    const [remote, target] = (tracking || "").split("\0");
    if (!remote || remote === "." || !target?.startsWith("refs/heads/")) {
      throw new PlannerError("Check out a branch with a GitHub upstream to save this trip.", 409);
    }
    const urls = (await git("remote", "get-url", "--push", "--all", "--", remote)).trim().split("\n");
    if (urls.length !== 1) throw new PlannerError("Configure one push destination for this checkout before saving.", 409);

    await git("fetch", "--no-tags", "--no-recurse-submodules", "--", remote, target);
    const upstream = (await git("rev-parse", "FETCH_HEAD")).trim();
    const head = (await git("rev-parse", branch)).trim();
    const remoteTip = await git("ls-remote", "--exit-code", "--refs", "--", urls[0], target);
    const destination = remoteTip.trim().split("\n").map(line => line.split("\t")).find(([, ref]) => ref === target);
    if (destination?.[0] !== upstream) {
      throw new PlannerError("The push destination is out of sync with the upstream branch. Check this checkout before saving.", 409);
    }
    const { mode, state } = await selectedTripHistory(git, upstream, head, trip.id);
    const updated = replaceTrip(state, trip);
    const commit = isDeepStrictEqual(state, updated) ? head : await commitTrip(directory, git, branch, head, mode, updated);
    if (commit === upstream) return { pushed: false };
    try {
      await git("push", "--no-follow-tags", "--recurse-submodules=no", "--", remote, `${commit}:${target}`);
    } catch {
      throw new PlannerError("The trip is committed locally, but Git could not push it. Check the upstream branch and credentials, then try again.", 502);
    }
    return { pushed: true };
  } catch (error) {
    if (error instanceof PlannerError) throw error;
    const details = `${error.stdout || ""}\n${error.stderr || ""}`;
    if (/identity unknown|unable to auto-detect email/i.test(details)) {
      throw new PlannerError("Set your Git user name and email for this checkout before saving.", 409);
    }
    throw new PlannerError("Git could not prepare this trip for saving. Check the checkout and its connection to GitHub.", 502);
  }
}
