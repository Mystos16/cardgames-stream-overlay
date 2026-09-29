import type { Card } from "./types.ts";

export interface OverlayShowMessage {
  type: "show";
  id: string;
  card: Pick<Card, "key" | "name" | "layout">;
  face: number;
  images: string[];
  playerName?: string;
}

export interface OverlayHideMessage {
  type: "hide";
}

export interface OverlayFlipMessage {
  type: "flip";
  face: number;
}

export type OverlayMessage = OverlayShowMessage | OverlayHideMessage | OverlayFlipMessage;

export interface PreloadProgress {
  deckId: number;
  total: number;
  done: number;
  failed: number;
  running: boolean;
}

export type ControlMessage =
  | { type: "overlay"; message: OverlayMessage | null }
  | { type: "preload"; progress: PreloadProgress }
  | { type: "image"; cardKey: string; faceIndex: number; status: "ready" | "failed" };
