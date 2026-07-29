import browser from "webextension-polyfill";

const BUFFER_TAB_ID_KEY = "bufferTabId";
const BUFFER_WINDOW_ID_KEY = "bufferWindowId";

export async function openOrFocusBufferTab(): Promise<void> {
  const stored = await browser.storage.session.get([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
  const existingTabId = stored[BUFFER_TAB_ID_KEY] as number | undefined;
  const existingWindowId = stored[BUFFER_WINDOW_ID_KEY] as number | undefined;

  if (existingWindowId !== undefined) {
    try {
      const win = await browser.windows.get(existingWindowId, { populate: false });
      if (win) {
        await browser.windows.update(win.id!, { focused: true });
        return;
      }
    } catch {
      await browser.storage.session.remove([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
    }
  } else if (existingTabId !== undefined) {
    try {
      const tab = await browser.tabs.get(existingTabId);
      if (tab && tab.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {
      await browser.storage.session.remove([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
    }
  }

  let left = 0;
  let top = 0;
  let width = 1200;
  let height = 800;
  try {
    const win = await browser.windows.getLastFocused();
    if (win && win.type === "normal" && win.width && win.height) {
      width = Math.round(win.width * 0.88);
      height = Math.round(win.height * 0.85);
      left = win.left! + Math.round((win.width - width) / 2);
      top = win.top! + Math.round((win.height - height) / 2);
    }
  } catch {
    // Use defaults
  }

  const popup = await browser.windows.create({
    url: browser.runtime.getURL("buffer.html"),
    type: "popup",
    width,
    height,
    left,
    top,
  });

  if (popup.tabs && popup.tabs[0] && popup.tabs[0].id !== undefined) {
    await browser.storage.session.set({
      [BUFFER_TAB_ID_KEY]: popup.tabs[0].id,
      [BUFFER_WINDOW_ID_KEY]: popup.id,
    });
  }
}

export async function getBufferTabId(): Promise<number | undefined> {
  const { [BUFFER_TAB_ID_KEY]: stored } = await browser.storage.session.get(BUFFER_TAB_ID_KEY);
  return stored as number | undefined;
}

export async function getBufferWindowId(): Promise<number | undefined> {
  const { [BUFFER_WINDOW_ID_KEY]: stored } = await browser.storage.session.get(BUFFER_WINDOW_ID_KEY);
  return stored as number | undefined;
}
