import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";

export function setupVimCommands(view: EditorView, save: (force: boolean) => void): void {
  Vim.defineEx("w", "w", () => save(false));
  Vim.defineEx("w!", "w!", () => save(true));
}
