const activityTypeInput = document.querySelector("#activityType");
const healthFileInput = document.querySelector("#healthFile");
const analysisStatusEl = document.querySelector("#analysisStatus");
const minorOutputTextInput = document.querySelector("#minorOutputText");
const majorOutputTextInput = document.querySelector("#majorOutputText");
const showStopperOutputTextInput = document.querySelector("#showStopperOutputText");
const missedChecksTextInput = document.querySelector("#missedChecksText");
const failCountEl = document.querySelector("#failCount");
const impactBadgeEl = document.querySelector("#impactBadge");
const showStopperCountEl = document.querySelector("#showStopperCount");
const analyzeButton = document.querySelector("#analyzeButton");
const downloadButton = document.querySelector("#downloadButton");
const offlineRules = window.OFFLINE_RULES || { checkTemplates: {}, customerName: "Customer" };
let currentDownloadHostname = "";

const activityProfiles = {
  "code-upgrade": {
    label: "Code upgrade",
    concerns: ["software consistency", "module stability", "control-plane health"],
  },
  "smu-update": {
    label: "SMU Update",
    concerns: ["software state", "existing defects", "supervisor stability"],
  },
  "hardware-replacement": {
    label: "Hardware replacement",
    concerns: ["module status", "port health", "hardware alarms"],
  },
  "topology-change": {
    label: "Topology change",
    concerns: ["neighbor relationships", "port-channel health", "routing adjacency"],
  },
  "switch-migration": {
    label: "Switch migration",
    concerns: ["neighbor relationships", "routing stability", "cutover readiness"],
  },
  "isolation-failover-testing": {
    label: "Isolation & Failover testing",
    concerns: ["redundancy health", "traffic failover behavior", "control-plane stability"],
  },
};

const keywordRules = [
  {
    id: "power",
    keywords: ["power", "psu", "supply"],
    title: "Power-related health issue",
    severity: "high",
    feedback:
      "Power redundancy or PSU health needs to be checked before the activity. Any unresolved power issue can increase operational risk during the maintenance window.",
    impacts: {
      "code-upgrade":
        "This should be treated as impacting the code upgrade until redundancy is confirmed.",
      "smu-update":
        "Proceeding with an SMU Update while power redundancy is degraded is not recommended.",
      "hardware-replacement":
        "This may directly affect hardware handling and should be reviewed before replacement work begins.",
      "topology-change":
        "This may not block the topology change by itself, but it does increase maintenance risk and should be reviewed.",
      "switch-migration":
        "This should be reviewed before switch migration because degraded power redundancy increases cutover risk.",
      "isolation-failover-testing":
        "This should be reviewed before isolation and failover testing because hardware resilience is part of the test objective.",
    },
  },
  {
    id: "fan",
    keywords: ["fan", "thermal", "temperature"],
    title: "Cooling or thermal health issue",
    severity: "high",
    feedback:
      "Thermal or fan-related failures should be reviewed before maintenance. Device stability could be affected while traffic is converging or software is restarting.",
    impacts: {
      "code-upgrade":
        "Thermal instability can impact reboot behavior during the code upgrade and should be addressed first.",
      "smu-update":
        "This could increase risk during the SMU activation cycle and should be investigated before proceeding.",
      "hardware-replacement":
        "This may indicate broader hardware stress and should be considered part of the replacement scope.",
      "topology-change":
        "This is a background risk rather than a topology-specific blocker, but it still needs review.",
      "switch-migration":
        "Thermal instability should be addressed before migration because it can affect platform stability during cutover.",
      "isolation-failover-testing":
        "Thermal instability can skew failover outcomes and should be reviewed before testing.",
    },
  },
  {
    id: "module",
    keywords: ["module", "linecard", "lc", "supervisor", "sup"],
    title: "Module or supervisor health issue",
    severity: "high",
    feedback:
      "Module or supervisor-related failures are important because they can directly affect platform readiness and maintenance recoverability.",
    impacts: {
      "code-upgrade":
        "This is likely to impact the code upgrade and should be reviewed before scheduling the activity.",
      "smu-update":
        "Supervisor or module instability can affect SMU installation or activation and should be treated as an impact.",
      "hardware-replacement":
        "This may align with the planned hardware work, but it still needs explicit review to confirm scope and risk.",
      "topology-change":
        "If the affected module carries links involved in the change, this can directly impact the topology activity.",
      "switch-migration":
        "Module health can directly affect switch migration and should be reviewed before cutover.",
      "isolation-failover-testing":
        "Module instability can invalidate failover testing and should be treated as impactful.",
    },
  },
  {
    id: "interface",
    keywords: ["interface", "eth", "port", "crc", "input error", "link", "transceiver"],
    title: "Interface health issue",
    severity: "medium",
    feedback:
      "Interface-related failures should be reviewed against the links participating in the planned maintenance. They may be pre-existing but can still influence change success or post-change validation.",
    impacts: {
      "code-upgrade":
        "This may impact the upgrade if the issue affects critical uplinks, vPC member links, or post-reload validation.",
      "smu-update":
        "This is usually a conditional impact; check whether the affected ports are critical for stability or rollback.",
      "hardware-replacement":
        "If the failing interface is on the hardware being replaced, include it in the replacement scope and validation plan.",
      "topology-change":
        "This can directly impact a topology change if the affected interface participates in the links being modified.",
      "switch-migration":
        "This can directly affect migration if the impacted interfaces are part of the cutover path.",
      "isolation-failover-testing":
        "This can directly affect isolation and failover testing if the impacted interfaces are part of the validation path.",
    },
  },
  {
    id: "port-channel",
    keywords: ["port-channel", "po", "lacp", "vpc", "peer-link", "member"],
    title: "Port-channel or vPC health issue",
    severity: "high",
    feedback:
      "Port-channel, vPC, or peer-link failures are usually significant because they can affect redundancy, convergence, and post-change traffic symmetry.",
    impacts: {
      "code-upgrade":
        "This should be treated as impacting the code upgrade until redundancy and consistency are confirmed.",
      "smu-update":
        "This may affect traffic resiliency during SMU activation and should be reviewed before proceeding.",
      "hardware-replacement":
        "This can materially affect replacement sequencing and rollback planning.",
      "topology-change":
        "This is very likely to impact the topology change and should be resolved or explicitly accepted before the activity.",
      "switch-migration":
        "This is likely to impact migration because redundancy and bundle health are critical during cutover.",
      "isolation-failover-testing":
        "This is likely to impact failover testing because bundle health is central to the expected test outcome.",
    },
  },
  {
    id: "routing",
    keywords: ["bgp", "ospf", "isis", "route", "neighbor", "adjacency", "hsrp", "vrf"],
    title: "Routing or control-plane health issue",
    severity: "high",
    feedback:
      "Routing and control-plane failures should be reviewed carefully because they can affect convergence, reachability, and validation during the maintenance window.",
    impacts: {
      "code-upgrade":
        "This is likely to impact pre/post checks for the code upgrade and should be addressed before proceeding.",
      "smu-update":
        "This may increase risk during SMU activation and should be reviewed as a potential blocker.",
      "hardware-replacement":
        "This may change the replacement procedure if the affected control-plane function is tied to the planned hardware.",
      "topology-change":
        "This is likely to impact the topology change directly because neighbor and path behavior may already be degraded.",
      "switch-migration":
        "This is likely to impact migration because neighbor and control-plane stability are central to cutover success.",
      "isolation-failover-testing":
        "This is likely to impact isolation and failover testing because control-plane stability is part of the validation.",
    },
  },
  {
    id: "storage",
    keywords: ["bootflash", "logflash", "disk", "storage", "space"],
    title: "Storage or filesystem health issue",
    severity: "medium",
    feedback:
      "Storage-related failures should be checked before maintenance because upgrades and logging operations may require healthy local storage.",
    impacts: {
      "code-upgrade":
        "This can impact image handling for the code upgrade and should be reviewed before proceeding.",
      "smu-update":
        "This can affect package staging or rollback files and should be treated as relevant.",
      "hardware-replacement":
        "This may not directly block replacement work, but it should still be documented and reviewed.",
      "topology-change":
        "This is usually a lower direct impact for topology changes, but it remains an operational concern.",
      "switch-migration":
        "This is usually a lower direct migration impact, but it remains an operational concern that should be documented.",
      "isolation-failover-testing":
        "This is usually lower direct impact for failover testing, but it should still be documented.",
    },
  },
];

const fallbackRule = {
  title: "General health check failure",
  severity: "medium",
  feedback:
    "This failed health-check item needs manual review to confirm whether it is a pre-existing observation or an active risk for the planned maintenance.",
  genericImpact:
    "Treat this as requiring review before the maintenance activity is approved.",
};

initialize();

analyzeButton.addEventListener("click", async () => {
  try {
    setAnalysisStatus("Reading uploaded folder...");
    const uploadedEntries = await readFiles(healthFileInput.files);

    if (!uploadedEntries.length) {
      setAnalysisStatus("No folder contents detected.");
      window.alert("Please choose the switch parent folder to analyze.");
      return;
    }

    setAnalysisStatus(`Detected ${uploadedEntries.length} file(s). Looking for RESULTS and LOGS...`);
    const deviceFolder = buildDeviceFolder(uploadedEntries);

    if (!deviceFolder) {
      setAnalysisStatus("Folder detected, but no valid RESULTS final report file was found.");
      window.alert(
        "The selected folder does not include a valid RESULTS final report file.",
      );
      return;
    }

    setAnalysisStatus(
      `Found report source. RESULTS files: ${deviceFolder.resultsFiles.length}, LOG files: ${deviceFolder.logFiles.length}. Parsing report...`,
    );
    const activityType = activityTypeInput.value;
    setAnalysisStatus(
      `Found report source. RESULTS files: ${deviceFolder.resultsFiles.length}, LOG files: ${deviceFolder.logFiles.length}. Saving review archive and parsing report...`,
    );
    const [savedExamples, manualRules, archiveResult] = await Promise.all([
      getSavedExamples(),
      getManualRules(),
      saveReviewArchive(deviceFolder.hostname, uploadedEntries),
    ]);
    const analysis = analyzeDeviceFolder({
      deviceFolder,
      activityType,
      exampleLibrary: savedExamples,
      manualRules,
    });

    renderAnalysis(analysis);
    setAnalysisStatus(
      `Analysis complete. Minor: ${analysis.minorCount}, Major: ${analysis.majorCount}, Show stopper: ${analysis.showStopperCount}.${archiveResult.ok ? ` Review archive saved.` : ` Review archive save skipped: ${archiveResult.error}`}`,
    );
  } catch (error) {
    setAnalysisStatus(`Analysis failed: ${error.message}`);
    window.alert(`Unable to analyze health check: ${error.message}`);
    console.error(error);
  }
});

downloadButton.addEventListener("click", () => {
  const content = buildDownloadContent().trim();

  if (!content) {
    return;
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeHostname = sanitizeFilename(currentDownloadHostname || "switch");
  const stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `${safeHostname}_HC_review_${stamp}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function initialize() {
  resetMainPageState();
  setAnalysisStatus("Awaiting analysis.");
}

async function readFiles(fileList) {
  if (!fileList || !fileList.length) {
    return [];
  }

  return Promise.all(
    [...fileList].map(async (file) => ({
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      content: await file.text(),
    })),
  );
}

async function getSavedExamples() {
  try {
    const response = await fetch("/api/training-library");

    if (!response.ok) {
      return [];
    }

    const parsed = await response.json();
    return Array.isArray(parsed.examples) ? parsed.examples : [];
  } catch {
    return [];
  }
}

async function getManualRules() {
  try {
    const response = await fetch("/api/manual-rules");

    if (!response.ok) {
      return {};
    }

    const parsed = await response.json();
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];

    return Object.fromEntries(
      rules
        .filter((rule) => rule.checkName && rule.feedback)
        .map((rule) => [
          normalizeCheckName(rule.checkName),
          {
            classification: rule.classification || "major",
            defaultAction: rule.feedback,
            source: "manual",
          },
        ]),
    );
  } catch {
    return {};
  }
}

async function saveReviewArchive(hostname, uploadedEntries) {
  try {
    const response = await fetch("/api/review-archives", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        hostname,
        files: uploadedEntries.map((entry) => ({
          name: entry.name,
          relativePath: entry.relativePath,
          content: entry.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      return { ok: false, error: errorPayload.error || "archive request failed" };
    }

    const parsed = await response.json();
    return { ok: true, archiveDirName: parsed.archiveDirName || "" };
  } catch (error) {
    console.warn("Unable to save review archive", error);
    return { ok: false, error: error.message || "archive save failed" };
  }
}

function buildDeviceFolder(uploadedEntries) {
  const resultsFiles = uploadedEntries.filter((entry) =>
    /\/RESULTS\/.+_final_report\.(txt|json)$/i.test(entry.relativePath),
  );
  const logFiles = uploadedEntries.filter((entry) =>
    /\/LOGS\/.+\.(xml|txt)$/i.test(entry.relativePath),
  );

  if (!resultsFiles.length) {
    return null;
  }

  const parentFolderName =
    uploadedEntries[0]?.relativePath.split("/")[0] || "Unknown device";
  const txtReport =
    resultsFiles.find((entry) => /_final_report\.txt$/i.test(entry.name)) ?? null;
  const jsonReport =
    resultsFiles.find((entry) => /_final_report\.json$/i.test(entry.name)) ?? null;

  return {
    hostname: parentFolderName,
    resultsFiles,
    logFiles,
    txtReport,
    jsonReport,
  };
}

function setAnalysisStatus(message) {
  if (analysisStatusEl) {
    analysisStatusEl.textContent = message;
  }
}

function resetMainPageState() {
  if (healthFileInput) {
    healthFileInput.value = "";
  }
  if (showStopperOutputTextInput) {
    showStopperOutputTextInput.value = "";
  }
  if (minorOutputTextInput) {
    minorOutputTextInput.value = "";
  }
  if (majorOutputTextInput) {
    majorOutputTextInput.value = "";
  }
  if (missedChecksTextInput) {
    missedChecksTextInput.value = "";
  }
  currentDownloadHostname = "";

  failCountEl.textContent = "0";
  impactBadgeEl.textContent = "0";
  showStopperCountEl.textContent = "0";
  downloadButton.disabled = true;
}

function analyzeDeviceFolder({
  deviceFolder,
  activityType,
  exampleLibrary,
  manualRules,
}) {
  const reportData = extractReportData(deviceFolder);
  const findings = reportData.failItems.map((item, index) =>
    buildFinding({
      item,
      activityType,
      index,
      exampleLibrary,
      logFiles: deviceFolder.logFiles,
      manualRules,
    }),
  );
  const deliveredFindings = findings.filter((finding) => finding.feedback.trim());
  const missedChecks = findings.filter((finding) => !finding.feedback.trim());
  const impactLevel = summarizeImpact(findings);
  const output = buildOutput({
    deviceFolder,
    reportData,
    findings: deliveredFindings,
    missedChecks,
    impactLevel,
    activityType,
  });

  return {
    minorCount: deliveredFindings.filter((finding) => finding.classification === "minor").length,
    majorCount: deliveredFindings.filter((finding) => finding.classification === "major").length,
    showStopperCount: deliveredFindings.filter((finding) => finding.classification === "show-stopper").length,
    impactLevel,
    output,
  };
}

function extractReportData(deviceFolder) {
  if (deviceFolder.txtReport) {
    const hostname = extractHostname(deviceFolder.txtReport.content) || deviceFolder.hostname;
    return {
      sourceFormat: "txt",
      hostname,
      reportName: deviceFolder.txtReport.name,
      failItems: extractStructuredFailItems(deviceFolder.txtReport.content),
    };
  }

  if (deviceFolder.jsonReport) {
    return {
      sourceFormat: "json",
      hostname: deviceFolder.hostname,
      reportName: deviceFolder.jsonReport.name,
      failItems: extractFailItemsFromJson(deviceFolder.jsonReport.content),
    };
  }

  return {
    sourceFormat: "unknown",
    hostname: deviceFolder.hostname,
    reportName: "Unavailable",
    failItems: [],
  };
}

function extractStructuredFailItems(text) {
  const hostname = extractHostname(text);
  const parsedBlocks = parseFailBlocksFromTable(text);

  if (parsedBlocks.length) {
    return parsedBlocks.map((block, index) => ({
      ...block,
      hostname,
      index: index + 1,
    }));
  }

  return extractFailItems(text).map((item, index) => ({
    ...item,
    hostname,
    checkName: "",
    messageLines: [item.line],
    commandHint: "",
  }));
}

function extractHostname(text) {
  const match = text.match(/# Hostname:\s*(.+)/i);
  return match ? match[1].trim() : "";
}

function parseFailBlocksFromTable(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  let seenHeader = false;

  lines.forEach((line) => {
    if (line.includes("|   Result")) {
      seenHeader = true;
      return;
    }

    if (!seenHeader) {
      return;
    }

    if (/^\+-[-+=]+\+$/.test(line)) {
      if (current) {
        finalizeFailBlock(blocks, current);
        current = null;
      }
      return;
    }

    if (!line.startsWith("|")) {
      return;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 6) {
      return;
    }

    if (cells[0] === "Fail") {
      if (current) {
        finalizeFailBlock(blocks, current);
      }

      current = {
        line: cells[2],
        context: cells[4],
        checkName: cells[3],
        messageLines: cells[2] ? [cells[2]] : [],
        descriptionLines: cells[4] ? [cells[4]] : [],
        commandLines: cells[5] ? [cells[5]] : [],
      };
      return;
    }

    if (!current) {
      return;
    }

    if (cells[2]) {
      current.messageLines.push(cells[2]);
    }
    if (cells[3] && !current.checkName) {
      current.checkName = cells[3];
    }
    if (cells[4]) {
      current.descriptionLines.push(cells[4]);
    }
    if (cells[5]) {
      current.commandLines.push(cells[5]);
    }
  });

  if (current) {
    finalizeFailBlock(blocks, current);
  }

  return blocks;
}

function finalizeFailBlock(blocks, block) {
  blocks.push({
    line: block.messageLines[0] || block.line || "",
    context: block.messageLines.join(" | "),
    checkName: normalizeCheckName(block.checkName || ""),
    messageLines: dedupe(block.messageLines),
    descriptionLines: dedupe(block.descriptionLines),
    commandHint: dedupe(block.commandLines).join(", "),
  });
}

function extractFailItems(text) {
  const lines = text.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    if (!/\bFAIL\b/i.test(line)) {
      return;
    }

    const context = lines
      .slice(Math.max(0, index - 1), Math.min(lines.length, index + 2))
      .join(" | ")
      .trim();

    matches.push({
      line: line.trim(),
      context,
      index: index + 1,
    });
  });

  return matches;
}

function extractFailItemsFromJson(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    const matches = [];

    walkJson(parsed, [], matches);
    return matches;
  } catch {
    return [];
  }
}

function walkJson(value, path, matches) {
  if (typeof value === "string" && /\bFAIL\b/i.test(value)) {
    matches.push({
      line: `${path.join(".") || "report"}: ${value}`,
      context: `JSON path ${path.join(".") || "report"}`,
      index: matches.length + 1,
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkJson(entry, [...path, `[${index}]`], matches);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      walkJson(entry, [...path, key], matches);
    });
  }
}

function buildFinding({ item, activityType, index, exampleLibrary, logFiles, manualRules }) {
  const normalizedCheckName = normalizeCheckName(item.checkName || "");
  const haystack = `${item.line} ${item.context} ${normalizedCheckName}`.toLowerCase();
  const matchedRule =
    keywordRules.find((rule) =>
      rule.keywords.some((keyword) => haystack.includes(keyword)),
    ) ?? fallbackRule;
  const ruleTemplate = getRuleTemplate(normalizedCheckName, manualRules);
  const exampleMatch = ruleTemplate
    ? null
    : findRelevantExampleText(exampleLibrary, item, normalizedCheckName);
  const severity = matchedRule.severity ?? fallbackRule.severity;
  const impactSentence =
    matchedRule.impacts?.[activityType] ?? fallbackRule.genericImpact;
  const feedback = composeFeedback({
    item,
    matchedRule,
    ruleTemplate,
    exampleMatch,
    activityType,
    logFiles,
    manualRules,
  });
  const logHint = findRelevantLogHint(logFiles, haystack);

  return {
    number: index + 1,
    title: matchedRule.title,
    severity,
    classification: resolveClassification(
      { ...item, checkName: normalizedCheckName },
      logFiles,
      manualRules,
    ),
    checkName: normalizedCheckName || matchedRule.title,
    source: `Line ${item.index}: ${item.line}`,
    context: item.context,
    feedback,
    impactSentence,
    logHint,
    trainingSource: exampleMatch?.label || "",
  };
}

function findRelevantLogHint(logFiles, haystack) {
  if (!logFiles?.length) {
    return "";
  }

  const preferred = logFiles.find((file) => {
    const name = file.name.toLowerCase();

    return (
      (haystack.includes("bgp") && name.includes("bgp")) ||
      (haystack.includes("interface") && name.includes("interface")) ||
      (haystack.includes("port-channel") && name.includes("port-channel")) ||
      (haystack.includes("vpc") && name.includes("vpc")) ||
      (haystack.includes("ospf") && name.includes("ospf"))
    );
  });

  return preferred
    ? `For deeper review, check LOGS/${preferred.name}.`
    : logFiles[0]
      ? `For deeper review, check LOGS/${logFiles[0].name}.`
      : "";
}

const TRAINING_LIBRARY_MATCH_THRESHOLD = 14;

function findRelevantExampleText(exampleLibrary, item, checkName) {
  if (!exampleLibrary.length || !checkName) {
    return null;
  }

  const normalizedCheckName = checkName.toLowerCase();
  const exactCheckExamples = exampleLibrary.filter(
    (example) =>
      normalizeCheckName(example.checkName || "").toLowerCase() === normalizedCheckName,
  );

  if (!exactCheckExamples.length) {
    return null;
  }

  const currentMessages = item.messageLines || [item.line].filter(Boolean);
  const currentSourceText = buildCurrentFindingSourceText(item);
  const currentInterfaces = extractStructuredInterfaceNames(currentMessages);
  const currentVrfs = extractStructuredVrfs(currentMessages);
  const currentNeighborIps = extractStructuredNeighborIps(currentMessages);
  const currentModuleIds = extractStructuredModuleIds(currentMessages);
  const currentClassMaps = extractStructuredClassMaps(currentMessages);
  const currentBugIds = extractBugIdsFromText(currentSourceText);
  const currentCommandTokens = extractCommandTokensFromText(item.commandHint || "");

  const bestMatch = exactCheckExamples
    .map((example) => {
      const sourceText = buildTrainingLibrarySourceText(example);
      const feedbackText = String(example.manualFeedback || example.feedback || "")
        .replace(/\s+/g, " ")
        .trim();
      const exampleMessages = Array.isArray(example.messageLines)
        ? example.messageLines
        : [];
      const exampleInterfaces = extractStructuredInterfaceNames(exampleMessages);
      const exampleVrfs = extractStructuredVrfs(exampleMessages);
      const exampleNeighborIps = extractStructuredNeighborIps(exampleMessages);
      const exampleModuleIds = extractStructuredModuleIds(exampleMessages);
      const exampleClassMaps = extractStructuredClassMaps(exampleMessages);
      const exampleBugIds = extractBugIdsFromText(`${sourceText}\n${feedbackText}`);
      const exampleCommandTokens = extractCommandTokensFromText(
        example.commandHint || sourceText,
      );

      const sourceScore = countTokenOverlap(currentSourceText, sourceText);
      const feedbackScore = countTokenOverlap(currentSourceText, feedbackText);
      const interfaceScore = countSharedValues(currentInterfaces, exampleInterfaces);
      const vrfScore = countSharedValues(currentVrfs, exampleVrfs);
      const neighborScore = countSharedValues(currentNeighborIps, exampleNeighborIps);
      const moduleScore = countSharedValues(currentModuleIds, exampleModuleIds);
      const classMapScore = countSharedValues(currentClassMaps, exampleClassMaps);
      const bugScore = countSharedValues(currentBugIds, exampleBugIds);
      const commandScore = countSharedValues(currentCommandTokens, exampleCommandTokens);

      return {
        label: `${example.deviceResultName || "training-result"} -> ${example.manualFeedbackName || "training-feedback"}`,
        feedbackText,
        score:
          sourceScore * 3 +
          feedbackScore +
          interfaceScore * 8 +
          vrfScore * 7 +
          neighborScore * 8 +
          moduleScore * 5 +
          classMapScore * 7 +
          bugScore * 10 +
          commandScore * 4,
      };
    })
    .sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.score < TRAINING_LIBRARY_MATCH_THRESHOLD) {
    return null;
  }

  return {
    text: normalizeFeedbackText(bestMatch.feedbackText),
    label: bestMatch.label,
    score: bestMatch.score,
  };
}

function composeFeedback({
  item,
  matchedRule,
  ruleTemplate,
  exampleMatch,
  activityType,
  logFiles,
  manualRules,
}) {
  const templateFeedback = ruleTemplate
    ? buildTemplateFeedback(item, activityType, logFiles, manualRules)
    : "";

  if (templateFeedback) {
    return templateFeedback;
  }

  if (exampleMatch?.text) {
    return exampleMatch.text;
  }

  return "";
}

function normalizeFeedbackText(text) {
  const compact = replaceCustomerName(text).replace(/\s+/g, " ").trim();

  if (!compact) {
    return "";
  }

  return truncateSentence(compact, 420);
}

function buildCurrentFindingSourceText(item) {
  return [
    `Check: ${normalizeCheckName(item.checkName || "")}`,
    ...(item.messageLines || [item.line]).filter(Boolean),
    item.descriptionLines?.length
      ? `Description: ${item.descriptionLines.join(" | ")}`
      : "",
    item.commandHint ? `Command: ${item.commandHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTrainingLibrarySourceText(example) {
  return String(
    example.sourceText ||
      example.deviceResult ||
      [
        `Check: ${normalizeCheckName(example.checkName || "")}`,
        ...(Array.isArray(example.messageLines) ? example.messageLines : []),
        Array.isArray(example.descriptionLines) && example.descriptionLines.length
          ? `Description: ${example.descriptionLines.join(" | ")}`
          : "",
        example.commandHint ? `Command: ${example.commandHint}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function buildTemplateFeedback(item, activityType, logFiles, manualRules) {
  const checkName = normalizeCheckName(item.checkName || "");
  const messages = item.messageLines || [item.line];
  const firstLine = messages[0] || item.line;
  const ruleTemplate = getRuleTemplate(checkName, manualRules);

  if (ruleTemplate?.source === "manual") {
    return resolveRuleAction(ruleTemplate, activityType, item);
  }

  if (checkName === "checkBiosGolden") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${firstLine}`;
  }

  if (checkName === "checkFeature") {
    return buildFeatureFeedback(messages, ruleTemplate, activityType);
  }

  if (checkName === "checkFwdUtilization") {
    return `${extractFwdUtilizationLine(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkLacpTimer") {
    return `${summarizeLacpMessages(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkLoggingMessages") {
    return `${normalizeLoggingMessage(firstLine)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkSmuCSCvz65993") {
    return `${messages[0]} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCoppPolicyMap") {
    return `${buildCoppSummary(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkInterfaceErrors") {
    return `Affected interfaces: ${summarizeInterfaceTargets(messages, /Interface\s+.+\s+has/i)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkActiveSmu" || checkName === "checkSmuOrder") {
    return buildSmuFeedback(checkName, messages, ruleTemplate, activityType);
  }

  if (checkName === "checkVpcStatus") {
    return `${summarizeVpcMessages(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkPortChannel") {
    return `${summarizePortChannelMessages(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkInterfaceFlap") {
    return `${firstLine} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkIntStatus") {
    return `${summarizeInterfaceTargets(messages, /\bInterface\b/i)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCpuInternal") {
    return `${summarizeCpuMessages(messages)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkAdvertisedRoutesBgpPeer") {
    return `${resolveRuleAction(ruleTemplate, activityType)} Neighbor IP: ${extractNeighborIps(messages)}`;
  }

  if (checkName === "checkBgpNeighborsStatus") {
    return `${resolveRuleAction(ruleTemplate, activityType)} ${extractVrfsFromMessages(messages)}`;
  }

  if (checkName === "checkBgpProcess") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  if (checkName === "checkBgpMemory") {
    return buildBgpMemoryFeedback(messages, ruleTemplate, activityType);
  }

  if (checkName === "checkBgpMemLeakAlert") {
    return `${summarizeRoutingMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCdpErrors") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeCdpMessages(messages)}`;
  }

  if (checkName === "checkEnvironment") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeHardwareMessages(messages)}`;
  }

  if (checkName === "checkRoutingTableIpv4") {
    return buildRoutingTableFeedback(messages, ruleTemplate, activityType);
  }

  if (checkName === "checkSnmpStatus") {
    return buildSnmpFeedback(messages, ruleTemplate, activityType);
  }

  if (checkName === "checkSupEpldVersion") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeEpldMessages(messages)}`;
  }

  if (checkName === "checkLinecardEpldVersion") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeEpldMessages(messages)}`;
  }

  if (checkName === "checkArpSummary") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeArpMessages(messages)}`;
  }

  if (checkName === "checkAsicEventsErrors") {
    return `${summarizeAsicMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkDiagStatus" || checkName === "checkModState") {
    return `${summarizeHardwareMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkL3InterfaceStatus") {
    return `Interface ${summarizeInterfaceTargets(messages, /\b(admin UP|line\/proto DOWN|line\/prot DOWN|Interface)\b/i)} - ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkSsdFirmware") {
    return `${summarizeHardwareMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkLogsFib") {
    return buildLogsFibFeedback(logFiles, ruleTemplate, activityType);
  }

  if (checkName === "checkDefaultrouteIpv4") {
    return `${extractVrfsFromMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkRibConsumption") {
    return `Routing table is consuming high memory\n${summarizeRoutingMessages(messages)}\nCustomer to verify if there is scaling issue / route flaps \nImpact with Maintenance Window is inconslusive without deep analysis. high RIB memory consumption is a smoking gun and needs attention.`;
  }

  if (checkName === "checkNtpPeerStatus") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  if (checkName === "checkSyslogRemote") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeSyslogMessages(messages)}`;
  }

  if (checkName === "checkCpuStatus") {
    return `${summarizeCpuMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCpuMacMgmtCounters") {
    return `${summarizeCpuMacMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCpuMacInbandCounters") {
    return `${summarizeCpuMacMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkBootflashSpace") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeBootflashMessages(messages)}`;
  }

  if (checkName === "checkMacInc") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeMacIncMessages(messages)}`;
  }

  if (checkName === "checkSystemReset") {
    return `${summarizeSystemResetMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCoppPolicy") {
    return `${summarizeCoppPolicyMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkInternalMts") {
    return `${summarizeMtsMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCoreFiles") {
    return `${summarizeCoreFileMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkSsdReadOnly") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeHardwareMessages(messages)}`;
  }

  if (checkName === "checkSsdStats") {
    return `${summarizeHardwareMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkModuleModel") {
    return `${summarizeHardwareMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkVersion") {
    return `${summarizeVersionMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkBiosVersion") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeVersionMessages(messages)}`;
  }

  if (checkName === "checkFeatureUtil") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeFeatureUtilMessages(messages)}`;
  }

  if (checkName === "checkMemoryInternal") {
    return `${resolveRuleAction(ruleTemplate, activityType)}\n${summarizeMemoryMessages(messages)}`;
  }

  if (checkName === "checkMemoryStatus") {
    return `${summarizeMemoryMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkBfdStatus") {
    return `${summarizeBfdMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkBfdTimers") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  if (checkName === "checkTcamUtilization") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  if (checkName === "checkRpmHeapAsPath") {
    return `${summarizeRpmHeapMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkProfilerDeviceNxos") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  if (checkName === "checkTrieTiles") {
    return `${summarizeTrieTileMessages(messages)}\n${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  if (checkName === "checkCcForwarding") {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  return "";
}

function resolveRuleAction(ruleTemplate, activityType, item = null) {
  if (!ruleTemplate) {
    return "";
  }

  const actionText = (
    ruleTemplate.byActivity?.[activityType] ||
    ruleTemplate.defaultAction ||
    ""
  );

  return renderRuleTemplate(actionText, item, ruleTemplate);
}

function resolveClassification(item, logFiles, manualRules) {
  const normalizedCheckName = normalizeCheckName(item.checkName || "");

  if (normalizedCheckName === "checkFwdUtilization") {
    return classifyFwdUtilization(item.messageLines || [item.line]);
  }

  if (normalizedCheckName === "checkBgpMemory") {
    return classifyBgpMemory(item.messageLines || [item.line]);
  }

  if (normalizedCheckName === "checkCpuStatus") {
    return classifyCpuStatus(item.messageLines || [item.line]);
  }

  const ruleTemplate = getRuleTemplate(normalizedCheckName, manualRules);
  return ruleTemplate?.classification || "major";
}

function getRuleTemplate(checkName, manualRules) {
  const normalizedCheckName = normalizeCheckName(checkName);

  if (!normalizedCheckName) {
    return null;
  }

  return (
    manualRules?.[normalizedCheckName] ||
    offlineRules.checkTemplates[normalizedCheckName] ||
    null
  );
}

function normalizeCheckName(checkName) {
  return String(checkName || "").trim();
}

function renderRuleTemplate(template, item, ruleTemplate = null) {
  if (!template || !item) {
    return template || "";
  }

  const messages = item.messageLines || [item.line] || [];
  const firstMessage = messages[0] || item.line || "";
  const allMessages = dedupe(messages).join("\n");
  const pipeMessages = dedupe(messages).join(" | ");
  const interfaces = extractInterfaceNames(messages);
  const compactInterfaces = compactInterfaceList(messages);
  const vrfs = extractVrfsFromMessages(messages);
  const neighborIps = extractNeighborIps(messages);
  const descriptionLines = dedupe(item.descriptionLines || []).join("\n");
  const commandHint = item.commandHint || "";
  const moduleIds = extractModuleIds(messages);
  const classMaps = extractClassMaps(messages);
  const utilization = extractReportedUtilization(messages);
  const classification = ruleTemplate?.classification || "";

  return String(template)
    .replace(/\{\{\s*check_name\s*\}\}/gi, item.checkName || "")
    .replace(/\{\{\s*hostname\s*\}\}/gi, item.hostname || "")
    .replace(/\{\{\s*message\s*\}\}/gi, firstMessage)
    .replace(/\{\{\s*first_message\s*\}\}/gi, firstMessage)
    .replace(/\{\{\s*message_lines\s*\}\}/gi, allMessages)
    .replace(/\{\{\s*messages\s*\}\}/gi, allMessages)
    .replace(/\{\{\s*message_pipe\s*\}\}/gi, pipeMessages)
    .replace(/\{\{\s*description_lines\s*\}\}/gi, descriptionLines)
    .replace(/\{\{\s*command_hint\s*\}\}/gi, commandHint)
    .replace(/\{\{\s*interfaces\s*\}\}/gi, interfaces)
    .replace(/\{\{\s*compact_interfaces\s*\}\}/gi, compactInterfaces)
    .replace(/\{\{\s*vrfs\s*\}\}/gi, vrfs)
    .replace(/\{\{\s*neighbor_ips\s*\}\}/gi, neighborIps)
    .replace(/\{\{\s*module_ids\s*\}\}/gi, moduleIds)
    .replace(/\{\{\s*class_maps\s*\}\}/gi, classMaps)
    .replace(/\{\{\s*utilization\s*\}\}/gi, utilization)
    .replace(/\{\{\s*classification\s*\}\}/gi, classification)
    .trim();
}

function extractModuleIds(messages) {
  const modules = dedupe(
    messages.flatMap((message) => {
      const matches = [...message.matchAll(/\bModule\s+([A-Za-z0-9/.-]+)/gi)];
      return matches.map((match) => match[1]);
    }),
  );

  return modules.join(", ");
}

function extractStructuredModuleIds(messages) {
  return dedupe(
    messages.flatMap((message) => {
      const matches = [...String(message).matchAll(/\bModule\s+([A-Za-z0-9/.-]+)/gi)];
      return matches.map((match) => match[1]);
    }),
  );
}

function extractClassMaps(messages) {
  const classMaps = dedupe(
    messages.flatMap((message) => {
      const matches = message.match(/copp-[a-z0-9-]+/gi);
      return matches || [];
    }),
  );

  return classMaps.join(", ");
}

function extractStructuredClassMaps(messages) {
  return dedupe(
    messages.flatMap((message) => String(message).match(/copp-[a-z0-9-]+/gi) || []),
  );
}

function extractReportedUtilization(messages) {
  for (const message of messages) {
    const actualMatch = message.match(
      /Actual utilization\s+([0-9]+(?:\.[0-9]+)?)/i,
    );
    if (actualMatch) {
      return actualMatch[1];
    }

    const percentMatch = message.match(/([0-9]+(?:\.[0-9]+)?)%/);
    if (percentMatch) {
      return percentMatch[1];
    }
  }

  return "";
}

function summarizeFeatureMessages(messages) {
  const configured = [];
  const missing = [];

  messages.forEach((message) => {
    const configuredMatch = message.match(/Feature\s+(.+?)\s+is configured but not in expected feature list/i);
    if (configuredMatch) {
      configured.push(configuredMatch[1]);
    }
    const missingMatch = message.match(/Feature\s+(.+?)\s+is not configured but is in expected feature list/i);
    if (missingMatch) {
      missing.push(missingMatch[1]);
    }
  });

  const parts = [];

  if (configured.length) {
    parts.push(`Feature ${configured.join(", ")} ${configured.length > 1 ? "are" : "is"} configured but not in expected feature list`);
  }
  if (missing.length) {
    parts.push(`Feature ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not configured but in expected feature list`);
  }

  return parts.join(". ");
}

function buildFeatureFeedback(messages, ruleTemplate, activityType) {
  const configured = [];
  const missing = [];

  messages.forEach((message) => {
    const configuredMatch = message.match(/Feature\s+(.+?)\s+is configured but not in expected feature list/i);
    if (configuredMatch) {
      configured.push(configuredMatch[1]);
    }

    const missingMatch =
      message.match(/Feature\s+(.+?)\s+is not configured but is in expected feature list/i) ||
      message.match(/Feature\s+(.+?)\s+is not enabled on switch but is in expected feature list/i);
    if (missingMatch) {
      missing.push(missingMatch[1]);
    }
  });

  const parts = [];

  if (configured.length) {
    parts.push(`Configured but unexpected features: ${dedupe(configured).join(", ")}`);
  }

  if (missing.length) {
    parts.push(`Expected but missing features: ${dedupe(missing).join(", ")}`);
  }

  if (!parts.length) {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  return `${parts.join(". ")} - ${resolveRuleAction(ruleTemplate, activityType)}`;
}

function pluralizeFeature(messages) {
  const summary = summarizeFeatureMessages(messages);
  return summary.includes(",") || summary.includes(" and ") ? "these features are" : "this feature is";
}

function summarizeLacpMessages(messages) {
  const lacpLines = filterMessages(messages, /mismatched\s+lacp\s+timers/i);
  const interfaces = summarizeInterfaceTargets(
    lacpLines.length ? lacpLines : messages,
    /mismatched\s+lacp\s+timers/i,
  );
  return interfaces
    ? `Interface ${interfaces} has mismatched LACP timers`
    : (lacpLines[0] || messages[0]);
}

function summarizeBfdMessages(messages) {
  const relevantLines = filterMessages(
    messages,
    /\b(bfd|neighbor|peer|interface|session)\b/i,
  );

  return dedupe(relevantLines.length ? relevantLines : messages).join("\n");
}

function summarizeInterfaceTargets(messages, pattern) {
  const relevantLines = pattern ? filterMessages(messages, pattern) : messages;
  const compact = compactInterfaceList(relevantLines);

  if (compact) {
    return compact;
  }

  return extractInterfaceNames(relevantLines);
}

function filterMessages(messages, pattern) {
  return messages.filter((message) => pattern.test(message));
}

function summarizeHardwareMessages(messages) {
  const relevantLines = filterMessages(
    messages,
    /\b(module|ssd|firmware|fan|psu|power|temperature|diag|diagnostic|model|read-only|state|failed|healthy|reason)\b/i,
  );
  const selectedLines = dedupe(relevantLines.length ? relevantLines : messages);

  return selectedLines.join("\n");
}

function summarizeRoutingMessages(messages) {
  const relevantLines = filterMessages(
    messages,
    /\b(bgp|vrf|rib|route|routes|neighbor|prefix|memory|advertises|default route)\b/i,
  );
  const selectedLines = dedupe(relevantLines.length ? relevantLines : messages);

  return selectedLines.join("\n");
}

function summarizeCpuMessages(messages) {
  const relevantLines = filterMessages(
    messages,
    /\b(process|cpu|pid|utilization|threshold|vsh\.bin|stats_client)\b/i,
  );
  const selectedLines = dedupe(relevantLines.length ? relevantLines : messages);

  return selectedLines.join(" | ");
}

function summarizeCpuMacMessages(messages) {
  const relevantLines = filterMessages(
    messages,
    /\b(cpu|mac|mgmt|inband|internal|counter|drop|queue|interface)\b/i,
  );
  const selectedLines = dedupe(relevantLines.length ? relevantLines : messages);

  return selectedLines.join("\n");
}

function normalizeLoggingMessage(message) {
  if (/multiple logging messages/i.test(message)) {
    return "Syslog messages found with severity lower than errors";
  }

  return message;
}

function summarizeSmuMessages(messages) {
  if (messages.some((message) => /CSCvz65993/i.test(message))) {
    return messages[0];
  }

  return `SMU state/order mismatch observed. ${summarizeTailMessages(messages)}`.trim();
}

function summarizeMatchedMessages(messages, patterns, options = {}) {
  const {
    fallback = messages[0] || "",
    joiner = "\n",
    limit = 8,
  } = options;
  const regexes = Array.isArray(patterns) ? patterns : [patterns];
  const selectedLines = dedupe(
    messages.filter((message) => regexes.some((pattern) => pattern.test(message))),
  );

  return (selectedLines.slice(0, limit).join(joiner) || fallback).trim();
}

function summarizeActiveSmuMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bSMU\b/i,
    /found active on device/i,
    /not found as active on device/i,
    /expected list/i,
  ]);
}

function summarizeSmuOrderMessages(messages) {
  const expectedIndex = messages.findIndex((message) =>
    /Expected committed SMU list order/i.test(message),
  );

  if (expectedIndex >= 0) {
    const expectedLines = [];

    for (let index = expectedIndex + 1; index < messages.length; index += 1) {
      const line = messages[index];
      if (
        !/^\s*-\s+\S+/i.test(line) &&
        line.trim() !== ""
      ) {
        break;
      }
      if (/^\s*-\s+\S+/i.test(line)) {
        expectedLines.push(line);
      }
    }

    if (expectedLines.length) {
      return expectedLines.join("\n");
    }
  }

  return summarizeMatchedMessages(messages, [
    /expected.*SMU/i,
    /expected.*order/i,
    /committed SMU list order/i,
    /^\s*-\s+\S+/i,
  ]);
}

function summarizeCdpMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bCDP\b/i,
    /checksum/i,
    /\binterface\b/i,
    /malformed/i,
  ]);
}

function summarizeArpMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bARP\b/i,
    /\bincomplete\b/i,
    /\bthrottled\b/i,
    /\bunknown\b/i,
    /\bVRF\b/i,
    /\bIP\b/i,
  ]);
}

function summarizeSyslogMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bsyslog\b/i,
    /\blogging server\b/i,
    /\bserver\b/i,
    /\bIP\b/i,
    /\bPORT\b/i,
    /reachability/i,
    /unreachable/i,
    /not available/i,
  ]);
}

function summarizeBootflashMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bbootflash\b/i,
    /\bspace\b/i,
    /\bfree\b/i,
    /\bdir\b/i,
    /insufficient/i,
    /not enough/i,
    /Test Skipped/i,
  ]);
}

function summarizeMtsMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bMTS\b/i,
    /\bqueue\b/i,
    /\brecv_q\b/i,
    /\bbuffer\b/i,
    /\bstuck\b/i,
    /\bnode\b/i,
  ]);
}

function summarizeCoreFileMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bcore\b/i,
    /Process Name/i,
    /\bPID\b/i,
    /\bprocess\b/i,
    /\bmodule\b/i,
  ]);
}

function summarizeEpldMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bEPLD\b/i,
    /\bmodule\b/i,
    /\bversion\b/i,
    /\bActual version\b/i,
    /\bincorrect version\b/i,
    /\bDevice\b/i,
  ]);
}

function summarizeAsicMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bASIC\b/i,
    /\btah\b/i,
    /\bevent-history\b/i,
    /\berror\b/i,
    /\bmodule\b/i,
    /\bslot\b/i,
  ]);
}

function summarizeMacIncMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bL2\b/i,
    /\bMAC\b/i,
    /\binconsisten/i,
    /\bmodule\b/i,
    /\bconsistency-checker\b/i,
  ]);
}

function summarizeSystemResetMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\breset\b/i,
    /\breason\b/i,
    /\blast reset\b/i,
    /\bservice\b/i,
    /\breload\b/i,
  ]);
}

function summarizeCoppPolicyMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bpolicy\b/i,
    /\bCopp\b/i,
    /\bCoPP\b/i,
    /\bcontrol-plane\b/i,
    /\bstrict\b/i,
    /\bpolicy-map\b/i,
  ]);
}

function summarizeVersionMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bNXOS\b/i,
    /\bBIOS\b/i,
    /\bversion\b/i,
    /\bExpected\b/i,
    /\bfound\b/i,
    /\bNode\b/i,
  ]);
}

function summarizeFeatureUtilMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bfeature\b/i,
    /\butilization\b/i,
    /\bscale\b/i,
    /\bthreshold\b/i,
    /\bswitch\b/i,
  ]);
}

function summarizeMemoryMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bmemory\b/i,
    /\bprocess\b/i,
    /\butilization\b/i,
    /\bthreshold\b/i,
    /\bconsumption\b/i,
    /\bPID\b/i,
  ], { joiner: "\n" });
}

function summarizeRpmHeapMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bAS-Path\b/i,
    /\bRunning-Config\b/i,
    /\bHeap memory\b/i,
    /\bas-path-access-list\b/i,
    /\bshow run rpm\b/i,
    /\bmismatch\b/i,
    /\bsync\b/i,
  ]);
}

function summarizeTrieTileMessages(messages) {
  return summarizeMatchedMessages(messages, [
    /\bTrie\b/i,
    /\btile\b/i,
    /\butilization\b/i,
    /\bmodule\b/i,
    /\bslot\b/i,
    /\bthreshold\b/i,
    /\bmax-paths\b/i,
  ]);
}

function summarizeVpcMessages(messages) {
  return summarizeTailMessages(messages) || messages[0];
}

function summarizePortChannelMessages(messages) {
  const vpcIds = dedupe(
    messages.flatMap((message) => {
      const matches = message.match(/port-channel(\d+)/gi);
      return (matches || []).map((value) => value.replace(/port-channel/gi, ""));
    }),
  )
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (vpcIds.length) {
    return `vPC ${formatNumericRanges(vpcIds)} - port-channel${formatNumericRanges(vpcIds)} is in Down state`;
  }

  return summarizeTailMessages(messages) || messages[0];
}

function buildCoppSummary(messages) {
  const classMaps = dedupe(
    messages.flatMap((message) => {
      const matches = message.match(/copp-[a-z0-9-]+/gi);
      return matches || [];
    }),
  );

  if (!classMaps.length) {
    return "Affected class map not identified";
  }

  return `Affected class map${classMaps.length > 1 ? "s" : ""}: ${classMaps.join(", ")}`;
}

function extractVrfsFromMessages(messages) {
  const vrfs = dedupe(
    messages.flatMap((message) => {
      const matches = [...message.matchAll(/\bVRF\s+([A-Za-z0-9_-]+)/gi)];
      return matches.map((match) => match[1]);
    }),
  );

  if (!vrfs.length) {
    return "";
  }

  return vrfs.length === 1
    ? `${vrfs[0]}`
    : vrfs.join(", ");
}

function extractStructuredVrfs(messages) {
  return dedupe(
    messages.flatMap((message) => {
      const matches = [...String(message).matchAll(/\bVRF\s+([A-Za-z0-9_-]+)/gi)];
      return matches.map((match) => match[1]);
    }),
  );
}

function extractNeighborIps(messages) {
  const ips = dedupe(
    messages.flatMap((message) => {
      const matches = [...message.matchAll(/\bNeighbor\s+(\d{1,3}(?:\.\d{1,3}){3})/gi)];
      return matches.map((match) => match[1]);
    }),
  );

  return ips.join(", ");
}

function extractStructuredNeighborIps(messages) {
  return dedupe(
    messages.flatMap((message) => {
      const matches = [
        ...String(message).matchAll(/\bNeighbor\s+(\d{1,3}(?:\.\d{1,3}){3})/gi),
      ];
      return matches.map((match) => match[1]);
    }),
  );
}

function buildRoutingTableFeedback(messages, ruleTemplate, activityType) {
  const vrfs = extractVrfsFromMessages(messages);
  const zeroDynamicMatch = messages.find((message) =>
    /only\s+0\s+learned dynamically|does not have ipv4 routes learned via dynamic protocols/i.test(
      message,
    ),
  );

  if (zeroDynamicMatch) {
    return `The VRF ${vrfs} ${resolveRuleAction(ruleTemplate, activityType)}`;
  }

  const zeroRouteVrfs = dedupe(
    messages.flatMap((message) => {
      const matches = [
        ...message.matchAll(/Number of ipv4 routes in vrf\s+([A-Za-z0-9_-]+):\s*0/gi),
      ];
      return matches.map((match) => match[1]);
    }),
  );

  if (zeroRouteVrfs.length) {
    return `The VRF ${zeroRouteVrfs.join(", ")} has 0 routes. This does not qualify for a problem. It is advised to check routing table entries from previous backups vs present for comparison.`;
  }

  return `The VRF ${vrfs} ${resolveRuleAction(ruleTemplate, activityType)}`;
}

function classifyFwdUtilization(messages) {
  const utilization = extractUtilizationValue(messages);

  if (utilization > 90) {
    return "show-stopper";
  }

  if (utilization >= 80) {
    return "major";
  }

  return "minor";
}

function classifyBgpMemory(messages) {
  const utilization = extractPercentValue(messages);

  if (utilization > 90) {
    return "show-stopper";
  }

  if (utilization > 80) {
    return "major";
  }

  return "minor";
}

function classifyCpuStatus(messages) {
  const utilization = extractPercentValue(messages);

  if (utilization > 90) {
    return "show-stopper";
  }

  if (utilization > 80) {
    return "major";
  }

  if (utilization > 70) {
    return "minor";
  }

  return "minor";
}

function extractUtilizationValue(messages) {
  for (const message of messages) {
    const match = message.match(/Actual utilization\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }

  return 0;
}

function extractPercentValue(messages) {
  for (const message of messages) {
    const match = message.match(/([0-9]+(?:\.[0-9]+)?)%/);
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }

  return 0;
}

function extractFwdUtilizationLine(messages) {
  const match = messages.find((message) =>
    /Actual utilization\s+[0-9]+(?:\.[0-9]+)?/i.test(message),
  );

  return match || messages[0] || "";
}

function buildSnmpFeedback(messages, ruleTemplate, activityType) {
  const hasUnknownCommunity = messages.some((message) =>
    /unknown community/i.test(message),
  );

  if (hasUnknownCommunity) {
    return resolveRuleAction(ruleTemplate, activityType);
  }

  return "";
}

function buildBgpMemoryFeedback(messages, ruleTemplate, activityType) {
  const percentLine = messages.find((message) => /[0-9]+(?:\.[0-9]+)?%/.test(message)) || messages[0] || "";
  const percentMatch = percentLine.match(/([0-9]+(?:\.[0-9]+)?)%/);
  const percentValue = percentMatch ? `${percentMatch[1]}%` : "unknown";

  return `BGP utilization is ${percentValue}\n${resolveRuleAction(ruleTemplate, activityType)}`;
}

function buildSmuFeedback(checkName, messages, ruleTemplate, activityType) {
  const base = resolveRuleAction(ruleTemplate, activityType);

  if (checkName === "checkActiveSmu") {
    return `${base}\n${summarizeActiveSmuMessages(messages)}`.trim();
  }

  if (checkName === "checkSmuOrder") {
    return `${base}\n${summarizeSmuOrderMessages(messages)}`.trim();
  }

  return `${base}\n${summarizeSmuMessages(messages)}`.trim();
}

function buildLogsFibFeedback(logFiles, ruleTemplate, activityType) {
  const fibLogFile = findLogFileByNameFragment(
    logFiles,
    "show_logging_logfile_pipe_grep_FIB_pipe_grep",
  );
  const fibLines = extractFibLogLines(fibLogFile?.content || "");
  const baseFeedback = resolveRuleAction(ruleTemplate, activityType);

  if (!fibLines.length) {
    return baseFeedback;
  }

  return `${baseFeedback}\n${fibLines.join("\n")}`;
}

function findLogFileByNameFragment(logFiles, fragment) {
  const normalizedFragment = fragment.toLowerCase();

  return (
    logFiles.find((file) => file.name.toLowerCase().includes(normalizedFragment)) ||
    logFiles.find((file) => file.relativePath?.toLowerCase().includes(normalizedFragment)) ||
    null
  );
}

function extractFibLogLines(content) {
  if (!content.trim()) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.trim().startsWith("#"))
    .filter((line) => !line.trim().startsWith("###"))
    .filter((line) => /\bFIB\b/i.test(line))
    .slice(-4);
}

function summarizeTailMessages(messages) {
  return dedupe(messages)
    .slice(0, 8)
    .join(" ");
}

function compactInterfaceList(messages) {
  const ethernetMatches = dedupe(
    messages.flatMap((message) => {
      const longMatches = message.match(/Ethernet\d+\/\d+(?:\.\d+)?/gi) || [];
      const shortMatches = message.match(/\bEth\d+\/\d+(?:\.\d+)?/gi) || [];
      return [...longMatches, ...shortMatches].map(normalizeInterfaceLabel);
    }),
  );

  if (!ethernetMatches.length) {
    return "";
  }

  const groups = new Map();

  ethernetMatches.forEach((name) => {
    const match = name.match(/^Ethernet(\d+)\/(\d+)(?:\.(\d+))?$/i);
    if (!match) {
      return;
    }

    const module = match[1];
    const port = Number(match[2]);
    const subinterface = match[3] || "";

    if (subinterface) {
      if (!groups.has(`${module}.sub`)) {
        groups.set(`${module}.sub`, []);
      }
      groups.get(`${module}.sub`).push(`${port}.${subinterface}`);
      return;
    }

    if (!groups.has(module)) {
      groups.set(module, []);
    }
    groups.get(module).push(port);
  });

  return [...groups.entries()]
    .map(([module, ports]) => {
      if (module.endsWith(".sub")) {
        const normalizedModule = module.replace(/\.sub$/, "");
        return ports
          .map((port) => `Ethernet${normalizedModule}/${port}`)
          .join(", ");
      }

      const uniquePorts = [...new Set(ports)].sort((left, right) => left - right);
      return formatPortRanges(module, uniquePorts);
    })
    .join(", ");
}

function extractInterfaceNames(messages) {
  const interfaces = dedupe(
    messages.flatMap((message) => {
      const ethernetMatches = message.match(/Ethernet\d+\/\d+(?:\.\d+)?/gi) || [];
      const shortEthernetMatches = message.match(/\bEth\d+\/\d+(?:\.\d+)?/gi) || [];
      const l3Matches = message.match(/\bLo\d+\b/gi) || [];
      const portChannelMatches = message.match(/port-channel\d+/gi) || [];
      return [
        ...ethernetMatches,
        ...shortEthernetMatches.map(normalizeInterfaceLabel),
        ...l3Matches,
        ...portChannelMatches,
      ];
    }),
  );

  return interfaces.join(", ");
}

function extractStructuredInterfaceNames(messages) {
  return dedupe(
    messages.flatMap((message) => {
      const ethernetMatches = String(message).match(/Ethernet\d+\/\d+(?:\.\d+)?/gi) || [];
      const shortEthernetMatches = String(message).match(/\bEth\d+\/\d+(?:\.\d+)?/gi) || [];
      const l3Matches = String(message).match(/\bLo\d+\b/gi) || [];
      const portChannelMatches = String(message).match(/port-channel\d+/gi) || [];
      return [
        ...ethernetMatches,
        ...shortEthernetMatches.map(normalizeInterfaceLabel),
        ...l3Matches,
        ...portChannelMatches,
      ];
    }),
  );
}

function normalizeInterfaceLabel(name) {
  if (/^Eth\d+\/\d+(?:\.\d+)?$/i.test(name)) {
    return name.replace(/^Eth/i, "Ethernet");
  }

  return name;
}

function formatPortRanges(module, ports) {
  const ranges = [];
  let start = ports[0];
  let previous = ports[0];

  for (let index = 1; index <= ports.length; index += 1) {
    const current = ports[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    if (start === previous) {
      ranges.push(`${module}/${start}`);
    } else {
      ranges.push(`${module}/${start}-${previous}`);
    }

    start = current;
    previous = current;
  }

  return `Ethernet${ranges.join(", ")}`;
}

function formatNumericRanges(values) {
  const ranges = [];
  let start = values[0];
  let previous = values[0];

  for (let index = 1; index <= values.length; index += 1) {
    const current = values[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    if (start === previous) {
      ranges.push(String(start));
    } else {
      ranges.push(`${start}-${previous}`);
    }

    start = current;
    previous = current;
  }

  return ranges.join(", ");
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function replaceCustomerName(text) {
  return text.replace(/\bJPMC\b/g, "Customer");
}

function extractBugIdsFromText(text) {
  return dedupe(String(text || "").match(/\bCSC[a-z]{1,3}\d{5}\b/gi) || []);
}

function extractCommandTokensFromText(text) {
  return dedupe(
    (String(text || "").match(/\b(show|grep|bash|rpm|lacp|logging|bootflash|epld|arp|bgp|route|policy-map)\b/gi) || [])
      .map((token) => token.toLowerCase()),
  );
}

function countSharedValues(leftValues, rightValues) {
  if (!leftValues.length || !rightValues.length) {
    return 0;
  }

  const rightSet = new Set(rightValues.map((value) => String(value).toLowerCase()));
  return dedupe(leftValues.map((value) => String(value).toLowerCase())).reduce(
    (total, value) => total + (rightSet.has(value) ? 1 : 0),
    0,
  );
}

function countTokenOverlap(leftText, rightText) {
  const leftTokens = new Set(tokenize(leftText));
  const rightTokens = new Set(tokenize(rightText));
  let overlap = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function truncateSentence(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

function summarizeImpact(findings) {
  if (findings.some((finding) => finding.severity === "high")) {
    return "high";
  }

  if (findings.some((finding) => finding.severity === "medium")) {
    return "medium";
  }

  return "low";
}

function buildOutput({
  deviceFolder,
  reportData,
  findings,
  missedChecks,
  impactLevel,
  activityType,
}) {
  const activity = activityProfiles[activityType];
  const minorFindings = findings.filter((finding) => finding.classification === "minor");
  const majorFindings = findings.filter((finding) => finding.classification === "major");
  const showStopperFindings = findings.filter(
    (finding) => finding.classification === "show-stopper",
  );
  const totalFails = findings.length;
  const summaryLabel = {
    high: "Potential impact identified",
    medium: "Review recommended before proceeding",
    low: "No major impact inferred from FAIL items",
  }[impactLevel];

  const header = [
    reportData.hostname || deviceFolder.hostname,
  ];

  header.push("");

  if (!totalFails) {
    const emptyMessage =
      "No FAIL items were detected in the uploaded files. Review the source file format if failures were expected.";
    return {
      hostname: reportData.hostname || deviceFolder.hostname,
      combined: [...header, emptyMessage].join("\n"),
      showStopper: "Show stopper checks\n-------------------\nNone",
      major: "Major checks\n------------\nNone",
      minor: "Minor checks\n------------\nNone",
      missed: missedChecks.map((finding) => finding.checkName).join("\n"),
    };
  }

  const showStopperSection = buildFeedbackSection(
    "Show stopper checks",
    showStopperFindings,
  );
  const minorSection = buildFeedbackSection("Minor checks", minorFindings);
  const majorSection = buildFeedbackSection("Major checks", majorFindings);
  const footer = [
    "Recommendation",
    "--------------",
    buildRecommendationLine(impactLevel, activity.label),
    `Summary: ${summaryLabel}`,
    `Report source: RESULTS/${reportData.reportName}`,
  ];

  return {
    hostname: reportData.hostname || deviceFolder.hostname,
    combined: [
      ...header,
      ...showStopperSection,
      ...majorSection,
      ...minorSection,
      "",
      ...footer,
    ].join("\n"),
    showStopper: showStopperSection.join("\n").trim(),
    minor: minorSection.join("\n").trim(),
    major: majorSection.join("\n").trim(),
    missed: missedChecks.length
      ? missedChecks.map((finding, index) => `${index + 1}. ${finding.checkName}`).join("\n")
      : "None",
  };
}

function buildFeedbackSection(title, findings) {
  const lines = [title, "-".repeat(title.length)];

  if (!findings.length) {
    lines.push("None", "");
    return lines;
  }

  findings.forEach((finding, index) => {
    const section = [`${index + 1}. ${finding.checkName}`, finding.feedback];

    section.push("");
    lines.push(...section);
  });

  return lines;
}

function buildRecommendationLine(impactLevel, activityLabel) {
  if (impactLevel === "high") {
    return `One or more FAIL items appear relevant to the planned ${activityLabel.toLowerCase()}. Review and disposition these items before the maintenance window.`;
  }

  if (impactLevel === "medium") {
    return `The FAIL items are not automatically blocking, but they should be checked against the exact ${activityLabel.toLowerCase()} scope before approval.`;
  }

  return `The FAIL items do not appear to present a strong direct impact to the planned ${activityLabel.toLowerCase()}, though standard manual validation is still recommended.`;
}

function renderAnalysis(analysis) {
  failCountEl.textContent = String(analysis.minorCount);
  impactBadgeEl.textContent = String(analysis.majorCount);
  showStopperCountEl.textContent = String(analysis.showStopperCount);
  currentDownloadHostname = analysis.output.hostname || "";
  impactBadgeEl.dataset.level =
    analysis.showStopperCount > 0 || analysis.majorCount > 0 ? "high" : "low";
  showStopperOutputTextInput.value = analysis.output.showStopper;
  minorOutputTextInput.value = analysis.output.minor;
  majorOutputTextInput.value = analysis.output.major;
  missedChecksTextInput.value = analysis.output.missed;
  downloadButton.disabled = !buildDownloadContent().trim();
}

function buildDownloadContent() {
  const showStopper = showStopperOutputTextInput.value.trim();
  const minor = minorOutputTextInput.value.trim();
  const major = majorOutputTextInput.value.trim();
  const hostname = currentDownloadHostname.trim();

  return [
    hostname,
    showStopper,
    major,
    minor,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function sanitizeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "") || "switch";
}
