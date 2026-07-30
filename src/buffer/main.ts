import { setupBufferUI } from "./BufferUI";

document.getElementById("closeBtn")?.addEventListener("click", () => window.close());

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupBufferUI);
} else {
  setupBufferUI();
}
