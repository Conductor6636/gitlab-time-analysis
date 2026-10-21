export type GroupMembersResponse = {
  id: string;
  name: string;
  url: string;
  bot: boolean;
  avatarUrl: string | null;
  verified: boolean;
}[];

export type GroupLabelsResponse = {
  [labelGroup: string]: {
    id: string;
    title: string;
    description: string;
    color: string;
  }[];
};

export type GroupTimelogsResponse = {
  id: string;
  issueUrl: string;
  issueLabels: string[];
  issueTitle: string;
  issueState: string;
  issueTimeEstimate: number;
  issueCreatedAt: string;
  issueClosedAt: string | null;
  spentAt: string;
  timeSpent: number;
  username: string;
  sprintNumber?: number;
}[];

export type GroupSprintsResponse = {
  sprintNumber: number;
  startDate: string;
  endDate: string;
}[];
