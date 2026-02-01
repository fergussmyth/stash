const BASE_URL = "https://acyuomgyhtpkbvbqgvyh.supabase.co/functions/v1";
const AUTO_CLOSE_MS = 900;

const collectionTrigger = document.getElementById("collectionTrigger");
const collectionMenu = document.getElementById("collectionMenu");
const noteInput = document.getElementById("note");
const saveBtn = document.getElementById("saveBtn");
const settingsBtn = document.getElementById("settingsBtn");
const statusEl = document.getElementById("status");
const pageInfoEl = document.getElementById("pageInfo");
const faviconEl = document.getElementById("favicon");
const pageTitleEl = document.getElementById("pageTitle");
const pageDomainEl = document.getElementById("pageDomain");
const openUrlBtn = document.getElementById("openUrlBtn");
const saveLabel = saveBtn.querySelector(".btn-label");

let activeTab = null;
let settings = { token: "", lastCollectionId: "" };
let isSaving = false;
let isSaved = false;
let selectedCollectionId = "";
let selectedCollectionName = "";
let hasCollections = false;

function setStatus(message, tone = "") {
  statusEl.textContent = message || "";
  statusEl.classList.remove("status--success", "status--error", "status--info");
  if (tone) {
    statusEl.classList.add(`status--${tone}`);
  }
}

function setSaveState(state) {
  saveBtn.classList.remove("is-loading", "is-saved");
  if (state === "loading") {
    saveBtn.classList.add("is-loading");
    saveLabel.textContent = "Stashing...";
    isSaving = true;
    isSaved = false;
  } else if (state === "saved") {
    saveBtn.classList.add("is-saved");
    saveLabel.textContent = "Stashed ✓";
    isSaving = false;
    isSaved = true;
  } else {
    saveLabel.textContent = "Stash";
    isSaving = false;
    isSaved = false;
  }

  updateSaveEnabled();
}

function updateSaveEnabled() {
  const hasCollection = Boolean(selectedCollectionId);
  saveBtn.disabled = isSaving || !hasCollection || !settings.token;
}

function sanitizeBase(base) {
  return (base || "").replace(/\/+$/, "");
}

function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./i, "");
  } catch (err) {
    return "";
  }
}

function setPageInfo(tab) {
  if (!tab) {
    return;
  }

  const title = tab.title || "Current page";
  pageTitleEl.textContent = title;

  if (tab.favIconUrl) {
    faviconEl.src = tab.favIconUrl;
    faviconEl.alt = "";
  } else {
    faviconEl.style.display = "none";
  }

  if (tab.url) {
    pageInfoEl.textContent = tab.url;
    const domain = getDomain(tab.url);
    pageDomainEl.textContent = domain;
    pageDomainEl.style.display = domain ? "inline-flex" : "none";
    openUrlBtn.disabled = false;
  } else {
    pageInfoEl.textContent = "No URL found";
    pageDomainEl.textContent = "";
    pageDomainEl.style.display = "none";
    openUrlBtn.disabled = true;
  }
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["token", "lastCollectionId"], (data) => {
      settings = {
        token: data.token || "",
        lastCollectionId: data.lastCollectionId || "",
      };
      resolve(settings);
    });
  });
}

async function loadActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      activeTab = tabs[0] || null;
      resolve(activeTab);
    });
  });
}

async function loadCollections() {
  const base = sanitizeBase(BASE_URL);
  if (!settings.token) {
    selectedCollectionId = "";
    selectedCollectionName = "";
    hasCollections = false;
    collectionMenu.innerHTML = "";
    collectionTrigger.textContent = "Set token in Settings";
    collectionTrigger.disabled = true;
    setStatus("Set token in Settings.", "error");
    updateSaveEnabled();
    return;
  }

  try {
    const response = await fetch(`${base}/extension-collections`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });

    if (!response.ok) {
      setStatus("Auth error. Check token.", "error");
      return;
    }

    const payload = await response.json();
    const collections = payload.collections || [];
    collectionMenu.innerHTML = "";
    hasCollections = collections.length > 0;
    selectedCollectionId = "";
    selectedCollectionName = "";

    collections.forEach((collection) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dropdownItem";
      item.dataset.value = collection.id;
      item.dataset.name = collection.name;
      item.textContent = `${collection.name} (${collection.link_count || 0})`;
      item.addEventListener("click", () => {
        selectCollection(collection.id, collection.name, item.textContent);
        closeMenu();
      });
      collectionMenu.appendChild(item);
      if (collection.id === settings.lastCollectionId) {
        selectedCollectionId = collection.id;
        selectedCollectionName = collection.name;
      }
    });

    if (collections.length === 0) {
      collectionTrigger.textContent = "No stashes yet";
      collectionTrigger.disabled = true;
    } else {
      collectionTrigger.disabled = false;
    }

    if (selectedCollectionId) {
      const selectedItem = Array.from(collectionMenu.children).find(
        (node) => node.dataset?.value === selectedCollectionId
      );
      const label = selectedItem?.textContent || "Choose a stash";
      selectCollection(selectedCollectionId, selectedCollectionName, label);
    } else {
      collectionTrigger.textContent = "Choose a stash";
    }
    updateSaveEnabled();
  } catch (err) {
    setStatus("Failed to load stashes.", "error");
  }
}

async function handleSave() {
  const base = sanitizeBase(BASE_URL);
  if (!settings.token) {
    setStatus("Set token in Settings.", "error");
    return;
  }

  if (!activeTab?.url) {
    setStatus("No active tab URL found.", "error");
    return;
  }

  const collectionId = selectedCollectionId;
  if (!collectionId) {
    setStatus("Pick a stash.", "error");
    return;
  }

  setSaveState("loading");
  setStatus("Stashing...", "info");

  try {
    const response = await fetch(`${base}/extension-save`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collectionId,
        url: activeTab.url,
        title: activeTab.title || "",
        note: noteInput.value || "",
      }),
    });

    const payload = await response.json();
    const collectionName = selectedCollectionName || collectionTrigger.textContent || "";

    if (!response.ok) {
    const message =
      payload.error ||
      (response.status === 401 ? "Token invalid — open Settings" : "Stash failed.");
      setStatus(message, "error");
      setSaveState("idle");
      return;
    }

    if (payload.status === "exists") {
      setStatus(`Already stashed in ${collectionName}.`, "info");
      setSaveState("saved");
    } else {
      setStatus(`Stashed in ${collectionName}.`, "success");
      setSaveState("saved");
    }

    chrome.storage.sync.set({ lastCollectionId: collectionId });

    if (AUTO_CLOSE_MS) {
      setTimeout(() => window.close(), AUTO_CLOSE_MS);
    }
  } catch (err) {
    setStatus("Stash failed.", "error");
    setSaveState("idle");
  }
}

function openMenu() {
  if (collectionTrigger.disabled) return;
  collectionMenu.classList.add("open");
  collectionTrigger.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  collectionMenu.classList.remove("open");
  collectionTrigger.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (collectionMenu.classList.contains("open")) {
    closeMenu();
  } else {
    openMenu();
  }
}

function selectCollection(id, name, label) {
  selectedCollectionId = id;
  selectedCollectionName = name || label;
  collectionTrigger.textContent = label;
  Array.from(collectionMenu.children).forEach((node) => {
    node.classList.toggle("active", node.dataset?.value === id);
  });
  if (!isSaved) {
    setStatus("");
  }
  updateSaveEnabled();
}

function safeAddListener(el, event, handler) {
  if (!el) return;
  el.addEventListener(event, handler);
}

safeAddListener(collectionTrigger, "click", () => {
  toggleMenu();
});

safeAddListener(settingsBtn, "click", () => {
  chrome.runtime.openOptionsPage();
});

safeAddListener(openUrlBtn, "click", () => {
  if (activeTab?.url) {
    chrome.tabs.create({ url: activeTab.url });
  }
});

safeAddListener(saveBtn, "click", handleSave);

document.addEventListener("DOMContentLoaded", async () => {
  if (!collectionTrigger || !collectionMenu || !saveBtn || !statusEl) return;
  document.addEventListener("mousedown", (event) => {
    if (!collectionMenu.classList.contains("open")) return;
    if (collectionMenu.contains(event.target)) return;
    if (collectionTrigger.contains(event.target)) return;
    closeMenu();
  });
  await loadSettings();
  await loadActiveTab();
  setPageInfo(activeTab);
  await loadCollections();
  updateSaveEnabled();
});
