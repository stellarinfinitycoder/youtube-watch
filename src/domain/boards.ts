export type ColumnWithId = {
  id: string;
};

export type BoardWithColumns<TColumn extends ColumnWithId> = {
  columns: TColumn[];
  columnScopeFilter: string[];
};

export function updateBoardById<TBoard extends { id: string }>(
  boards: TBoard[],
  boardId: string,
  updater: (board: TBoard) => TBoard
): TBoard[] {
  return boards.map((board) => (board.id === boardId ? updater(board) : board));
}

export function updateBoardColumnById<
  TColumn extends ColumnWithId,
  TBoard extends BoardWithColumns<TColumn>
>(
  board: TBoard,
  columnId: string,
  updater: (column: TColumn) => TColumn
): TBoard {
  return {
    ...board,
    columns: board.columns.map((column) => (column.id === columnId ? updater(column) : column))
  };
}

export function appendBoardColumns<
  TColumn extends ColumnWithId,
  TBoard extends BoardWithColumns<TColumn>
>(
  board: TBoard,
  columnsToAppend: TColumn[],
  nextColumnScopeFilter?: string[]
): TBoard {
  return {
    ...board,
    columns: [...board.columns, ...columnsToAppend],
    columnScopeFilter: nextColumnScopeFilter ?? board.columnScopeFilter
  };
}

export function removeBoardColumnById<
  TColumn extends ColumnWithId,
  TBoard extends BoardWithColumns<TColumn>
>(
  board: TBoard,
  columnId: string,
  nextColumnScopeFilter?: string[]
): TBoard {
  return {
    ...board,
    columns: board.columns.filter((column) => column.id !== columnId),
    columnScopeFilter: nextColumnScopeFilter ?? board.columnScopeFilter
  };
}

export function moveBoardColumnById<
  TColumn extends ColumnWithId,
  TBoard extends BoardWithColumns<TColumn>
>(
  board: TBoard,
  columnId: string,
  direction: "left" | "right",
  visibleColumnIds?: readonly string[]
): TBoard {
  const fromIndex = board.columns.findIndex((column) => column.id === columnId);
  if (fromIndex < 0) {
    return board;
  }

  if (visibleColumnIds) {
    const columnIds = new Set(board.columns.map((column) => column.id));
    const orderedVisibleColumnIds = [
      ...new Set(visibleColumnIds.filter((visibleColumnId) => columnIds.has(visibleColumnId)))
    ];
    const visibleFromIndex = orderedVisibleColumnIds.indexOf(columnId);
    if (visibleFromIndex < 0) {
      return board;
    }
    const visibleToIndex =
      direction === "left" ? visibleFromIndex - 1 : visibleFromIndex + 1;
    const targetColumnId = orderedVisibleColumnIds[visibleToIndex];
    if (!targetColumnId) {
      return board;
    }
    const targetIndex = board.columns.findIndex((column) => column.id === targetColumnId);
    if (targetIndex < 0) {
      return board;
    }
    const nextColumns = [...board.columns];
    const [moved] = nextColumns.splice(fromIndex, 1);
    const nextTargetIndex = nextColumns.findIndex((column) => column.id === targetColumnId);
    nextColumns.splice(direction === "left" ? nextTargetIndex : nextTargetIndex + 1, 0, moved);
    return {
      ...board,
      columns: nextColumns
    };
  }

  const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= board.columns.length) {
    return board;
  }
  const nextColumns = [...board.columns];
  const [moved] = nextColumns.splice(fromIndex, 1);
  nextColumns.splice(toIndex, 0, moved);
  return {
    ...board,
    columns: nextColumns
  };
}
