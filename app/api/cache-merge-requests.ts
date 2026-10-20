import { apolloClient, gql } from "./apollo-client";
import { CACHE_TTL_MS, groupCaches, getOrCreateGroupCache, getCacheKey, mergeRequestsStore, registerUser, cleanupOrphanedEntities } from "./cache-core";
import type { NormalizedMergeRequest, MergeRequestComment } from "./cache-types";
import { GITLAB_GROUP_PATH, getDisplayName } from "./env";

const MERGE_REQUESTS_QUERY = gql`
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
          author {
            username
            name
            webUrl
            bot
            avatarUrl
          }
          approvedBy {
            nodes {
              username
            }
          }
          headPipeline {
            status
          }
          sourceBranch
          targetBranch
          description
          diffStatsSummary {
            additions
            deletions
          }
          project {
            branchRules(first: 20) {
              nodes {
                name
              }
            }
          }
          notes(first: 100) {
            nodes {
              id
              body
              createdAt
              system
              author {
                username
                name
                avatarUrl
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

async function fetchAndProcessMergeRequests(
  fullGroupPath: string,
  token?: string,
): Promise<string[]> {
  let cursor: string | null = null;
  const mrIds: string[] = [];

  while (true) {
    const data: any = (await apolloClient.query<any>({
      query: MERGE_REQUESTS_QUERY,
      variables: { fullPath: fullGroupPath, after: cursor },
      fetchPolicy: "no-cache",
    })).data;

    if (!data?.group) {
      throw new Error(`Group not found or inaccessible: ${fullGroupPath}`);
    }
    const nodes = data.group.mergeRequests?.nodes || [];

    for (const node of nodes) {
      const id = node.id;
      const username = node.author ? registerUser(node.author) : "unknown";

      const approvedBy = (node.approvedBy?.nodes || []).map((u: any) => u.username);
      const notesNodes = node.notes?.nodes || [];
      const discussionAuthorsSet = new Set<string>();
      let discussionCount = 0;
      const discussions: MergeRequestComment[] = [];

      for (const note of notesNodes) {
        if (note.author?.username) {
          discussions.push({
            id: note.id,
            body: note.body || "",
            createdAt: note.createdAt,
            system: !!note.system,
            author: {
              username: note.author.username,
              name: getDisplayName(note.author.username, note.author.name || ""),
              avatarUrl: note.author.avatarUrl || null,
            },
          });
          if (!note.system) {
            discussionAuthorsSet.add(note.author.username);
            discussionCount++;
          }
        }
      }

      const normalized: NormalizedMergeRequest = {
        id,
        title: node.title || "",
        state: node.state || "",
        webUrl: node.webUrl || "",
        createdAt: node.createdAt,
        mergedAt: node.mergedAt || null,
        closedAt: node.closedAt || null,
        username,
        approvedBy,
        discussionAuthors: Array.from(discussionAuthorsSet),
        discussionCount,
        headPipelineStatus: node.headPipeline?.status || null,
        sourceBranch: node.sourceBranch || "",
        targetBranch: node.targetBranch || "",
        protectedBranches: (node.project?.branchRules?.nodes || []).map((br: any) => br.name || ""),
        description: node.description || null,
        additions: node.diffStatsSummary ? node.diffStatsSummary.additions : null,
        deletions: node.diffStatsSummary ? node.diffStatsSummary.deletions : null,
        discussions,
      };

      mergeRequestsStore.set(id, normalized);
      mrIds.push(id);
    }

    const pageInfo = data.group.mergeRequests?.pageInfo;
    if (pageInfo?.hasNextPage) {
      cursor = pageInfo.endCursor;
    } else {
      break;
    }
  }

  return mrIds;
}

export async function getMergeRequests(groupId: string, token?: string) {
  const fullGroupPath = `${GITLAB_GROUP_PATH}/${groupId}`;
  const now = Date.now();
  const cacheKey = getCacheKey(fullGroupPath, token);
  const groupCache = getOrCreateGroupCache(cacheKey);
  const isStale = now - groupCache.mergeRequestsTimestamp >= CACHE_TTL_MS;

  if (isStale && !groupCache.mergeRequestsPromise) {
    groupCache.mergeRequestsPromise = fetchAndProcessMergeRequests(fullGroupPath, token)
      .then((ids) => {
        const cacheEntry = groupCaches.get(cacheKey)!;
        cacheEntry.mergeRequestIds = ids;
        cacheEntry.mergeRequestsTimestamp = Date.now();
        cacheEntry.mergeRequestsPromise = null;
        cleanupOrphanedEntities();
        return ids;
      })
      .catch((error) => {
        console.error("Failed to refresh merge requests cache:", error);
        const cacheEntry = groupCaches.get(cacheKey)!;
        cacheEntry.mergeRequestsPromise = null;
        throw error;
      });
  }

  const resolveMergeRequests = (ids: string[]) => {
    return ids
      .map((id) => mergeRequestsStore.get(id))
      .filter((x): x is NormalizedMergeRequest => !!x);
  };

  if (groupCache.mergeRequestIds) {
    groupCache.mergeRequestsPromise?.catch(() => {});
    return {
      data: resolveMergeRequests(groupCache.mergeRequestIds),
      timestamp: groupCache.mergeRequestsTimestamp,
    };
  }

  const ids = await groupCache.mergeRequestsPromise!;
  return {
    data: resolveMergeRequests(ids),
    timestamp: groupCaches.get(cacheKey)!.mergeRequestsTimestamp,
  };
}
