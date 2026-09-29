import { describe, expect, it } from "vitest";
import { PLUGIN_API_VERSION, type ConnectorFactory } from "../types.ts";
import { createTestConnectorContext } from "./helpers.ts";

export function connectorContractSuite(factory: ConnectorFactory): void {
  describe(`connector contract: ${factory.id}`, () => {
    it("has matching api version and id", () => {
      const connector = factory.create();
      expect(factory.apiVersion).toBe(PLUGIN_API_VERSION);
      expect(connector.apiVersion).toBe(PLUGIN_API_VERSION);
      expect(connector.id).toBe(factory.id);
    });

    it("starts with default settings and reports a status", async () => {
      const connector = factory.create();
      await connector.start(createTestConnectorContext());
      const status = connector.status();
      expect(["ok", "degraded", "error", "idle"]).toContain(status.state);
      await connector.stop?.();
    });

    it("handles show and hide without throwing", async () => {
      const connector = factory.create();
      await connector.start(createTestConnectorContext());
      await connector.onShow?.({
        card: { key: "test:1", name: "Test", layout: "normal", faces: [{ name: "Test", imageUrl: "https://example.com/a.png" }] },
        face: 0,
        imageUrls: ["/images/test/1-0.png"],
        gameId: "test",
      });
      await connector.onHide?.();
      await connector.stop?.();
    });
  });
}
