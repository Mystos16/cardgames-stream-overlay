import type { Board, Slot } from "./match.ts";
import type { Card } from "./types.ts";

export interface OverlayShowMessage {
  type: "show";
  id: string;
  card: Pick<Card, "key" | "name" | "layout">;
  face: number;
  images: string[];
  playerName?: string;
  slot?: Slot;
}

export interface OverlayHideMessage {
  type: "hide";
}

export interface OverlayFlipMessage {
  type: "flip";
  face: number;
}

export interface OverlayBoardMessage {
  type: "board";
  board: Board | null;
}

export type OverlayMessage = OverlayShowMessage | OverlayHideMessage | OverlayFlipMessage | OverlayBoardMessage;

export interface PreloadProgress {
  deckId: number;
  total: number;
  done: number;
  failed: number;
  running: boolean;
}

export type ControlMessage =
  | { type: "overlay"; message: OverlayMessage | null }
  | { type: "board"; board: Board | null }
  | { type: "preload"; progress: PreloadProgress }
  | { type: "image"; cardKey: string; faceIndex: number; status: "ready" | "failed" };
