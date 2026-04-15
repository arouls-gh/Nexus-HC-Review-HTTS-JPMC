const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOT_DIR = __dirname;
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH || "");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));
const REVIEW_ARCHIVE_DIR = path.join(DATA_DIR, "review-archives");
const TRAINING_FILE = path.join(DATA_DIR, "training-library.json");
const MANUAL_RULES_FILE = path.join(DATA_DIR, "manual-rules.json");
const MAX_REVIEW_ARCHIVES = 20;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
    const pathname = normalizePathname(requestUrl.pathname);
    const appPathname = stripBasePath(pathname);

    if (appPathname == null) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: `Unknown route: ${pathname}` }));
      return;
    }

    if (appPathname === "/api/training-library") {
      await handleTrainingLibrary(request, response);
      return;
    }

    if (appPathname === "/api/manual-rules") {
      await handleManualRules(request, response);
      return;
    }

    if (appPathname === "/api/review-archives") {
      await handleReviewArchives(request, response);
      return;
    }

    if (appPathname.startsWith("/api/")) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: `Unknown API route: ${pathname}` }));
      return;
    }

    await serveStaticFile(request, response, appPathname);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  const baseSuffix = APP_BASE_PATH || "";
  console.log(`Nexus reviewer running at http://${HOST}:${PORT}${baseSuffix}/`);
});

async function handleTrainingLibrary(request, response) {
  if (request.method === "GET") {
    const payload = await readTrainingLibrary();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }

  if (request.method === "POST") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const payload = {
      savedAt: parsed.savedAt || new Date().toISOString(),
      notes: parsed.notes || "",
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    };

    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(
      TRAINING_FILE,
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, count: payload.examples.length }));
    return;
  }

  if (request.method === "DELETE") {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(
      TRAINING_FILE,
      JSON.stringify({ savedAt: null, notes: "", examples: [] }, null, 2),
      "utf8",
    );

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function readTrainingLibrary() {
  try {
    const raw = await fs.promises.readFile(TRAINING_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      savedAt: null,
      notes: "",
      examples: [],
    };
  }
}

async function handleManualRules(request, response) {
  if (request.method === "GET") {
    const payload = await readManualRules();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }

  if (request.method === "POST") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const existing = await readManualRules();
    const incomingRules = Array.isArray(parsed.rules) ? parsed.rules : [];
    const rulesByCheck = new Map(
      existing.rules.map((rule) => [rule.checkName, rule]),
    );

    incomingRules.forEach((rule) => {
      const checkName = String(rule.checkName || "").trim();
      const classification = String(rule.classification || "").trim();
      const feedback = String(rule.feedback || "").trim();

      if (!checkName || !classification || !feedback) {
        return;
      }

      rulesByCheck.set(checkName, {
        checkName,
        classification,
        feedback,
        savedAt: new Date().toISOString(),
      });
    });

    const payload = {
      savedAt: new Date().toISOString(),
      rules: [...rulesByCheck.values()].sort((left, right) =>
        left.checkName.localeCompare(right.checkName),
      ),
    };

    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(
      MANUAL_RULES_FILE,
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, count: payload.rules.length }));
    return;
  }

  if (request.method === "DELETE") {
    const current = await readManualRules();
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    const checkName = String(
      parsed.checkName || url.searchParams.get("checkName") || "",
    ).trim();

    if (!checkName) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "checkName is required" }));
      return;
    }

    const remainingRules = current.rules.filter((rule) => rule.checkName !== checkName);
    const payload = {
      savedAt: remainingRules.length ? new Date().toISOString() : null,
      rules: remainingRules,
    };

    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(
      MANUAL_RULES_FILE,
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, count: remainingRules.length }));
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function readManualRules() {
  try {
    const raw = await fs.promises.readFile(MANUAL_RULES_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      savedAt: parsed.savedAt || null,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    };
  } catch {
    return {
      savedAt: null,
      rules: [],
    };
  }
}

async function handleReviewArchives(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const body = await readRequestBody(request);
  const parsed = JSON.parse(body || "{}");
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const hostname = String(parsed.hostname || "").trim() || "unknown-device";
  const reportFiles = files.filter((file) =>
    isFinalReportPath(file.relativePath || file.name || ""),
  );

  if (!files.length) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "files are required" }));
    return;
  }

  if (!reportFiles.length) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "No final_report file was found to archive" }));
    return;
  }

  await fs.promises.mkdir(REVIEW_ARCHIVE_DIR, { recursive: true });

  const createdAt = new Date().toISOString();
  const archiveDirName = `${toArchiveStamp(createdAt)}_${sanitizePathSegment(hostname)}`;
  const archiveDir = path.join(REVIEW_ARCHIVE_DIR, archiveDirName);

  await fs.promises.mkdir(archiveDir, { recursive: true });

  for (const file of files) {
    const relativePath = normalizeArchiveRelativePath(file.relativePath || file.name || "");
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.join(archiveDir, relativePath);
    if (!absolutePath.startsWith(archiveDir)) {
      continue;
    }

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, String(file.content || ""), "utf8");
  }

  const finalReportsDir = path.join(archiveDir, "final-reports");
  await fs.promises.mkdir(finalReportsDir, { recursive: true });

  for (const [index, reportFile] of reportFiles.entries()) {
    const originalName = path.basename(
      normalizeArchiveRelativePath(reportFile.relativePath || reportFile.name || ""),
    ) || `final_report_${index + 1}.txt`;
    const extension = path.extname(originalName) || ".txt";
    const canonicalName =
      reportFiles.length === 1
        ? `final_report${extension}`
        : `final_report_${index + 1}${extension}`;

    await fs.promises.writeFile(
      path.join(finalReportsDir, canonicalName),
      String(reportFile.content || ""),
      "utf8",
    );

    if (canonicalName !== originalName) {
      await fs.promises.writeFile(
        path.join(finalReportsDir, originalName),
        String(reportFile.content || ""),
        "utf8",
      );
    }
  }

  const manifest = {
    hostname,
    createdAt,
    fileCount: files.length,
    archiveDirName,
    finalReportFileCount: reportFiles.length,
    finalReportFiles: reportFiles.map((file) =>
      normalizeArchiveRelativePath(file.relativePath || file.name || ""),
    ),
  };

  await fs.promises.writeFile(
    path.join(archiveDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  await pruneReviewArchives();

  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify({
      ok: true,
      archiveDirName,
      fileCount: files.length,
      finalReportFileCount: reportFiles.length,
    }),
  );
}

async function pruneReviewArchives() {
  const entries = await fs.promises.readdir(REVIEW_ARCHIVE_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (directories.length <= MAX_REVIEW_ARCHIVES) {
    return;
  }

  const removable = directories.slice(0, directories.length - MAX_REVIEW_ARCHIVES);

  for (const directory of removable) {
    await fs.promises.rm(path.join(REVIEW_ARCHIVE_DIR, directory), {
      recursive: true,
      force: true,
    });
  }
}

function toArchiveStamp(isoString) {
  return isoString.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-device";
}

function normalizeArchiveRelativePath(value) {
  const normalized = path
    .normalize(String(value || "").replace(/^[/\\]+/, ""))
    .replace(/^(\.\.(\/|\\|$))+/, "");

  if (!normalized || normalized === ".") {
    return "";
  }

  return normalized;
}

function isFinalReportPath(value) {
  return /(?:^|[\\/])RESULTS[\\/].+_final_report\.(txt|json)$/i.test(String(value || ""));
}

function normalizePathname(value) {
  const normalized = String(value || "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized === "/") {
    return "/";
  }

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizeBasePath(value) {
  const normalized = normalizePathname(String(value || "").trim());
  return normalized === "/" ? "" : normalized;
}

function stripBasePath(pathname) {
  if (!APP_BASE_PATH) {
    return pathname;
  }

  if (pathname === APP_BASE_PATH) {
    return "/";
  }

  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length) || "/";
  }

  return null;
}

async function serveStaticFile(request, response, appPathname = null) {
  const requestPathname =
    appPathname ||
    stripBasePath(normalizePathname(new URL(request.url, `http://${HOST}:${PORT}`).pathname));
  const requestPath = requestPathname === "/" ? "/index.html" : requestPathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT_DIR, safePath);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  const fileBuffer = await fs.promises.readFile(absolutePath);

  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileBuffer);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
