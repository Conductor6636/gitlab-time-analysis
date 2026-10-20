import { GITLAB_DOMAIN, GITLAB_GROUP_PATH, PROJECT_START_DATE, SPRINT_DURATION_WEEKS, SPRINT_START_WEEKDAY, getDisplayName } from "./env";
import type { NormalizedUser, NormalizedIssue, NormalizedTimelog, NormalizedMergeRequest, GroupCacheEntry, DescendantGroup } from "./cache-types";

export const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Global entity stores
export const usersStore = new Map<string, NormalizedUser>();
export const issuesStore = new Map<string, NormalizedIssue>();
export const timelogsStore = new Map<string, NormalizedTimelog>();
export const mergeRequestsStore = new Map<string, NormalizedMergeRequest>();

// Group-level SWR cache
export const groupCaches = new Map<string, GroupCacheEntry>();

export function getOrCreateGroupCache(cacheKey: string): GroupCacheEntry {
  let groupCache = groupCaches.get(cacheKey);
  if (!groupCache) {
    groupCache = {
      memberUsernames: null,
      verifiedMemberUsernames: null,
      membersTimestamp: 0,
      membersPromise: null,
      timelogIds: null,
      timelogsTimestamp: 0,
      timelogsPromise: null,
      labels: null,
      labelsTimestamp: 0,
      labelsPromise: null,
      mergeRequestIds: null,
      mergeRequestsTimestamp: 0,
      mergeRequestsPromise: null,
    };
    groupCaches.set(cacheKey, groupCache);
  }
  return groupCache;
}

export function getCacheKey(fullGroupPath: string, token?: string): string {
  if (!token) return fullGroupPath;
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return `${fullGroupPath}:${hash}`;
}

function normalizeAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  if (avatarUrl.startsWith("/")) {
    const domain = GITLAB_DOMAIN || "https://gitlab.com";
    return `${domain}${avatarUrl}`;
  }
  return avatarUrl;
}

export function registerUser(userNode: any): string {
  const username = userNode.username;
  usersStore.set(username, {
    username,
    name: getDisplayName(username, userNode.name || ""),
    webUrl: userNode.webUrl || "",
    bot: !!userNode.bot,
    avatarUrl: normalizeAvatarUrl(userNode.avatarUrl || null),
  });
  return username;
}

export function registerIssue(issueNode: any): string {
  const webUrl = issueNode.webUrl;
  const labels = (issueNode.labels?.nodes || []).map((label: any) => {
    const title = label.title;
    return title.includes("::")
      ? title
      : title.includes(":")
        ? title.replace(/:/g, "::")
        : "Ungrouped::" + title;
  });

  issuesStore.set(webUrl, {
    webUrl,
    title: issueNode.title || "",
    state: issueNode.state || "",
    timeEstimate: issueNode.timeEstimate || 0,
    labels,
    createdAt: issueNode.createdAt || new Date().toISOString(),
    closedAt: issueNode.closedAt || null,
  });
  return webUrl;
}

export function registerTimelog(logNode: any): string {
  const id = logNode.id;
  const username = logNode.user ? registerUser(logNode.user) : "unknown";
  const issueUrl = logNode.issue ? registerIssue(logNode.issue) : "";

  // Calculate sprint number
  const spentDate = new Date(logNode.spentAt);
  const projectStartDate = new Date(PROJECT_START_DATE || "");

  const parseDesiredWeekday = (fallbackWeekday: number) => {
    const w = (SPRINT_START_WEEKDAY || "").trim().toLowerCase();
    if (w === "") return fallbackWeekday;
    if (/^\d+$/.test(w)) return parseInt(w, 10) % 7;
    const map: Record<string, number> = {
      sunday: 0, sun: 0,
      monday: 1, mon: 1,
      tuesday: 2, tue: 2,
      wednesday: 3, wed: 3,
      thursday: 4, thu: 4,
      friday: 5, fri: 5,
      saturday: 6, sat: 6,
    };
    return map[w] ?? fallbackWeekday;
  };

  let sprintNumber: number | undefined = undefined;
  if (!isNaN(projectStartDate.getTime()) && !isNaN(spentDate.getTime())) {
    const desiredWeekday = parseDesiredWeekday(projectStartDate.getDay());
    const projectStartDay = projectStartDate.getDay();
    const offsetDays = (desiredWeekday - projectStartDay + 7) % 7;
    const firstSprintStart = new Date(projectStartDate);
    firstSprintStart.setDate(projectStartDate.getDate() + offsetDays);

    const utc = (d: Date) =>
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysDifference = Math.floor(
      (utc(spentDate) - utc(firstSprintStart)) / msPerDay,
    );
    const sprintDurationDays = parseInt(SPRINT_DURATION_WEEKS || "1", 10) * 7;
    const calcSprint = Math.floor(daysDifference / sprintDurationDays) + 1;
    sprintNumber = calcSprint > 0 ? calcSprint : undefined;
  }

  timelogsStore.set(id, {
    id,
    spentAt: logNode.spentAt,
    timeSpent: logNode.timeSpent,
    username,
    issueUrl,
    sprintNumber,
  });
  return id;
}

export interface DescendantGroupsCacheEntry {
  data: DescendantGroup[] | null;
  timestamp: number;
  fetchPromise: Promise<DescendantGroup[]> | null;
}

export const descendantGroupsCache = new Map<string, DescendantGroupsCacheEntry>();

// Active caches garbage collection
function hasActivePromises(): boolean {
  return (
    Array.from(groupCaches.values()).some(
      (c) => c.membersPromise || c.timelogsPromise || c.labelsPromise || c.mergeRequestsPromise,
    ) ||
    Array.from(descendantGroupsCache.values()).some((c) => c.fetchPromise)
  );
}

export function cleanupOrphanedEntities() {
  if (hasActivePromises()) return;

  const activeUsernames = new Set<string>();
  const activeIssueUrls = new Set<string>();
  const activeTimelogIds = new Set<string>();
  const activeMergeRequestIds = new Set<string>();

  for (const cacheEntry of groupCaches.values()) {
    if (cacheEntry.memberUsernames) {
      for (const username of cacheEntry.memberUsernames) {
        activeUsernames.add(username);
      }
    }
    if (cacheEntry.timelogIds) {
      for (const id of cacheEntry.timelogIds) {
        activeTimelogIds.add(id);
        const log = timelogsStore.get(id);
        if (log) {
          activeUsernames.add(log.username);
          activeIssueUrls.add(log.issueUrl);
        }
      }
    }
    if (cacheEntry.mergeRequestIds) {
      for (const id of cacheEntry.mergeRequestIds) {
        activeMergeRequestIds.add(id);
        const mr = mergeRequestsStore.get(id);
        if (mr) {
          activeUsernames.add(mr.username);
          mr.approvedBy.forEach(u => activeUsernames.add(u));
          mr.discussionAuthors.forEach(u => activeUsernames.add(u));
        }
      }
    }
  }

  for (const username of usersStore.keys()) {
    if (!activeUsernames.has(username)) usersStore.delete(username);
  }
  for (const url of issuesStore.keys()) {
    if (!activeIssueUrls.has(url)) issuesStore.delete(url);
  }
  for (const id of timelogsStore.keys()) {
    if (!activeTimelogIds.has(id)) timelogsStore.delete(id);
  }
  for (const id of mergeRequestsStore.keys()) {
    if (!activeMergeRequestIds.has(id)) mergeRequestsStore.delete(id);
  }
}

export function invalidateCache() {
  groupCaches.clear();
  timelogsStore.clear();
  issuesStore.clear();
  mergeRequestsStore.clear();
}


