interface ShortcutRow {
  key: string;
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

    const urlTd = document.createElement("td");
    const urlInput = document.createElement("input");
    urlInput.value = rows[i].url;
    urlInput.placeholder = "https://example.com/";
    urlInput.dataset.index = String(i);
    urlInput.addEventListener("input", () => { rows[Number(urlInput.dataset.index)].url = urlInput.value; });
    urlTd.appendChild(urlInput);
    tr.appendChild(urlTd);

    const actionTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => {
      rows.splice(i, 1);
      renderRows(rows, tbody);
    });
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }
}

async function loadRows(): Promise<ShortcutRow[]> {
  const { globalShortcuts } = await chrome.storage.sync.get("globalShortcuts");
  return (globalShortcuts ?? []) as ShortcutRow[];
}

async function saveRows(rows: ShortcutRow[]): Promise<void> {
  await chrome.storage.sync.set({ globalShortcuts: rows });
}

async function init(): Promise<void> {
  const tbody = document.getElementById("rows")!;
  const status = document.getElementById("status")!;
  let rows = await loadRows();
  renderRows(rows, tbody);

  document.getElementById("addBtn")!.addEventListener("click", () => {
    rows.push({ key: "", url: "" });
    renderRows(rows, tbody);
  });

  document.getElementById("saveBtn")!.addEventListener("click", async () => {
    const valid = rows.filter((r) => r.key.trim() && r.url.trim());
    await saveRows(valid);
    rows = valid;
    renderRows(rows, tbody);
    status.textContent = "Saved.";
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
