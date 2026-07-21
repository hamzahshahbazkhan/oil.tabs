import browser from "webextension-polyfill";

const BUFFER_TAB_ID_KEY = "bufferTabId";

export async function openOrFocusBufferTab(): Promise<void> {
  const { [BUFFER_TAB_ID_KEY]: stored } = await browser.storage.session.get(BUFFER_TAB_ID_KEY);
  const existingTabId = stored as number | undefined;

  if (existingTabId !== undefined) {
    try {
      const tab = await browser.tabs.get(existingTabId);
      if (tab && tab.id !== undefined) {
        await browser.tabs.update(tab.id, { active: true });
        if (tab.windowId !== undefined) {
          await browser.windows.update(tab.windowId, { focused: true });
        }
        return;
      }
    } catch {
      // Tab no longer exists, fall through to create new one
    }
  }

  const tab = await browser.tabs.create({
    url: browser.runtime.getURL("buffer.html"),
  });

  if (tab.id !== undefined) {
    await browser.storage.session.set({ [BUFFER_TAB_ID_KEY]: tab.id });
  }
}

export async function getBufferTabId(): Promise<number | undefined> {
  const { [BUFFER_TAB_ID_KEY]: stored } = await browser.storage.session.get(BUFFER_TAB_ID_KEY);
  return stored as number | undefined;
}
