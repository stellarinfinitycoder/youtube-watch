import { describe, expect, it } from "vitest";

import { moveBoardColumnById } from "./boards";

type TestColumn = {
  id: string;
};

type TestBoard = {
  columns: TestColumn[];
  columnScopeFilter: string[];
};

function createBoard(columnIds: string[]): TestBoard {
  return {
    columns: columnIds.map((id) => ({ id })),
    columnScopeFilter: ["__all__"]
  };
}

function columnIds(board: TestBoard): string[] {
  return board.columns.map((column) => column.id);
}

describe("moveBoardColumnById", () => {
  it("moves a column right by one visible slot when hidden columns are between visible columns", () => {
    const board = createBoard(["a", "hidden", "b"]);

    const next = moveBoardColumnById(board, "a", "right", ["a", "b"]);

    expect(columnIds(next)).toEqual(["hidden", "b", "a"]);
    expect(columnIds(next).filter((id) => id !== "hidden")).toEqual(["b", "a"]);
  });

  it("moves a column left by one visible slot when hidden columns are between visible columns", () => {
    const board = createBoard(["a", "hidden", "b"]);

    const next = moveBoardColumnById(board, "b", "left", ["a", "b"]);

    expect(columnIds(next)).toEqual(["b", "a", "hidden"]);
    expect(columnIds(next).filter((id) => id !== "hidden")).toEqual(["b", "a"]);
  });

  it("does not move past visible boundaries", () => {
    const board = createBoard(["a", "hidden", "b"]);

    expect(moveBoardColumnById(board, "a", "left", ["a", "b"])).toBe(board);
    expect(moveBoardColumnById(board, "b", "right", ["a", "b"])).toBe(board);
  });

  it("keeps full column order movement when no visible order is supplied", () => {
    const board = createBoard(["a", "hidden", "b"]);

    expect(columnIds(moveBoardColumnById(board, "a", "right"))).toEqual([
      "hidden",
      "a",
      "b"
    ]);
    expect(columnIds(moveBoardColumnById(board, "b", "left"))).toEqual([
      "a",
      "b",
      "hidden"
    ]);
  });
});
