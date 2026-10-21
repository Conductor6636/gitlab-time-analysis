import {
  matchLabelToCategory,
  CATEGORY_DEFINITIONS,
} from "../config/categories";
import type { GroupTimelogsResponse } from "../types/group";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierName = "bronze" | "silver" | "gold" | "platinum" | "legend";
export type BadgeTrack =
  | "endurance"
  | "velocity"
  | "shipping"
  | "quality"
  | "momentum"
  | "automation"
  | "one-time";

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

export type GamificationMergeRequest = {
  id: string;
  title: string;
  state: string;
  webUrl: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  username: string; // author username
  approvedBy: string[]; // array of usernames who approved
  discussionAuthors: string[]; // array of usernames who commented
  discussionCount: number;
  sourceBranch: string;
  targetBranch: string;
  protectedBranches: string[];
  description?: string | null;
  additions?: number | null;
  deletions?: number | null;
  discussions?: MergeRequestComment[];
};

export type BadgeInfo = {
  id: string;
  name: string;
  icon: string;
  description: string;
  track: BadgeTrack;
  unlocked: boolean;
  progressText: string;
  xpReward: number;
};

export type GamificationStats = {
  xp: number;
  level: number;
  tierName: TierName;
  tierLabel: string;
  tierColor: string;
  xpToNextLevel: number;
  xpPercent: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  longestStreak: number;
  xpBreakdown: {
    hoursXp: number;
    issuesXp: number;
    blindFlightPenalty: number;
    sprintsXp: number;
    reviewsXp: number;
    mergesXp: number;
    badgesXp: number;
    botActionsXp?: number;
  };
  badges: BadgeInfo[];
};

// ---------------------------------------------------------------------------
// Tier system — piecewise linear XP per level
// ---------------------------------------------------------------------------

const TIER_CONFIG = [
  {
    minLevel: 1,
    maxLevel: 9,
    xpPerLevel: 200,
    name: "bronze" as TierName,
    label: "Bronze",
    color: "#cd7f32",
  },
  {
    minLevel: 10,
    maxLevel: 19,
    xpPerLevel: 300,
    name: "silver" as TierName,
    label: "Silver",
    color: "#c0c0c0",
  },
  {
    minLevel: 20,
    maxLevel: 29,
    xpPerLevel: 400,
    name: "gold" as TierName,
    label: "Gold",
    color: "#ffd700",
  },
  {
    minLevel: 30,
    maxLevel: Infinity,
    xpPerLevel: 500,
    name: "legend" as TierName,
    label: "Legend",
    color: "#a855f7",
  },
];

function xpNeededForLevel(level: number): number {
  if (level <= 1) return 0;
  let xp = 0;
  for (let l = 1; l < level; l++) {
    const tier =
      TIER_CONFIG.find((t) => l >= t.minLevel && l <= t.maxLevel) ??
      TIER_CONFIG[TIER_CONFIG.length - 1];
    xp += tier.xpPerLevel;
  }
  return xp;
}

function getTier(level: number): (typeof TIER_CONFIG)[number] {
  return (
    TIER_CONFIG.find((t) => level >= t.minLevel && level <= t.maxLevel) ??
    TIER_CONFIG[TIER_CONFIG.length - 1]
  );
}

function computeLevelInfo(xp: number): {
  level: number;
  tierName: TierName;
  tierLabel: string;
  tierColor: string;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  xpPercent: number;
} {
  let level = 1;
  while (true) {
    const nextXp = xpNeededForLevel(level + 1);
    if (nextXp > xp) break;
    level++;
  }

  const xpForCurrent = xpNeededForLevel(level);
  const xpForNext = xpNeededForLevel(level + 1);
  const xpToNext = xpForNext - xp;
  const xpInLevel = xp - xpForCurrent;
  const xpRange = xpForNext - xpForCurrent;
  const xpPercent =
    xpRange > 0 ? Math.min(100, (xpInLevel / xpRange) * 100) : 100;
  const tier = getTier(level);

  return {
    level,
    tierName: tier.name,
    tierLabel: tier.label,
    tierColor: tier.color,
    xpForCurrentLevel: xpForCurrent,
    xpForNextLevel: xpForNext,
    xpToNextLevel: xpToNext,
    xpPercent: Math.round(xpPercent * 100) / 100,
  };
}

function isProtectedBranch(branch: string, protectedBranches: string[]): boolean {
  if (protectedBranches && protectedBranches.length > 0) {
    return protectedBranches.includes(branch);
  }
  const protectedNames = ["main", "master", "develop", "developer", "production"];
  const b = branch.toLowerCase();
  return protectedNames.includes(b) || b.startsWith("release");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the longest consecutive run in a sorted array of sprint numbers. */
function longestConsecutiveRun(sortedSprints: number[]): number {
  if (sortedSprints.length === 0) return 0;
  let max = 1;
  let current = 1;
  for (let i = 1; i < sortedSprints.length; i++) {
    if (sortedSprints[i] === sortedSprints[i - 1] + 1) {
      current++;
      if (current > max) max = current;
    } else {
      current = 1;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Badge definitions
// ---------------------------------------------------------------------------

type RawBadgeDef = {
  id: string;
  name: string;
  icon: string;
  description: string;
  track: BadgeTrack;
  xpReward: number;
  // threshold is interpreted per-track:
  //   endurance  → totalHours
  //   velocity   → closedEstimatedHours
  //   shipping   → mergedMrsCount
  //   quality    → reviewedMrsCount
  //   momentum   → activeSprintCount
  threshold: number;
};

const ENDURANCE_BADGES: RawBadgeDef[] = [
  {
    id: "endurance_1",
    name: "Greenhorn",
    icon: "🥉",
    description: "Log 1+ hour total",
    track: "endurance",
    xpReward: 15,
    threshold: 1,
  },
  {
    id: "endurance_2",
    name: "Apprentice",
    icon: "🥉",
    description: "Log 10+ hours total",
    track: "endurance",
    xpReward: 50,
    threshold: 10,
  },
  {
    id: "endurance_3",
    name: "Dedicated Worker",
    icon: "🥈",
    description: "Log 30+ hours total",
    track: "endurance",
    xpReward: 100,
    threshold: 30,
  },
  {
    id: "endurance_4",
    name: "Deep Worker",
    icon: "🥈",
    description: "Log 60+ hours total",
    track: "endurance",
    xpReward: 150,
    threshold: 60,
  },
  {
    id: "endurance_5",
    name: "Century Club",
    icon: "🥇",
    description: "Log 100+ hours total",
    track: "endurance",
    xpReward: 200,
    threshold: 100,
  },
  {
    id: "endurance_6",
    name: "Marathoner",
    icon: "👑",
    description: "Log 130+ hours total",
    track: "endurance",
    xpReward: 250,
    threshold: 130,
  },
  {
    id: "endurance_7",
    name: "Apex Contributor",
    icon: "🌌",
    description: "Log 150+ hours total",
    track: "endurance",
    xpReward: 400,
    threshold: 150,
  },
];

const VELOCITY_BADGES: RawBadgeDef[] = [
  {
    id: "velocity_1",
    name: "Task Solver",
    icon: "🥉",
    description: "Close issues totaling 5+ estimated hours",
    track: "velocity",
    xpReward: 20,
    threshold: 5,
  },
  {
    id: "velocity_2",
    name: "Problem Solver",
    icon: "🥈",
    description: "Close issues totaling 20+ estimated hours",
    track: "velocity",
    xpReward: 50,
    threshold: 20,
  },
  {
    id: "velocity_3",
    name: "Code Crusader",
    icon: "🥈",
    description: "Close issues totaling 40+ estimated hours",
    track: "velocity",
    xpReward: 100,
    threshold: 40,
  },
  {
    id: "velocity_4",
    name: "Issue Sweeper",
    icon: "🥇",
    description: "Close issues totaling 70+ estimated hours",
    track: "velocity",
    xpReward: 150,
    threshold: 70,
  },
  {
    id: "velocity_5",
    name: "Task Master",
    icon: "🏆",
    description: "Close issues totaling 100+ estimated hours",
    track: "velocity",
    xpReward: 250,
    threshold: 100,
  },
  {
    id: "velocity_6",
    name: "Titan of Tasks",
    icon: "🪐",
    description: "Close issues totaling 150+ estimated hours",
    track: "velocity",
    xpReward: 350,
    threshold: 150,
  },
];

const SHIPPING_BADGES: RawBadgeDef[] = [
  {
    id: "shipping_1",
    name: "Continuous Integrator",
    icon: "🥉",
    description: "Have 5 of your MRs merged",
    track: "shipping",
    xpReward: 50,
    threshold: 5,
  },
  {
    id: "shipping_2",
    name: "Git Master",
    icon: "🥈",
    description: "Have 10 of your MRs merged",
    track: "shipping",
    xpReward: 100,
    threshold: 10,
  },
  {
    id: "shipping_3",
    name: "Merge Maestro",
    icon: "🥇",
    description: "Have 20 of your MRs merged",
    track: "shipping",
    xpReward: 150,
    threshold: 20,
  },
  {
    id: "shipping_4",
    name: "Deployment Deity",
    icon: "☄️",
    description: "Have 30+ of your MRs merged",
    track: "shipping",
    xpReward: 250,
    threshold: 30,
  },
];

const QUALITY_BADGES: RawBadgeDef[] = [
  {
    id: "quality_1",
    name: "Eagle Eye",
    icon: "🥉",
    description: "Approve/Review 5 teammate MRs",
    track: "quality",
    xpReward: 40,
    threshold: 5,
  },
  {
    id: "quality_2",
    name: "Code Guardian",
    icon: "🥈",
    description: "Approve/Review 10 teammate MRs",
    track: "quality",
    xpReward: 80,
    threshold: 10,
  },
  {
    id: "quality_3",
    name: "Sentinel",
    icon: "🥇",
    description: "Approve/Review 20 teammate MRs",
    track: "quality",
    xpReward: 150,
    threshold: 20,
  },
  {
    id: "quality_4",
    name: "The Gatekeeper",
    icon: "🦅",
    description: "Approve/Review 30 teammate MRs",
    track: "quality",
    xpReward: 250,
    threshold: 30,
  },
];

const MOMENTUM_BADGES: RawBadgeDef[] = [
  {
    id: "momentum_1",
    name: "Sprint Jogger",
    icon: "🥉",
    description: "Active in 2 Iterations/Milestones",
    track: "momentum",
    xpReward: 20,
    threshold: 2,
  },
  {
    id: "momentum_2",
    name: "Sprint Machine",
    icon: "🥈",
    description: "Active in 6 Iterations/Milestones",
    track: "momentum",
    xpReward: 80,
    threshold: 6,
  },
  {
    id: "momentum_3",
    name: "Sprint Overlord",
    icon: "🥇",
    description: "Active in 10 Iterations/Milestones",
    track: "momentum",
    xpReward: 150,
    threshold: 10,
  },
  {
    id: "momentum_4",
    name: "Chronos",
    icon: "⏳",
    description: "Active in 15+ Iterations/Milestones",
    track: "momentum",
    xpReward: 300,
    threshold: 15,
  },
];

const AUTOMATION_BADGES: RawBadgeDef[] = [
  {
    id: "automation_1",
    name: "Ghost Writer",
    icon: "✍️",
    description: "Bot updates 50 MR descriptions or comments",
    track: "automation",
    xpReward: 100,
    threshold: 50,
  },
  {
    id: "automation_2",
    name: "Skynet",
    icon: "🧠",
    description: "Bot reaches 200 total automated actions",
    track: "automation",
    xpReward: 300,
    threshold: 200,
  },
];

const STREAK_BADGES = [
  {
    id: "streak_1",
    name: "On Fire",
    icon: "🔥",
    description: "Maintain a streak of 3+ consecutive active sprints",
    track: "momentum" as BadgeTrack,
    xpReward: 40,
    threshold: 3,
  },
  {
    id: "streak_2",
    name: "Unstoppable",
    icon: "⚡",
    description: "Maintain a streak of 5+ consecutive active sprints",
    track: "momentum" as BadgeTrack,
    xpReward: 80,
    threshold: 5,
  },
  {
    id: "streak_3",
    name: "Streak Legend",
    icon: "👑",
    description: "Maintain a streak of 8+ consecutive active sprints",
    track: "momentum" as BadgeTrack,
    xpReward: 150,
    threshold: 8,
  },
  {
    id: "streak_4",
    name: "Sprint Monarch",
    icon: "🌌",
    description: "Maintain a streak of 15+ consecutive active sprints",
    track: "momentum" as BadgeTrack,
    xpReward: 300,
    threshold: 15,
  },
];

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeGamification(
  username: string,
  timelogs: GroupTimelogsResponse,
  mergeRequests: GamificationMergeRequest[] = [],
  isBot: boolean = false,
  validatedTeammates: string[] = [],
): GamificationStats {
  const lowerUser = username.toLowerCase();
  const userLogs = timelogs.filter(
    (log) => log.username.toLowerCase() === lowerUser,
  );

  // --------------- Total hours ---------------
  const totalHours =
    userLogs.reduce((sum, log) => sum + log.timeSpent, 0) / 3600;

  // --------------- Sprint / iteration data ---------------
  const sprintHoursMap: Record<number, number> = {};
  userLogs.forEach((log) => {
    if (log.sprintNumber !== undefined && log.sprintNumber !== null) {
      sprintHoursMap[log.sprintNumber] =
        (sprintHoursMap[log.sprintNumber] || 0) + log.timeSpent / 3600;
    }
  });

  const activeSprintNumbers = Object.keys(sprintHoursMap)
    .map(Number)
    .sort((a, b) => a - b);
  const longestStreak = longestConsecutiveRun(activeSprintNumbers);

  // --------------- Categories ---------------
  const categoryHours: Record<string, number> = { other: 0 };
  CATEGORY_DEFINITIONS.forEach((cat) => {
    categoryHours[cat.id] = 0;
  });
  userLogs.forEach((log) => {
    let assigned = "other";
    for (const label of log.issueLabels || []) {
      const cat = matchLabelToCategory(label);
      if (cat) {
        assigned = cat.id;
        break;
      }
    }
    categoryHours[assigned] += log.timeSpent / 3600;
  });

  let maxCategoryHours = 0;
  let maxCategoryName = "None";
  Object.entries(categoryHours).forEach(([id, hours]) => {
    if (hours > maxCategoryHours) {
      maxCategoryHours = hours;
      maxCategoryName =
        id === "other"
          ? "Other"
          : CATEGORY_DEFINITIONS.find((c) => c.id === id)?.label || "Other";
    }
  });
  const maxCategoryPercentage =
    totalHours > 0 ? (maxCategoryHours / totalHours) * 100 : 0;

  // --------------- Issue-level analysis ---------------
  const uniqueIssueUrls = new Set<string>();
  userLogs.forEach((log) => {
    if (log.issueUrl) uniqueIssueUrls.add(log.issueUrl);
  });

  // Closed issues the user contributed to (for Velocity track + issuesXp + one-time badges)
  const userClosedIssueUrls = new Set<string>();
  const closedIssueEstimates: Record<string, number> = {}; // issueUrl -> estimate in seconds

  userLogs.forEach((log) => {
    if (log.issueUrl && log.issueState === "closed") {
      userClosedIssueUrls.add(log.issueUrl);
      closedIssueEstimates[log.issueUrl] = log.issueTimeEstimate || 0;
    }
  });

  let totalClosedEstimateSeconds = 0;
  let sharpShooterUnlocked = false;
  let maxEstimateShareHours = 0;

  Array.from(userClosedIssueUrls).forEach((issueUrl) => {
    const estimate = closedIssueEstimates[issueUrl];
    if (estimate <= 0) return;

    const issueLogs = timelogs.filter((l) => l.issueUrl === issueUrl);
    const userSeconds = issueLogs
      .filter((l) => l.username.toLowerCase() === lowerUser)
      .reduce((sum, l) => sum + l.timeSpent, 0);
    const totalSeconds = issueLogs.reduce((sum, l) => sum + l.timeSpent, 0);
    if (totalSeconds <= 0) return;

    const share = userSeconds / totalSeconds;

    // Proportional estimate share for Velocity badges
    totalClosedEstimateSeconds += share * estimate;

    // Sharp Shooter: total time spent across all users is within ±10% of estimate
    const diffPct = Math.abs(totalSeconds - estimate) / estimate;
    if (diffPct <= 0.1) {
      sharpShooterUnlocked = true;
    }

    const shareHours = (share * estimate) / 3600;
    if (shareHours > maxEstimateShareHours) {
      maxEstimateShareHours = shareHours;
    }
  });

  const heavyLifterUnlocked = maxEstimateShareHours >= 8;
  const colossalLifterUnlocked = maxEstimateShareHours >= 10;
  const titanLifterUnlocked = maxEstimateShareHours >= 12;

  const totalClosedEstimateHours = totalClosedEstimateSeconds / 3600;

  // --------------- MR-level analysis ---------------
  const userMergedMrs = mergeRequests.filter(
    (mr) =>
      mr.username.toLowerCase() === lowerUser &&
      mr.state === "merged" &&
      isProtectedBranch(mr.targetBranch, mr.protectedBranches) &&
      !isProtectedBranch(mr.sourceBranch, mr.protectedBranches),
  );
  const mergedMrsCount = userMergedMrs.length;

  const approvedMrs = mergeRequests.filter(
    (mr) =>
      mr.username.toLowerCase() !== lowerUser &&
      mr.approvedBy.some((u) => u.toLowerCase() === lowerUser),
  );
  const approvedMrsCount = approvedMrs.length;

  const commentedOnlyMrs = mergeRequests.filter(
    (mr) =>
      mr.username.toLowerCase() !== lowerUser &&
      mr.discussionAuthors.some((u) => u.toLowerCase() === lowerUser) &&
      !mr.approvedBy.some((u) => u.toLowerCase() === lowerUser),
  );
  const commentedOnlyMrsCount = commentedOnlyMrs.length;

  const reviewedMrsCount = approvedMrsCount + commentedOnlyMrsCount;

  const approvedTeammates = new Set<string>();
  const commentedTeammates = new Set<string>();
  approvedMrs.forEach((mr) => approvedTeammates.add(mr.username.toLowerCase()));
  commentedOnlyMrs.forEach((mr) => commentedTeammates.add(mr.username.toLowerCase()));

  const lowerTeammates = validatedTeammates
    .map((t) => t.toLowerCase())
    .filter((t) => t !== lowerUser);
  const teammatesSet = new Set(lowerTeammates);

  const uniqueTeammatesReviewed = new Set<string>();
  approvedTeammates.forEach((t) => {
    if (validatedTeammates.length === 0 || teammatesSet.has(t)) {
      uniqueTeammatesReviewed.add(t);
    }
  });
  commentedTeammates.forEach((t) => {
    if (validatedTeammates.length === 0 || teammatesSet.has(t)) {
      uniqueTeammatesReviewed.add(t);
    }
  });
  const teammatesReviewedCount = uniqueTeammatesReviewed.size;

  const otherActiveAuthors = new Set(
    mergeRequests
      .map((mr) => mr.username.toLowerCase())
      .filter((u) => u !== lowerUser)
  );

  const otherActiveTeammates = validatedTeammates.length > 0
    ? teammatesSet
    : otherActiveAuthors;

  // Full-Stack Sprint: at least 1 hour in each of the 4 categories in a single sprint
  const sprintCategoryHours: Record<number, Record<string, number>> = {};
  userLogs.forEach((log) => {
    if (log.sprintNumber !== undefined && log.sprintNumber !== null) {
      const sprintNum = log.sprintNumber;
      if (!sprintCategoryHours[sprintNum]) {
        sprintCategoryHours[sprintNum] = {};
        CATEGORY_DEFINITIONS.forEach((cat) => {
          sprintCategoryHours[sprintNum][cat.id] = 0;
        });
      }
      let assigned = "";
      for (const label of log.issueLabels || []) {
        const cat = matchLabelToCategory(label);
        if (cat) {
          assigned = cat.id;
          break;
        }
      }
      if (assigned) {
        sprintCategoryHours[sprintNum][assigned] += log.timeSpent / 3600;
      }
    }
  });

  const fullStackSprintUnlocked = Object.values(sprintCategoryHours).some(
    (cats) =>
      (cats["project-management"] || 0) >= 1 &&
      (cats["requirements-engineering"] || 0) >= 1 &&
      (cats["implementation"] || 0) >= 1 &&
      (cats["architecture"] || 0) >= 1
  );

  // (No synergy badge — removed per user request; the spec's 48h window
  // required review timestamps that are not available in the current data.)

  // --------------- Base XP ---------------
  // 20 XP per hour (fractional)
  const hoursXp = Math.floor(totalHours * 20);

  // 15 XP per estimated hour for closed issues, split proportionally by each user's
  // logged time on the issue; -10 Blind Flight penalty if no estimate, also split
  let issuesXp = 0;
  let blindFlightPenalty = 0;
  Array.from(userClosedIssueUrls).forEach((issueUrl) => {
    const estimate = closedIssueEstimates[issueUrl];
    const issueLogs = timelogs.filter((l) => l.issueUrl === issueUrl);
    const userSeconds = issueLogs
      .filter((l) => l.username.toLowerCase() === lowerUser)
      .reduce((sum, l) => sum + l.timeSpent, 0);
    const totalSeconds = issueLogs.reduce((sum, l) => sum + l.timeSpent, 0);
    if (totalSeconds <= 0) return;

    const share = userSeconds / totalSeconds;
    if (estimate > 0) {
      const totalIssueXp = Math.floor((estimate / 3600) * 15);
      issuesXp += Math.floor(share * totalIssueXp);
    } else {
      blindFlightPenalty += Math.floor(share * 30);
    }
  });

  // 25 XP per active sprint
  const sprintsXp = activeSprintNumbers.length * 25;

  // 15 XP per teammate MR approved, 10 XP per MR commented (no approval)
  const reviewsXp = (approvedMrsCount * 15) + (commentedOnlyMrsCount * 10);

  // 50 XP per authored MR merged
  const mergesXp = mergedMrsCount * 50;

  // Automation/Bot action XP: 2 XP per bot action (discussion count contribution on MRs)
  const botActionsCount = mergeRequests.reduce(
    (sum, mr) => sum + mr.discussionCount,
    0,
  );
  const botActionsXp = isBot ? botActionsCount * 2 : 0;

  const baseXp =
    hoursXp + issuesXp + sprintsXp + reviewsXp + mergesXp + botActionsXp - blindFlightPenalty;

  // --------------- Badge evaluation ---------------
  const badges: BadgeInfo[] = [];

  // Endurance
  ENDURANCE_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: totalHours >= def.threshold,
      progressText: `${totalHours.toFixed(1)} / ${def.threshold} h`,
    });
  });

  // Velocity
  VELOCITY_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: totalClosedEstimateHours >= def.threshold,
      progressText: `${totalClosedEstimateHours.toFixed(1)} / ${def.threshold} estimated hours`,
    });
  });

  // Shipping
  SHIPPING_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: mergedMrsCount >= def.threshold,
      progressText: `${mergedMrsCount} / ${def.threshold} MRs`,
    });
  });

  // Quality
  QUALITY_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: reviewedMrsCount >= def.threshold,
      progressText: `${reviewedMrsCount} / ${def.threshold} reviews`,
    });
  });

  // Momentum
  MOMENTUM_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: activeSprintNumbers.length >= def.threshold,
      progressText: `${activeSprintNumbers.length} / ${def.threshold} iterations`,
    });
  });

  // Sprint Streak
  STREAK_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: longestStreak >= def.threshold,
      progressText: `${longestStreak} / ${def.threshold} sprints`,
    });
  });

  // Automation (only meaningful for bot accounts)
  AUTOMATION_BADGES.forEach((def) => {
    badges.push({
      ...def,
      unlocked: isBot ? botActionsCount >= def.threshold : false,
      progressText: isBot
        ? `${botActionsCount} / ${def.threshold} actions`
        : `Bot-only badge`,
    });
  });

  // One-time badges
  const oneTimeBadges: BadgeInfo[] = [
    {
      id: "first_steps",
      name: "First Steps",
      icon: "🌱",
      description: "Close your very first GitLab issue",
      track: "one-time",
      unlocked: userClosedIssueUrls.size >= 1,
      progressText:
        userClosedIssueUrls.size >= 1 ? "Unlocked" : "Close your first issue",
      xpReward: 10,
    },
    {
      id: "pr_pioneer",
      name: "PR Pioneer",
      icon: "🚀",
      description: "Have your very first authored MR successfully merged",
      track: "one-time",
      unlocked: mergedMrsCount >= 1,
      progressText: mergedMrsCount >= 1 ? "Unlocked" : "Merge your first MR",
      xpReward: 20,
    },
    {
      id: "sharp_shooter",
      name: "Sharp Shooter",
      icon: "🎯",
      description:
        "Close an issue where the logged time is within ±10% of the estimate",
      track: "one-time",
      unlocked: sharpShooterUnlocked,
      progressText: sharpShooterUnlocked
        ? "Unlocked"
        : "Close an issue within ±10% of estimate",
      xpReward: 50,
    },
    {
      id: "heavy_lifter",
      name: "Heavy Lifter",
      icon: "💪",
      description:
        "Successfully close a large issue with an estimate of 8+ hours",
      track: "one-time",
      unlocked: heavyLifterUnlocked,
      progressText: `${maxEstimateShareHours.toFixed(1)} / 8 h`,
      xpReward: 80,
    },
    {
      id: "colossal_lifter",
      name: "Colossal Lifter",
      icon: "🏋️",
      description:
        "Successfully close a massive issue with an estimate of 10+ hours",
      track: "one-time",
      unlocked: colossalLifterUnlocked,
      progressText: `${maxEstimateShareHours.toFixed(1)} / 10 h`,
      xpReward: 120,
    },
    {
      id: "titan_lifter",
      name: "Titan Lifter",
      icon: "🌋",
      description:
        "Successfully close a gargantuan issue with an estimate of 12+ hours",
      track: "one-time",
      unlocked: titanLifterUnlocked,
      progressText: `${maxEstimateShareHours.toFixed(1)} / 12 h`,
      xpReward: 150,
    },
    {
      id: "all_rounder",
      name: "Full-Stack Sprint",
      icon: "🎨",
      description:
        "Log at least 1 hour in each of the 4 categories during a single sprint",
      track: "one-time",
      unlocked: fullStackSprintUnlocked,
      progressText: fullStackSprintUnlocked
        ? "Unlocked"
        : "Log 1h+ in all 4 categories in a single sprint",
      xpReward: 100,
    },
    {
      id: "team_player",
      name: "Team Player",
      icon: "🤝",
      description:
        "Review/approve merge requests for at least 3 different team members",
      track: "one-time",
      unlocked: otherActiveTeammates.size > 0 && teammatesReviewedCount >= Math.min(3, otherActiveTeammates.size),
      progressText: `${teammatesReviewedCount} / ${Math.min(3, otherActiveTeammates.size)} teammates`,
      xpReward: 50,
    },
    {
      id: "community_pillar",
      name: "Community Pillar",
      icon: "🏛️",
      description:
        "Review/approve merge requests for all other active team members",
      track: "one-time",
      unlocked: otherActiveTeammates.size > 0 && teammatesReviewedCount >= otherActiveTeammates.size,
      progressText: `${teammatesReviewedCount} / ${otherActiveTeammates.size} teammates`,
      xpReward: 150,
    },
  ];

  badges.push(...oneTimeBadges);

  // --------------- Total XP and level ---------------
  const badgesXp = badges
    .filter((b) => b.unlocked)
    .reduce((sum, b) => sum + b.xpReward, 0);
  const totalXp = baseXp + badgesXp;
  const levelInfo = computeLevelInfo(totalXp);

  // --------------- Legacy fields for backward compat ---------------
  const maxSprintHours = activeSprintNumbers.reduce(
    (max, sp) => Math.max(max, sprintHoursMap[sp]),
    0,
  );
  const activeCategoriesCount = CATEGORY_DEFINITIONS.filter(
    (cat) => (categoryHours[cat.id] || 0) > 0,
  ).length;

  return {
    xp: totalXp,
    level: levelInfo.level,
    tierName: levelInfo.tierName,
    tierLabel: levelInfo.tierLabel,
    tierColor: levelInfo.tierColor,
    xpToNextLevel: levelInfo.xpToNextLevel,
    xpPercent: levelInfo.xpPercent,
    xpForCurrentLevel: levelInfo.xpForCurrentLevel,
    xpForNextLevel: levelInfo.xpForNextLevel,
    longestStreak,
    xpBreakdown: {
      hoursXp,
      issuesXp,
      blindFlightPenalty,
      sprintsXp,
      reviewsXp,
      mergesXp,
      badgesXp,
      botActionsXp,
    },
    badges,
  };
}

// Re-export constants for use by other modules (e.g., tier colors in UI)
export const TIER_INFO = TIER_CONFIG;
export { xpNeededForLevel, computeLevelInfo };
