import { describe, expect, it } from "vitest";
import { applyAction, buildBoard, initialState, layoutSlots, normalizeState, sideStatus, type FormatDef } from "../src/match.ts";

const commander: FormatDef = {
  id: "commander",
  name: "Commander",
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 4,
  counters: [
    { id: "life", name: "Life", short: "Life", start: 40, primary: true, showWhen: "always", ends: { at: 0, when: "lte", result: "lose" } },
    { id: "poison", name: "Poison", short: "Poison", start: 0, min: 0, showWhen: "nonzero", ends: { at: 10, when: "gte", result: "lose" } },
  ],
  opponentCounters: [{ id: "commander", name: "Commander damage", short: "Cmdr", showWhen: "nonzero", lethal: 21, alsoCounter: "life" }],
};

const prizes: FormatDef = {
  id: "standard",
  name: "Standard",
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  turns: true,
  counters: [{ id: "prizes", name: "Prizes", short: "Prizes", start: 6, min: 0, max: 6, primary: true, showWhen: "always", ends: { at: 0, when: "lte", result: "win" } }],
};

const players = ["Ann", "Bob", "Cat", "Dan"].map((playerName, seat) => ({ seat, playerName }));

describe("layoutSlots", () => {
  it("puts 2 players left and right, 4 in the corners", () => {
    expect(layoutSlots(2)).toEqual(["left", "right"]);
    expect(layoutSlots(4)).toEqual(["top-left", "top-right", "bottom-right", "bottom-left"]);
  });
  it("fills odd counts with top and bottom middle", () => {
    expect(layoutSlots(3)).toEqual(["top-left", "top-right", "bottom"]);
    expect(layoutSlots(6)).toContain("top");
    expect(layoutSlots(6)).toContain("bottom");
    expect(new Set(layoutSlots(6)).size).toBe(6);
  });
});

describe("applyAction", () => {
  it("changes life and clamps poison at 0", () => {
    let state = initialState(commander, 4);
    state = applyAction(commander, state, { type: "counter", side: 1, counter: "life", delta: -5 });
    state = applyAction(commander, state, { type: "counter", side: 1, counter: "poison", delta: -1 });
    expect(state.sides[1]!.counters).toEqual({ life: 35, poison: 0 });
  });

  it("commander damage also reduces life and is lethal at 21", () => {
    let state = initialState(commander, 4);
    state = applyAction(commander, state, { type: "opponentCounter", side: 2, from: 0, counter: "commander", delta: 21 });
    expect(state.sides[2]!.counters.life).toBe(19);
    expect(sideStatus(commander, state.sides[2]!)).toBe("out");
    state = applyAction(commander, state, { type: "opponentCounter", side: 2, from: 0, counter: "commander", delta: -1 });
    expect(state.sides[2]!.counters.life).toBe(20);
    expect(sideStatus(commander, state.sides[2]!)).toBe("alive");
  });

  it("rejects commander damage from yourself", () => {
    expect(() => applyAction(commander, initialState(commander, 2), { type: "opponentCounter", side: 0, from: 0, counter: "commander", delta: 1 })).toThrow();
  });

  it("10 poison loses", () => {
    const state = applyAction(commander, initialState(commander, 2), { type: "counter", side: 0, counter: "poison", delta: 10 });
    expect(sideStatus(commander, state.sides[0]!)).toBe("out");
  });

  it("taking the last prize wins and new game keeps the score", () => {
    let state = initialState(prizes, 2, 3);
    state = applyAction(prizes, state, { type: "counter", side: 0, counter: "prizes", delta: -6 });
    expect(sideStatus(prizes, state.sides[0]!)).toBe("won");
    state = applyAction(prizes, state, { type: "win", side: 0, delta: 1 });
    state = applyAction(prizes, state, { type: "turn", side: "next" });
    expect(state.turn).toBe(1);
    state = applyAction(prizes, state, { type: "newGame" });
    expect(state.sides[0]).toMatchObject({ counters: { prizes: 6 }, wins: 1 });
    expect(state.gameNumber).toBe(2);
    expect(state.turn).toBe(0);
  });

  it("caps wins at what best-of allows", () => {
    let state = initialState(prizes, 2, 3);
    for (let i = 0; i < 5; i++) state = applyAction(prizes, state, { type: "win", side: 1, delta: 1 });
    expect(state.sides[1]!.wins).toBe(2);
  });
});

describe("normalizeState", () => {
  it("adapts to a changed player count and drops stale commander damage", () => {
    let state = initialState(commander, 4);
    state = applyAction(commander, state, { type: "opponentCounter", side: 0, from: 3, counter: "commander", delta: 5 });
    const shrunk = normalizeState(commander, 3, state);
    expect(shrunk.sides).toHaveLength(3);
    expect(shrunk.sides[0]!.opponentCounters.commander).toEqual({});
  });
});

describe("buildBoard", () => {
  it("hides poison and commander damage while zero", () => {
    let state = initialState(commander, 4);
    state = applyAction(commander, state, { type: "opponentCounter", side: 1, from: 0, counter: "commander", delta: 3 });
    const board = buildBoard({ id: 1, name: "m", game: "mtg" }, commander, players, state);
    expect(board.sides.map((side) => side.slot)).toEqual(["top-left", "top-right", "bottom-right", "bottom-left"]);
    expect(board.sides[0]!.counters.find((counter) => counter.id === "poison")!.visible).toBe(false);
    const visible = board.sides[1]!.opponentCounters.filter((counter) => counter.visible);
    expect(visible).toEqual([expect.objectContaining({ fromName: "Ann", value: 3 })]);
  });

  it("groups teams into one side", () => {
    const giant: FormatDef = { ...commander, id: "2hg", teamSize: 2, opponentCounters: [] };
    const board = buildBoard({ id: 1, name: "m", game: "mtg" }, giant, players, initialState(giant, 2));
    expect(board.sides.map((side) => side.name)).toEqual(["Ann & Bob", "Cat & Dan"]);
    expect(board.sides.map((side) => side.slot)).toEqual(["left", "right"]);
  });
});
