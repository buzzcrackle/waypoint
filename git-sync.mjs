import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const git = process.env.WAYPOINT_GIT || "git";

export async function runGit(directory, args, env) {
  const { stdout } = await exec(git, args, {
    cwd: directory,
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true
  });
  return stdout;
}

async function conflicts(directory) {
  const paths = await runGit(directory, ["diff", "--name-only", "--diff-filter=U", "-z"]);
  return paths.split("\0").filter(Boolean);
}

function conflict(files) {
  return {
    type: "conflict", files,
    message: files.length ? "Resolve the listed files in Git and finish the merge. Then choose Pull again."
      : "Finish the pending Git merge in this checkout. Then choose Pull again."
  };
}

export function committedTrips(directory) {
  return runGit(directory, ["show", "HEAD:trips.json"]);
}

export async function pullRepository(directory) {
  try {
    const files = await conflicts(directory);
    if (files.length) return conflict(files);
    await runGit(directory, ["pull", "--no-rebase", "--ff", "--no-autostash", "--no-edit", "--no-recurse-submodules"]);
    return null;
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    if (/overwritten by merge|would be overwritten by checkout/i.test(output)) {
      return { type: "blocked", message: "Local changes block this pull. Commit or reconcile your edits in Git, then choose Pull again." };
    }
    if (/MERGE_HEAD exists|unmerged files|fix conflicts/i.test(output)) {
      return conflict(await conflicts(directory).catch(() => []));
    }
    if (error.code === "ENOENT" || /Xcode license/i.test(output)) {
      return { type: "error", message: "Git could not start. Check your Git installation or set WAYPOINT_GIT to a working Git executable." };
    }
    return { type: "error", message: "Git could not pull. Check the upstream branch, connection, and credentials in this checkout." };
  }
}
