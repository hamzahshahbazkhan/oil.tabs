import { EditorView, basicSetup } from "codemirror";
import { vim } from "@replit/codemirror-vim";
import { snapshotToText } from "./serialize";
import { headerLineDeco } from "./decorations";
import { setupVimCommands } from "./vimCommands";
import type { BgToBuffer } from "../shared/messages";
import type { Snapshot } from "../shared/types";

let view: EditorView;

function init() {
  try {
    view = new EditorView({
      extensions: [
        basicSetup,
        vim(),
        headerLineDeco,
      ],
      parent: document.getElementById("editor")!,
    });

    setupVimCommands(view);

    chrome.runtime.onMessage.addListener((message: BgToBuffer) => {
      switch (message.type) {
        case "SNAPSHOT":
          renderSnapshot(message.snapshot);
          break;
        case "APPLY_RESULT":
          if (message.ok) {
            renderSnapshot(message.snapshot);
          } else {
            alert(`tab-oil error: ${message.error}`);
          }
          break;
        case "STALE_WARNING":
          console.warn("tab-oil: snapshot may be stale");
          break;
      }
    });

    chrome.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
  } catch (e) {
    console.error("tab-oil init error:", e);
    document.body.textContent = `tab-oil init error: ${e}`;
  }
}

function renderSnapshot(snapshot: Snapshot): void {
  const { text } = snapshotToText(snapshot);
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: text,
    },
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
