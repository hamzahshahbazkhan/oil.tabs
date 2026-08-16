import browser from "webextension-polyfill";

interface ShortcutRow {
  key: string;
  action: "focusOrOpen" | "cycleNext" | "cyclePrev";
  url: string;
}

function renderRows(rows: ShortcutRow[], tbody: HTMLElement): void {
  tbody.innerHTML = "";
  for (let i = 0; i < rows.length; i++) {
    const tr = document.createElement("tr");

    const keyTd = document.createElement("td");
    const keyInput = document.createElement("input");
    keyInput.value = rows[i].key;
    keyInput.placeholder = "e.g. Ctrl+Shift+1";
    keyInput.dataset.index = String(i);
    keyInput.addEventListener("input", () => { rows[Number(keyInput.dataset.index)].key = keyInput.value; });
    keyTd.appendChild(keyInput);
    tr.appendChild(keyTd);

    const actionTd = document.createElement("td");
    const actionSelect = document.createElement("select");
    actionSelect.dataset.index = String(i);
    actionSelect.addEventListener("change", () => {
      const idx = Number(actionSelect.dataset.index);
      rows[idx].action = actionSelect.value as ShortcutRow["action"];
      rows[idx].url = "";
      renderRows(rows, tbody);
    });
    for (const val of ["focusOrOpen", "cycleNext", "cyclePrev"]) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val === "focusOrOpen" ? "Focus or open URL" : val === "cycleNext" ? "Cycle to next tab (MRU)" : "Cycle to previous tab (MRU)";
      if (val === rows[i].action) opt.selected = true;
      actionSelect.appendChild(opt);
    }
    actionTd.appendChild(actionSelect);
    tr.appendChild(actionTd);

    const urlTd = document.createElement("td");
    if (rows[i].action === "focusOrOpen") {
      const urlInput = document.createElement("input");
      urlInput.value = rows[i].url;
      urlInput.placeholder = "https://example.com/";
      urlInput.dataset.index = String(i);
      urlInput.addEventListener("input", () => { rows[Number(urlInput.dataset.index)].url = urlInput.value; });
      urlTd.appendChild(urlInput);
    } else {
      urlTd.textContent = "—";
    }
    tr.appendChild(urlTd);

    const delTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => {
      rows.splice(i, 1);
      renderRows(rows, tbody);
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    tbody.appendChild(tr);
  }
}

async function loadRows(): Promise<ShortcutRow[]> {
  const { globalShortcuts } = await browser.storage.sync.get("globalShortcuts");
  return (globalShortcuts ?? []) as ShortcutRow[];
}

async function saveRows(rows: ShortcutRow[]): Promise<void> {
  await browser.storage.sync.set({ globalShortcuts: rows });
}

async function init(): Promise<void> {
  const tbody = document.getElementById("rows")!;
  const status = document.getElementById("status")!;
  let rows = await loadRows();
  renderRows(rows, tbody);

  document.getElementById("addBtn")!.addEventListener("click", () => {
    rows.push({ key: "", action: "focusOrOpen", url: "" });
    renderRows(rows, tbody);
  });

  document.getElementById("saveBtn")!.addEventListener("click", async () => {
    const invalid = rows.filter((r) => !r.key.trim() || (r.action === "focusOrOpen" && !r.url.trim()));
    if (invalid.length > 0) {
      status.textContent = `${invalid.length} shortcut row(s) need a key${invalid.some((r) => r.action === "focusOrOpen" && !r.url.trim()) ? " and URL" : ""}.`;
      return;
    }
    await saveRows(rows);
    status.textContent = "Saved.";
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
