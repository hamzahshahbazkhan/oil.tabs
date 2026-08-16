import browser from "webextension-polyfill";
import { setupBufferUI } from "./BufferUI";

document.getElementById("closeBtn")?.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "CLOSE_BUFFER" });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupBufferUI);
} else {
  setupBufferUI();
}
