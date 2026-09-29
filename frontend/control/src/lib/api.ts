import type { Card, ControlMessage, DeckRules, OverlayMessage, ParseWarning, PreloadProgress, SectionDef, SettingsSchema, SettingsValues } from "@cso/shared";

const TOKEN_KEY = "cso-control-token";

export function initToken(): void {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    params.delete("token");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
  }
}

export function token(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(value: string): void {
  localStorage.setItem(TOKEN_KEY, value);
}

export function withToken(url: string): string {
  const value = token();
  return value ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(value)}` : url;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const value = token();
  if (value) headers.Authorization = `Bearer ${value}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!response.ok) {
    let message = response.statusText;
    try {
      message = ((await response.json()) as { message?: string; error?: string }).message ?? message;
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export interface GameInfo {
  id: string;
  name: string;
  sections: SectionDef[];
  deckRules?: DeckRules;
  canSearch: boolean;
}

export interface DeckSummary {
  id: number;
  game: string;
  name: string;
}

export interface DeckCard extends Card {
  cached: boolean[];
}

export interface DeckEntryView {
  entryId: number;
  section: string;
  quantity: number;
  name: string;
  auto: boolean;
  error: string | null;
  card: DeckCard | null;
}

export interface Deck extends DeckSummary {
  rawText: string;
  entries: DeckEntryView[];
}

export interface Player {
  seat: number;
  playerName: string;
  deckId: number | null;
}

export interface Match {
  id: number;
  game: string;
  name: string;
  players: Player[];
}

export interface SettingsScope {
  scope: string;
  schema: SettingsSchema;
  values: SettingsValues;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  status: { state: string; message?: string };
  info: { browserSource?: { url: string; width: number; height: number; steps: string[] } };
}

export const api = {
  games: () => request<GameInfo[]>("GET", "/api/games"),
  decks: () => request<DeckSummary[]>("GET", "/api/decks"),
  deck: (id: number) => request<Deck>("GET", `/api/decks/${id}`),
  createDeck: (game: string, name: string, rawText: string) =>
    request<{ deck: Deck; warnings: ParseWarning[] }>("POST", "/api/decks", { game, name, rawText }),
  updateDeck: (id: number, name: string, rawText: string) =>
    request<{ deck: Deck; warnings: ParseWarning[] }>("PUT", `/api/decks/${id}`, { name, rawText }),
  deleteDeck: (id: number) => request<void>("DELETE", `/api/decks/${id}`),
  resolveDeck: (id: number) => request<Deck>("POST", `/api/decks/${id}/resolve`),
  preloadDeck: (id: number) => request<PreloadProgress>("POST", `/api/decks/${id}/preload`),
  addCard: (id: number, cardKey: string, section: string) => request<Deck>("POST", `/api/decks/${id}/cards`, { cardKey, section }),
  matches: () => request<Match[]>("GET", "/api/matches"),
  match: (id: number) => request<Match>("GET", `/api/matches/${id}`),
  createMatch: (game: string, name: string, players: Omit<Player, "seat">[]) =>
    request<Match>("POST", "/api/matches", { game, name, players }),
  updateMatch: (id: number, name: string, players: Omit<Player, "seat">[]) =>
    request<Match>("PUT", `/api/matches/${id}`, { name, players }),
  deleteMatch: (id: number) => request<void>("DELETE", `/api/matches/${id}`),
  preloadMatch: (id: number) => request<PreloadProgress[]>("POST", `/api/matches/${id}/preload`),
  search: (game: string, q: string) => request<Card[]>("GET", `/api/search?game=${encodeURIComponent(game)}&q=${encodeURIComponent(q)}`),
  show: (cardKey: string, playerName?: string, face = 0) => request<OverlayMessage>("POST", "/api/overlay/show", { cardKey, playerName, face }),
  flip: () => request<OverlayMessage>("POST", "/api/overlay/flip"),
  hide: () => request<void>("POST", "/api/overlay/hide"),
  settings: () => request<SettingsScope[]>("GET", "/api/settings"),
  saveSettings: (scope: string, values: SettingsValues) => request<SettingsValues>("PUT", `/api/settings/${encodeURIComponent(scope)}`, values),
  cache: () => request<{ bytes: number; files: number }>("GET", "/api/cache"),
  clearCache: () => request<void>("DELETE", "/api/cache"),
  connectors: () => request<ConnectorInfo[]>("GET", "/api/connectors"),
};

export function connectControl(onMessage: (message: ControlMessage) => void, onState: (connected: boolean) => void): void {
  let delay = 1000;
  const open = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(withToken(`${protocol}//${location.host}/ws/control`));
    socket.onopen = () => {
      delay = 1000;
      onState(true);
    };
    socket.onmessage = (event) => onMessage(JSON.parse(event.data) as ControlMessage);
    socket.onclose = () => {
      onState(false);
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 15000);
    };
  };
  open();
}
