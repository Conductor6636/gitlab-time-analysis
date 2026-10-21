import {
  CATEGORY_DEFINITIONS,
  matchLabelToCategory,
  type CategoryId,
} from "../config/categories";
export { matchLabelToCategory } from "../config/categories";
import type { GroupLabelsResponse, GroupTimelogsResponse } from "../types/group";

/**
 * How many of the four well-known categories are covered by sub-labels
 * inside a single label group.
 */
function scoreGroup(groupName: string, labels: GroupLabelsResponse[string]): number {
  const subLabelTitles = labels.map((l) => l.title);

  return CATEGORY_DEFINITIONS.reduce((score, cat) => {
    // Check group name
    if (cat.patterns.some((p) => p.test(groupName))) return score + 1;
    // Check sub-label titles
    if (subLabelTitles.some((t) => cat.patterns.some((p) => p.test(t))))
      return score + 1;
    return score;
  }, 0);
}

/**
 * Pick the best default label group.
 *
 * Strategy (in order):
 * 1. The label group whose sub-labels cover the most of the 4 categories.
 * 2. Fall back to the same `/req/i` heuristic as before for backward compat.
 * 3. First available group.
 * 4. Empty string.
 */
export function findDefaultCategoryGroup(
  labels: GroupLabelsResponse,
): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";

  // Score each group
  let bestGroup = "";
  let bestScore = -1;

  for (const [groupName, groupLabels] of entries) {
    const score = scoreGroup(groupName, groupLabels);
    if (score > bestScore) {
      bestScore = score;
      bestGroup = groupName;
    }
  }

  if (bestGroup) return bestGroup;

  // Fallback: legacy /req/i heuristic
  const reqMatch = entries.filter(([, groupLabels]) =>
    groupLabels.some((l) => l.title.match(/req/i)),
  )[0]?.[0];
  if (reqMatch) return reqMatch;

  // Fallback: first available
  return entries[0]?.[0] ?? "";
}

/**
 * For every label group, report which of the 4 well-known categories
 * its sub-labels match.  Useful when you want to show all four at once
 * or build a mapping from category → label sub-group.
 *
 * Returns: { [categoryId]: { group, subLabel } | null }
 */
export function matchCategoriesToLabels(labels: GroupLabelsResponse): Record<
  CategoryId,
  { group: string; subLabel: string } | null
> {
  const result = {} as Record<CategoryId, { group: string; subLabel: string } | null>;

  for (const def of CATEGORY_DEFINITIONS) {
    let match: { group: string; subLabel: string } | null = null;

    for (const [groupName, groupLabels] of Object.entries(labels)) {
      // Check group name first
      if (def.patterns.some((p) => p.test(groupName))) {
        match = { group: groupName, subLabel: "" };
        break;
      }
      // Check sub-labels
      const sub = groupLabels.find((l) =>
        def.patterns.some((p) => p.test(l.title)),
      );
      if (sub) {
        match = { group: groupName, subLabel: sub.title };
        break;
      }
    }

    result[def.id] = match;
  }

  return result;
}

export function categorizeTimelog(
  log: GroupTimelogsResponse[number],
): string {
  for (const label of log.issueLabels) {
    const catDef = matchLabelToCategory(label);
    if (catDef) return catDef.id;
  }
  return "other";
}

export type CategorySummary = {
  categoryId: string;
  shortLabel: string;
  color: string;
  hours: number;
  matchedLabels: string[];
};

function buildCategoryGroupLabels(
  labels: GroupLabelsResponse,
): Set<string> {
  const bestGroup = findDefaultCategoryGroup(labels);
  const groupLabels = labels[bestGroup] || [];
  const labelSet = new Set<string>();
  for (const lbl of groupLabels) {
    labelSet.add(lbl.id);
    if (lbl.title !== lbl.id) {
      labelSet.add(`${bestGroup}::${lbl.title}`);
    }
  }
  return labelSet;
}

export function computeCategorySummary(
  timelogs: GroupTimelogsResponse,
  labels?: GroupLabelsResponse,
): { categories: CategorySummary[]; otherHours: number; otherLabels: string[]; totalHours: number } {
  const buckets: Record<string, number> = {};
  const labelSets: Record<string, Set<string>> = {};
  for (const def of CATEGORY_DEFINITIONS) {
    buckets[def.id] = 0;
    labelSets[def.id] = new Set();
  }
  let other = 0;
  const otherLabelSet = new Set<string>();

  const categoryLabelsSet = labels ? buildCategoryGroupLabels(labels) : null;

  for (const log of timelogs) {
    let assigned = false;
    for (const label of log.issueLabels) {
      const catDef = matchLabelToCategory(label);
      if (catDef) {
        buckets[catDef.id] += log.timeSpent;
        labelSets[catDef.id].add(label.includes("::") ? label : `Ungrouped::${label}`);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      other += log.timeSpent;
      for (const label of log.issueLabels) {
        const normalized = label.includes("::") ? label : `Ungrouped::${label}`;
        if (categoryLabelsSet && !categoryLabelsSet.has(label) && !categoryLabelsSet.has(normalized)) {
          continue;
        }
        otherLabelSet.add(normalized);
      }
    }
  }

  const totalSeconds = timelogs.reduce((s, l) => s + l.timeSpent, 0);

  const categories: CategorySummary[] = CATEGORY_DEFINITIONS.map((def) => ({
    categoryId: def.id,
    shortLabel: def.label,
    color: def.color,
    hours: +(buckets[def.id] / 3600).toFixed(1),
    matchedLabels: [...labelSets[def.id]].sort(),
  }));

  return {
    categories,
    otherHours: +(other / 3600).toFixed(1),
    otherLabels: [...otherLabelSet].sort(),
    totalHours: +(totalSeconds / 3600).toFixed(1),
  };
}
