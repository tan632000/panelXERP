/**
 * A document of a list that draws one row per line. The API pages and sorts lines, so one
 * entry names the lines it lists in `listedLineIds` — in list order — while `lines` stays the
 * document's full set, which its own state (editable, deletable, its last line) is read from.
 */
export interface ListedLinesDocument<L> {
  lines?: L[];
  listedLineIds?: number[];
}

/**
 * The lines one list entry draws, in list order. An entry without `listedLineIds` — an
 * older response, or a detail read — draws every line.
 */
export function listedLines<L extends { id?: number | null }>(
  document: ListedLinesDocument<L>,
): L[] {
  const lines = document.lines ?? [];
  if (!document.listedLineIds) return lines;
  const byId = new Map(lines.map((line) => [Number(line.id), line]));
  return document.listedLineIds
    .map((id) => byId.get(id))
    .filter((line): line is L => line !== undefined);
}
