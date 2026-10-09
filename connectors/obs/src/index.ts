import { PLUGIN_API_VERSION, defineConnector, type Connector, type ConnectorContext, type ConnectorStatus } from "@cso/shared";

export default defineConnector({
  apiVersion: PLUGIN_API_VERSION,
  id: "obs",
  create(): Connector {
    let ctx: ConnectorContext | undefined;
    let lastShown: string | undefined;

    return {
      apiVersion: PLUGIN_API_VERSION,
      id: "obs",
      name: "OBS Studio (Browser Source)",
      settingsSchema: {
        fields: [
          { key: "width", label: "Browser Source width", type: "number", default: 1920, min: 320, max: 7680 },
          { key: "height", label: "Browser Source height", type: "number", default: 1080, min: 240, max: 4320 },
          {
            key: "position",
            label: "Card position for cards without a player (search results)",
            type: "select",
            default: "center",
            options: [
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ],
          },
          { key: "cardHeight", label: "Maximum card height (% of source)", type: "number", default: 55, min: 10, max: 80 },
          { key: "board", label: "Show player names, life and counters", type: "boolean", default: true },
        ],
      },
      async start(context) {
        ctx = context;
        ctx.logger.info("obs connector ready", { overlayUrl: ctx.overlayUrl() });
      },
      async onShow(event) {
        lastShown = event.card.name;
      },
      async onHide() {
        lastShown = undefined;
      },
      status(): ConnectorStatus {
        if (!ctx) return { state: "idle", message: "not started" };
        return { state: "ok", message: lastShown ? `showing ${lastShown}` : "add the overlay URL as a Browser Source" };
      },
      info() {
        if (!ctx) return {};
        const settings = ctx.settings();
        const params = new URLSearchParams({
          position: String(settings.position ?? "center"),
          cardHeight: String(settings.cardHeight ?? 55),
          board: settings.board === false ? "0" : "1",
        });
        const base = ctx.overlayUrl();
        const url = `${base}${base.includes("?") ? "&" : "?"}${params}`;
        return {
          browserSource: {
            url,
            width: settings.width ?? 1920,
            height: settings.height ?? 1080,
            steps: [
              "In OBS, add a new Browser source to your scene.",
              "Paste the URL below and set width and height.",
              "Leave 'Shutdown source when not visible' unchecked so it stays connected.",
            ],
          },
        };
      },
    };
  },
});
