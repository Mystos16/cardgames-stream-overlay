import type { FormatDef } from "./match.ts";
import type { SettingsSchema, SettingsValues } from "./settings.ts";

export const PLUGIN_API_VERSION = 1 as const;
export type PluginApiVersion = typeof PLUGIN_API_VERSION;

export interface SectionDef {
  id: string;
  name: string;
  description?: string;
}

export interface DeckRules {
  minPlayers?: number;
  maxPlayers?: number;
  expectedSizes?: Record<string, { min?: number; max?: number }>;
}

export interface DeckEntry {
  quantity: number;
  name: string;
  section: string;
  identifiers: Record<string, string>;
}

export interface ParseWarning {
  line: number;
  text: string;
  message: string;
}

export interface ParseResult {
  entries: DeckEntry[];
  warnings: ParseWarning[];
}

export interface CardFace {
  name: string;
  imageUrl: string;
}

export interface Card {
  key: string;
  name: string;
  layout: string;
  faces: CardFace[];
  meta?: Record<string, unknown>;
}

export interface ResolvedCard {
  entry: DeckEntry;
  card: Card | null;
  error?: string;
  related?: Card[];
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface HttpRequestInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PluginHttp {
  json<T>(url: string, init?: HttpRequestInit): Promise<T>;
}

export interface GamePluginContext {
  http: PluginHttp;
  settings: () => SettingsValues;
  env: (name: string) => string | undefined;
  logger: Logger;
}

export interface GamePlugin {
  apiVersion: PluginApiVersion;
  id: string;
  name: string;
  sections: SectionDef[];
  deckRules?: DeckRules;
  formats: FormatDef[];
  settingsSchema: SettingsSchema;
  rateLimit: { requestsPerSecond: number; batchSize?: number };
  userAgent?: string;
  parseDecklist(text: string): ParseResult;
  resolveCards(entries: DeckEntry[]): Promise<ResolvedCard[]>;
  relatedCards?(card: Card): Promise<Card[]>;
  searchCards?(query: string): Promise<Card[]>;
}

export interface GamePluginFactory {
  apiVersion: PluginApiVersion;
  id: string;
  create(ctx: GamePluginContext): GamePlugin;
}

export interface ShowEvent {
  card: Card;
  face: number;
  imageUrls: string[];
  playerName?: string;
  gameId: string;
}

export interface ConnectorStatus {
  state: "ok" | "degraded" | "error" | "idle";
  message?: string;
  details?: Record<string, unknown>;
}

export interface ConnectorContext {
  publicBaseUrl: () => string;
  overlayUrl: () => string;
  settings: () => SettingsValues;
  env: (name: string) => string | undefined;
  logger: Logger;
}

export interface Connector {
  apiVersion: PluginApiVersion;
  id: string;
  name: string;
  settingsSchema: SettingsSchema;
  start(ctx: ConnectorContext): Promise<void>;
  stop?(): Promise<void>;
  onShow?(event: ShowEvent): Promise<void>;
  onHide?(): Promise<void>;
  status(): ConnectorStatus;
  info?(): Record<string, unknown>;
}

export interface ConnectorFactory {
  apiVersion: PluginApiVersion;
  id: string;
  create(): Connector;
}

export function defineGame(factory: GamePluginFactory): GamePluginFactory {
  return factory;
}

export function defineConnector(factory: ConnectorFactory): ConnectorFactory {
  return factory;
}

export function cardKey(gameId: string, id: string): string {
  return `${gameId}:${id}`;
}

export function splitCardKey(key: string): { gameId: string; id: string } {
  const index = key.indexOf(":");
  if (index <= 0) throw new Error(`invalid card key: ${key}`);
  return { gameId: key.slice(0, index), id: key.slice(index + 1) };
}
