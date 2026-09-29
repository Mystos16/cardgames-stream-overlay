export type SettingField =
  | { key: string; label: string; type: "string"; default?: string; help?: string }
  | { key: string; label: string; type: "number"; default?: number; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: "boolean"; default?: boolean; help?: string }
  | {
      key: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      default?: string;
      help?: string;
    };

export interface SettingsSchema {
  fields: SettingField[];
}

export type SettingValue = string | number | boolean;
export type SettingsValues = Record<string, SettingValue>;

export function settingsDefaults(schema: SettingsSchema): SettingsValues {
  const values: SettingsValues = {};
  for (const field of schema.fields) {
    if (field.default !== undefined) values[field.key] = field.default;
  }
  return values;
}

export function validateSettings(schema: SettingsSchema, input: Record<string, unknown>): SettingsValues {
  const values: SettingsValues = {};
  for (const field of schema.fields) {
    const raw = input[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    switch (field.type) {
      case "string":
        values[field.key] = String(raw);
        break;
      case "number": {
        const num = Number(raw);
        if (Number.isNaN(num)) throw new Error(`${field.key}: not a number`);
        if (field.min !== undefined && num < field.min) throw new Error(`${field.key}: below ${field.min}`);
        if (field.max !== undefined && num > field.max) throw new Error(`${field.key}: above ${field.max}`);
        values[field.key] = num;
        break;
      }
      case "boolean":
        values[field.key] = raw === true || raw === "true";
        break;
      case "select":
        if (!field.options.some((option) => option.value === raw)) {
          throw new Error(`${field.key}: invalid option ${String(raw)}`);
        }
        values[field.key] = String(raw);
        break;
    }
  }
  return values;
}
