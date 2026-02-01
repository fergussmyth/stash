const BASE_URL = "https://acyuomgyhtpkbvbqgvyh.supabase.co/functions/v1";

const tokenInput = document.getElementById("token");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const testBtn = document.getElementById("testBtn");
const saveStatus = document.getElementById("saveStatus");
const toggleTokenBtn = document.getElementById("toggleToken");
const copyTokenBtn = document.getElementById("copyToken");
const clearTokenBtn = document.getElementById("clearToken");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusDetail = document.getElementById("statusDetail");
const summaryDot = document.getElementById("summaryDot");
const summaryText = document.getElementById("summaryText");

let isTesting = false;
let isSaving = false;
let lastStatus = "";

function setSaveStatus(message, tone = "success") {
  saveStatus.textContent = message || "";
  saveStatus.style.color = tone === "error" ? "#fca5a5" : "#86efac";
}

function setStatusState(tone, text, detail) {
  statusDot.className = `dot ${tone || ""}`.trim();
  statusText.textContent = text;
  statusDetail.textContent = detail || "";
  summaryDot.className = `dot ${tone || ""}`.trim();
  summaryText.textContent = text;
  lastStatus = text;
}

function setButtonsEnabled() {
  const hasToken = Boolean(tokenInput.value.trim());
  saveBtn.disabled = isSaving || !hasToken;
  testBtn.disabled = isTesting || !hasToken;
}

function loadSettings() {
  chrome.storage.sync.get(["token"], (data) => {
    tokenInput.value = data.token || "";
    const hasValues = Boolean(tokenInput.value.trim());
    setStatusState(
      hasValues ? "" : "warn",
      hasValues ? "Ready to test" : "Not connected",
      hasValues ? "Run a connection test." : "Add your token."
    );
    setButtonsEnabled();
  });
}

function saveSettings() {
  const token = (tokenInput.value || "").trim();

  if (!token) {
    setSaveStatus("Token required.", "error");
    return;
  }

  isSaving = true;
  saveBtn.textContent = "Saving...";
  setButtonsEnabled();

  chrome.storage.sync.set({ token }, () => {
    isSaving = false;
    saveBtn.textContent = "Save settings";
    setSaveStatus("Settings saved ✅");
    setTimeout(() => setSaveStatus(""), 1800);
    setButtonsEnabled();
  });
}

function resetSettings() {
  tokenInput.value = "";
  setStatusState("", "Not connected", "");
  setSaveStatus("Cleared.");
  setButtonsEnabled();
  chrome.storage.sync.set({ token: "" });
}

function toggleTokenVisibility() {
  if (tokenInput.type === "password") {
    tokenInput.type = "text";
    toggleTokenBtn.textContent = "Hide";
  } else {
    tokenInput.type = "password";
    toggleTokenBtn.textContent = "Show";
  }
}

async function copyToken() {
  const value = tokenInput.value.trim();
  if (!value) {
    setSaveStatus("No token to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setSaveStatus("Token copied.");
  } catch (err) {
    setSaveStatus("Copy failed.", "error");
  }
}

function clearToken() {
  tokenInput.value = "";
  setSaveStatus("Token cleared.");
  setButtonsEnabled();
}

function sanitizeBase(base) {
  return (base || "").replace(/\/+$/, "");
}

async function testConnection() {
  const base = sanitizeBase(BASE_URL);
  const token = tokenInput.value.trim();

  if (!token) {
    setStatusState("warn", "Missing token", "Add your token to connect.");
    return;
  }

  isTesting = true;
  testBtn.textContent = "Testing...";
  setButtonsEnabled();

  try {
    const response = await fetch(`${base}/extension-collections`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const tone = response.status === 401 ? "error" : "warn";
      const message = response.status === 401 ? "Token invalid" : "Connection error";
      setStatusState(tone, message, `HTTP ${response.status}`);
      return;
    }

    const payload = await response.json();
    const collections = payload.collections || [];
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setStatusState(
      "success",
      "Connected",
      `Connected • ${collections.length} stashes found • checked ${timestamp}`
    );
  } catch (err) {
    setStatusState("warn", "Connection error", "Network error or invalid URL.");
  } finally {
    isTesting = false;
    testBtn.textContent = "Test connection";
    setButtonsEnabled();
  }
}

tokenInput.addEventListener("input", setButtonsEnabled);
saveBtn.addEventListener("click", saveSettings);
resetBtn.addEventListener("click", resetSettings);
testBtn.addEventListener("click", testConnection);
toggleTokenBtn.addEventListener("click", toggleTokenVisibility);
copyTokenBtn.addEventListener("click", copyToken);
clearTokenBtn.addEventListener("click", clearToken);

loadSettings();
