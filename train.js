const trainingLogsInput = document.querySelector("#trainingLogs");
const trainingLogTextInput = document.querySelector("#trainingLogText");
const trainingFeedbackInput = document.querySelector("#trainingFeedback");
const trainingFeedbackTextInput = document.querySelector("#trainingFeedbackText");
const trainingNotesInput = document.querySelector("#trainingNotes");
const autoMapTrainingButton = document.querySelector("#autoMapTrainingButton");
const saveTrainingButton = document.querySelector("#saveTrainingButton");
const trainingStatusEl = document.querySelector("#trainingStatus");
const mappingSummaryEl = document.querySelector("#mappingSummary");
const uncertainMappingPanel = document.querySelector("#uncertainMappingPanel");
const uncertainMappingsEl = document.querySelector("#uncertainMappings");
const buildApiUrl =
  window.APP_CONFIG?.buildApiUrl || ((resource) => `/api/${String(resource || "").replace(/^\/+/, "")}`);

let pendingTrainingState = null;

initializeTrainingPage();

autoMapTrainingButton.addEventListener("click", async () => {
  const existingLibrary = await loadTrainingLibraryData();
  const trainingExamples = Array.isArray(existingLibrary?.examples)
    ? existingLibrary.examples
    : [];
  const deviceResults = await collectTrainingEntries({
    textValue: trainingLogTextInput.value,
    files: trainingLogsInput.files,
    fallbackPrefix: "pasted-device-result",
  });
  const manualFeedback = await collectTrainingEntries({
    textValue: trainingFeedbackTextInput.value,
    files: trainingFeedbackInput.files,
    fallbackPrefix: "pasted-manual-feedback",
  });

  if (!deviceResults.length || !manualFeedback.length) {
    window.alert(
      "Please provide at least one device result and one manual feedback entry.",
    );
    return;
  }

  if (deviceResults.length !== manualFeedback.length) {
    window.alert(
      "The number of device results and manual feedback entries must match so they can be paired.",
    );
    return;
  }

  const autoMappedPairs = deviceResults.map((deviceResult, index) =>
    autoMapTrainingPair({
      deviceResult,
      manualFeedback: manualFeedback[index],
      pairIndex: index,
      trainingExamples,
    }),
  );

  const confirmedMappings = autoMappedPairs.flatMap((pair) => pair.confirmedMappings);
  const uncertainMappings = autoMappedPairs.flatMap((pair) => pair.uncertainMappings);
  const skippedPairs = autoMappedPairs.filter((pair) => pair.failBlocks.length === 0);
  const blockById = Object.fromEntries(
    autoMappedPairs.flatMap((pair) =>
      pair.failBlocks.map((block) => [block.id, block]),
    ),
  );

  pendingTrainingState = {
    createdAt: new Date().toISOString(),
    notes: trainingNotesInput.value.trim(),
    confirmedMappings,
    uncertainMappings,
    blockById,
  };

  saveTrainingButton.disabled =
    confirmedMappings.length === 0 && uncertainMappings.length === 0;

  if (skippedPairs.length) {
    trainingStatusEl.textContent =
      `${skippedPairs.length} report pair(s) did not produce any failed check blocks and were skipped.`;
  } else {
    trainingStatusEl.textContent =
      "Auto-map complete. Review any uncertain mappings below, then save the mapped training examples.";
  }

  renderPendingTrainingState(pendingTrainingState);
});

saveTrainingButton.addEventListener("click", async () => {
  if (!pendingTrainingState) {
    window.alert("Run Auto-map past cases first.");
    return;
  }

  const reviewedExamples = buildReviewedExamples(pendingTrainingState);

  if (!reviewedExamples.length) {
    window.alert("No mapped training examples are ready to save.");
    return;
  }

  const existingLibrary = await loadTrainingLibraryData();
  const trainingLibrary = {
    savedAt: new Date().toISOString(),
    notes: [existingLibrary?.notes, trainingNotesInput.value.trim()]
      .filter(Boolean)
      .join(" | "),
    examples: [...(existingLibrary?.examples || []), ...reviewedExamples],
  };

  const response = await fetch(buildApiUrl("training-library"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(trainingLibrary),
  });

  if (!response.ok) {
    window.alert("Unable to save the training library.");
    return;
  }

  pendingTrainingState = null;
  saveTrainingButton.disabled = true;
  renderPendingTrainingState(null);
  renderTrainingStatus(trainingLibrary, `${reviewedExamples.length} mapped example(s) saved.`);
});

function initializeTrainingPage() {
  resetTrainingInputs();
  saveTrainingButton.disabled = true;
  renderPendingTrainingState(null);
  if (trainingFeedbackTextInput) {
    trainingFeedbackTextInput.addEventListener("paste", handleManualFeedbackPaste);
  }
  void loadTrainingLibrary();
}

window.addEventListener("pageshow", () => {
  resetTrainingInputs();
  pendingTrainingState = null;
  saveTrainingButton.disabled = true;
  renderPendingTrainingState(null);
});

async function collectTrainingEntries({ textValue, files, fallbackPrefix }) {
  const entries = [];
  const trimmedText = textValue.trim();

  if (trimmedText) {
    entries.push({
      name: `${fallbackPrefix}.txt`,
      content: trimmedText,
    });
  }

  if (files?.length) {
    const uploadedFiles = await Promise.all(
      [...files].map(async (file) => ({
        name: file.name,
        content: await file.text(),
      })),
    );

    entries.push(...uploadedFiles);
  }

  return entries;
}

async function loadTrainingLibrary() {
  const trainingLibrary = await loadTrainingLibraryData();
  renderTrainingStatus(trainingLibrary);
}

async function loadTrainingLibraryData() {
  try {
    const response = await fetch(buildApiUrl("training-library"));

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function renderTrainingStatus(trainingLibrary, overrideMessage = "") {
  if (overrideMessage) {
    trainingStatusEl.textContent = overrideMessage;
    return;
  }

  if (!trainingLibrary) {
    trainingStatusEl.textContent = "No training library saved yet.";
    return;
  }

  const notesSuffix = trainingLibrary.notes
    ? ` Notes: ${trainingLibrary.notes}`
    : "";
  trainingStatusEl.textContent =
    `${trainingLibrary.examples.length} training example(s) saved.` +
    notesSuffix;
}

function resetTrainingInputs() {
  if (trainingLogTextInput) {
    trainingLogTextInput.value = "";
  }
  if (trainingLogsInput) {
    trainingLogsInput.value = "";
  }
  if (trainingFeedbackTextInput) {
    trainingFeedbackTextInput.value = "";
  }
  if (trainingFeedbackInput) {
    trainingFeedbackInput.value = "";
  }
  if (trainingNotesInput) {
    trainingNotesInput.value = "";
  }
}

function renderPendingTrainingState(state) {
  uncertainMappingsEl.innerHTML = "";

  if (!state) {
    uncertainMappingPanel.hidden = true;
    mappingSummaryEl.textContent =
      "Upload one or more report/feedback pairs, then run auto-map to review uncertain mappings only.";
    return;
  }

  const confirmedMappings = state.confirmedMappings || [];
  const uncertainCount = state.uncertainMappings.length;
  saveTrainingButton.disabled = confirmedMappings.length === 0 && uncertainCount === 0;
  mappingSummaryEl.textContent =
    `${confirmedMappings.length} high-confidence mapping(s) are ready. ${uncertainCount} uncertain mapping(s) need review.`;

  if (!uncertainCount) {
    uncertainMappingPanel.hidden = true;
    return;
  }

  uncertainMappingPanel.hidden = false;
  state.uncertainMappings.forEach((mapping) => {
    uncertainMappingsEl.append(buildUncertainMappingCard(mapping, state.blockById));
  });
}

function buildUncertainMappingCard(mapping, blockById) {
  const article = document.createElement("article");
  article.className = "mapping-card";
  article.dataset.mappingId = mapping.id;

  const title = document.createElement("h3");
  title.textContent = `${mapping.pairLabel} • Feedback item ${mapping.feedbackIndex}`;
  article.append(title);

  const meta = document.createElement("div");
  meta.className = "mapping-meta";
  meta.innerHTML = `
    <span class="confidence-pill ${mapping.confidenceLabel}">${capitalize(mapping.confidenceLabel)} confidence</span>
    <span>Suggested check: ${mapping.suggestedCheckName || "No confident match"}</span>
    <span>Score: ${mapping.score}</span>
  `;
  article.append(meta);

  if (mapping.trainingLibraryInfluence?.influenced) {
    const trainingHint = document.createElement("p");
    trainingHint.className = "helper-text";
    trainingHint.textContent =
      `Suggestion influenced by ${mapping.trainingLibraryInfluence.matchCount} saved training example(s) for ` +
      `${mapping.suggestedCheckName}.`;
    article.append(trainingHint);
  }

  article.append(
    buildTextBlock("Manual feedback item", mapping.feedbackText),
  );

  const selectLabel = document.createElement("label");
  selectLabel.className = "field compact-field";

  const selectTitle = document.createElement("span");
  selectTitle.textContent = "Choose matching failed check";
  selectLabel.append(selectTitle);

  const select = document.createElement("select");
  select.className = "viewer-box";
  select.dataset.mappingId = mapping.id;

  const skipOption = document.createElement("option");
  skipOption.value = "__skip__";
  skipOption.textContent = "Skip this feedback item";
  select.append(skipOption);

  getSelectableCandidates(mapping, blockById).forEach((candidate) => {
    const option = document.createElement("option");
    option.value = candidate.blockId;
    option.textContent = `${candidate.checkName} • ${truncateText(candidate.summary, 110)}`;
    if (candidate.blockId === mapping.selectedBlockId) {
      option.selected = true;
    }
    select.append(option);
  });

  selectLabel.append(select);
  article.append(selectLabel);

  const blockPreview = buildTextBlock(
    "Selected failed check block",
    describeSelectedBlock(blockById[mapping.selectedBlockId]),
  );
  blockPreview.dataset.previewFor = mapping.id;
  article.append(blockPreview);

  select.addEventListener("change", () => {
    mapping.selectedBlockId = select.value;
    resolveManualSelectionConflict(mapping.id, select.value);
    const preview = uncertainMappingsEl.querySelector(
      `[data-preview-for="${mapping.id}"] pre`,
    );
    if (!preview) {
      return;
    }

    preview.textContent =
      select.value === "__skip__"
        ? "This feedback item will be skipped and not saved to the training library."
        : describeSelectedBlock(blockById[select.value]);
  });

  if (mapping.confidenceLabel === "low") {
    const actions = document.createElement("div");
    actions.className = "actions compact-actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removePendingMapping(mapping.id);
    });

    actions.append(removeButton);
    article.append(actions);
  }

  return article;
}

function getSelectableCandidates(mapping, blockById) {
  const scoredCandidates = mapping.candidates || [];
  const scoredCandidateIds = new Set(scoredCandidates.map((candidate) => candidate.blockId));
  const pairBlocks = Object.values(blockById).filter(
    (block) => block?.pairIndex === mapping.pairMeta?.pairIndex,
  );
  const remainingBlocks = pairBlocks
    .filter((block) => !scoredCandidateIds.has(block.id))
    .map((block) => ({
      blockId: block.id,
      checkName: block.checkName,
      summary: block.line || block.context || block.checkName,
      trainingLibraryInfluence: null,
    }));

  return [...scoredCandidates, ...remainingBlocks];
}

function buildTextBlock(label, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "mapping-block";

  const title = document.createElement("strong");
  title.textContent = label;
  wrapper.append(title);

  const pre = document.createElement("pre");
  pre.textContent = text || "None";
  wrapper.append(pre);

  return wrapper;
}

function buildReviewedExamples(state) {
  syncPendingSelections(state);
  const reviewedExamples = (state.confirmedMappings || []).map((mapping) =>
    createTrainingExample({
      pairMeta: mapping.pairMeta,
      block: state.blockById[mapping.selectedBlockId],
      feedbackText: mapping.feedbackText,
      confidenceLabel: mapping.confidenceLabel,
      confidenceScore: mapping.score,
      mappingMethod: "auto-map",
    }),
  );

  state.uncertainMappings.forEach((mapping) => {
    if (!mapping.selectedBlockId || mapping.selectedBlockId === "__skip__") {
      return;
    }

    const block = state.blockById[mapping.selectedBlockId];
    if (!block) {
      return;
    }

    reviewedExamples.push(
      createTrainingExample({
        pairMeta: mapping.pairMeta,
        block,
        feedbackText: mapping.feedbackText,
        confidenceLabel: mapping.confidenceLabel,
        confidenceScore: mapping.score,
        mappingMethod: "reviewed-auto-map",
      }),
    );
  });

  return reviewedExamples;
}

function syncPendingSelections(state) {
  if (!state?.uncertainMappings?.length) {
    return;
  }

  state.uncertainMappings.forEach((mapping) => {
    const select = uncertainMappingsEl.querySelector(
      `select[data-mapping-id="${mapping.id}"]`,
    );

    if (select) {
      mapping.selectedBlockId = select.value;
    }
  });
}

function removePendingMapping(mappingId) {
  if (!pendingTrainingState) {
    return;
  }

  syncPendingSelections(pendingTrainingState);
  pendingTrainingState.uncertainMappings = pendingTrainingState.uncertainMappings.filter(
    (mapping) => mapping.id !== mappingId,
  );
  renderPendingTrainingState(pendingTrainingState);
}

function resolveManualSelectionConflict(mappingId, selectedBlockId) {
  if (!pendingTrainingState || !selectedBlockId || selectedBlockId === "__skip__") {
    return;
  }

  syncPendingSelections(pendingTrainingState);
  const conflictingMappingIndex = (pendingTrainingState.confirmedMappings || []).findIndex(
    (mapping) => mapping.selectedBlockId === selectedBlockId,
  );

  if (conflictingMappingIndex < 0) {
    return;
  }

  const [releasedMapping] = pendingTrainingState.confirmedMappings.splice(
    conflictingMappingIndex,
    1,
  );

  pendingTrainingState.uncertainMappings.push({
    ...releasedMapping,
    id: `${releasedMapping.id}-released`,
    confidenceLabel: "low",
    score: 0,
    suggestedCheckName: "",
    selectedBlockId: "__skip__",
    trainingLibraryInfluence: null,
  });

  renderPendingTrainingState(pendingTrainingState);
}

function autoMapTrainingPair({
  deviceResult,
  manualFeedback,
  pairIndex,
  trainingExamples = [],
}) {
  const parsedReport = parseTrainingReport(deviceResult.content, deviceResult.name);
  const failBlocks = parsedReport.failItems.map((block, index) => ({
    ...block,
    id: `pair-${pairIndex + 1}-block-${index + 1}`,
    pairIndex,
  }));
  const feedbackItems = splitManualFeedback(
    manualFeedback.content,
    parsedReport.hostname,
  ).map((item, index) => ({
    ...item,
    id: `pair-${pairIndex + 1}-feedback-${index + 1}`,
    index: index + 1,
  }));

  if (!failBlocks.length || !feedbackItems.length) {
    return {
      hostname: parsedReport.hostname || deviceResult.name,
      failBlocks,
      confirmedMappings: [],
      uncertainMappings: [],
    };
  }

  const mappingResults = assignMappings(feedbackItems, failBlocks, trainingExamples);
  const pairMeta = {
    pairIndex,
    hostname: parsedReport.hostname,
    deviceResultName: deviceResult.name,
    manualFeedbackName: manualFeedback.name,
  };

  const confirmedMappings = [];
  const uncertainMappings = [];

  mappingResults.forEach((mapping) => {
    if (mapping.confidenceLabel === "high" && mapping.selectedCandidate) {
      confirmedMappings.push({
        id: mapping.feedbackItem.id,
        pairLabel: `${pairMeta.deviceResultName} -> ${pairMeta.manualFeedbackName}`,
        pairMeta,
        feedbackIndex: mapping.feedbackItem.index,
        feedbackText: mapping.feedbackItem.text,
        confidenceLabel: mapping.confidenceLabel,
        score: mapping.score,
        suggestedCheckName: mapping.selectedCandidate.checkName || "",
        selectedBlockId: mapping.selectedCandidate.blockId || "__skip__",
        trainingLibraryInfluence: mapping.selectedCandidate.trainingLibraryInfluence || null,
        candidates: mapping.candidates.map((candidate) => ({
          blockId: candidate.blockId,
          checkName: candidate.checkName,
          summary: candidate.summary,
          trainingLibraryInfluence: candidate.trainingLibraryInfluence || null,
        })),
      });
      return;
    }

    uncertainMappings.push({
      id: mapping.feedbackItem.id,
      pairLabel: `${pairMeta.deviceResultName} -> ${pairMeta.manualFeedbackName}`,
      pairMeta,
      feedbackIndex: mapping.feedbackItem.index,
      feedbackText: mapping.feedbackItem.text,
      confidenceLabel: mapping.confidenceLabel,
      score: mapping.score,
      suggestedCheckName: mapping.selectedCandidate?.checkName || "",
      selectedBlockId: mapping.selectedCandidate?.blockId || "__skip__",
      trainingLibraryInfluence: mapping.selectedCandidate?.trainingLibraryInfluence || null,
      candidates: mapping.candidates.map((candidate) => ({
        blockId: candidate.blockId,
        checkName: candidate.checkName,
        summary: candidate.summary,
        trainingLibraryInfluence: candidate.trainingLibraryInfluence || null,
      })),
    });
  });

  return {
    hostname: parsedReport.hostname,
    failBlocks,
    confirmedMappings,
    uncertainMappings,
  };
}

function assignMappings(feedbackItems, failBlocks, trainingExamples = []) {
  const rankedItems = feedbackItems
    .map((feedbackItem) => ({
      feedbackItem,
      candidates: scoreCandidates(feedbackItem, failBlocks, trainingExamples),
    }))
    .sort(
      (left, right) =>
        (right.candidates[0]?.score || 0) - (left.candidates[0]?.score || 0),
    );

  const usedBlocks = new Set();
  const mappings = [];

  rankedItems.forEach((entry) => {
    const candidateToReview =
      entry.candidates.find((candidate) => !usedBlocks.has(candidate.blockId)) ||
      null;

    const selectedCandidate =
      candidateToReview && candidateToReview.score >= 8 ? candidateToReview : null;

    if (selectedCandidate?.blockId) {
      usedBlocks.add(selectedCandidate.blockId);
    }

    const secondCandidate = entry.candidates.find(
      (candidate) => candidate.blockId !== candidateToReview?.blockId,
    );
    const score = selectedCandidate?.score || 0;

    mappings.push({
      feedbackItem: entry.feedbackItem,
      candidates: entry.candidates,
      selectedCandidate,
      score,
      confidenceLabel: determineConfidenceLabel(score, secondCandidate?.score || 0),
    });
  });

  return mappings.sort(
    (left, right) => left.feedbackItem.index - right.feedbackItem.index,
  );
}

function scoreCandidates(feedbackItem, failBlocks, trainingExamples = []) {
  return failBlocks
    .map((block) => {
      const blockSourceText = buildBlockSourceText(block);
      return {
        blockId: block.id,
        block,
        checkName: block.checkName,
        summary: block.line || block.context || block.checkName,
        ...scoreFeedbackAgainstBlock(
          feedbackItem,
          block,
          blockSourceText,
          trainingExamples,
        ),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function scoreFeedbackAgainstBlock(
  feedbackItem,
  block,
  blockSourceText,
  trainingExamples = [],
) {
  const feedbackText = feedbackItem.text || "";
  const feedbackSummary = feedbackItem.summaryLine || feedbackItem.lines?.[0] || "";
  const feedbackDetails = (feedbackItem.detailLines || []).join("\n");
  const feedbackLower = normalizeText(feedbackText);
  const summaryLower = normalizeText(feedbackSummary);
  const detailLower = normalizeText(feedbackDetails);
  const blockLower = normalizeText(blockSourceText);
  const blockMessageText = (block.messageLines || []).join("\n");
  const blockDescriptionText = (block.descriptionLines || []).join("\n");
  const blockMessageLower = normalizeText(blockMessageText);
  const blockDescriptionLower = normalizeText(blockDescriptionText);
  const checkTokens = extractCheckTokens(block.checkName);
  const feedbackTokens = tokenize(feedbackLower);
  const feedbackSummaryTokens = tokenize(feedbackSummary);
  const feedbackDetailTokens = tokenize(feedbackDetails);
  const blockTokens = tokenize(blockLower);
  const blockMessageTokens = tokenize(blockMessageText);
  const blockDescriptionTokens = tokenize(blockDescriptionText);
  const feedbackInterfaces = extractInterfaces(feedbackText);
  const blockInterfaces = extractInterfaces(blockSourceText);
  const feedbackVrfs = extractVrfs(feedbackText);
  const blockVrfs = extractVrfs(blockSourceText);
  const feedbackIps = extractIpAddresses(feedbackText);
  const blockIps = extractIpAddresses(blockSourceText);
  const feedbackModules = extractModuleIds(feedbackText);
  const blockModules = extractModuleIds(blockSourceText);
  const feedbackClassMaps = extractClassMaps(feedbackText);
  const blockClassMaps = extractClassMaps(blockSourceText);
  const feedbackBugIds = extractBugIds(feedbackText);
  const blockBugIds = extractBugIds(blockSourceText);
  const feedbackFeatures = extractFeatureNames(feedbackText);
  const blockFeatures = extractFeatureNames(blockSourceText);
  const feedbackCommandTokens = extractCommandTokens(feedbackText);
  const blockCommandTokens = extractCommandTokens(blockSourceText);

  let score = 0;

  score += countOverlap(feedbackTokens, blockTokens);
  score += countOverlap(feedbackSummaryTokens, blockMessageTokens) * 4;
  score += countOverlap(feedbackSummaryTokens, blockDescriptionTokens) * 2;
  score += countOverlap(feedbackDetailTokens, blockMessageTokens) * 3;
  score += countOverlap(feedbackDetailTokens, blockDescriptionTokens) * 2;
  score += countOverlap(checkTokens, feedbackTokens) * 6;
  score += countOverlap(feedbackInterfaces, blockInterfaces) * 14;
  score += countOverlap(feedbackVrfs, blockVrfs) * 12;
  score += countOverlap(feedbackIps, blockIps) * 16;
  score += countOverlap(feedbackModules, blockModules) * 10;
  score += countOverlap(feedbackClassMaps, blockClassMaps) * 14;
  score += countOverlap(feedbackBugIds, blockBugIds) * 16;
  score += countOverlap(feedbackFeatures, blockFeatures) * 10;
  score += countOverlap(feedbackCommandTokens, blockCommandTokens) * 4;

  if (feedbackLower.includes(block.checkName.toLowerCase())) {
    score += 18;
  }

  if (summaryLower && blockMessageLower.includes(summaryLower)) {
    score += 18;
  }

  if (detailLower && blockMessageLower.includes(detailLower)) {
    score += 10;
  }

  if (detailLower && blockDescriptionLower.includes(detailLower)) {
    score += 6;
  }

  if (
    checkTokens.length &&
    checkTokens.every((token) => feedbackLower.includes(token))
  ) {
    score += 8;
  }

  if (
    /manual check/i.test(feedbackText) &&
    /csc/i.test(blockSourceText)
  ) {
    score += 8;
  }

  const trainingLibraryInfluence = scoreTrainingLibraryMatch(
    feedbackItem,
    block,
    blockSourceText,
    trainingExamples,
  );
  score += trainingLibraryInfluence.score;

  return {
    score,
    trainingLibraryInfluence,
  };
}

function scoreTrainingLibraryMatch(
  feedbackItem,
  block,
  blockSourceText,
  trainingExamples,
) {
  if (!trainingExamples.length || !block.checkName) {
    return {
      score: 0,
      influenced: false,
      matchCount: 0,
      bestExampleScore: 0,
    };
  }

  const normalizedCheckName = normalizeCheckName(block.checkName).toLowerCase();
  const relevantExamples = trainingExamples.filter(
    (example) =>
      normalizeCheckName(example.checkName || "").toLowerCase() === normalizedCheckName,
  );

  if (!relevantExamples.length) {
    return {
      score: 0,
      influenced: false,
      matchCount: 0,
      bestExampleScore: 0,
    };
  }

  const feedbackText = feedbackItem.text || "";
  const feedbackLower = normalizeText(feedbackText);
  const blockLower = normalizeText(blockSourceText);

  const bestExampleScore = relevantExamples.reduce((bestScore, example) => {
    const exampleFeedback = String(example.manualFeedback || example.feedback || "");
    const exampleSource = String(
      example.sourceText ||
      example.deviceResult ||
      buildExampleSourceText(example),
    );
    const exampleFeedbackLower = normalizeText(exampleFeedback);
    const exampleSourceLower = normalizeText(exampleSource);

    let exampleScore = 0;
    exampleScore += countOverlap(tokenize(feedbackLower), tokenize(exampleFeedbackLower)) * 4;
    exampleScore += countOverlap(tokenize(blockLower), tokenize(exampleSourceLower)) * 3;
    exampleScore += countOverlap(
      extractInterfaces(feedbackText),
      extractInterfaces(exampleFeedback),
    ) * 8;
    exampleScore += countOverlap(
      extractVrfs(feedbackText),
      extractVrfs(exampleFeedback),
    ) * 7;
    exampleScore += countOverlap(
      extractIpAddresses(feedbackText),
      extractIpAddresses(exampleFeedback),
    ) * 8;
    exampleScore += countOverlap(
      extractBugIds(feedbackText),
      extractBugIds(exampleFeedback),
    ) * 10;
    exampleScore += countOverlap(
      extractCommandTokens(blockSourceText),
      extractCommandTokens(exampleSource),
    ) * 3;

    if (exampleFeedbackLower && feedbackLower.includes(exampleFeedbackLower)) {
      exampleScore += 14;
    }

    if (exampleSourceLower && blockLower.includes(exampleSourceLower)) {
      exampleScore += 12;
    }

    return Math.max(bestScore, exampleScore);
  }, 0);

  return {
    score: Math.min(bestExampleScore, 60),
    influenced: bestExampleScore > 0,
    matchCount: relevantExamples.length,
    bestExampleScore,
  };
}

function buildExampleSourceText(example) {
  return [
    `Check: ${example.checkName || ""}`,
    ...(Array.isArray(example.messageLines) ? example.messageLines : []),
    Array.isArray(example.descriptionLines) && example.descriptionLines.length
      ? `Description: ${example.descriptionLines.join(" | ")}`
      : "",
    example.commandHint ? `Command: ${example.commandHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function determineConfidenceLabel(score, secondScore) {
  if (score >= 26 && score - secondScore >= 8) {
    return "high";
  }

  if (score >= 16 && score - secondScore >= 4) {
    return "medium";
  }

  if (score >= 8) {
    return "low";
  }

  return "low";
}

function createTrainingExample({
  pairMeta,
  block,
  feedbackText,
  confidenceLabel,
  confidenceScore,
  mappingMethod,
}) {
  const normalizedFeedback = buildNormalizedFeedbackArtifacts({
    feedbackText,
    checkName: block.checkName,
    hostname: pairMeta.hostname || "",
    sourceText: buildBlockSourceText(block),
    messageLines: block.messageLines,
    commandHint: block.commandHint,
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type: "check-level-example",
    hostname: pairMeta.hostname || "",
    checkName: block.checkName,
    line: block.line,
    context: block.context,
    messageLines: block.messageLines,
    descriptionLines: block.descriptionLines,
    commandHint: block.commandHint,
    deviceResult: buildBlockSourceText(block),
    sourceText: buildBlockSourceText(block),
    deviceResultName: pairMeta.deviceResultName,
    manualFeedback: feedbackText.trim(),
    manualFeedbackTemplate: normalizedFeedback.template,
    manualFeedbackVariables: normalizedFeedback.variables,
    manualFeedbackName: pairMeta.manualFeedbackName,
    confidenceLabel,
    confidenceScore,
    mappingMethod,
  };
}

function buildNormalizedFeedbackArtifacts({
  feedbackText,
  checkName = "",
  hostname = "",
  sourceText = "",
  messageLines = [],
  commandHint = "",
}) {
  const rawFeedback = String(feedbackText || "").trim();
  const fallbackText = [...(messageLines || []), commandHint, sourceText]
    .filter(Boolean)
    .join("\n");
  const isStructuredExample = Boolean(checkName);
  const interfaces = pickNormalizedValues(
    extractInterfaces(rawFeedback),
    isStructuredExample ? extractInterfaces(fallbackText) : [],
  );
  const vrfs = pickNormalizedValues(
    extractVrfs(rawFeedback),
    isStructuredExample ? extractVrfs(fallbackText) : [],
  );
  const neighborIps = pickNormalizedValues(
    extractNeighborIps(rawFeedback),
    isStructuredExample ? extractNeighborIps(fallbackText) : [],
  );
  const ipAddresses = pickNormalizedValues(
    extractIpAddresses(rawFeedback),
    isStructuredExample ? extractIpAddresses(fallbackText) : [],
  );
  const moduleIds = pickNormalizedValues(
    extractModuleIds(rawFeedback),
    isStructuredExample ? extractModuleIds(fallbackText) : [],
  );
  const classMaps = pickNormalizedValues(
    extractClassMaps(rawFeedback),
    isStructuredExample ? extractClassMaps(fallbackText) : [],
  );
  const bugIds = pickNormalizedValues(
    extractBugIds(rawFeedback),
    isStructuredExample ? extractBugIds(fallbackText) : [],
  );
  const variables = {
    schemaVersion: 1,
    hostname: hostname || "",
    checkName: checkName || "",
    interfaces,
    vrfs,
    neighborIps,
    ipAddresses,
    moduleIds,
    classMaps,
    bugIds,
    commandTokens: extractCommandTokens([rawFeedback, commandHint].filter(Boolean).join("\n")),
    utilization: extractUtilization(rawFeedback) || (isStructuredExample ? extractUtilization(fallbackText) : ""),
  };

  if (!isStructuredExample) {
    return {
      template: rawFeedback,
      variables,
    };
  }

  return {
    template: buildFeedbackTemplate(rawFeedback, variables),
    variables,
  };
}

function normalizeTrainingLibraryExample(example) {
  const normalizedFeedback = buildNormalizedFeedbackArtifacts({
    feedbackText: example.manualFeedback || example.feedback || "",
    checkName: example.checkName || "",
    hostname: example.hostname || "",
    sourceText:
      example.sourceText ||
      example.deviceResult ||
      buildExampleSourceText(example),
    messageLines: Array.isArray(example.messageLines) ? example.messageLines : [],
    commandHint: example.commandHint || "",
  });

  return {
    ...example,
    manualFeedbackTemplate: normalizedFeedback.template,
    manualFeedbackVariables: normalizedFeedback.variables,
  };
}

function buildFeedbackTemplate(feedbackText, variables) {
  let template = String(feedbackText || "").trim();
  const replacements = [
    ...(variables.hostname ? [{ value: variables.hostname, placeholder: "{{hostname}}" }] : []),
    ...(variables.checkName ? [{ value: variables.checkName, placeholder: "{{check_name}}" }] : []),
    ...buildPhraseReplacements(variables.interfaces, "{{interfaces}}"),
    ...buildVrfsReplacements(variables.vrfs),
    ...buildPhraseReplacements(variables.neighborIps, "{{neighbor_ips}}"),
    ...buildPhraseReplacements(
      variables.ipAddresses.filter((ip) => !variables.neighborIps.includes(ip)),
      "{{ip_addresses}}",
    ),
    ...buildPhraseReplacements(variables.moduleIds, "{{module_ids}}"),
    ...buildPhraseReplacements(variables.classMaps, "{{class_maps}}"),
    ...buildPhraseReplacements(variables.bugIds, "{{bug_ids}}"),
    ...(variables.utilization
      ? [{ value: variables.utilization, placeholder: "{{utilization}}" }]
      : []),
  ]
    .filter((entry) => entry.value)
    .sort((left, right) => right.value.length - left.value.length);

  replacements.forEach(({ value, placeholder, regex }) => {
    if (!value) {
      return;
    }

    template = regex
      ? template.replace(regex, placeholder)
      : template.replaceAll(value, placeholder);
  });

  return template;
}

function buildPhraseReplacements(values, placeholder) {
  return dedupe(values).map((value) => ({
    value,
    placeholder,
  }));
}

function pickNormalizedValues(primaryValues, fallbackValues) {
  return primaryValues.length ? primaryValues : fallbackValues;
}

function buildVrfsReplacements(vrfs) {
  return dedupe(vrfs).flatMap((vrf) => ([
    {
      value: `VRF ${vrf}`,
      placeholder: "VRF {{vrfs}}",
      regex: new RegExp(`\\bVRF\\s+${escapeRegExp(vrf)}\\b`, "g"),
    },
    {
      value: `vrf ${vrf}`,
      placeholder: "vrf {{vrfs}}",
      regex: new RegExp(`\\bvrf\\s+${escapeRegExp(vrf)}\\b`, "g"),
    },
  ]));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTrainingReport(text, fallbackName) {
  const hostname = extractHostname(text) || fallbackName.replace(/\.txt$/i, "");
  const failItems = extractStructuredFailItems(text);

  return {
    hostname,
    failItems: failItems.map((item, index) => ({
      ...item,
      hostname,
      index: index + 1,
    })),
  };
}

function extractStructuredFailItems(text) {
  const parsedBlocks = parseFailBlocksFromTable(text);

  if (parsedBlocks.length) {
    return parsedBlocks;
  }

  return [];
}

function extractHostname(text) {
  const match = String(text || "").match(/# Hostname:\s*(.+)/i);
  return match ? match[1].trim() : "";
}

function parseFailBlocksFromTable(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let current = null;
  let seenHeader = false;

  lines.forEach((line) => {
    if (/^\|\s*Result\s*\|/i.test(line)) {
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

    const rawCells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (rawCells.length < 6) {
      return;
    }

    const cells = [
      rawCells[0],
      rawCells[1],
      rawCells[2],
      rawCells[3],
      rawCells[4],
      rawCells.slice(5).join(" | "),
    ];

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

function splitManualFeedback(text, hostname) {
  const normalizedText = normalizeBulletText(text);
  if (hasBulletFeedbackBlocks(normalizedText)) {
    return splitBulletFeedback(normalizedText, hostname);
  }

  return splitLegacyFeedback(normalizedText, hostname);
}

function hasBulletFeedbackBlocks(text) {
  return String(text || "")
    .split(/\r?\n/)
    .some((line) => isBulletLine(line.trim()));
}

function splitBulletFeedback(text, hostname) {
  const rawLines = String(text || "").split(/\r?\n/);
  const items = [];
  let current = [];

  function flushCurrent() {
    const block = buildFeedbackItem(current, items.length + 1);
    if (block) {
      items.push(block);
    }
    current = [];
  }

  rawLines.forEach((rawLine) => {
    const line = rawLine.replace(/\r/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (shouldSkipFeedbackLine(trimmed, hostname)) {
      return;
    }

    if (isBulletLine(trimmed)) {
      flushCurrent();
      current.push(stripBulletPrefix(trimmed));
      return;
    }

    if (current.length) {
      current.push(trimmed);
      return;
    }
  });

  flushCurrent();

  return items;
}

function splitLegacyFeedback(text, hostname) {
  const rawLines = String(text || "").split(/\r?\n/);
  const items = [];
  let current = [];

  function flushCurrent() {
    const block = buildFeedbackItem(current, items.length + 1);
    if (block) {
      items.push(block);
    }
    current = [];
  }

  rawLines.forEach((rawLine) => {
    const line = rawLine.replace(/\r/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      flushCurrent();
      return;
    }

    if (shouldSkipFeedbackLine(trimmed, hostname)) {
      return;
    }

    if (isBulletLine(trimmed)) {
      flushCurrent();
      current.push(stripBulletPrefix(trimmed));
      return;
    }

    if (shouldAppendToCurrent(line, trimmed, current)) {
      current.push(trimmed);
      return;
    }

    flushCurrent();
    current.push(trimmed);
  });

  flushCurrent();

  return items;
}

function buildFeedbackItem(lines, index) {
  const cleanedLines = dedupe(
    (lines || [])
      .map((line) => String(line || "").trim())
      .filter(Boolean),
  );

  if (!cleanedLines.length) {
    return null;
  }

  return {
    id: `feedback-${index}`,
    index,
    lines: cleanedLines,
    summaryLine: cleanedLines[0] || "",
    detailLines: cleanedLines.slice(1),
    text: cleanedLines.join("\n"),
  };
}

function shouldSkipFeedbackLine(line, hostname) {
  const normalizedLine = line.replace(/:$/, "").trim().toLowerCase();
  const normalizedHostname = String(hostname || "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();

  return (
    normalizedLine === normalizedHostname ||
    normalizedLine === `hostname ${normalizedHostname}` ||
    normalizedLine === `hostname: ${normalizedHostname}` ||
    /^health check review:?$/i.test(line) ||
    /^review:?$/i.test(line)
  );
}

function shouldAppendToCurrent(rawLine, trimmedLine, current) {
  if (!current.length) {
    return false;
  }

  const previous = current[current.length - 1] || "";

  return (
    /^\s+/.test(rawLine) ||
    (!isBulletLine(trimmedLine) && !looksLikeNewFeedbackSentence(trimmedLine)) ||
    /^manual check:?$/i.test(trimmedLine) ||
    /^(config\s*;|run bash|copy run start|module-\d+#|stripfcs=|show\s)/i.test(trimmedLine) ||
    /^manual check:?$/i.test(previous)
  );
}

function handleManualFeedbackPaste(event) {
  const clipboardData = event.clipboardData;

  if (!clipboardData) {
    return;
  }

  const html = clipboardData.getData("text/html");
  const plainText = clipboardData.getData("text/plain");
  const normalizedText = html
    ? convertClipboardHtmlToBulletText(html, plainText)
    : normalizeBulletText(plainText);

  if (!normalizedText) {
    return;
  }

  event.preventDefault();
  insertTextAtCursor(trainingFeedbackTextInput, normalizedText);
}

function convertClipboardHtmlToBulletText(html, fallbackText) {
  try {
    const parser = new DOMParser();
    const documentFragment = parser.parseFromString(html, "text/html");
    const rawText = htmlToStructuredText(documentFragment.body) || fallbackText || "";

    return normalizeBulletText(rawText);
  } catch {
    return normalizeBulletText(fallbackText);
  }
}

function htmlToStructuredText(root) {
  if (!root) {
    return "";
  }

  const lines = [];
  walkHtmlNode(root, lines, { inListItem: false });

  return lines
    .join("")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walkHtmlNode(node, lines, state) {
  if (!node) {
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    lines.push(state.inListItem ? text.replace(/\s+/g, " ") : text);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const tagName = node.tagName.toLowerCase();

  if (tagName === "br") {
    lines.push("\n");
    return;
  }

  if (tagName === "li") {
    ensureTrailingNewline(lines);
    lines.push("* ");
    [...node.childNodes].forEach((childNode) =>
      walkHtmlNode(childNode, lines, { inListItem: true }),
    );
    lines.push("\n");
    return;
  }

  if (["p", "div", "tr", "table", "section", "article"].includes(tagName)) {
    ensureTrailingNewline(lines);
    [...node.childNodes].forEach((childNode) =>
      walkHtmlNode(childNode, lines, state),
    );
    lines.push("\n");
    return;
  }

  if (["ul", "ol"].includes(tagName)) {
    ensureTrailingNewline(lines);
    [...node.childNodes].forEach((childNode) =>
      walkHtmlNode(childNode, lines, state),
    );
    lines.push("\n");
    return;
  }

  [...node.childNodes].forEach((childNode) => walkHtmlNode(childNode, lines, state));
}

function ensureTrailingNewline(lines) {
  if (!lines.length) {
    return;
  }

  const last = lines[lines.length - 1];
  if (!String(last).endsWith("\n")) {
    lines.push("\n");
  }
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prefix = textarea.value.slice(0, start);
  const suffix = textarea.value.slice(end);
  const separator =
    prefix && !prefix.endsWith("\n") && text && !text.startsWith("\n") ? "\n" : "";

  textarea.value = `${prefix}${separator}${text}${suffix}`;
  const cursorPosition = (prefix + separator + text).length;
  textarea.setSelectionRange(cursorPosition, cursorPosition);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function normalizeBulletText(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeBulletLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBulletLine(line) {
  const cleaned = String(line || "").replace(/\s+$/g, "");
  const bulletMatch = cleaned.match(
    /^(\s*)([\u2022\u25CF\u25E6\u00B7*o-]|\d+[\.\)])(?:\s+(.*))?$/i,
  );

  if (!bulletMatch) {
    return cleaned;
  }

  const indent = bulletMatch[1] || "";
  const content = (bulletMatch[3] || "").trim();
  return content ? `${indent}* ${content}` : `${indent}*`;
}

function isBulletLine(line) {
  return /^\s*\*(?:\s+.*)?$/.test(String(line || ""));
}

function stripBulletPrefix(line) {
  return String(line || "").replace(/^\s*\*\s*/, "").trim();
}

function looksLikeNewFeedbackSentence(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) {
    return false;
  }

  return (
    /^[A-Z0-9]/.test(trimmed) ||
    /^Interface\b/i.test(trimmed) ||
    /^Neighbor\b/i.test(trimmed) ||
    /^VRF\b/i.test(trimmed) ||
    /^Module\b/i.test(trimmed) ||
    /^SMU\b/i.test(trimmed) ||
    /^Class Mapp\b/i.test(trimmed) ||
    /^Feature\b/i.test(trimmed) ||
    /^The\b/i.test(trimmed) ||
    /^Below\b/i.test(trimmed) ||
    /^Node\b/i.test(trimmed)
  );
}

function buildBlockSourceText(block) {
  return [
    `Check: ${block.checkName}`,
    ...block.messageLines,
    block.descriptionLines.length
      ? `Description: ${block.descriptionLines.join(" | ")}`
      : "",
    block.commandHint ? `Command: ${block.commandHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function describeSelectedBlock(block) {
  if (!block) {
    return "No matching failed check selected.";
  }

  return buildBlockSourceText(block);
}

function normalizeCheckName(checkName) {
  return String(checkName || "").trim();
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function extractCheckTokens(checkName) {
  return String(checkName || "")
    .replace(/^check/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function extractInterfaces(text) {
  return dedupe(
    (String(text || "").match(/(?:Ethernet|Eth)\d+\/\d+(?:\.\d+)?/gi) || []).map(
      normalizeInterfaceLabel,
    ),
  );
}

function extractVrfs(text) {
  return dedupe(
    [...String(text || "").matchAll(/\bVRF\s+([A-Za-z0-9_-]+)/gi)].map(
      (match) => match[1],
    ),
  );
}

function extractNeighborIps(text) {
  return dedupe(
    [...String(text || "").matchAll(/\bNeighbor\s+(\d{1,3}(?:\.\d{1,3}){3})/gi)].map(
      (match) => match[1],
    ),
  );
}

function extractIpAddresses(text) {
  return dedupe(String(text || "").match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []);
}

function extractModuleIds(text) {
  return dedupe(
    [...String(text || "").matchAll(/\b(?:Module|module|Slot|slot)\s+(\d+(?:\/\d+)?)/g)].map(
      (match) => match[1],
    ),
  );
}

function extractClassMaps(text) {
  return dedupe(
    String(text || "").match(/\b(?:copp-[a-z0-9-]+|[A-Z0-9_]*COPP[A-Z0-9_-]*)\b/gi) || [],
  );
}

function extractBugIds(text) {
  return dedupe(String(text || "").match(/\bCSC[a-z]{1,3}\d{5}\b/gi) || []);
}

function extractFeatureNames(text) {
  const directMatches = [
    ...String(text || "").matchAll(/Feature\s+(.+?)\s+is\b/gi),
  ].map((match) => match[1]);
  const colonMatches = [...String(text || "").matchAll(/features?:\s*([A-Za-z0-9_, -]+)/gi)]
    .flatMap((match) => match[1].split(","));

  return dedupe(
    [...directMatches, ...colonMatches]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function extractCommandTokens(text) {
  return dedupe(
    (String(text || "").match(/\b(show|grep|bash|rpm|lacp|logging|bootflash|epld|arp|bgp)\b/gi) || [])
      .map((token) => token.toLowerCase()),
  );
}

function extractUtilization(text) {
  const actualMatch = String(text || "").match(
    /Actual utilization\s+([0-9]+(?:\.[0-9]+)?)/i,
  );

  if (actualMatch) {
    return actualMatch[1];
  }

  const percentMatch = String(text || "").match(/([0-9]+(?:\.[0-9]+)?)%/);
  return percentMatch ? percentMatch[1] : "";
}

function normalizeInterfaceLabel(name) {
  if (/^Eth\d+\/\d+(?:\.\d+)?$/i.test(name)) {
    return name.replace(/^Eth/i, "Ethernet");
  }

  return name;
}

function countOverlap(left, right) {
  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right);
  return dedupe(left).reduce(
    (total, value) => total + (rightSet.has(value) ? 1 : 0),
    0,
  );
}

function dedupe(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function truncateText(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}
