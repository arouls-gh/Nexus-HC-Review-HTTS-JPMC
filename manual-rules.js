const manualRuleCheckNameInput = document.querySelector("#manualRuleCheckName");
const manualRuleClassificationInput = document.querySelector("#manualRuleClassification");
const manualRuleFeedbackInput = document.querySelector("#manualRuleFeedback");
const saveManualRuleButton = document.querySelector("#saveManualRuleButton");
const manualRuleStatusEl = document.querySelector("#manualRuleStatus");
const manualRulesListEl = document.querySelector("#manualRulesList");
const manualRuleDetailsEl = document.querySelector("#manualRuleDetails");
const deleteManualRuleButton = document.querySelector("#deleteManualRuleButton");
const buildApiUrl =
  window.APP_CONFIG?.buildApiUrl || ((resource) => `/api/${String(resource || "").replace(/^\/+/, "")}`);

let savedManualRules = [];
let selectedRuleCheckName = "";

initializeManualRulesPage();

saveManualRuleButton.addEventListener("click", async () => {
  const checkName = manualRuleCheckNameInput.value.trim();
  const classification = manualRuleClassificationInput.value.trim();
  const feedback = manualRuleFeedbackInput.value.trim();

  if (!checkName || !classification || !feedback) {
    window.alert("Please provide a check name, classification, and feedback.");
    return;
  }

  const response = await fetch(buildApiUrl("manual-rules"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rules: [
        {
          checkName,
          classification,
          feedback,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorMessage = await readErrorMessage(
      response,
      "Unable to save the manual rule.",
    );
    window.alert(errorMessage);
    return;
  }

  manualRuleCheckNameInput.value = "";
  manualRuleClassificationInput.value = "minor";
  manualRuleFeedbackInput.value = "";
  await loadManualRules(checkName);
});

manualRulesListEl.addEventListener("change", () => {
  selectedRuleCheckName = manualRulesListEl.value;
  renderSelectedManualRule();
});

deleteManualRuleButton.addEventListener("click", async () => {
  if (!selectedRuleCheckName) {
    return;
  }

  const response = await fetch(buildApiUrl("manual-rules"), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkName: selectedRuleCheckName,
    }),
  });

  if (!response.ok) {
    const errorMessage = await readErrorMessage(
      response,
      "Unable to delete the selected manual rule.",
    );
    window.alert(errorMessage);
    return;
  }

  await loadManualRules(selectedRuleCheckName);
});

function initializeManualRulesPage() {
  void loadManualRules();
}

async function loadManualRules(previousSelection = "") {
  try {
    const response = await fetch(buildApiUrl("manual-rules"));

    if (!response.ok) {
      renderManualRules({ savedAt: null, rules: [] }, previousSelection);
      return;
    }

    const payload = await response.json();
    renderManualRules(payload, previousSelection);
  } catch {
    renderManualRules({ savedAt: null, rules: [] }, previousSelection);
  }
}

function renderManualRules(payload, previousSelection = "") {
  savedManualRules = Array.isArray(payload?.rules) ? payload.rules : [];
  manualRulesListEl.innerHTML = "";

  if (!savedManualRules.length) {
    manualRuleStatusEl.textContent = "No manual rules saved yet.";
    manualRuleDetailsEl.value = "None";
    selectedRuleCheckName = "";
    deleteManualRuleButton.disabled = true;
    return;
  }

  manualRuleStatusEl.textContent = `${savedManualRules.length} manual rule(s) saved.`;

  savedManualRules.forEach((rule) => {
    const option = document.createElement("option");
    option.value = rule.checkName;
    option.textContent = rule.checkName;
    manualRulesListEl.append(option);
  });

  const firstAvailableCheck = savedManualRules[0]?.checkName || "";
  if (
    previousSelection &&
    savedManualRules.some((rule) => rule.checkName === previousSelection)
  ) {
    selectedRuleCheckName = previousSelection;
  } else if (
    selectedRuleCheckName &&
    savedManualRules.some((rule) => rule.checkName === selectedRuleCheckName)
  ) {
    selectedRuleCheckName = selectedRuleCheckName;
  } else {
    selectedRuleCheckName = firstAvailableCheck;
  }

  manualRulesListEl.value = selectedRuleCheckName;
  renderSelectedManualRule();
}

function renderSelectedManualRule() {
  const selectedRule = savedManualRules.find(
    (rule) => rule.checkName === selectedRuleCheckName,
  );

  if (!selectedRule) {
    manualRuleDetailsEl.value = "Select a check name to view its classification and feedback.";
    deleteManualRuleButton.disabled = true;
    return;
  }

  manualRuleDetailsEl.value =
    `Classification: ${selectedRule.classification}\n\n` +
    `Feedback:\n${selectedRule.feedback}`;
  deleteManualRuleButton.disabled = false;
}

async function readErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
