import { and, eq } from "drizzle-orm";
import { settingsDefaults, validateSettings, type SettingsSchema, type SettingsValues } from "@cso/shared";
import type { Db } from "../db/client.ts";
import { settings } from "../db/schema.ts";

export const CORE_SETTINGS: SettingsSchema = {
  fields: [
    {
      key: "fetchMode",
      label: "Card images",
      type: "select",
      default: "preload",
      options: [
        { value: "preload", label: "Preload when a deck is saved (works offline)" },
        { value: "onDemand", label: "Download the first time a card is shown" },
      ],
    },
    { key: "overlayDurationSec", label: "Auto hide after (seconds, 0 = never)", type: "number", default: 0, min: 0, max: 600 },
  ],
};

export class SettingsService {
  private readonly db: Db;
  private readonly schemas = new Map<string, SettingsSchema>();
  private readonly cache = new Map<string, SettingsValues>();

  constructor(db: Db) {
    this.db = db;
  }

  register(scope: string, schema: SettingsSchema): void {
    this.schemas.set(scope, schema);
  }

  scopes(): { scope: string; schema: SettingsSchema }[] {
    return [...this.schemas].map(([scope, schema]) => ({ scope, schema }));
  }

  async load(): Promise<void> {
    const rows = await this.db.select().from(settings);
    for (const [scope, schema] of this.schemas) {
      const values = { ...settingsDefaults(schema) };
      for (const row of rows.filter((item) => item.scope === scope)) values[row.key] = row.value as SettingsValues[string];
      this.cache.set(scope, values);
    }
  }

  get(scope: string): SettingsValues {
    return this.cache.get(scope) ?? {};
  }

  async set(scope: string, input: Record<string, unknown>): Promise<SettingsValues> {
    const schema = this.schemas.get(scope);
    if (!schema) throw new Error(`unknown settings scope ${scope}`);
    const values = validateSettings(schema, input);
    for (const [key, value] of Object.entries(values)) {
      await this.db
        .insert(settings)
        .values({ scope, key, value })
        .onConflictDoUpdate({ target: [settings.scope, settings.key], set: { value } });
    }
    const removed = schema.fields.map((field) => field.key).filter((key) => !(key in values));
    for (const key of removed) await this.db.delete(settings).where(and(eq(settings.scope, scope), eq(settings.key, key)));
    const merged = { ...settingsDefaults(schema), ...values };
    this.cache.set(scope, merged);
    return merged;
  }
}
