#!/usr/bin/env node
// Единая точка вызова OpenAI Codex CLI для навыков codex-* (.claude/skills).
//
//   node scripts/codex/run.mjs exec   --name ux-today   --prompt-file p.md [--image a.png ...] [--schema s.json]
//   node scripts/codex/run.mjs review --name stage-04   --base main --schema scripts/codex/schemas/review.json < prompt.md
//   node scripts/codex/run.mjs exec   --resume <session-id> --prompt-file followup.md
//
// Что делает поверх `codex exec`:
// - находит Codex (CODEX_BIN → глобальный npm → расширение VS Code), путь которого меняется при обновлениях;
// - передаёт задание через stdin (длинные промпты в аргументах ломаются на Windows);
// - по умолчанию запускает Codex только на чтение (`--sandbox read-only`);
// - складывает всё про запуск в .codex-runs/<время>-<имя>/: prompt.md, events.jsonl, stderr.log,
//   last.md (итоговый ответ), session.txt (id сессии для --resume);
// - ограничивает время работы и понятно сообщает, если слетела авторизация.
//
// Итоговый ответ Codex печатается в stdout, служебные сообщения — в stderr.

import { spawn, execSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const RUNS_DIR = path.join(REPO_ROOT, ".codex-runs");
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const AUTH_ERROR =
  /could not be refreshed|sign in again|unauthorized \(401\)|not logged in|Please log ?in/i;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string", default: "run" },
    "prompt-file": { type: "string" },
    sandbox: { type: "string", default: "read-only" },
    cd: { type: "string" },
    image: { type: "string", multiple: true, default: [] },
    schema: { type: "string" },
    base: { type: "string" },
    uncommitted: { type: "boolean", default: false },
    resume: { type: "string" },
    "collect-images": { type: "string" },
    timeout: { type: "string", default: "15" },
    "dry-run": { type: "boolean", default: false },
  },
});

const task = positionals[0];
if (task !== "exec" && task !== "review") {
  fail("Usage: run.mjs <exec|review> [options] — see the header of this file.");
}
if (!["read-only", "workspace-write"].includes(opts.sandbox)) {
  fail(`--sandbox must be read-only or workspace-write, got "${opts.sandbox}"`);
}

function fail(message, code = 1) {
  process.stderr.write(`codex-run: ${message}\n`);
  process.exit(code);
}

function log(message) {
  process.stderr.write(`codex-run: ${message}\n`);
}

/** Codex: явный CODEX_BIN, глобальный npm-пакет или бинарник из расширения VS Code. */
function resolveCodex() {
  const candidates = [];
  if (process.env.CODEX_BIN) candidates.push(process.env.CODEX_BIN);
  try {
    const prefix = execSync("npm prefix -g", {
      encoding: "utf8",
      shell: true,
    }).trim();
    candidates.push(
      path.join(prefix, "node_modules/@openai/codex/bin/codex.js"),
      path.join(prefix, "lib/node_modules/@openai/codex/bin/codex.js"),
    );
  } catch {
    // npm недоступен — пробуем дальше
  }
  const extensions = path.join(homedir(), ".vscode/extensions");
  if (existsSync(extensions)) {
    const bundled = readdirSync(extensions)
      .filter((dir) => dir.startsWith("openai.chatgpt-"))
      .sort()
      .reverse()
      .flatMap((dir) => {
        const binDir = path.join(extensions, dir, "bin");
        if (!existsSync(binDir)) return [];
        return readdirSync(binDir).map((platform) =>
          path.join(
            binDir,
            platform,
            process.platform === "win32" ? "codex.exe" : "codex",
          ),
        );
      });
    candidates.push(...bundled);
  }
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    fail(
      "Codex CLI not found. Install it: npm install -g @openai/codex, then run: codex login",
    );
  }
  return found.endsWith(".js")
    ? { command: process.execPath, prefix: [found] }
    : { command: found, prefix: [] };
}

function readPrompt() {
  if (opts["prompt-file"]) return readFileSync(opts["prompt-file"], "utf8");
  if (!process.stdin.isTTY) return readFileSync(0, "utf8");
  return "";
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildArgs(runDir, workDir) {
  const lastFile = path.join(runDir, "last.md");
  const common = ["--json", "-o", lastFile];
  if (opts.schema) common.push("--output-schema", path.resolve(opts.schema));
  for (const image of opts.image) common.push("-i", path.resolve(image));

  if (opts.resume) {
    return [
      "exec",
      "resume",
      ...common,
      "--skip-git-repo-check",
      opts.resume,
      "-",
    ];
  }
  if (task === "review") {
    const scope = opts.uncommitted
      ? ["--uncommitted"]
      : ["--base", opts.base ?? "main"];
    // Свои инструкции к ревью необязательны: без них Codex использует стандартные.
    return [
      "exec",
      "review",
      ...common,
      ...scope,
      ...(prompt.trim() ? ["-"] : []),
    ];
  }
  return [
    "exec",
    ...common,
    "--sandbox",
    opts.sandbox,
    "--cd",
    workDir,
    "--skip-git-repo-check",
    "-",
  ];
}

/** Новые картинки за время запуска: из рабочей папки и из хранилища Codex. */
function collectImages(sinceMs, workDir, targetDir) {
  const roots = [
    workDir,
    path.join(
      process.env.CODEX_HOME ?? path.join(homedir(), ".codex"),
      "generated_images",
    ),
  ];
  const found = [];
  const walk = (dir, depth) => {
    if (!existsSync(dir) || depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (IMAGE_EXT.test(entry.name) && statSync(full).mtimeMs >= sinceMs)
        found.push(full);
    }
  };
  roots.forEach((root) => walk(root, 0));
  mkdirSync(targetDir, { recursive: true });
  return found.map((file) => {
    const dest = path.join(targetDir, path.basename(file));
    if (path.resolve(file) !== path.resolve(dest)) copyFileSync(file, dest);
    return dest;
  });
}

const prompt = readPrompt();
if (!prompt.trim() && task === "exec")
  fail("Empty prompt: pass --prompt-file or pipe it via stdin.");

const runDir = path.join(
  RUNS_DIR,
  `${stamp()}-${opts.name.replace(/[^\w.-]+/g, "-")}`,
);
const workDir = path.resolve(
  opts.cd ??
    (opts.sandbox === "workspace-write"
      ? path.join(runDir, "work")
      : REPO_ROOT),
);
const codex = resolveCodex();
const args = buildArgs(runDir, workDir);

if (opts["dry-run"]) {
  console.log(
    JSON.stringify(
      {
        command: codex.command,
        args: [...codex.prefix, ...args],
        runDir,
        workDir,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

mkdirSync(runDir, { recursive: true });
mkdirSync(workDir, { recursive: true });
writeFileSync(path.join(runDir, "prompt.md"), prompt);
log(`run folder: ${path.relative(REPO_ROOT, runDir)}`);

const startedAt = Date.now();
const child = spawn(codex.command, [...codex.prefix, ...args], {
  cwd: task === "review" ? REPO_ROOT : workDir,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const events = createWriteStream(path.join(runDir, "events.jsonl"));
const stderrLog = createWriteStream(path.join(runDir, "stderr.log"));
let stderrText = "";
let sessionId = null;

child.stdout.on("data", (chunk) => {
  events.write(chunk);
  const match = /"(?:thread_id|session_id)"\s*:\s*"([^"]+)"/.exec(
    chunk.toString(),
  );
  if (match && !sessionId) sessionId = match[1];
});
child.stderr.on("data", (chunk) => {
  stderrLog.write(chunk);
  stderrText += chunk.toString();
});
child.stdin.end(prompt);

const timeoutMs = Number(opts.timeout) * 60_000;
const timer = setTimeout(() => {
  log(`timeout after ${opts.timeout} min, stopping Codex`);
  child.kill();
}, timeoutMs);

child.on("close", (code) => {
  clearTimeout(timer);
  events.end();
  stderrLog.end();
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (sessionId) writeFileSync(path.join(runDir, "session.txt"), sessionId);

  if (AUTH_ERROR.test(stderrText)) {
    fail(
      "Codex is not authorized (token expired). Ask the user to run: codex logout && codex login",
      2,
    );
  }
  const lastFile = path.join(runDir, "last.md");
  const last = existsSync(lastFile) ? readFileSync(lastFile, "utf8") : "";
  if (code !== 0 || !last.trim()) {
    const tail = stderrText.trim().split("\n").slice(-8).join("\n");
    fail(
      `Codex exited with code ${code} after ${seconds}s.\n${tail}\nSee ${path.relative(REPO_ROOT, runDir)}`,
      code || 1,
    );
  }

  log(`done in ${seconds}s${sessionId ? `, session ${sessionId}` : ""}`);
  if (opts["collect-images"]) {
    const images = collectImages(
      startedAt,
      workDir,
      path.resolve(opts["collect-images"]),
    );
    log(
      images.length
        ? `images:\n  ${images.join("\n  ")}`
        : "no new images found",
    );
  }
  process.stdout.write(last.endsWith("\n") ? last : `${last}\n`);
});
