import { buildOutlineTreeModel, type OutlineTreeModelItem } from "./core-outline-svg";
import type { BreadcrumbThreadOption } from "./breadcrumb-settings";
import type { ParsedHeading } from "./headings";

export interface BreadcrumbHeading extends OutlineTreeModelItem {
  line: number;
  rawBody: string;
  index: number;
}
export type BreadcrumbThreads = Record<BreadcrumbThreadOption, boolean>;

export function breadcrumbHeadings(headings: readonly ParsedHeading[]): BreadcrumbHeading[] {
  return buildOutlineTreeModel(headings.map((heading) => heading.level)).map((model, index) => ({
    ...model, index, line: headings[index].line, rawBody: headings[index].rawBody,
  }));
}

export function breadcrumbAncestors(headings: readonly BreadcrumbHeading[], index: number): number[] {
  const indexes: number[] = [];
  let current: number | null = index;
  while (current !== null && headings[current]) {
    indexes.push(current);
    current = headings[current].parentIndex;
  }
  return indexes.reverse();
}

export function breadcrumbThreadPlan(headings: readonly BreadcrumbHeading[], activeIndex: number, options: BreadcrumbThreads): {
  roots: number[]; edges: number[]; all: boolean;
} {
  const active = headings[activeIndex];
  if (!active) return { roots: [], edges: [], all: false };
  const mixedRoots = headings.filter((heading) => heading.parentIndex === null);
  const hasMixed = mixedRoots.some((heading) => heading.orphan) && mixedRoots.some((heading) => !heading.orphan);
  const mixed = options.Mixed && hasMixed && (options.MixedAll || options.MixedActive);
  const root = !active.orphan && options.Root && (options.RootAll || options.RootActive);
  const orphan = active.orphan && options.Orphan && (options.OrphanAll || options.OrphanActive);
  const all = mixed ? options.MixedAll : orphan ? options.OrphanAll
    : root && options.RootAll || !active.orphan && options.All;
  const roots = mixed ? mixedRoots : root ? mixedRoots.filter((h) => !h.orphan)
    : orphan ? mixedRoots.filter((h) => h.orphan) : [];
  const edges = all ? headings.filter((heading) => heading.parentIndex !== null && (
    mixed || orphan && heading.orphan || root && options.RootAll && !heading.orphan
      || !active.orphan && options.All && heading.rootIndex === active.rootIndex
  )).map((heading) => heading.index) : mixed || root || orphan || !active.orphan && options.Active
    ? breadcrumbAncestors(headings, activeIndex).filter((index) => headings[index].parentIndex !== null) : [];
  return {
    roots: roots.filter((heading) => mixed || all || heading.index <= active.rootIndex).map((heading) => heading.index),
    edges, all,
  };
}

export function breadcrumbEntries(headings: readonly BreadcrumbHeading[], currentIndex: number, options: BreadcrumbThreads | null): number[] {
  const ancestors = breadcrumbAncestors(headings, currentIndex);
  if (!options) return ancestors;
  const plan = breadcrumbThreadPlan(headings, currentIndex, options);
  const entries = new Set([...ancestors, ...plan.roots, ...plan.edges]);
  for (const index of plan.edges) for (const ancestor of breadcrumbAncestors(headings, index)) entries.add(ancestor);
  return [...entries].sort((a, b) => a - b);
}

export function breadcrumbKeyboardTarget(key: string, index: number, length: number): number | null {
  if (!length) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return Math.min(length - 1, index + 1);
  if (key === "ArrowUp") return Math.max(0, index - 1);
  return null;
}
