let current;

const MAIN_TAB_KEY =
  "sensorsphere.simulator.mainTab";

const FOLDER_SELECTION_KEY =
  "sensorsphere.simulator.folderSelection.v1";

const THEME_STORAGE_KEY =
  "sensorsphere.simulator.theme.v1";

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
let selectedTheme = "synthwave";

function resolvedTheme(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme) {
  const selected = ["system", "synthwave", "dark", "light"].includes(theme)
    ? theme
    : "synthwave";
  selectedTheme = selected;
  document.documentElement.dataset.theme = resolvedTheme(selected);
  document.documentElement.dataset.themeMode = selected;
  const select = document.getElementById("themeSelect");
  if (select && select.value !== selected) select.value = selected;
  return selected;
}

function setTheme(theme) {
  const selected = applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, selected);
  } catch {}
}

function restoreTheme() {
  let selected = "synthwave";
  try {
    selected = localStorage.getItem(THEME_STORAGE_KEY) || "synthwave";
  } catch {}
  applyTheme(selected);
}

const systemThemeMedia = window.matchMedia(SYSTEM_THEME_QUERY);
systemThemeMedia.addEventListener("change", () => {
  if (selectedTheme === "system") applyTheme("system");
});

restoreTheme();

function loadFolderSelection() {
  try {
    return {
      basic: "__all__",
      scenarios: "__all__",
      ...JSON.parse(localStorage.getItem(FOLDER_SELECTION_KEY) || "{}")
    };
  } catch {
    return { basic: "__all__", scenarios: "__all__" };
  }
}

const folderSelection = loadFolderSelection();

const FOLDER_COLLAPSE_KEY =
  "sensorsphere.simulator.folderCollapse.v1";

function loadFolderCollapse() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOLDER_COLLAPSE_KEY) || "{}");
    return {
      basic: new Set(Array.isArray(parsed.basic) ? parsed.basic : []),
      scenarios: new Set(Array.isArray(parsed.scenarios) ? parsed.scenarios : [])
    };
  } catch {
    return { basic: new Set(), scenarios: new Set() };
  }
}

const folderCollapse = loadFolderCollapse();

function saveFolderCollapse() {
  try {
    localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify({
      basic: [...folderCollapse.basic],
      scenarios: [...folderCollapse.scenarios]
    }));
  } catch {}
}

function toggleFolderCollapsed(event, kind, id) {
  event.stopPropagation();
  const collapsed = folderCollapse[kind];
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
  saveFolderCollapse();
  renderFolderNavigation(kind);
}

function saveFolderSelection() {
  try {
    localStorage.setItem(FOLDER_SELECTION_KEY, JSON.stringify(folderSelection));
  } catch {}
}

function foldersFor(kind) {
  return current?.folders?.[kind] || [];
}

function itemsFor(kind) {
  return kind === "basic" ? (current?.sensors || []) : (current?.scenarios || []);
}

function folderById(kind, id) {
  return foldersFor(kind).find(folder => folder.id === id);
}

function folderChildren(kind, parentId) {
  return foldersFor(kind)
    .filter(folder => (folder.parentId || null) === (parentId || null))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function itemIsRunning(kind, item) {
  if (kind === "basic") return Boolean(item.enabled);
  return item.status === "RUNNING";
}

function runtimeSummary(kind, items) {
  const total = items.length;
  const running = items.filter(item => itemIsRunning(kind, item)).length;
  return { running, total };
}

function directFolderRuntimeSummary(kind, folderId) {
  return runtimeSummary(
    kind,
    itemsFor(kind).filter(item => (item.folderId || null) === (folderId || null))
  );
}

function folderRuntimeBadge(kind, folderId) {
  const { running, total } = directFolderRuntimeSummary(kind, folderId);
  return `<span class="folder-count ${running > 0 ? "has-running" : ""}" title="${running} running / ${total} total">${running}/${total}</span>`;
}

function visibleItems(kind) {
  const selected = folderSelection[kind] || "__all__";
  const items = itemsFor(kind);
  if (selected === "__all__") return items;
  if (selected === "__unfiled__") return items.filter(item => !item.folderId);
  return items.filter(item => item.folderId === selected);
}

function folderOptionRows(kind, parentId = null, depth = 0, selectedId = null) {
  return folderChildren(kind, parentId).map(folder => `
    <option value="${esc(folder.id)}" ${folder.id === selectedId ? "selected" : ""}>
      ${esc(`${"  ".repeat(depth)}${depth ? "↳ " : ""}${folder.name}`)}
    </option>
    ${folderOptionRows(kind, folder.id, depth + 1, selectedId)}
  `).join("");
}

function folderSelectOptions(kind, selectedId) {
  return `
    <option value="" ${!selectedId ? "selected" : ""}>Unfiled</option>
    ${folderOptionRows(kind, null, 0, selectedId)}
  `;
}

function folderTreeRows(kind, parentId = null, depth = 0) {
  return folderChildren(kind, parentId).map(folder => {
    const selected = folderSelection[kind] === folder.id;
    const children = folderChildren(kind, folder.id);
    const hasChildren = children.length > 0;
    const collapsed = folderCollapse[kind].has(folder.id);
    return `
      <div class="folder-node" style="--folder-depth:${depth}">
        <button
          class="folder-row ${selected ? "active" : ""}"
          draggable="true"
          data-folder-kind="${kind}"
          data-folder-id="${folder.id}"
          onclick="selectFolder('${kind}','${folder.id}')"
          ondragstart="folderDragStart(event,'${kind}','${folder.id}')"
          ondragend="folderDragEnd(event)"
          ondragover="folderDragOver(event,'${kind}','${folder.id}')"
          ondragleave="folderDragLeave(event)"
          ondrop="folderDrop(event,'${kind}','${folder.id}')"
        >
          <span
            class="folder-icon ${hasChildren ? "is-toggle" : ""}"
            ${hasChildren ? `onclick="toggleFolderCollapsed(event,'${kind}','${folder.id}')" title="${collapsed ? "Expand folder" : "Collapse folder"}"` : ""}
          >${hasChildren ? (collapsed ? "▸" : "▾") : "·"}</span>
          <span class="folder-name">${esc(folder.name)}</span>
          ${folderRuntimeBadge(kind, folder.id)}
        </button>
        <div class="folder-node-actions">
          <button onclick="event.stopPropagation();moveFolderPrompt('${kind}','${folder.id}')" title="Move folder">⇄</button>
          <button onclick="event.stopPropagation();renameFolder('${kind}','${folder.id}')" title="Rename folder">✎</button>
          <button onclick="event.stopPropagation();deleteFolder('${kind}','${folder.id}')" title="Delete folder">×</button>
        </div>
      </div>
      ${collapsed ? "" : folderTreeRows(kind, folder.id, depth + 1)}
    `;
  }).join("");
}

function folderDragStart(event, kind, id) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify({ kind, id }));
  event.currentTarget.classList.add("is-dragging");
}

function folderDragEnd(event) {
  event.currentTarget.classList.remove("is-dragging");
  document.querySelectorAll(".folder-row.drop-target").forEach(row => row.classList.remove("drop-target"));
}

function folderDragOver(event, kind, targetId) {
  const raw = event.dataTransfer.getData("text/plain");
  if (!raw) return;
  try {
    const dragged = JSON.parse(raw);
    if (dragged.kind !== kind || dragged.id === targetId) return;
  } catch {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drop-target");
}

function folderDragLeave(event) {
  event.currentTarget.classList.remove("drop-target");
}

async function folderDrop(event, kind, targetId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("drop-target");
  let dragged;
  try {
    dragged = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (!dragged || dragged.kind !== kind || dragged.id === targetId) return;
  try {
    await moveFolder(kind, dragged.id, targetId);
  } catch (error) {
    alert(`Move failed: ${error.message}`);
  }
}

async function folderDropToRoot(event, kind) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("drop-target");
  let dragged;
  try {
    dragged = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (!dragged || dragged.kind !== kind) return;
  try {
    await moveFolder(kind, dragged.id, null);
  } catch (error) {
    alert(`Move failed: ${error.message}`);
  }
}

async function moveFolder(kind, id, parentId) {
  const folder = folderById(kind, id);
  if (!folder) return;
  if ((folder.parentId || null) === (parentId || null)) return;
  await api(`/api/folders/${kind}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ parentId })
  });
  await refresh();
}

function folderMoveChoices(kind, movingId, parentId = null, depth = 0) {
  return folderChildren(kind, parentId)
    .filter(folder => folder.id !== movingId)
    .flatMap(folder => {
      const descendants = new Set();
      const collect = id => {
        for (const child of folderChildren(kind, id)) {
          descendants.add(child.id);
          collect(child.id);
        }
      };
      collect(movingId);
      if (descendants.has(folder.id)) return [];
      return [
        { id: folder.id, label: `${"  ".repeat(depth)}${depth ? "↳ " : ""}${folder.name}` },
        ...folderMoveChoices(kind, movingId, folder.id, depth + 1)
      ];
    });
}

function moveFolderPrompt(kind, id) {
  const folder = folderById(kind, id);
  if (!folder) return;
  const descendants = new Set();
  const collect = parent => {
    for (const child of folderChildren(kind, parent)) {
      descendants.add(child.id);
      collect(child.id);
    }
  };
  collect(id);
  const choices = [{ id: "", label: "Root" }];
  const walk = (parentId = null, depth = 0) => {
    for (const candidate of folderChildren(kind, parentId)) {
      if (candidate.id === id || descendants.has(candidate.id)) continue;
      choices.push({ id: candidate.id, label: `${"  ".repeat(depth)}${depth ? "↳ " : ""}${candidate.name}` });
      walk(candidate.id, depth + 1);
    }
  };
  walk();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="move-folder-dialog" role="dialog" aria-modal="true" aria-label="Move folder">
      <h3>Move folder</h3>
      <p>Move <strong>${esc(folder.name)}</strong> into:</p>
      <select class="move-folder-select">
        ${choices.map(choice => `<option value="${esc(choice.id)}" ${(folder.parentId || "") === choice.id ? "selected" : ""}>${esc(choice.label)}</option>`).join("")}
      </select>
      <div class="move-folder-actions">
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" class="primary" data-action="move">Move</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.dataset.action === "cancel") close();
  });
  overlay.querySelector('[data-action="move"]').addEventListener("click", async () => {
    const parentId = overlay.querySelector(".move-folder-select").value || null;
    try {
      await moveFolder(kind, id, parentId);
      close();
    } catch (error) {
      alert(`Move failed: ${error.message}`);
    }
  });
}

function renderFolderNavigation(kind) {
  const targetId = kind === "basic" ? "basicFolderTree" : "scenarioFolderTree";
  const contextId = kind === "basic" ? "basicFolderContext" : "scenarioFolderContext";
  const target = document.getElementById(targetId);
  const context = document.getElementById(contextId);
  if (!target) return;

  const selected = folderSelection[kind] || "__all__";
  if (selected !== "__all__" && selected !== "__unfiled__" && !folderById(kind, selected)) {
    folderSelection[kind] = "__all__";
    saveFolderSelection();
  }

  const allSummary = runtimeSummary(kind, itemsFor(kind));
  const unfiledSummary = directFolderRuntimeSummary(kind, null);

  target.innerHTML = `
    <button class="folder-row folder-root-drop ${folderSelection[kind] === "__all__" ? "active" : ""}" onclick="selectFolder('${kind}','__all__')" ondragover="event.preventDefault();this.classList.add('drop-target')" ondragleave="this.classList.remove('drop-target')" ondrop="folderDropToRoot(event,'${kind}')">
      <span class="folder-icon">◆</span><span class="folder-name">All</span><span class="folder-count ${allSummary.running > 0 ? "has-running" : ""}" title="${allSummary.running} running / ${allSummary.total} total">${allSummary.running}/${allSummary.total}</span>
    </button>
    <button class="folder-row ${folderSelection[kind] === "__unfiled__" ? "active" : ""}" onclick="selectFolder('${kind}','__unfiled__')">
      <span class="folder-icon">◇</span><span class="folder-name">Unfiled</span><span class="folder-count ${unfiledSummary.running > 0 ? "has-running" : ""}" title="${unfiledSummary.running} running / ${unfiledSummary.total} total">${unfiledSummary.running}/${unfiledSummary.total}</span>
    </button>
    ${folderTreeRows(kind)}
  `;

  if (context) {
    const label = folderSelection[kind] === "__all__"
      ? "All items"
      : folderSelection[kind] === "__unfiled__"
        ? "Unfiled"
        : folderById(kind, folderSelection[kind])?.name || "All items";
    const summary = runtimeSummary(kind, visibleItems(kind));
    context.innerHTML = `
      <strong>${esc(label)}</strong>
      <span class="folder-context-runtime ${summary.running > 0 ? "has-running" : ""}">${summary.running} running / ${summary.total} total</span>
    `;
  }
}

function selectFolder(kind, id) {
  folderSelection[kind] = id;
  saveFolderSelection();
  renderFolderNavigation(kind);
  if (kind === "basic") renderSensors(); else renderScenarios();
}

async function createFolder(kind) {
  const parentId = folderSelection[kind] && !folderSelection[kind].startsWith("__") ? folderSelection[kind] : null;
  const name = prompt("Folder name:");
  if (!name?.trim()) return;
  const folder = await api(`/api/folders/${kind}`, { method: "POST", body: JSON.stringify({ name: name.trim(), parentId }) });
  folderSelection[kind] = folder.id;
  saveFolderSelection();
  await refresh();
}

async function renameFolder(kind, id) {
  const folder = folderById(kind, id);
  if (!folder) return;
  const name = prompt("Rename folder:", folder.name);
  if (!name?.trim() || name.trim() === folder.name) return;
  await api(`/api/folders/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
  await refresh();
}

async function deleteFolder(kind, id) {
  const folder = folderById(kind, id);
  if (!folder) return;
  if (!confirm(`Delete folder "${folder.name}"? Items and child folders will be moved to its parent; no injection/scenario will be deleted.`)) return;
  await api(`/api/folders/${kind}/${id}`, { method: "DELETE" });
  if (folderSelection[kind] === id) folderSelection[kind] = folder.parentId || "__unfiled__";
  saveFolderSelection();
  await refresh();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportLibrary(kind, currentOnly) {
  const selected = folderSelection[kind];
  const useFolder = currentOnly && selected && !selected.startsWith("__");
  if (currentOnly && !useFolder) {
    alert("Select a real folder to export the current folder tree, or use Export all.");
    return;
  }
  const query = useFolder ? `?folderId=${encodeURIComponent(selected)}` : "";
  const data = await api(`/api/export/${kind}${query}`);
  const suffix = useFolder ? (folderById(kind, selected)?.name || "folder") : "all";
  downloadJson(`sensorsphere-simulator-${kind}-${suffix.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`, data);
}

async function importLibrary(kind, input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const document = JSON.parse(await file.text());
    const result = await api(`/api/import/${kind}`, { method: "POST", body: JSON.stringify(document) });
    alert(`Imported ${result.items} item(s) and ${result.folders} folder(s).`);
    folderSelection[kind] = "__all__";
    saveFolderSelection();
    await refresh();
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

function selectMainTab(tab) {
  const selected =
    ["basic", "scenarios", "logs"].includes(tab)
      ? tab
      : "basic";

  document.querySelectorAll(".main-tab").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === selected
      );
    }
  );

  document.querySelectorAll(".tab-panel").forEach(
    panel => {
      panel.hidden =
        panel.id !== `tab-${selected}`;
    }
  );

  try {
    localStorage.setItem(
      MAIN_TAB_KEY,
      selected
    );
  } catch {}
}

function restoreMainTab() {
  let selected = "basic";

  try {
    selected =
      localStorage.getItem(
        MAIN_TAB_KEY
      ) ?? "basic";
  } catch {}

  selectMainTab(selected);
}

async function api(url, options={}) {
  const response = await fetch(url, {
    headers: {"Content-Type":"application/json"},
    ...options
  });
  if (!response.ok && response.status !== 204) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const COLLAPSE_STORAGE_KEY =
  "sensorsphere.simulator.collapsed.v1";

function loadCollapsedState() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          COLLAPSE_STORAGE_KEY
        ) || "{}"
      );

    return {
      sensors:
        new Set(
          Array.isArray(
            parsed.sensors
          )
            ? parsed.sensors
            : []
        ),

      scenarios:
        new Set(
          Array.isArray(
            parsed.scenarios
          )
            ? parsed.scenarios
            : []
        )
    };
  } catch {
    return {
      sensors:
        new Set(),

      scenarios:
        new Set()
    };
  }
}

const collapsedState =
  loadCollapsedState();

function saveCollapsedState() {
  try {
    localStorage.setItem(
      COLLAPSE_STORAGE_KEY,
      JSON.stringify({
        sensors:
          [...collapsedState.sensors],

        scenarios:
          [...collapsedState.scenarios]
      })
    );
  } catch {}
}

function isCollapsed(
  type,
  id
) {
  return collapsedState[
    type
  ].has(
    id
  );
}

function toggleCollapsed(
  type,
  id
) {
  const values =
    collapsedState[
      type
    ];

  if (
    values.has(
      id
    )
  ) {
    values.delete(
      id
    );
  } else {
    values.add(
      id
    );
  }

  saveCollapsedState();

  if (
    type ===
    "sensors"
  ) {
    renderSensors();
  } else {
    renderScenarios();
  }
}

function collapseButton(
  type,
  id
) {
  const collapsed =
    isCollapsed(
      type,
      id
    );

  return `
    <button
      class="btn-collapse"
      type="button"
      onclick="toggleCollapsed('${type}','${id}')"
      title="${collapsed ? "Expand" : "Collapse"}"
      aria-label="${collapsed ? "Expand" : "Collapse"}"
    >
      <span class="collapse-chevron" aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
    </button>
  `;
}

function isEditingForm() {
  const active =
    document.activeElement;

  const focusedEditor =
    Boolean(
      active &&
      (
        active.tagName === "INPUT" ||
        active.tagName === "SELECT" ||
        active.tagName === "TEXTAREA"
      ) &&
      (
        active.closest(".sensor") ||
        active.closest(".scenario-card")
      )
    );

  const openRampGenerator =
    Boolean(
      document.querySelector(
        ".ramp-generator:not([hidden])"
      )
    );

  return (
    focusedEditor ||
    openRampGenerator
  );
}

async function refresh() {
  try {
    current =
      await api(
        "/api/state"
      );

    renderStatus();
    renderRuntimeStats();
    renderFolderNavigation("basic");
    renderFolderNavigation("scenarios");

    // Do not rebuild sensor forms while the user is typing.
    // Replacing the DOM would move focus/cursor and interrupt input.
    if (!isEditingForm()) {
      renderSensors();
      renderScenarios();
    }

    renderLogFilters();
    renderLogs();

  } catch (e) {
    const mqtt =
      document.getElementById(
        "mqtt"
      );

    mqtt.className =
      "status disconnected";

    mqtt.textContent =
      "API disconnected";
  }
}

function renderRuntimeStats() {
  if (!current) return;

  const sensors = current.sensors || [];
  const scenarios = current.scenarios || [];
  const basicRunning = sensors.filter(sensor => Boolean(sensor.enabled)).length;
  const scenarioRunning = scenarios.filter(scenario => scenario.status === "RUNNING").length;
  const scenarioPaused = scenarios.filter(scenario => scenario.status === "PAUSED").length;
  const scenarioActive = scenarioRunning + scenarioPaused;
  const published = Number(current.runtimeStats?.mqttPublished || 0);

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText("basicRuntimeValue", `${basicRunning} / ${sensors.length}`);
  setText("basicRuntimeDetail", `${basicRunning} running`);
  setText("scenarioRuntimeValue", `${scenarioActive} / ${scenarios.length}`);
  setText(
    "scenarioRuntimeDetail",
    scenarioPaused > 0
      ? `${scenarioRunning} running · ${scenarioPaused} paused`
      : `${scenarioRunning} running`
  );
  setText("mqttRuntimeValue", published.toLocaleString());
  setText("mqttRuntimeDetail", "since service start");

  document.getElementById("basicRuntimeStat")?.classList.toggle("is-active", basicRunning > 0);
  document.getElementById("scenarioRuntimeStat")?.classList.toggle("is-active", scenarioActive > 0);
  document.getElementById("scenarioRuntimeStat")?.classList.toggle("has-paused", scenarioPaused > 0);
  document.getElementById("mqttRuntimeStat")?.classList.toggle("is-active", published > 0);
}

function renderStatus() {
  const buildVersion =
    document.getElementById(
      "buildVersion"
    );

  if (
    buildVersion &&
    current.application
  ) {
    buildVersion.textContent =
      `${current.application.version} · build ${current.application.build}`;
  }

  const mqtt =
    document.getElementById(
      "mqtt"
    );

  mqtt.className =
    `status ${
      current.mqtt.connected
        ? "connected"
        : "disconnected"
    }`;

  mqtt.textContent =
    current.mqtt.connected
      ? "● MQTT connected"
      : "● MQTT disconnected";
}

function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

async function writeClipboard(text, message = "Copied to clipboard") {
  let copied = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {}

  if (!copied) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      copied = document.execCommand("copy");
    } finally {
      area.remove();
    }
  }

  if (!copied) {
    alert("Unable to copy automatically. Please copy the value manually.");
    return;
  }

  const toast = document.createElement("div");
  toast.className = "clipboard-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add("visible"), 10);
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 1500);
}

function copyBasicInjectionName(id) {
  const sensor = current?.sensors?.find(sensor => sensor.id === id);
  if (!sensor) return;
  writeClipboard(sensor.name, "Basic Injection name copied");
}

function sensorMetricTopic(sensor, metric) {
  const explicit = String(metric.topic || "").trim().replace(/^\/+|\/+$/g, "");
  if (explicit) return explicit;
  const prefix = String(sensor.topicPrefix || current?.mqtt?.topicPrefix || "sensors/ble_gateway/sensor")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return `${prefix}/${metric.key}_${sensor.uid}/state`;
}

function copyMosquittoSubscribe(id) {
  const sensor = current?.sensors?.find(sensor => sensor.id === id);
  if (!sensor) return;

  const topics = [...new Set(
    (sensor.metrics || [])
      .filter(metric => metric.enabled !== false)
      .map(metric => sensorMetricTopic(sensor, metric))
      .filter(Boolean)
  )];

  if (topics.length === 0) {
    alert("This Basic Injection has no enabled MQTT metric to monitor.");
    return;
  }

  const topicArgs = topics.map(topic => `-t ${shellQuote(topic)}`).join(" ");
  const command = `docker compose exec mosquitto mosquitto_sub -h localhost -v ${topicArgs}`;
  writeClipboard(command, "mosquitto_sub command copied");
}

function renderSensors() {
  document.getElementById("sensors").innerHTML = visibleItems("basic").map(sensor => {
    const collapsed =
      isCollapsed(
        "sensors",
        sensor.id
      );

    return `
    <section class="sensor ${collapsed ? "is-collapsed" : ""}">
      <div class="sensor-head">
        <div class="grow">
          <div class="sensor-title-row">
            <h2 data-live-sensor-name="${esc(sensor.id)}">${esc(sensor.name)}</h2>
            <button class="icon-action" type="button" onclick="copyBasicInjectionName('${sensor.id}')" title="Copy Basic Injection name" aria-label="Copy Basic Injection name">⧉</button>
            <button class="icon-action terminal-action" type="button" onclick="copyMosquittoSubscribe('${sensor.id}')" title="Copy mosquitto_sub command" aria-label="Copy mosquitto_sub command">&gt;_</button>
          </div>
          <small>
            UID: <span data-live-sensor-uid="${esc(sensor.id)}">${esc(sensor.uid)}</span> ·
            <span class="sensor-status ${sensor.enabled?"running":"stopped"}">
              ${sensor.enabled?"RUNNING":"STOPPED"}
            </span>
          </small>
        </div>

        ${collapseButton(
          "sensors",
          sensor.id
        )}

        <button
          class="${sensor.enabled?"btn-stop":"btn-start"}"
          onclick="sensorAction('${sensor.id}','${sensor.enabled?"stop":"start"}')"
        >
          ${sensor.enabled?"■ Stop":"▶ Start"}
        </button>
        <button
          class="btn-publish"
          onclick="sensorAction('${sensor.id}','publish')"
        >
          Publish now
        </button>
        <button
          class="btn-copy"
          onclick="copySensor('${sensor.id}')"
        >
          Copy
        </button>
        <button class="danger" onclick="deleteSensor('${sensor.id}')">Delete</button>
      </div>

      <div
        class="collapsible-body"
        ${collapsed ? "hidden" : ""}
      >
      <div class="config">
        <label>Name <input value="${esc(sensor.name)}" oninput="queueSensorPatch('${sensor.id}',{name:this.value})" onblur="flushSensorPatch('${sensor.id}')" onkeydown="commitSensorInput(event,'${sensor.id}')"></label>
        <label>Folder <select onchange="patchSensor('${sensor.id}',{folderId:this.value || null})">${folderSelectOptions("basic", sensor.folderId)}</select></label>
        <label>UID <input value="${esc(sensor.uid)}" oninput="queueSensorPatch('${sensor.id}',{uid:this.value})" onblur="flushSensorPatch('${sensor.id}')" onkeydown="commitSensorInput(event,'${sensor.id}')"></label>
        <label class="topic-prefix-label">Topic prefix <input class="topic-prefix-input" value="${esc(sensor.topicPrefix || current.mqtt.topicPrefix || 'sensors/ble_gateway/sensor')}" oninput="queueSensorPatch('${sensor.id}',{topicPrefix:this.value})" onblur="flushSensorPatch('${sensor.id}')" onkeydown="commitSensorInput(event,'${sensor.id}')" placeholder="${esc(current.mqtt.topicPrefix || 'sensors/ble_gateway/sensor')}"></label>
        <label>Interval (s) <input class="interval" type="number" min="1" value="${sensor.intervalSeconds}" oninput="queueSensorIntervalPatch('${sensor.id}',this.value)" onblur="flushSensorPatch('${sensor.id}')" onkeydown="commitSensorInput(event,'${sensor.id}')"></label>
      </div>
      <div class="metrics">
        ${sensor.metrics.map(metric => `
          ${
            (() => {
              const scenarioLock =
                (current.scenarioLocks || []).find(
                  lock =>
                    lock.sensorUid === sensor.uid &&
                    lock.metricKey === metric.key
                );

              const lockedByScenario =
                Boolean(
                  scenarioLock
                );

              const lockNames =
                scenarioLock?.scenarios
                  ?.map(
                    scenario =>
                      scenario.name
                  )
                  .join(", ")
                ?? "";

              return `
          <div class="metric-card ${lockedByScenario ? "metric-scenario-locked" : ""}">
            ${
              lockedByScenario
                ? `<div class="scenario-lock-banner">
                    Controlled by scenario: ${esc(lockNames || metric.key)}
                  </div>`
                : ""
            }

            <div class="metric-main">
              <input class="switch" type="checkbox" ${metric.enabled?"checked":""} ${lockedByScenario?"disabled":""} onchange="patchMetric('${sensor.id}','${metric.id}',{enabled:this.checked})" title="Enable metric">
              <input value="${esc(metric.key)}" ${lockedByScenario?"disabled":""} onchange="patchMetric('${sensor.id}','${metric.id}',{key:this.value})" placeholder="metric key">
              <input value="${esc(metric.value)}" ${lockedByScenario?"disabled":""} onchange="patchMetric('${sensor.id}','${metric.id}',{value:this.value})" placeholder="value">
              <input value="${esc(metric.unit)}" ${lockedByScenario?"disabled":""} onchange="patchMetric('${sensor.id}','${metric.id}',{unit:this.value})" placeholder="unit">
              <select ${lockedByScenario?"disabled":""} onchange="patchMetric('${sensor.id}','${metric.id}',{mode:this.value})">
                <option value="manual" ${metric.mode==="manual"?"selected":""}>Manual</option>
                <option value="random" ${metric.mode==="random"?"selected":""}>Random</option>
                <option value="ramp" ${metric.mode==="ramp"?"selected":""}>Ramp</option>
                <option value="timeline" ${metric.mode==="timeline"?"selected":""}>Timeline</option>
              </select>
              <button class="danger" onclick="deleteMetric('${sensor.id}','${metric.id}')">×</button>
            </div>
            <div class="metric-topic-override">
              <label>Topic override
                <input value="${esc(metric.topic || "")}" onchange="patchMetric('${sensor.id}','${metric.id}',{topic:this.value})" placeholder="Optional exact MQTT topic">
              </label>
            </div>

            ${metric.mode==="random" ? `
              <div class="mode-config">
                <label>Min <input value="${esc(metric.randomMin)}" onchange="patchMetric('${sensor.id}','${metric.id}',{randomMin:this.value})"></label>
                <label>Max <input value="${esc(metric.randomMax)}" onchange="patchMetric('${sensor.id}','${metric.id}',{randomMax:this.value})"></label>
                <span>New random value on every publish</span>
              </div>` : ""}

            ${metric.mode==="ramp" ? `
              <div class="mode-config">
                <label>Start <input value="${esc(metric.rampStart)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampStart:this.value,value:this.value})"></label>
                <label>End <input value="${esc(metric.rampEnd)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampEnd:this.value})"></label>
                <label>Step <input value="${esc(metric.rampStep)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampStep:this.value})"></label>
                <span>Ping-pong ramp on each publish</span>
              </div>` : ""}

            ${metric.mode==="timeline" ? `
              <div class="mode-config timeline-editor">
                <div class="timeline-title">
                  <strong>Timeline</strong>
                  <button onclick="addTimelinePoint('${sensor.id}','${metric.id}')">+ Point</button>
                </div>
                ${(metric.timeline||[]).sort((a,b)=>a.offsetSeconds-b.offsetSeconds).map((point,index)=>`
                  <div class="timeline-point">
                    <label>At <input type="number" min="0" value="${point.offsetSeconds}" onchange="updateTimelinePoint('${sensor.id}','${metric.id}',${index},'offsetSeconds',Number(this.value))"> s</label>
                    <label>Value <input value="${esc(point.value)}" onchange="updateTimelinePoint('${sensor.id}','${metric.id}',${index},'value',this.value)"></label>
                    <button class="danger" onclick="deleteTimelinePoint('${sensor.id}','${metric.id}',${index})">×</button>
                  </div>`).join("")}
              </div>` : ""}

            <div class="topic" data-live-sensor-topic="${esc(sensor.id)}" data-metric-key="${esc(metric.key)}" data-explicit-topic="${esc(metric.topic || "")}">${esc(metric.topic || `${sensor.topicPrefix || current.mqtt.topicPrefix || "sensors/ble_gateway/sensor"}/${metric.key}_${sensor.uid}/state`)}</div>
          </div>`;
            })()
          }
        `).join("")}
      </div>
      <button class="addmetric" onclick="addMetric('${sensor.id}')">+ Add metric</button>
      </div>
    </section>`;
  }).join("");

}

function formatScenarioDuration(
  totalSeconds
) {
  const seconds =
    Math.max(
      0,
      Number(
        totalSeconds
      ) || 0
    );

  const minutes =
    Math.floor(
      seconds /
      60
    );

  const remaining =
    seconds %
    60;

  return `${minutes} min ${remaining} sec`;
}

function formatScenarioStartedAt(
  scenario
) {
  if (
    !scenario.startedAt
  ) {
    return "—";
  }

  return new Date(
    scenario.startedAt
  ).toLocaleString();
}

function scenarioElapsed(
  scenario
) {
  if (
    scenario.status ===
    "PAUSED"
  ) {
    return Math.floor(
      (
        scenario.elapsedBeforePause
        || 0
      ) /
      1000
    );
  }

  if (
    scenario.status !==
      "RUNNING" ||
    !scenario.startedAt
  ) {
    return 0;
  }

  return Math.floor(
    (
      Date.now() -
      scenario.startedAt +
      (
        scenario.elapsedBeforePause
        || 0
      )
    ) /
    1000
  );
}

function actionSensorOptions(
  selectedUid
) {
  return current.sensors
    .map(
      sensor =>
        `<option value="${esc(sensor.uid)}" ${
          sensor.uid === selectedUid
            ? "selected"
            : ""
        }>${esc(sensor.name)} · ${esc(sensor.uid)}</option>`
    )
    .join("");
}

function actionMetricOptions(
  sensorUid,
  selectedKey
) {
  const sensor =
    current.sensors.find(
      currentSensor =>
        currentSensor.uid ===
        sensorUid
    );

  return (sensor?.metrics || [])
    .map(
      metric =>
        `<option value="${esc(metric.key)}" ${
          metric.key === selectedKey
            ? "selected"
            : ""
        }>${esc(metric.key)}</option>`
    )
    .join("");
}

function scenarioActionNeedsMetric(
  type
) {
  return [
    "SET_VALUE",
    "ENABLE_METRIC",
    "DISABLE_METRIC"
  ].includes(type);
}

function renderScenarios() {
  const target =
    document.getElementById(
      "scenarios"
    );

  if (!target) {
    return;
  }

  if (visibleItems("scenarios").length === 0) {
    target.innerHTML =
      `<div class="empty-state">
        No scenarios yet. Create one to automate alert and recovery tests.
      </div>`;
    return;
  }

  target.innerHTML =
    visibleItems("scenarios").map(
      scenario => {

        const elapsed =
          scenarioElapsed(
            scenario
          );

        const collapsed =
          isCollapsed(
            "scenarios",
            scenario.id
          );

        const locked =
          scenario.status === "RUNNING" ||
          scenario.status === "PAUSED";

        const statusClass =
          `scenario-${String(
            scenario.status
          ).toLowerCase()}`;

        const actions =
          [...(scenario.actions || [])]
            .sort(
              (left, right) =>
                left.offsetSeconds -
                right.offsetSeconds
            );

        return `
          <article class="scenario-card ${locked ? "scenario-locked" : ""} ${collapsed ? "is-collapsed" : ""}">

            <div class="scenario-head">
              <div class="grow">

                <input
                  class="scenario-name"
                  value="${esc(scenario.name)}"
                  ${locked ? "disabled" : ""}
                  onchange="patchScenario('${scenario.id}',{name:this.value})"
                >

                <input
                  class="scenario-description"
                  value="${esc(scenario.description || "")}"
                  placeholder="Description"
                  ${locked ? "disabled" : ""}
                  onchange="patchScenario('${scenario.id}',{description:this.value})"
                >

              </div>

              <label class="scenario-folder-select">Folder
                <select ${locked ? "disabled" : ""} onchange="patchScenario('${scenario.id}',{folderId:this.value || null})">
                  ${folderSelectOptions("scenarios", scenario.folderId)}
                </select>
              </label>

              ${collapseButton(
                "scenarios",
                scenario.id
              )}

              <span class="scenario-status ${statusClass}">
                ${esc(scenario.status)}
              </span>

              <div class="scenario-runtime-info">
                <span>
                  <strong>Started at:</strong>
                  ${esc(formatScenarioStartedAt(scenario))}
                </span>

                <span>
                  <strong>Expected end:</strong>
                  ${esc(formatScenarioDuration(
                    scenario.expectedDurationSeconds
                    ?? 0
                  ))}
                </span>

                <span class="scenario-elapsed">
                  <strong>Elapsed:</strong>
                  ${elapsed}s
                </span>
              </div>

              ${
                scenario.status === "RUNNING"
                  ? `<button class="btn-pause" onclick="scenarioAction('${scenario.id}','pause')">Pause</button>`
                  : scenario.status === "PAUSED"
                    ? `<button class="btn-start" onclick="scenarioAction('${scenario.id}','resume')">Resume</button>`
                    : `<button class="btn-start" onclick="scenarioAction('${scenario.id}','start')">Start</button>`
              }

              <button
                class="btn-stop"
                onclick="scenarioAction('${scenario.id}','stop')"
                ${locked ? "" : "disabled"}
              >
                Stop
              </button>

              <button
                class="btn-copy"
                onclick="copyScenario('${scenario.id}')"
              >
                Copy
              </button>

              ${
                !locked
                  ? `
                    <button class="btn-validate" onclick="validateScenarioUi('${scenario.id}')">Validate</button>
                    <button class="btn-ramp" onclick="openRampGenerator('${scenario.id}')">Generate ramp</button>
                    <button class="danger" onclick="deleteScenario('${scenario.id}')">Delete</button>
                  `
                  : ""
              }

            </div>

            <div
              class="collapsible-body"
              ${collapsed ? "hidden" : ""}
            >

            ${
              locked
                ? `<div class="scenario-readonly-note">
                    Scenario active — configuration locked. Stop the scenario to edit it.
                  </div>`
                : ""
            }

            <div
              id="scenario-validation-${scenario.id}"
              class="scenario-validation"
            ></div>

            <div
              id="ramp-generator-${scenario.id}"
              class="ramp-generator"
              hidden
            >
              <div class="ramp-grid">

                <label>
                  Sensor
                  <select
                    id="ramp-sensor-${scenario.id}"
                    onchange="refreshRampMetrics('${scenario.id}')"
                  >
                    ${actionSensorOptions(current.sensors[0]?.uid)}
                  </select>
                </label>

                <label>
                  Metric
                  <select id="ramp-metric-${scenario.id}">
                    ${actionMetricOptions(
                      current.sensors[0]?.uid,
                      current.sensors[0]?.metrics?.[0]?.key
                    )}
                  </select>
                </label>

                <label>
                  Start
                  <input id="ramp-start-${scenario.id}" value="25">
                </label>

                <label>
                  End
                  <input id="ramp-end-${scenario.id}" value="31">
                </label>

                <label>
                  Step
                  <input id="ramp-step-${scenario.id}" value="0.5">
                </label>

                <label>
                  Every
                  <input id="ramp-every-${scenario.id}" type="number" min="1" value="15">
                  s
                </label>

                <label>
                  Start at
                  <input id="ramp-offset-${scenario.id}" type="number" min="0" value="0">
                  s
                </label>

                <button class="primary" onclick="generateRamp('${scenario.id}')">
                  Add ramp actions
                </button>

              </div>
            </div>

            <div class="scenario-actions">
              ${
                actions.length === 0
                  ? `<div class="empty-inline">No actions configured.</div>`
                  : actions.map(
                      action => {

                        const needsMetric =
                          scenarioActionNeedsMetric(
                            action.type
                          );

                        return `
                          <div class="scenario-action">

                            <label>
                              At
                              <input
                                type="number"
                                min="0"
                                value="${action.offsetSeconds}"
                                ${locked ? "disabled" : ""}
                                onchange="patchScenarioAction('${scenario.id}','${action.id}',{offsetSeconds:Number(this.value)})"
                              >
                              s
                            </label>

                            <select
                              ${locked ? "disabled" : ""}
                              onchange="patchScenarioAction('${scenario.id}','${action.id}',{type:this.value})"
                            >
                              <option value="SET_VALUE" ${action.type==="SET_VALUE"?"selected":""}>Set value</option>
                              <option value="ENABLE_METRIC" ${action.type==="ENABLE_METRIC"?"selected":""}>Enable metric</option>
                              <option value="DISABLE_METRIC" ${action.type==="DISABLE_METRIC"?"selected":""}>Disable metric</option>
                              <option value="START_SENSOR" ${action.type==="START_SENSOR"?"selected":""}>Start sensor</option>
                              <option value="STOP_SENSOR" ${action.type==="STOP_SENSOR"?"selected":""}>Stop sensor</option>
                              <option value="PUBLISH_SENSOR" ${action.type==="PUBLISH_SENSOR"?"selected":""}>Publish sensor</option>
                            </select>

                            <select
                              ${locked ? "disabled" : ""}
                              onchange="patchScenarioAction('${scenario.id}','${action.id}',{sensorUid:this.value,metricKey:null})"
                            >
                              ${actionSensorOptions(action.sensorUid || current.sensors.find(s => s.id === action.sensorId)?.uid)}
                            </select>

                            ${
                              needsMetric
                                ? `<select
                                    ${locked ? "disabled" : ""}
                                    onchange="patchScenarioAction('${scenario.id}','${action.id}',{metricKey:this.value})"
                                  >
                                    ${actionMetricOptions(
                                      action.sensorUid || current.sensors.find(s => s.id === action.sensorId)?.uid,
                                      action.metricKey || current.sensors.find(s => s.id === action.sensorId)?.metrics.find(m => m.id === action.metricId)?.key
                                    )}
                                  </select>`
                                : `<span class="action-placeholder">—</span>`
                            }

                            ${
                              action.type === "SET_VALUE"
                                ? `<input
                                    class="action-value"
                                    value="${esc(action.value ?? "")}"
                                    placeholder="value"
                                    ${locked ? "disabled" : ""}
                                    onchange="patchScenarioAction('${scenario.id}','${action.id}',{value:this.value})"
                                  >`
                                : `<span class="action-placeholder">—</span>`
                            }

                            ${
                              !locked
                                ? `<button class="danger" onclick="deleteScenarioAction('${scenario.id}','${action.id}')">×</button>`
                                : `<span class="action-placeholder">—</span>`
                            }

                          </div>
                        `;
                      }
                    )
                    .join("")
              }
            </div>

            ${
              !locked
                ? `<button class="addmetric" onclick="addScenarioAction('${scenario.id}')">+ Add action</button>`
                : ""
            }

            </div>

          </article>
        `;
      }
    )
    .join("");
}

function setSelectOptions(
  id,
  values,
  allLabel
) {
  const select =
    document.getElementById(id);

  if (!select) {
    return;
  }

  const previous =
    select.value;

  select.innerHTML =
    [
      `<option value="">${esc(allLabel)}</option>`,
      ...values.map(
        value =>
          `<option value="${esc(value)}">${esc(value)}</option>`
      )
    ].join("");

  if (
    values.includes(previous)
  ) {
    select.value =
      previous;
  }
}

function renderLogFilters() {
  const sensors =
    [...new Set(
      current.logs
        .map(log => log.sensor)
        .filter(Boolean)
    )]
    .sort();

  const metrics =
    [...new Set(
      current.logs
        .map(log => log.metric)
        .filter(Boolean)
    )]
    .sort();

  setSelectOptions(
    "logSensor",
    sensors,
    "All sensors"
  );

  setSelectOptions(
    "logMetric",
    metrics,
    "All metrics"
  );
}

function renderLogs() {
  const periodMinutes =
    Number(
      document.getElementById(
        "logPeriod"
      )?.value ?? 5
    );

  const sensorFilter =
    document.getElementById(
      "logSensor"
    )?.value ?? "";

  const metricFilter =
    document.getElementById(
      "logMetric"
    )?.value ?? "";

  const statusFilter =
    document.getElementById(
      "logStatus"
    )?.value ?? "";

  const cutoff =
    Date.now() -
    periodMinutes *
    60 *
    1000;

  const logs =
    current.logs.filter(
      log =>
        new Date(
          log.time
        ).getTime() >= cutoff &&
        (
          !sensorFilter ||
          log.sensor ===
            sensorFilter
        ) &&
        (
          !metricFilter ||
          log.metric ===
            metricFilter
        ) &&
        (
          !statusFilter ||
          log.status ===
            statusFilter
        )
    );

  const count =
    document.getElementById(
      "logCount"
    );

  if (count) {
    count.textContent =
      `${logs.length} event${
        logs.length === 1
          ? ""
          : "s"
      }`;
  }

  document.getElementById(
    "logRows"
  ).innerHTML =
    logs.map(
      log => `
        <tr>
          <td>${new Date(log.time).toLocaleTimeString()}</td>
          <td>${esc(log.sensor||"—")}</td>
          <td>${esc(log.metric||"—")}</td>
          <td>${esc(log.value||"—")}</td>
          <td>
            <span class="log-status status-${String(log.status).toLowerCase()}">
              ${esc(log.status)}
            </span>
          </td>
          <td class="topic">${esc(log.topic||log.message||"")}</td>
        </tr>`
    )
    .join("");
}

const sensorPatchTimers =
  new Map();

const pendingSensorPatches =
  new Map();

const SENSOR_PATCH_DEBOUNCE_MS =
  400;

function updateLocalSensor(
  id,
  body
) {
  const sensor =
    current.sensors.find(
      candidate =>
        candidate.id === id
    );

  if (sensor) {
    Object.assign(
      sensor,
      body
    );
  }
}

function normalizedTopicPrefix(
  value
) {
  return String(
    value ||
    current.mqtt.topicPrefix ||
    "sensors/ble_gateway/sensor"
  )
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function updateSensorLiveUi(
  id
) {
  const sensor =
    current.sensors.find(
      candidate =>
        candidate.id === id
    );

  if (!sensor) {
    return;
  }

  document
    .querySelectorAll(
      "[data-live-sensor-name]"
    )
    .forEach(element => {
      if (
        element.dataset.liveSensorName ===
        id
      ) {
        element.textContent =
          sensor.name;
      }
    });

  document
    .querySelectorAll(
      "[data-live-sensor-uid]"
    )
    .forEach(element => {
      if (
        element.dataset.liveSensorUid ===
        id
      ) {
        element.textContent =
          sensor.uid;
      }
    });

  const topicPrefix =
    normalizedTopicPrefix(
      sensor.topicPrefix
    );

  document
    .querySelectorAll(
      "[data-live-sensor-topic]"
    )
    .forEach(element => {
      if (
        element.dataset.liveSensorTopic !==
        id
      ) {
        return;
      }

      const explicitTopic = element.dataset.explicitTopic || "";
      if (explicitTopic) {
        element.textContent = explicitTopic;
        return;
      }

      const metricKey =
        element.dataset.metricKey ||
        "";

      element.textContent =
        `${topicPrefix}/${metricKey}_${sensor.uid}/state`;
    });
}

function queueSensorPatch(
  id,
  body
) {
  updateLocalSensor(
    id,
    body
  );

  updateSensorLiveUi(
    id
  );

  pendingSensorPatches.set(
    id,
    {
      ...(pendingSensorPatches.get(id) || {}),
      ...body
    }
  );

  const existingTimer =
    sensorPatchTimers.get(id);

  if (existingTimer) {
    clearTimeout(
      existingTimer
    );
  }

  sensorPatchTimers.set(
    id,
    setTimeout(
      () => {
        flushSensorPatch(id);
      },
      SENSOR_PATCH_DEBOUNCE_MS
    )
  );
}

function queueSensorIntervalPatch(
  id,
  value
) {
  const intervalSeconds =
    Number(value);

  if (
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < 1
  ) {
    return;
  }

  queueSensorPatch(
    id,
    { intervalSeconds }
  );
}

async function flushSensorPatch(
  id
) {
  const timer =
    sensorPatchTimers.get(id);

  if (timer) {
    clearTimeout(timer);
    sensorPatchTimers.delete(id);
  }

  const body =
    pendingSensorPatches.get(id);

  if (!body) {
    return;
  }

  pendingSensorPatches.delete(id);

  await api(
    `/api/sensors/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body)
    }
  );

  await refresh();
}

function commitSensorInput(
  event,
  id
) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  flushSensorPatch(id);
  event.currentTarget.blur();
}

async function action(url){ await api(url,{method:"POST"}); await refresh(); }
async function sensorAction(id, actionName){ await flushSensorPatch(id); await action(`/api/sensors/${id}/${actionName}`); }
async function patchSensor(id, body){ await api(`/api/sensors/${id}`,{method:"PATCH",body:JSON.stringify(body)}); await refresh(); }
async function patchMetric(sid, mid, body){ await api(`/api/sensors/${sid}/metrics/${mid}`,{method:"PATCH",body:JSON.stringify(body)}); await refresh(); }

async function addSensor(){
  const n = current.sensors.length + 1;
  await api("/api/sensors",{method:"POST",body:JSON.stringify({name:`Test Sensor ${String(n).padStart(2,"0")}`,uid:`test_${String(n).padStart(2,"0")}`,intervalSeconds:15,folderId:folderSelection.basic && !folderSelection.basic.startsWith("__") ? folderSelection.basic : null})});
  await refresh();
}
async function copySensor(id){
  await api(
    `/api/sensors/${id}/copy`,
    {
      method:"POST"
    }
  );

  await refresh();
}

async function deleteSensor(id){
  if(!confirm("Delete this sensor?")) return;
  await api(`/api/sensors/${id}`,{method:"DELETE"}); await refresh();
}
async function addMetric(id){
  await api(`/api/sensors/${id}/metrics`,{method:"POST",body:JSON.stringify({key:"temperature",value:"20",unit:"°C",enabled:true})}); await refresh();
}
async function deleteMetric(sid,mid){
  await api(`/api/sensors/${sid}/metrics/${mid}`,{method:"DELETE"}); await refresh();
}
async function addTimelinePoint(sensorId, metricId){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  const last = timeline[timeline.length - 1];

  timeline.push({
    offsetSeconds: last ? Number(last.offsetSeconds) + 60 : 0,
    value: metric.value
  });

  await patchMetric(sensorId, metricId, {timeline});
}

async function updateTimelinePoint(sensorId, metricId, index, field, value){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  timeline[index] = {...timeline[index], [field]: value};

  await patchMetric(sensorId, metricId, {timeline});
}

async function deleteTimelinePoint(sensorId, metricId, index){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  timeline.splice(index, 1);

  await patchMetric(sensorId, metricId, {timeline});
}

async function validateScenarioUi(id){
  try {
    const result =
      await api(
        `/api/scenarios/${id}/validate`
      );

    const target =
      document.getElementById(
        `scenario-validation-${id}`
      );

    if (!target) {
      return;
    }

    if (result.valid) {
      target.className =
        "scenario-validation valid";

      target.innerHTML =
        "✓ Scenario valid";
      return;
    }

    target.className =
      "scenario-validation invalid";

    target.innerHTML =
      `<strong>Scenario invalid</strong><ul>${
        result.issues.map(
          issue =>
            `<li>${esc(issue.message)}</li>`
        ).join("")
      }</ul>`;

  } catch (error) {
    alert(
      `Validation failed: ${error.message}`
    );
  }
}

function openRampGenerator(id){
  const target =
    document.getElementById(
      `ramp-generator-${id}`
    );

  if (!target) {
    return;
  }

  target.hidden =
    !target.hidden;
}

function refreshRampMetrics(id){
  const sensorUid =
    document.getElementById(
      `ramp-sensor-${id}`
    )?.value;

  const metricSelect =
    document.getElementById(
      `ramp-metric-${id}`
    );

  if (!metricSelect) {
    return;
  }

  metricSelect.innerHTML =
    actionMetricOptions(
      sensorUid,
      null
    );
}

async function generateRamp(id){
  const sensorUid =
    document.getElementById(
      `ramp-sensor-${id}`
    )?.value;

  const metricKey =
    document.getElementById(
      `ramp-metric-${id}`
    )?.value;

  const startValue =
    document.getElementById(
      `ramp-start-${id}`
    )?.value;

  const endValue =
    document.getElementById(
      `ramp-end-${id}`
    )?.value;

  const step =
    document.getElementById(
      `ramp-step-${id}`
    )?.value;

  const everySeconds =
    Number(
      document.getElementById(
        `ramp-every-${id}`
      )?.value
      ?? 15
    );

  const startOffsetSeconds =
    Number(
      document.getElementById(
        `ramp-offset-${id}`
      )?.value
      ?? 0
    );

  try {
    const result =
      await api(
        `/api/scenarios/${id}/generate-ramp`,
        {
          method:"POST",
          body:JSON.stringify({
            sensorUid,
            metricKey,
            startValue,
            endValue,
            step,
            everySeconds,
            startOffsetSeconds
          })
        }
      );

    alert(
      `${result.generated} ramp actions added.`
    );

    const generator =
      document.getElementById(
        `ramp-generator-${id}`
      );

    if (generator) {
      generator.hidden =
        true;
    }

    await refresh();

  } catch (error) {
    alert(
      `Ramp generation failed: ${error.message}`
    );
  }
}

async function addScenario(){
  await api(
    "/api/scenarios",
    {
      method:"POST",
      body:JSON.stringify({
        name:`Scenario ${(current.scenarios?.length || 0) + 1}`,
        description:"",
        folderId:folderSelection.scenarios && !folderSelection.scenarios.startsWith("__") ? folderSelection.scenarios : null
      })
    }
  );

  await refresh();
}

async function patchScenario(id, body){
  await api(
    `/api/scenarios/${id}`,
    {
      method:"PATCH",
      body:JSON.stringify(body)
    }
  );

  await refresh();
}

async function copyScenario(id){
  await api(
    `/api/scenarios/${id}/copy`,
    {
      method:"POST"
    }
  );

  await refresh();
}

async function deleteScenario(id){
  if(!confirm("Delete this scenario?")) return;

  await api(
    `/api/scenarios/${id}`,
    {
      method:"DELETE"
    }
  );

  await refresh();
}

async function scenarioAction(id, actionName){
  await api(
    `/api/scenarios/${id}/${actionName}`,
    {
      method:"POST"
    }
  );

  await refresh();
}

async function addScenarioAction(scenarioId){
  const firstSensor =
    current.sensors[0];

  if(!firstSensor){
    alert("Create at least one sensor first.");
    return;
  }

  const firstMetric =
    firstSensor.metrics?.[0];

  await api(
    `/api/scenarios/${scenarioId}/actions`,
    {
      method:"POST",
      body:JSON.stringify({
        offsetSeconds:0,
        type:"SET_VALUE",
        sensorUid:firstSensor.uid,
        metricKey:firstMetric?.key || null,
        value:firstMetric?.value ?? ""
      })
    }
  );

  await refresh();
}

async function patchScenarioAction(scenarioId, actionId, body){
  await api(
    `/api/scenarios/${scenarioId}/actions/${actionId}`,
    {
      method:"PATCH",
      body:JSON.stringify(body)
    }
  );

  await refresh();
}

async function deleteScenarioAction(scenarioId, actionId){
  await api(
    `/api/scenarios/${scenarioId}/actions/${actionId}`,
    {
      method:"DELETE"
    }
  );

  await refresh();
}

async function clearLogs(){ await api("/api/logs",{method:"DELETE"}); await refresh(); }

restoreMainTab();
refresh();
setInterval(refresh, 3000);
