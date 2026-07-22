export interface VirtualFolder {
  id: number;
  name: string;
}

export interface SavedItem {
  url: string;
  title: string;
  savedAt: number;
}

export interface GlobalShortcut {
  key: string;
  action: "focusOrOpen" | "cycleNext" | "cyclePrev";
  url: string;
}

export interface UserSettings {
  globalShortcuts: GlobalShortcut[];
  largeDiffConfirmThreshold: number;
}

export interface ExtensionStorage {
  folders: VirtualFolder[];
  tabFolderMap: Record<number, number>;
  savedForLater: SavedItem[];
  mruTabIds: number[];
}
