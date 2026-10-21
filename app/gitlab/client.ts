"use client";

import type {
  MergeRequestComment,
  NormalizedMergeRequest,
} from "../types/gitlab";
import type {
  GroupLabelsResponse,
  GroupMembersResponse,
  GroupSprintsResponse,
  GroupTimelogsResponse,
} from "../types/group";
import type {
  GroupComparisonItem,
  GroupComparisonResponse,
  GroupResponse,
  UserLeaderboardResponse,
} from "../types/analytics";
import {
  CATEGORY_DEFINITIONS,
  matchLabelToCategory,
} from "../config/categories";
import { computeCategorySummary } from "../utils/categoryUtils";
import { computeGamification, computeLevelInfo } from "../utils/gamification";

const GITLAB_URL = (
  process.env.NEXT_PUBLIC_GITLAB_DOMAIN || "https://gitlab.com"
).replace(/\/$/, "");
const ROOT_GROUP_PATH = process.env.NEXT_PUBLIC_GITLAB_GROUP_PATH;
const CACHE_TTL_MS = 3 * 60 * 1000;

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type GitLabUser = {
  username: string;
  name?: string | null;
  webUrl?: string | null;
  bot?: boolean | null;
  avatarUrl?: string | null;
};

type GitLabGroupMember = {
  user?: GitLabUser | null;
};

type GitLabTimelog = {
  id: string;
  spentAt: string;
  timeSpent: number;
  user?: GitLabUser | null;
  issue?: {
    webUrl?: string | null;
    state?: string | null;
    timeEstimate?: number | null;
    title?: string | null;
    createdAt?: string | null;
    closedAt?: string | null;
    labels?: { nodes?: { title: string }[] | null } | null;
  } | null;
};

type LoadedTimelogs = {
  logs: GroupTimelogsResponse;
  users: Map<string, GitLabUser>;
};

type GitLabMergeRequest = {
  id: string;
  title?: string | null;
  state?: string | null;
  webUrl?: string | null;
  createdAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  author?: GitLabUser | null;
  approvedBy?: { nodes?: { username: string }[] | null } | null;
  headPipeline?: { status?: string | null } | null;
  sourceBranch?: string | null;
  targetBranch?: string | null;
  description?: string | null;
  diffStatsSummary?: {
    additions?: number | null;
    deletions?: number | null;
  } | null;
  project?: {
    branchRules?: { nodes?: { name?: string | null }[] | null } | null;
  } | null;
  notes?: {
    nodes?:
      | {
          id: string;
          body?: string | null;
          createdAt: string;
          system?: boolean | null;
          author?: GitLabUser | null;
        }[]
      | null;
  } | null;
};

type DescendantGroupNode = {
  fullPath: string;
  name: string;
  parent?: { fullPath: string; name: string } | null;
};

type QueryCacheEntry<T> = {
  data: T;
  timestamp: number;
};

const queryCache = new Map<string, QueryCacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

const DESCENDANT_GROUPS_QUERY = `
  query GetDescendantGroups($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      descendantGroups(first: 100, after: $after) {
        nodes {
          fullPath
          name
          parent { fullPath name }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const DIRECT_MEMBERS_QUERY = `
  query GetDirectGroupMembers($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      groupMembers(
        first: 100
        after: $after
        accessLevels: [OWNER, MAINTAINER, ADMIN]
        relations: [DIRECT]
      ) {
        nodes { user { username name webUrl bot avatarUrl } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const INHERITED_MEMBERS_QUERY = `
  query GetInheritedGroupMembers($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      groupMembers(
        first: 100
        after: $after
        accessLevels: [OWNER, MAINTAINER, ADMIN]
        relations: [INHERITED]
      ) {
        nodes { user { username name webUrl bot avatarUrl } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const ROOT_OWNERS_QUERY = `
  query GetRootOwners($fullPath: ID!) {
    group(fullPath: $fullPath) {
      groupMembers(accessLevels: [OWNER], relations: [DIRECT]) {
        nodes { user { username } }
      }
    }
  }
`;

const LABELS_QUERY = `
  query GetGroupLabels($fullPath: ID!) {
    group(fullPath: $fullPath) {
      labels {
        nodes { title description color }
      }
    }
  }
`;

const TIMELOGS_QUERY = `
  query GetGroupTimelogs(
    $fullPath: ID!
    $after: String
    $startDate: Time!
    $endDate: Time!
  ) {
    group(fullPath: $fullPath) {
      timelogs(
        first: 100
        after: $after
        startDate: $startDate
        endDate: $endDate
      ) {
        nodes {
          id
          spentAt
          timeSpent
          user { username name webUrl bot avatarUrl }
          issue {
            webUrl
            state
            timeEstimate
            title
            createdAt
            closedAt
            labels { nodes { title } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const MERGE_REQUESTS_QUERY = `
  query GetGroupMergeRequests($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      mergeRequests(first: 100, after: $after) {
        nodes {
          id
          title
          state
          webUrl
          createdAt
          mergedAt
          closedAt
          author { username name webUrl bot avatarUrl }
          approvedBy { nodes { username } }
          headPipeline { status }
          sourceBranch
          targetBranch
          description
          diffStatsSummary { additions deletions }
          project {
            branchRules(first: 20) { nodes { name } }
          }
          notes(first: 100) {
            nodes {
              id
              body
              createdAt
              system
              author { username name avatarUrl }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

function getRootGroupPath() {
  if (!ROOT_GROUP_PATH?.trim()) {
    throw new Error(
      "GitLab root group is not configured. Set NEXT_PUBLIC_GITLAB_GROUP_PATH.",
    );
  }
  return ROOT_GROUP_PATH.trim().replace(/^\/|\/$/g, "");
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index++) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return result.toString(36);
}

async function graphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${GITLAB_URL}/api/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (!response.ok) {
    throw new Error(`GitLab GraphQL request failed (HTTP ${response.status})`);
  }
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  if (!result.data) {
    throw new Error("GitLab GraphQL response did not contain data");
  }
  return result.data;
}

async function cached<T>(
  token: string,
  key: string,
  load: () => Promise<T>,
): Promise<{ data: T; timestamp: number }> {
  const cacheKey = `${GITLAB_URL}:${hash(token)}:${key}`;
  const existing = queryCache.get(cacheKey) as QueryCacheEntry<T> | undefined;
  if (existing && Date.now() - existing.timestamp < CACHE_TTL_MS) {
    return { data: existing.data, timestamp: existing.timestamp };
  }

  let pending = inFlight.get(cacheKey) as Promise<T> | undefined;
  if (!pending) {
    const generation = cacheGeneration;
    pending = load().then((data) => {
      if (generation === cacheGeneration) {
        const timestamp = Date.now();
        queryCache.set(cacheKey, { data, timestamp });
      }
      return data;
    });
    inFlight.set(cacheKey, pending);
  }
  try {
    const data = await pending;
    const entry = queryCache.get(cacheKey) as QueryCacheEntry<T>;
    return { data, timestamp: entry.timestamp };
  } finally {
    if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
  }
}

async function loadDescendantGroups(token: string) {
  const rootPath = getRootGroupPath();
  let cursor: string | null = null;
  const nodes: DescendantGroupNode[] = [];

  do {
    const data: {
      group: {
        descendantGroups: {
          nodes: DescendantGroupNode[];
          pageInfo: PageInfo;
        };
      } | null;
    } = await graphQL<{
      group: {
        descendantGroups: {
          nodes: DescendantGroupNode[];
          pageInfo: PageInfo;
        };
      } | null;
    }>(token, DESCENDANT_GROUPS_QUERY, { fullPath: rootPath, after: cursor });
    if (!data.group) {
      throw new Error(`Parent group not found or inaccessible: ${rootPath}`);
    }
    const page: { nodes: DescendantGroupNode[]; pageInfo: PageInfo } =
      data.group.descendantGroups;
    nodes.push(...(page?.nodes || []));
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return nodes
    .map((group) => {
      const id = group.fullPath.startsWith(`${rootPath}/`)
        ? group.fullPath.slice(rootPath.length + 1)
        : group.fullPath;
      const parentFullPath = group.parent?.fullPath;
      const parentId =
        parentFullPath && parentFullPath !== rootPath
          ? parentFullPath.startsWith(`${rootPath}/`)
            ? parentFullPath.slice(rootPath.length + 1)
            : parentFullPath
          : null;
      return {
        id,
        name: group.name,
        url: `${GITLAB_URL}/${group.fullPath}`,
        parentId,
        parentName: group.parent?.name || null,
        level: id.split("/").length,
      };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function getGroups(token: string) {
  return cached(token, "descendant-groups", () => loadDescendantGroups(token));
}

async function readMembers(
  token: string,
  fullPath: string,
  relation: "DIRECT" | "INHERITED",
) {
  const members: GitLabGroupMember[] = [];
  let cursor: string | null = null;
  const query =
    relation === "DIRECT" ? DIRECT_MEMBERS_QUERY : INHERITED_MEMBERS_QUERY;
  do {
    const data: {
      group: {
        groupMembers: { nodes: GitLabGroupMember[]; pageInfo: PageInfo };
      } | null;
    } = await graphQL<{
      group: {
        groupMembers: { nodes: GitLabGroupMember[]; pageInfo: PageInfo };
      } | null;
    }>(token, query, { fullPath, after: cursor });
    if (!data.group) {
      throw new Error(`Group not found or inaccessible: ${fullPath}`);
    }
    const page: { nodes: GitLabGroupMember[]; pageInfo: PageInfo } =
      data.group.groupMembers;
    members.push(...(page?.nodes || []));
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return members;
}

async function loadRootOwners(token: string, rootPath: string) {
  try {
    const data = await graphQL<{
      group: { groupMembers?: { nodes?: GitLabGroupMember[] } } | null;
    }>(token, ROOT_OWNERS_QUERY, { fullPath: rootPath });
    if (!data.group) {
      throw new Error(`Parent group not found or inaccessible: ${rootPath}`);
    }
    return new Set(
      (data.group.groupMembers?.nodes || [])
        .map((member) => member.user?.username?.toLowerCase())
        .filter((username): username is string => !!username),
    );
  } catch (error) {
    console.warn("Failed to fetch root group owners:", error);
    return new Set<string>();
  }
}

async function loadLabels(token: string, fullPath: string) {
  const data = await graphQL<{
    group: {
      labels?: {
        nodes?: { title: string; description: string; color: string }[];
      };
    } | null;
  }>(token, LABELS_QUERY, { fullPath });
  if (!data.group) {
    throw new Error(`Group not found or inaccessible: ${fullPath}`);
  }
  const result: GroupLabelsResponse = {};
  for (const label of data.group.labels?.nodes || []) {
    const separator = label.title.includes("::")
      ? "::"
      : label.title.includes(":")
        ? ":"
        : null;
    const splitAt = separator ? label.title.indexOf(separator) : -1;
    const group = splitAt >= 0 ? label.title.slice(0, splitAt) : "Ungrouped";
    const title =
      splitAt >= 0 && separator
        ? label.title.slice(splitAt + separator.length)
        : label.title;
    result[group] ||= [];
    result[group].push({
      id: `${group}::${title}`,
      title,
      description: label.description || "",
      color: label.color || "",
    });
  }
  return result;
}

function parseWeekday(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  if (/^\d+$/.test(value.trim())) return Number(value) % 7;
  const weekdays: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };
  return weekdays[value.trim().toLowerCase()] ?? fallback;
}

function calculateSprintNumber(
  spentAt: string,
  startValue: string | undefined,
) {
  if (!startValue) return undefined;
  const startDate = new Date(startValue);
  const spentDate = new Date(spentAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(spentDate.getTime())) {
    return undefined;
  }
  const startWeekday = parseWeekday(
    process.env.NEXT_PUBLIC_SPRINT_START_WEEKDAY,
    1,
  );
  startDate.setDate(
    startDate.getDate() + ((startWeekday - startDate.getDay() + 7) % 7),
  );
  const durationDays =
    Math.max(1, Number(process.env.NEXT_PUBLIC_SPRINT_DURATION_WEEKS) || 2) * 7;
  const utcDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceStart = Math.floor(
    (utcDay(spentDate) - utcDay(startDate)) / 86_400_000,
  );
  const sprint = Math.floor(daysSinceStart / durationDays) + 1;
  return sprint > 0 ? sprint : undefined;
}

async function loadTimelogs(
  token: string,
  fullPath: string,
): Promise<LoadedTimelogs> {
  const timelogs: GitLabTimelog[] = [];
  const users = new Map<string, GitLabUser>();
  let cursor: string | null = null;
  const configuredStartDate = process.env.NEXT_PUBLIC_PROJECT_START_DATE;
  const endDate = process.env.NEXT_PUBLIC_PROJECT_END_DATE || "2100-01-01";

  do {
    const data: {
      group: {
        timelogs: { nodes: GitLabTimelog[]; pageInfo: PageInfo };
      } | null;
    } = await graphQL<{
      group: {
        timelogs: { nodes: GitLabTimelog[]; pageInfo: PageInfo };
      } | null;
    }>(token, TIMELOGS_QUERY, {
      fullPath,
      after: cursor,
      startDate: configuredStartDate || "1970-01-01",
      endDate,
    });
    if (!data.group) {
      throw new Error(`Group not found or inaccessible: ${fullPath}`);
    }
    const page: { nodes: GitLabTimelog[]; pageInfo: PageInfo } =
      data.group.timelogs;
    const nodes = page?.nodes || [];
    timelogs.push(...nodes);
    for (const log of nodes) {
      if (log.user?.username) users.set(log.user.username, log.user);
    }
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  const effectiveStartDate =
    configuredStartDate ||
    timelogs
      .map((log) => log.spentAt)
      .filter(Boolean)
      .sort()[0]
      ?.slice(0, 10);
  return {
    logs: timelogs
      .filter((log) => !log.issue?.webUrl?.includes("deletion_scheduled"))
      .map((log) => ({
        id: log.id,
        issueUrl: log.issue?.webUrl || "",
        issueLabels: (log.issue?.labels?.nodes || []).map((label) =>
          label.title.includes("::")
            ? label.title
            : label.title.includes(":")
              ? label.title.replace(/:/g, "::")
              : `Ungrouped::${label.title}`,
        ),
        issueTitle: log.issue?.title || "",
        issueState: log.issue?.state || "",
        issueTimeEstimate: log.issue?.timeEstimate || 0,
        issueCreatedAt: log.issue?.createdAt || "",
        issueClosedAt: log.issue?.closedAt || null,
        spentAt: log.spentAt,
        timeSpent: log.timeSpent,
        username: log.user?.username || "unknown",
        sprintNumber: calculateSprintNumber(log.spentAt, effectiveStartDate),
      })),
    users,
  };
}

async function loadMergeRequests(token: string, fullPath: string) {
  const mergeRequests: GitLabMergeRequest[] = [];
  let cursor: string | null = null;
  do {
    const data: {
      group: {
        mergeRequests: { nodes: GitLabMergeRequest[]; pageInfo: PageInfo };
      } | null;
    } = await graphQL<{
      group: {
        mergeRequests: { nodes: GitLabMergeRequest[]; pageInfo: PageInfo };
      } | null;
    }>(token, MERGE_REQUESTS_QUERY, { fullPath, after: cursor });
    if (!data.group) {
      throw new Error(`Group not found or inaccessible: ${fullPath}`);
    }
    const page: { nodes: GitLabMergeRequest[]; pageInfo: PageInfo } =
      data.group.mergeRequests;
    mergeRequests.push(...(page?.nodes || []));
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  const displayNames = parseDisplayNames();
  return mergeRequests.map((request): NormalizedMergeRequest => {
    const discussions: MergeRequestComment[] = [];
    const discussionAuthors = new Set<string>();
    let discussionCount = 0;
    for (const note of request.notes?.nodes || []) {
      if (!note.author?.username) continue;
      discussions.push({
        id: note.id,
        body: note.body || "",
        createdAt: note.createdAt,
        system: !!note.system,
        author: {
          username: note.author.username,
          name:
            displayNames[note.author.username.toLowerCase()] ||
            note.author.name ||
            "",
          avatarUrl: note.author.avatarUrl || null,
        },
      });
      if (!note.system) {
        discussionAuthors.add(note.author.username);
        discussionCount++;
      }
    }
    return {
      id: request.id,
      title: request.title || "",
      state: request.state || "",
      webUrl: request.webUrl || "",
      createdAt: request.createdAt,
      mergedAt: request.mergedAt || null,
      closedAt: request.closedAt || null,
      username: request.author?.username || "unknown",
      approvedBy: (request.approvedBy?.nodes || []).map(
        (user) => user.username,
      ),
      discussionAuthors: Array.from(discussionAuthors),
      discussionCount,
      headPipelineStatus: request.headPipeline?.status || null,
      sourceBranch: request.sourceBranch || "",
      targetBranch: request.targetBranch || "",
      protectedBranches: (request.project?.branchRules?.nodes || [])
        .map((rule) => rule.name || "")
        .filter(Boolean),
      description: request.description || null,
      additions: request.diffStatsSummary?.additions ?? null,
      deletions: request.diffStatsSummary?.deletions ?? null,
      discussions,
    };
  });
}

function parseDisplayNames() {
  const raw = process.env.NEXT_PUBLIC_GITLAB_DISPLAY_NAMES;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && !!entry[1].trim(),
        )
        .map(([username, name]) => [username.toLowerCase(), name.trim()]),
    );
  } catch (error) {
    console.warn("Ignoring invalid NEXT_PUBLIC_GITLAB_DISPLAY_NAMES:", error);
    return {};
  }
}

async function loadMembers(
  token: string,
  groupId: string,
  descendants: GroupResponse,
  timelogs: LoadedTimelogs,
): Promise<GroupMembersResponse> {
  const rootPath = getRootGroupPath();
  const fullPath = `${rootPath}/${groupId}`;
  const rootOwners = await loadRootOwners(token, rootPath);
  const currentGroup = descendants.find((group) => group.id === groupId);
  const parentId = currentGroup?.parentId;
  const paths = new Set([fullPath]);

  for (const child of descendants.filter(
    (group) => group.parentId === groupId || group.id.startsWith(`${groupId}/`),
  )) {
    paths.add(`${rootPath}/${child.id}`);
  }
  if (parentId) paths.add(`${rootPath}/${parentId}`);

  const directUsers = new Map<string, GitLabUser>();
  const directResults = await Promise.all(
    Array.from(paths).map(async (path) => {
      try {
        return { path, members: await readMembers(token, path, "DIRECT") };
      } catch (error) {
        if (path === fullPath) throw error;
        console.warn(`Failed to fetch direct members for ${path}:`, error);
        return { path, members: [] };
      }
    }),
  );
  for (const { members } of directResults) {
    for (const member of members) {
      if (member.user?.username) {
        directUsers.set(member.user.username, member.user);
      }
    }
  }

  let inheritedUsers: GitLabGroupMember[] = [];
  try {
    inheritedUsers = await readMembers(token, fullPath, "INHERITED");
  } catch (error) {
    console.warn("Failed to fetch inherited group members:", error);
  }
  const users = new Map(directUsers);
  const loggedUsernames = new Set(
    timelogs.logs.map((log) => log.username.toLowerCase()),
  );
  for (const [username, user] of timelogs.users) {
    if (!users.has(username)) users.set(username, user);
  }
  for (const member of inheritedUsers) {
    const username = member.user?.username;
    if (
      username &&
      member.user &&
      loggedUsernames.has(username.toLowerCase())
    ) {
      users.set(username, member.user);
    }
  }

  const displayNames = parseDisplayNames();
  return Array.from(users.values())
    .map((user) => {
      const username = user.username;
      const lower = username.toLowerCase();
      const bot =
        !!user.bot ||
        lower.startsWith("group_") ||
        lower.startsWith("project_") ||
        lower.includes("_bot_");
      const verified =
        !bot &&
        (loggedUsernames.has(lower) ||
          (!rootOwners.has(lower) && directUsers.has(username)));
      return {
        id: username,
        name: displayNames[lower] || user.name || username,
        url: user.webUrl || "",
        bot,
        avatarUrl: normalizeAvatarUrl(user.avatarUrl),
        verified,
      };
    })
    .sort(
      (left, right) =>
        Number(right.verified) - Number(left.verified) ||
        left.name.localeCompare(right.name),
    );
}

function normalizeAvatarUrl(avatarUrl?: string | null) {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  return `${GITLAB_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

function generateSprints(
  timelogs: GroupTimelogsResponse,
): GroupSprintsResponse {
  const startValue =
    process.env.NEXT_PUBLIC_PROJECT_START_DATE ||
    timelogs
      .map((log) => log.spentAt)
      .filter(Boolean)
      .sort()[0]
      ?.slice(0, 10);
  const endValue =
    process.env.NEXT_PUBLIC_PROJECT_END_DATE ||
    timelogs
      .map((log) => log.spentAt)
      .filter(Boolean)
      .sort()
      .at(-1)
      ?.slice(0, 10);
  if (!startValue || !endValue) return [];

  const startDate = new Date(`${startValue}T00:00:00`);
  const endDate = new Date(`${endValue}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Configured project dates are invalid");
  }
  const weekday = parseWeekday(
    process.env.NEXT_PUBLIC_SPRINT_START_WEEKDAY,
    1,
  );
  startDate.setDate(
    startDate.getDate() + ((weekday - startDate.getDay() + 7) % 7),
  );
  const durationWeeks = Math.max(
    1,
    Number(process.env.NEXT_PUBLIC_SPRINT_DURATION_WEEKS) || 2,
  );
  const durationDays = durationWeeks * 7;
  const sprints: GroupSprintsResponse = [];

  let sprintStart = startDate;
  let sprintNumber = 1;
  while (sprintStart <= endDate) {
    const sprintEnd = new Date(sprintStart);
    sprintEnd.setDate(sprintEnd.getDate() + durationDays - 1);
    if (sprintEnd > endDate) break;
    sprints.push({
      sprintNumber,
      startDate: sprintStart.toISOString().slice(0, 10),
      endDate: sprintEnd.toISOString().slice(0, 10),
    });
    sprintStart = new Date(sprintEnd);
    sprintStart.setDate(sprintStart.getDate() + 1);
    sprintNumber++;
  }
  return sprints;
}

export function loadGroupData(token: string, groupId: string) {
  const fullPath = `${getRootGroupPath()}/${groupId}`;
  return cached(token, `group-data:${groupId}`, async () => {
    const [groupsResult, labelsResult, timelogsResult, mergeRequestsResult] =
      await Promise.all([
        getGroups(token),
        cached(token, `labels:${fullPath}`, () => loadLabels(token, fullPath)),
        cached(token, `timelogs:${fullPath}`, () =>
          loadTimelogs(token, fullPath),
        ),
        cached(token, `merge-requests:${fullPath}`, () =>
          loadMergeRequests(token, fullPath),
        ),
      ]);

    const { data: members, timestamp: membersTimestamp } = await cached(
      token,
      `members:${fullPath}`,
      () => loadMembers(token, groupId, groupsResult.data, timelogsResult.data),
    );
    const timelogs = timelogsResult.data.logs;
    return {
      members,
      labels: labelsResult.data,
      timelogs,
      sprints: generateSprints(timelogs),
      mergeRequests: mergeRequestsResult.data,
      timestamps: {
        members: membersTimestamp,
        labels: labelsResult.timestamp,
        timelogs: timelogsResult.timestamp,
        sprints: Date.now(),
        mergeRequests: mergeRequestsResult.timestamp,
      },
      groups: groupsResult.data,
    };
  });
}

export async function loadGroupComparison(
  token: string,
): Promise<GroupComparisonResponse> {
  const { data: groups } = await getGroups(token);
  const comparison: GroupComparisonItem[] = [];

  for (let index = 0; index < groups.length; index += 2) {
    const batch = groups.slice(index, index + 2);
    const results = await Promise.allSettled(
      batch.map(async (group): Promise<GroupComparisonItem> => {
        const { data } = await loadGroupData(token, group.id);
        const { categories, otherHours, otherLabels, totalHours } =
          computeCategorySummary(data.timelogs, data.labels);
        const verifiedMembers = data.members.filter(
          (member) => !member.bot && member.verified,
        );
        const verifiedIdsLower = new Set(
          verifiedMembers.map((member) => member.id.toLowerCase()),
        );
        const userHours: Record<string, number> = {};
        const userChurn: Record<string, number> = {};

        for (const log of data.timelogs) {
          const username = log.username.toLowerCase();
          if (verifiedIdsLower.has(username)) {
            userHours[username] = (userHours[username] || 0) + log.timeSpent;
          }
        }
        for (const request of data.mergeRequests) {
          const username = request.username.toLowerCase();
          if (verifiedIdsLower.has(username)) {
            userChurn[username] =
              (userChurn[username] || 0) +
              (request.additions || 0) +
              (request.deletions || 0);
          }
        }

        let totalXp = 0;
        let activeCount = 0;
        for (const member of verifiedMembers) {
          const teammates = Array.from(verifiedIdsLower).filter(
            (id) => id !== member.id.toLowerCase(),
          );
          const stats = computeGamification(
            member.id,
            data.timelogs,
            data.mergeRequests,
            false,
            teammates,
          );
          userHours[member.id.toLowerCase()] ||= 0;
          if (stats.xp > 0) {
            totalXp += stats.xp;
            activeCount++;
          }
        }
        const avgXp = activeCount > 0 ? Math.floor(totalXp / activeCount) : 0;
        const levelInfo = computeLevelInfo(avgXp);
        const churnValues = Object.values(userChurn);
        const totalChurn = churnValues.reduce((sum, value) => sum + value, 0);
        const codeChurnBusFactor =
          totalChurn > 0
            ? Math.max(
                ...churnValues.map((value) => (value / totalChurn) * 100),
              )
            : 0;
        const hourValues = Object.values(userHours).filter(
          (hours) => hours > 0,
        );
        const totalGroupHours = hourValues.reduce(
          (sum, hours) => sum + hours,
          0,
        );
        const peakHeroRelianceIndex =
          totalGroupHours > 0
            ? Math.max(
                ...hourValues.map((hours) => (hours / totalGroupHours) * 100),
              )
            : 0;
        const sortedHours = [...hourValues].sort((a, b) => a - b);
        const minHours = sortedHours[0] || 0;
        const maxHours = sortedHours.at(-1) || 0;
        const meanHours =
          hourValues.length > 0
            ? hourValues.reduce((sum, value) => sum + value, 0) /
              hourValues.length
            : 0;
        const variance =
          hourValues.length > 1
            ? hourValues.reduce(
                (sum, value) => sum + (value - meanHours) ** 2,
                0,
              ) / hourValues.length
            : 0;
        let mergedCount = 0;
        let reviewedCount = 0;
        for (const request of data.mergeRequests) {
          if (request.state !== "merged") continue;
          const author = request.username.toLowerCase();
          if (!verifiedIdsLower.has(author)) continue;
          mergedCount++;
          if (
            [...request.approvedBy, ...request.discussionAuthors].some(
              (reviewer) =>
                reviewer.toLowerCase() !== author &&
                verifiedIdsLower.has(reviewer.toLowerCase()),
            )
          ) {
            reviewedCount++;
          }
        }

        return {
          id: group.id,
          name: group.name,
          url: group.url,
          parentId: group.parentId ?? null,
          parentName: group.parentName ?? null,
          level: group.level ?? group.id.split("/").length,
          subgroups: [],
          members: data.members.map((member) => ({
            id: member.id,
            name: member.name,
            avatarUrl: member.avatarUrl,
            bot: member.bot,
            verified: member.verified,
          })),
          categoryBreakdown: categories.map((category) => ({
            id: category.categoryId,
            label: category.shortLabel,
            hours: category.hours,
            color: category.color,
            matchedLabels: category.matchedLabels,
          })),
          otherHours,
          otherLabels,
          totalHours,
          groupLevel: levelInfo.level,
          groupTierName: levelInfo.tierLabel,
          groupTierColor: levelInfo.tierColor,
          groupAvgXp: avgXp,
          codeChurnBusFactor: +codeChurnBusFactor.toFixed(1),
          peakHeroRelianceIndex: +peakHeroRelianceIndex.toFixed(1),
          effortMultiplier: +(minHours > 0 ? maxHours / minHours : 0).toFixed(
            1,
          ),
          effortGap: +((maxHours - minHours) / 3600).toFixed(1),
          coefficientOfVariation: +(
            meanHours > 0 ? Math.sqrt(variance) / meanHours : 0
          ).toFixed(3),
          reviewCoverage: +(
            mergedCount > 0 ? (reviewedCount / mergedCount) * 100 : 0
          ).toFixed(1),
          groupWorkWeeks: +(totalHours / 40).toFixed(1),
          groupMeanHours: +(
            totalHours / Math.max(verifiedMembers.length, 1)
          ).toFixed(1),
        };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        comparison.push(result.value);
      } else {
        console.error("Failed to load GitLab group comparison:", result.reason);
      }
    }
  }

  if (groups.length > 0 && comparison.length === 0) {
    throw new Error(
      "GitLab groups were found, but none of their analytics could be loaded. Check your access to those groups.",
    );
  }

  const itemsById = new Map<string, GroupComparisonItem>();
  for (const item of comparison) {
    item.subgroups = [];
    itemsById.set(item.id, item);
  }
  const topLevelGroups: GroupComparisonItem[] = [];
  for (const item of comparison) {
    const parent = item.parentId ? itemsById.get(item.parentId) : undefined;
    if (parent) parent.subgroups?.push(item);
    else topLevelGroups.push(item);
  }
  return { groups: topLevelGroups, allGroups: comparison };
}

export async function loadUserLeaderboard(
  token: string,
): Promise<UserLeaderboardResponse> {
  const { data: groups } = await getGroups(token);
  const userMap = new Map<
    string,
    {
      userId: string;
      name: string;
      avatarUrl: string | null;
      groups: Set<string>;
      totalSeconds: number;
      categorySeconds: Record<string, number>;
      otherSeconds: number;
    }
  >();
  const bots = new Set<string>();
  const teammates = new Map<string, Set<string>>();
  const allTimelogs = new Map<string, GroupTimelogsResponse[number]>();
  const allMergeRequests = new Map<string, NormalizedMergeRequest>();

  for (const group of groups) {
    const { data } = await loadGroupData(token, group.id);
    const membersById = new Map(
      data.members.map((member) => [member.id.toLowerCase(), member]),
    );
    const verifiedHumans = data.members.filter(
      (member) => !member.bot && member.verified,
    );

    for (const member of data.members) {
      const userKey = member.id.toLowerCase();
      if (member.bot) bots.add(userKey);
      if (!teammates.has(userKey)) teammates.set(userKey, new Set());
      for (const teammate of verifiedHumans) {
        if (teammate.id.toLowerCase() !== userKey) {
          teammates.get(userKey)?.add(teammate.id.toLowerCase());
        }
      }
    }

    for (const request of data.mergeRequests) {
      allMergeRequests.set(request.id, request);
    }
    for (const log of data.timelogs) {
      if (allTimelogs.has(log.id)) continue;
      allTimelogs.set(log.id, log);

      const userKey = log.username.toLowerCase() || "unknown";
      const member = membersById.get(userKey);
      let entry = userMap.get(userKey);
      if (!entry) {
        entry = {
          userId: log.username || "unknown",
          name: member?.name || log.username || "unknown",
          avatarUrl: member?.avatarUrl || null,
          groups: new Set(),
          totalSeconds: 0,
          categorySeconds: {},
          otherSeconds: 0,
        };
        userMap.set(userKey, entry);
      } else if (!entry.avatarUrl && member?.avatarUrl) {
        entry.avatarUrl = member.avatarUrl;
      }

      entry.groups.add(group.name);
      entry.totalSeconds += log.timeSpent;
      const category = log.issueLabels
        .map((label) => matchLabelToCategory(label))
        .find(Boolean);
      if (category) {
        entry.categorySeconds[category.id] =
          (entry.categorySeconds[category.id] || 0) + log.timeSpent;
      } else {
        entry.otherSeconds += log.timeSpent;
      }
    }
  }

  const timelogs = Array.from(allTimelogs.values());
  const mergeRequests = Array.from(allMergeRequests.values());
  return Array.from(userMap.values())
    .map((user) => {
      const stats = computeGamification(
        user.userId,
        timelogs,
        mergeRequests,
        bots.has(user.userId.toLowerCase()),
        Array.from(teammates.get(user.userId.toLowerCase()) || []),
      );
      return {
        userId: user.userId,
        name: user.name,
        avatarUrl: user.avatarUrl,
        totalHours: +(user.totalSeconds / 3600).toFixed(1),
        categoryBreakdown: CATEGORY_DEFINITIONS.map((definition) => ({
          categoryId: definition.id,
          label: definition.label,
          hours: +((user.categorySeconds[definition.id] || 0) / 3600).toFixed(
            1,
          ),
          color: definition.color,
        })),
        otherHours: +(user.otherSeconds / 3600).toFixed(1),
        groups: Array.from(user.groups).sort(),
        level: stats.level,
        xp: stats.xp,
      };
    })
    .filter((user) => user.totalHours > 0)
    .sort((left, right) => right.totalHours - left.totalHours);
}

export async function loadUserProfile(token: string, username: string) {
  const { data: groups } = await getGroups(token);
  const userTimelogs = new Map<string, GroupTimelogsResponse[number]>();
  const allTimelogs = new Map<string, GroupTimelogsResponse[number]>();
  const allMergeRequests = new Map<string, NormalizedMergeRequest>();
  const validatedTeammates = new Set<string>();
  let member: {
    name: string;
    avatarUrl: string | null;
    id: string;
    url: string;
    bot: boolean;
  } | null = null;
  let userGroupTotalSeconds = 0;
  let sprints: GroupSprintsResponse = [];
  const usernameLower = username.toLowerCase();

  for (const group of groups) {
    const { data } = await loadGroupData(token, group.id);
    if (sprints.length === 0) sprints = data.sprints;
    for (const log of data.timelogs) {
      allTimelogs.set(log.id, log);
      if (log.username.toLowerCase() === usernameLower) {
        userTimelogs.set(log.id, log);
      }
    }
    for (const request of data.mergeRequests) {
      allMergeRequests.set(request.id, request);
    }

    const foundMember = data.members.find(
      (item) => item.id.toLowerCase() === usernameLower,
    );
    if (!foundMember) continue;
    member = {
      name: foundMember.name,
      avatarUrl: foundMember.avatarUrl,
      id: foundMember.id,
      url: foundMember.url,
      bot: foundMember.bot,
    };
    for (const teammate of data.members) {
      if (
        !teammate.bot &&
        teammate.verified &&
        teammate.id.toLowerCase() !== usernameLower
      ) {
        validatedTeammates.add(teammate.id.toLowerCase());
      }
    }
    if (userGroupTotalSeconds === 0) {
      const humanMemberIds = new Set(
        data.members
          .filter((item) => !item.bot)
          .map((item) => item.id.toLowerCase()),
      );
      userGroupTotalSeconds = data.timelogs
        .filter((log) => humanMemberIds.has(log.username.toLowerCase()))
        .reduce((sum, log) => sum + log.timeSpent, 0);
    }
  }

  if (!member && userTimelogs.size > 0) {
    member = {
      name: username,
      avatarUrl: null,
      id: username,
      url: "",
      bot: false,
    };
  }
  if (!member) throw new Error(`GitLab user not found: ${username}`);

  const totalUserSeconds = Array.from(userTimelogs.values()).reduce(
    (sum, log) => sum + log.timeSpent,
    0,
  );
  return {
    member,
    timelogs: Array.from(userTimelogs.values()),
    allTimelogsForGamification: Array.from(allTimelogs.values()),
    allMergeRequestsForGamification: Array.from(allMergeRequests.values()),
    sprints,
    validatedTeammates: Array.from(validatedTeammates),
    groupSharePercent:
      userGroupTotalSeconds > 0
        ? +((totalUserSeconds / userGroupTotalSeconds) * 100).toFixed(1)
        : 0,
  };
}

type IssueUpdateOptions = {
  stateEvent?: "close" | "reopen";
  estimate?: number | string;
};

function getIssueProjectPath(issueUrl: string) {
  let parsedIssueUrl: URL;
  let configuredGitLabUrl: URL;
  try {
    parsedIssueUrl = new URL(issueUrl);
    configuredGitLabUrl = new URL(GITLAB_URL);
  } catch {
    throw new Error("Invalid GitLab issue URL");
  }

  if (
    parsedIssueUrl.origin !== configuredGitLabUrl.origin ||
    parsedIssueUrl.username ||
    parsedIssueUrl.password
  ) {
    throw new Error("Issue URL must belong to the configured GitLab instance");
  }

  const match = parsedIssueUrl.pathname
    .replace(/^\/+/, "")
    .match(/^(.+?)\/(?:-\/)?(?:issues|work_items)\/(\d+)(?:\/.*)?$/);
  if (!match) throw new Error("Invalid GitLab issue URL format");

  let projectPath: string;
  try {
    projectPath = decodeURIComponent(match[1]);
  } catch {
    throw new Error("Invalid GitLab project path in issue URL");
  }
  if (
    projectPath
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid GitLab project path in issue URL");
  }

  return `/projects/${encodeURIComponent(projectPath)}/issues/${match[2]}`;
}

async function updateGitLabIssueRequest(
  token: string,
  endpoint: string,
  method: "POST" | "PUT",
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!token) throw new Error("Sign in with GitLab to edit issues");

  const response = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();

  if (!response.ok) {
    let message: string | undefined;
    try {
      const errorBody = JSON.parse(responseText);
      message =
        typeof errorBody.message === "string"
          ? errorBody.message
          : typeof errorBody.error === "string"
            ? errorBody.error
            : undefined;
    } catch {
      // GitLab may return a plain-text error response.
    }
    throw new Error(
      message || `GitLab issue update failed (HTTP ${response.status})`,
    );
  }

  if (!responseText) {
    throw new Error("GitLab returned an empty response for the issue update");
  }
  try {
    const responseBody: unknown = JSON.parse(responseText);
    if (
      !responseBody ||
      typeof responseBody !== "object" ||
      Array.isArray(responseBody)
    ) {
      throw new Error(
        "GitLab returned an invalid response for the issue update",
      );
    }
    return responseBody as Record<string, unknown>;
  } catch {
    throw new Error("GitLab returned an invalid response for the issue update");
  }
}

export async function updateGitLabIssue(
  token: string,
  issueUrl: string,
  options: IssueUpdateOptions,
) {
  const endpoint = getIssueProjectPath(issueUrl);
  const result: { state?: string; timeEstimate?: number } = {};

  if (options.stateEvent) {
    const updated = await updateGitLabIssueRequest(token, endpoint, "PUT", {
      state_event: options.stateEvent,
    });
    if (typeof updated.state !== "string") {
      throw new Error("GitLab did not return the updated issue state");
    }
    result.state = updated.state;
  }

  if (options.estimate !== undefined) {
    const reset =
      options.estimate === "reset" ||
      options.estimate === 0 ||
      options.estimate === "0";
    if (
      typeof options.estimate === "number" &&
      (!Number.isFinite(options.estimate) || options.estimate < 0)
    ) {
      throw new Error("Issue estimate must be a non-negative number");
    }
    if (
      typeof options.estimate === "string" &&
      !reset &&
      !/^\d+(?:s|m|h|d|w)?$/.test(options.estimate)
    ) {
      throw new Error("Issue estimate must be a GitLab duration or reset");
    }

    const updated = reset
      ? await updateGitLabIssueRequest(
          token,
          `${endpoint}/reset_time_estimate`,
          "POST",
        )
      : await updateGitLabIssueRequest(
          token,
          `${endpoint}/time_estimate`,
          "POST",
          {
            duration:
              typeof options.estimate === "number"
                ? `${options.estimate}s`
                : options.estimate,
          },
        );
    if (typeof updated.time_estimate !== "number") {
      throw new Error("GitLab did not return the updated issue estimate");
    }
    result.timeEstimate = updated.time_estimate;
  }

  return result;
}

export async function updateGitLabIssueLabels(
  token: string,
  issueUrl: string,
  labels: string[],
) {
  if (
    !Array.isArray(labels) ||
    labels.some((label) => typeof label !== "string")
  ) {
    throw new Error("Issue labels must be an array of label names");
  }

  const endpoint = getIssueProjectPath(issueUrl);
  const updated = await updateGitLabIssueRequest(token, endpoint, "PUT", {
    labels: labels.join(","),
  });
  if (
    !Array.isArray(updated.labels) ||
    updated.labels.some((label) => typeof label !== "string")
  ) {
    throw new Error("GitLab did not return the updated issue labels");
  }
  return updated.labels;
}

export function clearGitLabClientCache() {
  cacheGeneration++;
  queryCache.clear();
  inFlight.clear();
}
