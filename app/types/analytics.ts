export type GroupResponse = {
  id: string;
  name: string;
  url: string;
  parentId?: string | null;
  parentName?: string | null;
  level?: number;
}[];

export type MemberBrief = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bot: boolean;
  verified: boolean;
};

export type CategoryBreakdown = {
  id: string;
  label: string;
  hours: number;
  color: string;
  matchedLabels: string[];
};

export type GroupComparisonItem = {
  id: string;
  name: string;
  url: string;
  parentId?: string | null;
  parentName?: string | null;
  level: number;
  subgroups?: GroupComparisonItem[];
  members: MemberBrief[];
  categoryBreakdown: CategoryBreakdown[];
  otherHours: number;
  otherLabels: string[];
  totalHours: number;
  groupLevel: number;
  groupTierName: string;
  groupTierColor: string;
  groupAvgXp: number;
  codeChurnBusFactor: number;
  peakHeroRelianceIndex: number;
  effortMultiplier: number;
  effortGap: number;
  coefficientOfVariation: number;
  reviewCoverage: number;
  groupWorkWeeks: number;
  groupMeanHours: number;
};

export type GroupComparisonResponse = {
  groups: GroupComparisonItem[];
  allGroups?: GroupComparisonItem[];
};

export type CategoryEntry = {
  categoryId: string;
  label: string;
  hours: number;
  color: string;
};

export type UserLeaderboardEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalHours: number;
  categoryBreakdown: CategoryEntry[];
  otherHours: number;
  groups: string[];
  level: number;
  xp: number;
};

export type UserLeaderboardResponse = UserLeaderboardEntry[];
