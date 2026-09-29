import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game: text("game").notNull(),
  name: text("name").notNull(),
  rawText: text("raw_text").notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch('subsec') * 1000)`),
});

export const deckEntries = sqliteTable(
  "deck_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    quantity: integer("quantity").notNull(),
    name: text("name").notNull(),
    cardKey: text("card_key"),
    identifiers: text("identifiers", { mode: "json" }).$type<Record<string, string>>().notNull(),
    error: text("error"),
    auto: integer("auto", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("deck_entries_deck_idx").on(table.deckId), index("deck_entries_card_idx").on(table.cardKey)],
);

export const cards = sqliteTable("cards", {
  cardKey: text("card_key").primaryKey(),
  game: text("game").notNull(),
  name: text("name").notNull(),
  layout: text("layout").notNull(),
  faces: text("faces", { mode: "json" }).$type<{ name: string; imageUrl: string }[]>().notNull(),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const cardImages = sqliteTable(
  "card_images",
  {
    cardKey: text("card_key")
      .notNull()
      .references(() => cards.cardKey, { onDelete: "cascade" }),
    faceIndex: integer("face_index").notNull(),
    path: text("path"),
    bytes: integer("bytes"),
    status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
    error: text("error"),
  },
  (table) => [primaryKey({ columns: [table.cardKey, table.faceIndex] })],
);

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game: text("game").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const matchPlayers = sqliteTable(
  "match_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    seat: integer("seat").notNull(),
    playerName: text("player_name").notNull(),
    deckId: integer("deck_id").references(() => decks.id, { onDelete: "set null" }),
  },
  (table) => [uniqueIndex("match_players_seat_idx").on(table.matchId, table.seat)],
);

export const settings = sqliteTable(
  "settings",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);
