export interface MergeRequestComment {
  id: string;
  body: string;
  createdAt: string;
  system: boolean;
  author: {
    username: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface NormalizedMergeRequest {
  id: string;
  title: string;
  state: string;
  webUrl: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  username: string;
  approvedBy: string[];
  discussionAuthors: string[];
  discussionCount: number;
  headPipelineStatus: string | null;
  sourceBranch: string;
  targetBranch: string;
  protectedBranches: string[];
  description: string | null;
  additions: number | null;
  deletions: number | null;
  discussions: MergeRequestComment[];
}
