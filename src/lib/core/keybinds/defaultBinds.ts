import type { MessageKey } from '$lib/i18n/index.svelte'

export interface Keybinds {
  turnPageRight:          string;
  turnPageLeft:           string;
  firstPage:              string;
  lastPage:               string;
  turnChapterRight:       string;
  turnChapterLeft:        string;
  exitReader:             string;
  toggleReadingDirection: string;
  togglePageStyle:        string;
  toggleFullscreen:       string;
  openSettings:           string;
  toggleBookmark:         string;
  toggleAutoScroll:       string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  turnPageRight:          "ArrowRight",
  turnPageLeft:           "ArrowLeft",
  firstPage:              "ctrl+ArrowLeft",
  lastPage:               "ctrl+ArrowRight",
  turnChapterRight:       "]",
  turnChapterLeft:        "[",
  exitReader:             "Backspace",
  toggleReadingDirection: "d",
  togglePageStyle:        "q",
  toggleFullscreen:       "f",
  openSettings:           "o",
  toggleBookmark:         "m",
  toggleAutoScroll:       "s",
};

export const KEYBIND_LABELS: Record<keyof Keybinds, MessageKey> = {
  turnPageRight:          "keybinds.turnPageRight",
  turnPageLeft:           "keybinds.turnPageLeft",
  firstPage:              "keybinds.firstPage",
  lastPage:               "keybinds.lastPage",
  turnChapterRight:       "keybinds.turnChapterRight",
  turnChapterLeft:        "keybinds.turnChapterLeft",
  exitReader:             "keybinds.exitReader",
  toggleReadingDirection: "keybinds.toggleReadingDirection",
  togglePageStyle:        "keybinds.togglePageStyle",
  toggleFullscreen:       "keybinds.toggleFullscreen",
  openSettings:           "keybinds.openSettings",
  toggleBookmark:         "keybinds.toggleBookmark",
  toggleAutoScroll:       "keybinds.toggleAutoScroll",
};