import type { Board, OverlayMessage, PreloadProgress } from "@cso/shared";
import { api, connectControl, type GameInfo } from "./api.ts";

export const live = $state({
  connected: false,
  overlay: null as OverlayMessage | null,
  board: null as Board | null,
  preload: {} as Record<number, PreloadProgress>,
  imageVersion: 0,
  games: [] as GameInfo[],
  error: "" as string,
});

export function startLive(): void {
  connectControl(
    (message) => {
      if (message.type === "overlay") live.overlay = message.message;
      else if (message.type === "board") live.board = message.board;
      else if (message.type === "preload") live.preload[message.progress.deckId] = message.progress;
      else if (message.type === "image") live.imageVersion++;
    },
    (connected) => (live.connected = connected),
  );
}

export async function loadGames(): Promise<void> {
  live.games = await api.games();
}

export function gameById(id: string): GameInfo | undefined {
  return live.games.find((game) => game.id === id);
}

export async function attempt<T>(task: () => Promise<T>): Promise<T | undefined> {
  try {
    live.error = "";
    return await task();
  } catch (error) {
    live.error = error instanceof Error ? error.message : String(error);
    return undefined;
  }
}
