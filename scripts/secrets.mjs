#!/usr/bin/env node
//
// Read, edit and write back one environment's secrets in SSM Parameter Store.
//
// Runs on a laptop, with an AWS profile that may write the prefix - never on the instance, which
// has a read-only instance role. The console can do this too, but one parameter per screen and a
// click to decrypt each: for thirty variables that is the reason this exists.
//
//   pnpm secrets:edit stage
//
// This was a bash script until November 2026, and the port is the whole point. It needed bash, the
// AWS CLI and jq all on one PATH, which on Windows means Git Bash's PATH rather than the shell the
// tools were installed from - so `aws --version` answered in PowerShell while the script said "aws
// is not installed", and the reader went looking for a tool they already had. Node is already the
// toolchain here, it inherits the PATH of whatever shell ran `pnpm`, it parses JSON without jq, and
// it behaves the same on all three platforms. One implementation, not a .ps1 beside a .sh.
//
// What it does NOT do: reach the running application. `fetch-env.sh` reads Parameter Store at
// deploy time, so a secret changed here takes effect at the next deploy. The last line of output
// says so, because everybody forgets it once.
//
// Plaintext never touches the terminal: values are only ever in the editor and in a directory
// removed on every exit path. What is printed is key names.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV = process.argv[2];
if (ENV !== "prod" && ENV !== "stage") {
  console.error("usage: pnpm secrets:edit prod|stage");
  process.exit(64);
}

const REGION = process.env.AWS_REGION || "eu-north-1";
// Override when the parameters live under a different path. Confirm the real shape with
// `aws ssm describe-parameters --query 'Parameters[].Name'`, which returns no values.
const PREFIX = process.env.ITBRIDGE_SSM_PREFIX || `/itbridge/${ENV}/`;

// The CLI is spawned with an argument array and no shell, so a value containing a quote, a space
// or a semicolon is passed as itself and never parsed by anything. That matters more here than
// anywhere else in the repo: the arguments are secrets.
let AWS = null;
function aws(args, { capture = true } = {}) {
  const candidates = AWS ? [AWS] : ["aws", "aws.exe"];
  for (const cmd of candidates) {
    const run = spawnSync(cmd, args, {
      encoding: "utf8",
      stdio: capture
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "pipe"],
      windowsHide: true,
    });
    if (run.error?.code === "ENOENT") continue;
    AWS = cmd;
    if (run.error) {
      console.error(`could not run ${cmd}: ${run.error.message}`);
      process.exit(69);
    }
    if (run.status !== 0) {
      // The CLI's own message names the parameter and the permission, which is more useful
      // than anything this script could say about it.
      process.stderr.write(run.stderr || "");
      process.exit(1);
    }
    return run.stdout ?? "";
  }
  console.error("the AWS CLI is not on this process's PATH");
  console.error(
    "`where.exe aws` (Windows) or `command -v aws` names the directory to add;",
  );
  console.error(
    "this runs on your laptop, so it needs a profile that may write the prefix",
  );
  process.exit(69);
}

// mkdtemp is 0700 on POSIX. On Windows the per-user temp directory is already ACL'd to that user,
// and chmod there sets only the read-only bit, so asking for a mode would be theatre.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "itbridge-secrets-"));
const file = path.join(work, `${ENV}.env`);
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    // Losing the directory is not worth masking the exit code that brought us here; the
    // path is under the user's own temp directory either way.
  }
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

const fetched = JSON.parse(
  aws([
    "ssm",
    "get-parameters-by-path",
    "--path",
    PREFIX,
    "--recursive",
    "--with-decryption",
    "--region",
    REGION,
  ]),
);

const parameters = fetched.Parameters ?? [];
if (parameters.length === 0) {
  console.error(`no parameters under ${PREFIX} in ${REGION}`);
  process.exit(1);
}

// A value containing a newline cannot survive the round trip through KEY=value, and a truncated
// secret is worse than a refusal: it would be written back silently. The bash version inferred
// this by counting lines; here the value can simply be asked.
const multiline = parameters
  .filter((p) => /[\r\n]/.test(p.Value))
  .map((p) => p.Name.split("/").pop());
if (multiline.length > 0) {
  console.error("a value contains a newline, so it cannot be edited here:");
  for (const key of multiline) console.error(`  ${key}`);
  console.error("edit those in the console.");
  process.exit(1);
}

const before = new Map();
const types = new Map();
for (const p of parameters) {
  const key = p.Name.split("/").pop();
  before.set(key, p.Value);
  types.set(key, p.Type);
}

const sorted = [...before.keys()].sort();
fs.writeFileSync(
  file,
  sorted.map((key) => `${key}=${before.get(key)}`).join("\n") + "\n",
  { mode: 0o600 },
);

// A GUI editor that returns before the window closes would hand back the unedited file, so an
// $EDITOR of `code` needs its own `--wait` - the same string the reader would type by hand.
const editor =
  process.env.EDITOR ||
  process.env.VISUAL ||
  (process.platform === "win32" ? "notepad" : "vi");
const [editorCmd, ...editorArgs] = editor.split(/\s+/).filter(Boolean);
const edit = spawnSync(editorCmd, [...editorArgs, file], {
  stdio: "inherit",
  windowsHide: false,
});
if (edit.error) {
  console.error(
    `could not start the editor (${editor}): ${edit.error.message}`,
  );
  console.error(
    'set EDITOR, e.g. $env:EDITOR = "notepad" or EDITOR="code --wait"',
  );
  process.exit(69);
}

const after = new Map();
let lineNumber = 0;
for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  lineNumber += 1;
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) continue;
  const at = line.indexOf("=");
  if (at < 0) {
    console.error(`line ${lineNumber}: no '=', skipped`);
    continue;
  }
  const key = line.slice(0, at);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    console.error(
      `line ${lineNumber}: ${key} is not a valid key name, skipped`,
    );
    continue;
  }
  // The value is taken from the raw line, not the trimmed one, only up to the trailing newline:
  // a trailing space in a secret is real, and a reader cannot see it to put it back.
  after.set(key, raw.replace(/\r$/, "").slice(at + 1));
}

let wrote = 0;
for (const [key, value] of after) {
  if (before.has(key) && before.get(key) === value) continue;
  // Keep the type it already had; a new key defaults to SecureString, because the safe default
  // for something typed into this file is "encrypted".
  aws([
    "ssm",
    "put-parameter",
    "--name",
    `${PREFIX}${key}`,
    "--value",
    value,
    "--type",
    types.get(key) ?? "SecureString",
    "--overwrite",
    "--region",
    REGION,
  ]);
  console.log(`wrote: ${key}`);
  wrote += 1;
}

// A key removed from the file is a deletion, and deletions are confirmed one by one: an
// accidentally emptied line should not take a secret with it. Without a terminal to ask - a pipe,
// a CI runner - they are listed instead of guessed at, and the writes above still stand.
const gone = sorted.filter((key) => !after.has(key));
if (gone.length > 0) {
  if (process.stdin.isTTY) {
    for (const key of gone) {
      process.stdout.write(`delete ${PREFIX}${key}? [y/N] `);
      if (readLine().trim().toLowerCase() !== "y") continue;
      aws([
        "ssm",
        "delete-parameter",
        "--name",
        `${PREFIX}${key}`,
        "--region",
        REGION,
      ]);
      console.log(`deleted: ${key}`);
      wrote += 1;
    }
  } else {
    console.error(
      "no terminal to confirm deletions; these keys left the file and were kept:",
    );
    for (const key of gone) console.error(`  ${key}`);
  }
}

if (wrote === 0) {
  console.log("nothing changed");
  process.exit(0);
}

console.log();
console.log(
  `${wrote} parameter(s) changed. The application still runs on the old values:`,
);
console.log("fetch-env.sh reads Parameter Store at deploy time only.");
console.log("GitHub -> Actions -> Deploy -> Re-run jobs.");

// One synchronous line from the terminal. readline/promises would make this file async for a
// single prompt, and an await between the writes and the deletions is a window in which a
// Ctrl-C leaves half the work reported and half not.
function readLine() {
  const buffer = Buffer.alloc(1);
  let line = "";
  for (;;) {
    let read = 0;
    try {
      read = fs.readSync(0, buffer, 0, 1, null);
    } catch (error) {
      // EAGAIN happens on a non-blocking stdin; EOF and a closed pipe both mean "no answer",
      // which is a no, because this prompt guards a deletion.
      if (error.code === "EAGAIN") continue;
      return "";
    }
    if (read === 0) return line;
    const char = buffer.toString("utf8");
    if (char === "\n") return line;
    if (char !== "\r") line += char;
  }
}
