export interface VirtualFolder {
  id: number;
  name: string;
}

export interface SavedItem {
  url: string;
  title: string;
  savedAt: number;
}

export interface UserSettings {
  globalShortcuts: { key: string; url: string }[];
  largeDiffConfirmThreshold: number;
}

export interface ExtensionStorage {
  folders: VirtualFolder[];
  tabFolderMap: Record<number, number>;
  savedForLater: SavedItem[];
  mruTabIds: number[];
}
