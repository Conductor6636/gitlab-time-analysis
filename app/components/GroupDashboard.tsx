"use client";

import {
  Box,
  Alert,
  Card,
  CardContent,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Tooltip,
  Typography,
  useTheme,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Breadcrumbs,
  Chip,
} from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import TvIcon from "@mui/icons-material/Tv";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import Group from "@mui/icons-material/Group";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import React from "react";
import { useUserAuth } from "../UserAuthContext";
import { useThemeMode } from "../ThemeContext";
import type {
  GroupLabelsResponse,
  GroupMembersResponse,
  GroupSprintsResponse,
  GroupTimelogsResponse,
} from "../types/group";
import type { GroupResponse } from "../types/analytics";
import EstimateAccuracy from "./EstimateAccuracy";
import HeaderCards from "./HeaderCards";
import Heatmap from "./Heatmap";
import ProblemsModal from "./ProblemsModal";
import SprintOverview from "./SprintOverview";
import SprintRadar from "./SprintRadar";
import StaleIndicator from "./StaleIndicator";
import TimePerCategory from "./TimePerCategory";
import TimePerMember from "./TimePerMember";
import TimePerSprintMember from "./TimePerSprintMember";
import TimePerWeek from "./TimePerWeek";
import TimePerWeekday from "./TimePerWeekday";
import UserDetailModal from "./UserDetailModal";
import { GroupContext } from "../GroupContext";
import { useUserProfile } from "../UserProfileContext";
import { GamificationMergeRequest, computeLevelInfo, computeGamification, TIER_INFO, xpNeededForLevel } from "../utils/gamification";
import {
  PieChart,
  Pie,
  Cell,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as ChartTooltip,
} from "recharts";
import { matchLabelToCategory } from "../utils/categoryUtils";
import { CATEGORY_DEFINITIONS } from "../config/categories";
import { UserAvatar } from "./UserAvatar";
import { groupRouteHref, handleGroupRouteClick } from "../ClientRoute";
import {
  clearGitLabClientCache,
  getGroups,
  loadGroupData,
} from "../gitlab/client";

export default function GroupDashboard({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const { presentationMode, setPresentationMode } = useThemeMode();
  const groupIdStr = groupId;
  const { token, loading: authLoading } = useUserAuth();

  const [allGroups, setAllGroups] = React.useState<GroupResponse>([]);

  const currentGroupInfo = allGroups.find((g) => g.id === groupIdStr);
  const childSubgroups = allGroups.filter((g) => g.parentId === groupIdStr);
  const parentGroup = currentGroupInfo?.parentId
    ? allGroups.find((g) => g.id === currentGroupInfo.parentId)
    : null;
  const siblingSubgroups = parentGroup
    ? allGroups.filter((g) => g.parentId === parentGroup.id)
    : [];

  const breadcrumbAncestors = React.useMemo(() => {
    const ancestors: typeof allGroups = [];
    let curr = currentGroupInfo;
    while (curr?.parentId) {
      const parent = allGroups.find((g) => g.id === curr?.parentId);
      if (parent) {
        ancestors.unshift(parent);
        curr = parent;
      } else {
        break;
      }
    }
    return ancestors;
  }, [currentGroupInfo, allGroups]);

  const [members, setMembers] = React.useState<GroupMembersResponse>([]);
  const [labels, setLabels] = React.useState<GroupLabelsResponse>({});
  const [timelogs, setTimelogs] = React.useState<GroupTimelogsResponse>([]);
  const [sprints, setSprints] = React.useState<GroupSprintsResponse>([]);
  const [mergeRequests, setMergeRequests] = React.useState<GamificationMergeRequest[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [selectedSprint, setSelectedSprint] = React.useState<number | null>(null);
  const [showProblems, setShowProblems] = React.useState(false);
  const { profileUsername, closeProfile } = useUserProfile();

  React.useEffect(() => {
    if (authLoading || !token) {
      setAllGroups([]);
      return;
    }
    let active = true;
    getGroups(token)
      .then(({ data }) => {
        if (active) setAllGroups(data);
      })
      .catch((error: unknown) => {
        console.error("Failed to load GitLab groups:", error);
        if (active) {
          setDataError(
            error instanceof Error ? error.message : "Failed to load GitLab groups",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [token, authLoading]);

  const togglePresentationMode = () => {
    if (!presentationMode) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable full-screen mode:", err);
      });
      setPresentationMode(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      setPresentationMode(false);
    }
  };

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setPresentationMode(isFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [setPresentationMode]);

  const fetchAllData = React.useCallback(async () => {
    if (authLoading) return;
    if (!token) {
      setDataError("Sign in with GitLab to load group analytics.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setDataError(null);
    try {
      const { data } = await loadGroupData(token, groupIdStr);
      setMembers(data.members);
      setLabels(data.labels);
      setTimelogs(data.timelogs);
      setSprints(data.sprints);
      setMergeRequests(data.mergeRequests);
      setLastFetchedAt(data.timestamps);
      setAllGroups(data.groups);
    } catch (error) {
      console.error("Failed to load GitLab group analytics:", error);
      setDataError(
        error instanceof Error
          ? error.message
          : "Failed to load GitLab group analytics",
      );
    } finally {
      setIsLoading(false);
    }
  }, [groupIdStr, token, authLoading]);

  const refreshData = React.useCallback(() => {
    clearGitLabClientCache();
    fetchAllData();
  }, [fetchAllData]);

  React.useEffect(() => {
    if (!authLoading) {
      fetchAllData();
    }
  }, [fetchAllData, authLoading]);

  // Group-level XP: aggregate verified human members' gamification
  // Computed off the main thread after render to avoid blocking the UI
  const [groupLevelInfo, setGroupLevelInfo] = React.useState<{
    totalXp: number;
    avgXp: number;
    memberCount: number;
  } & ReturnType<typeof computeLevelInfo> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const humanMembers = members.filter((m) => !m.bot && m.verified);
      if (humanMembers.length === 0) return;
      const humanMemberIds = humanMembers.map((m) => m.id.toLowerCase());
      let totalXp = 0;
      let activeCount = 0;
      for (const member of humanMembers) {
        const validatedTeammates = humanMemberIds.filter((id) => id !== member.id.toLowerCase());
        const stats = computeGamification(member.id, timelogs, mergeRequests, false, validatedTeammates);
        if (stats.xp > 0) {
          totalXp += stats.xp;
          activeCount++;
        }
      }
      if (cancelled) return;
      if (activeCount === 0) return;
      const avgXp = Math.floor(totalXp / activeCount);
      const info = computeLevelInfo(avgXp);
      setGroupLevelInfo({ totalXp, avgXp, memberCount: activeCount, ...info });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [members, timelogs, mergeRequests]);

  // Group XP history per sprint
  const [groupXpHistory, setGroupXpHistory] = React.useState<{ sprint: string; xp: number; totalXp: number; memberCount: number }[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !sprints.length || !timelogs.length) return;
      const humanMembers = members.filter((m) => !m.bot && m.verified);
      if (humanMembers.length === 0) return;
      const humanMemberIds = humanMembers.map((m) => m.id.toLowerCase());

      const history = sprints.map((sp) => {
        const sprintEndDate = new Date(new Date(sp.endDate).setHours(23, 59, 59, 999));

        const timelogsUpToSprint = timelogs
          .filter((log) => new Date(log.spentAt) <= sprintEndDate)
          .map((log) => {
            const wasClosedBeforeSprint = log.issueClosedAt && new Date(log.issueClosedAt) <= sprintEndDate;
            return { ...log, issueState: wasClosedBeforeSprint ? "closed" : "opened" };
          });

        const mergeRequestsUpToSprint = mergeRequests
          .filter((mr) => new Date(mr.createdAt) <= sprintEndDate)
          .map((mr) => {
            const isMergedBeforeSprint = mr.mergedAt && new Date(mr.mergedAt) <= sprintEndDate;
            return { ...mr, state: isMergedBeforeSprint ? "merged" : "opened", mergedAt: isMergedBeforeSprint ? mr.mergedAt : null };
          });

        let totalXp = 0;
        let activeCount = 0;
        for (const member of humanMembers) {
          const validatedTeammates = humanMemberIds.filter((id) => id !== member.id.toLowerCase());
          const stats = computeGamification(member.id, timelogsUpToSprint, mergeRequestsUpToSprint, false, validatedTeammates);
          if (stats.xp > 0) {
            totalXp += stats.xp;
            activeCount++;
          }
        }
        return {
          sprint: `Sprint ${sp.sprintNumber}`,
          xp: activeCount > 0 ? Math.floor(totalXp / activeCount) : 0,
          totalXp,
          memberCount: activeCount,
        };
      }).filter((entry) => entry.xp > 0);

      if (cancelled) return;
      setGroupXpHistory(history);
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sprints, timelogs, mergeRequests, members]);

  const hasParsedQuery = React.useRef(false);

  const isDark = theme.palette.mode === "dark";
  const groupTierColor = groupLevelInfo?.tierColor ?? "#cd7f32";

  const visibleThresholds = React.useMemo(() => {
    if (!groupXpHistory.length) return [];
    const maxHistoryXp = groupXpHistory.reduce((max, h) => Math.max(max, h.xp), 0);
    const silverThreshold = xpNeededForLevel(10);
    const goldThreshold = xpNeededForLevel(20);
    const legendThreshold = xpNeededForLevel(30);
    const list = [
      { value: silverThreshold, label: "Silver", color: "#c0c0c0" },
      { value: goldThreshold, label: "Gold", color: "#ffd700" },
      { value: legendThreshold, label: "Legend", color: "#a855f7" },
    ];
    return list.filter((t, i) => {
      if (maxHistoryXp >= t.value) return true;
      const prev = list[i - 1];
      if (!prev || maxHistoryXp >= prev.value) return true;
      return false;
    });
  }, [groupXpHistory]);

  // Sync state with URL search params
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (!hasParsedQuery.current) {
      // 1. Initial load: parse from URL
      const params = new URLSearchParams(window.location.search);
      const sprintStr = params.get("sprintNumber");
      const presentationStr = params.get("presentation");

      if (sprintStr) {
        const sprintNum = parseInt(sprintStr, 10);
        if (!isNaN(sprintNum)) {
          setSelectedSprint(sprintNum);
        }
      }

      if (presentationStr === "true") {
        setPresentationMode(true);
      }

      hasParsedQuery.current = true;
    } else {
      // 2. Subsequent updates: sync back to URL
      const params = new URLSearchParams(window.location.search);
      let changed = false;

      if (selectedSprint !== null) {
        if (params.get("sprintNumber") !== selectedSprint.toString()) {
          params.set("sprintNumber", selectedSprint.toString());
          changed = true;
        }
      } else if (params.has("sprintNumber")) {
        params.delete("sprintNumber");
        changed = true;
      }

      if (presentationMode) {
        if (params.get("presentation") !== "true") {
          params.set("presentation", "true");
          changed = true;
        }
      } else if (params.has("presentation")) {
        params.delete("presentation");
        changed = true;
      }

      if (changed) {
        const newSearch = params.toString();
        const newUrl = `${window.location.pathname}${newSearch ? "?" + newSearch : ""}`;
        window.history.replaceState(null, "", newUrl);
      }
    }
  }, [selectedSprint, presentationMode, setPresentationMode]);

  // Set default active sprint based on current date
  React.useEffect(() => {
    if (sprints.length && selectedSprint === null) {
      const today = new Date().toISOString().slice(0, 10);
      const current = sprints.find(
        (sp) => sp.startDate <= today && today <= sp.endDate
      );
      setSelectedSprint(
        current?.sprintNumber ?? sprints[sprints.length - 1]?.sprintNumber ?? null
      );
    }
  }, [sprints, selectedSprint]);

  return (
    <GroupContext.Provider
      value={{
        members,
        labels,
        timelogs,
        sprints,
        mergeRequests,
        loaded: Object.keys(lastFetchedAt).length > 0,
        groupId: groupIdStr,
        lastFetchedAt,
        refreshData,
        selectedSprint,
        setSelectedSprint,
      }}
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {isLoading && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              alignItems: "center",
              py: 8,
            }}
          >
            <Box sx={{ width: "60%", maxWidth: 400 }}>
              <LinearProgress />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Loading group dashboard…
            </Typography>
          </Box>
        )}
        {dataError && <Alert severity="error">{dataError}</Alert>}
        {!isLoading && !dataError && (
          <>
        {/* Sticky Global Cycle Selector Bar */}
        {!presentationMode && (
          <Box
            sx={{
              position: "sticky",
              top: 64, // below the AppShell AppBar header
              zIndex: 10,
              bgcolor: theme.palette.mode === "dark" ? "rgba(9, 13, 22, 0.8)" : "rgba(248, 250, 252, 0.8)",
              backdropFilter: "blur(12px)",
              py: 2,
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Breadcrumbs
                separator={<NavigateNextIcon fontSize="small" sx={{ color: "text.secondary" }} />}
                aria-label="breadcrumb"
                sx={{ mb: 0.5 }}
              >
                <Typography
                  component="a"
                  href="/"
                  variant="caption"
                  color="text.secondary"
                  sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                >
                  All Groups
                </Typography>
                {breadcrumbAncestors.map((ancestor) => (
                  <Typography
                    key={ancestor.id}
                    component="a"
                    href={groupRouteHref(ancestor.id)}
                    onClick={(event) =>
                      handleGroupRouteClick(event, ancestor.id)
                    }
                    variant="caption"
                    color="text.secondary"
                    sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                  >
                    {ancestor.name}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>
                  {currentGroupInfo?.name || groupIdStr}
                </Typography>
              </Breadcrumbs>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {currentGroupInfo?.name || "Group Dashboard"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {parentGroup
                  ? `Exercise / Subgroup under ${parentGroup.name}`
                  : childSubgroups.length > 0
                    ? `Team Dashboard (${childSubgroups.length} exercises/subgroups)`
                    : "Review timesheets and category distributions across weekly cycles"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormControl sx={{ minWidth: 240 }} size="small">
                <InputLabel id="global-cycle-select-label">Weekly Cycle</InputLabel>
                <Select
                  labelId="global-cycle-select-label"
                  value={selectedSprint ?? ""}
                  label="Weekly Cycle"
                  onChange={(e) => setSelectedSprint(Number(e.target.value))}
                  sx={{
                    bgcolor: "background.paper",
                    border: "1px solid var(--border-color)",
                    borderRadius: 2,
                  }}
                >
                  {sprints.map((sp) => (
                    <MenuItem key={sp.sprintNumber} value={sp.sprintNumber}>
                      {`Cycle ${sp.sprintNumber} (${new Date(
                        sp.startDate,
                      ).toLocaleDateString()} - ${new Date(
                        sp.endDate,
                      ).toLocaleDateString()})`}
                    </MenuItem>
                  ))}
                  {timelogs
                    .reduce((years, log) => {
                      const year = new Date(log.spentAt).getFullYear();
                      if (!years.includes(year)) years.push(year);
                      return years;
                    }, [] as number[])
                    .sort((a, b) => b - a)
                    .map((year) => (
                      <MenuItem
                        key={10000 + year}
                        value={10000 + year}
                      >{`Year ${year}`}</MenuItem>
                    ))}
                  <MenuItem key={1000} value={1000}>
                    All time
                  </MenuItem>
                </Select>
              </FormControl>
              <Tooltip title="Problems Board" placement="bottom">
                <IconButton
                  id="problems-board-button"
                  aria-label="Open problems board"
                  onClick={() => setShowProblems(true)}
                  size="small"
                  sx={{
                    color: "warning.main",
                    border: "1px solid",
                    borderColor: "warning.main",
                    borderRadius: 1.5,
                    p: 0.75,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: "warning.main",
                      color: "#fff",
                      boxShadow: "0 0 8px rgba(255,152,0,0.4)",
                    },
                  }}
                >
                  <ReportProblemIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* Subgroups / Exercises Navigation Bar */}
        {!presentationMode && (childSubgroups.length > 0 || parentGroup) && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              px: 2.5,
              py: 1.5,
              borderRadius: 2,
              bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: "1px solid var(--border-color)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                mr: 1,
              }}
            >
              {parentGroup ? "Team Navigation:" : "Exercises / Subgroups:"}
            </Typography>

            {parentGroup ? (
              <Chip
                component="a"
                href={groupRouteHref(parentGroup.id)}
                onClick={(event) =>
                  handleGroupRouteClick(event, parentGroup.id)
                }
                label={`← ${parentGroup.name} (Overview)`}
                size="small"
                variant="outlined"
                clickable
                sx={{ fontWeight: 600 }}
              />
            ) : (
              <Chip
                label="Team Overview (All)"
                size="small"
                color="primary"
                variant="filled"
                sx={{ fontWeight: 700 }}
              />
            )}

            {(parentGroup ? siblingSubgroups : childSubgroups).map((sub) => {
              const isCurrent = sub.id === groupIdStr;
              return (
                <Chip
                  key={sub.id}
                  component="a"
                  href={groupRouteHref(sub.id)}
                  onClick={(event) => handleGroupRouteClick(event, sub.id)}
                  label={sub.name}
                  size="small"
                  color={isCurrent ? "primary" : "default"}
                  variant={isCurrent ? "filled" : "outlined"}
                  clickable
                  sx={{
                    fontWeight: isCurrent ? 700 : 500,
                  }}
                />
              );
            })}
          </Box>
        )}

        {presentationMode ? (
          /* Presentation Mode Layout - Optimized for readability, forced light mode, scroll-free fit */
          (() => {
            const currentSprintLogs = timelogs.filter((log) => {
              return (
                log.sprintNumber === selectedSprint ||
                selectedSprint === 1000 ||
                (selectedSprint &&
                  selectedSprint >= 10000 &&
                  log.spentAt.startsWith((selectedSprint - 10000).toString()))
              );
            });

            const totalCycleSeconds = currentSprintLogs.reduce((sum, log) => sum + log.timeSpent, 0);
            const totalCycleHours = (totalCycleSeconds / 3600).toFixed(1);

            // Group category data for Pie Chart
            const categoryTotals: Record<string, number> = {};
            currentSprintLogs.forEach((log) => {
              let category = "Other";
              for (const label of log.issueLabels) {
                const catDef = matchLabelToCategory(label);
                if (catDef) {
                  category = catDef.label;
                  break;
                }
              }
              categoryTotals[category] = (categoryTotals[category] || 0) + log.timeSpent;
            });

            const pieData = Object.entries(categoryTotals)
              .map(([name, value]) => ({
                name,
                value: +(value / 3600).toFixed(2),
              }))
              .filter((d) => d.value > 0);

            const PIE_COLORS = ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#6B7280"];

            // Group issues by total time spent with detailed metrics
            const issuesMap: Record<
              string,
              {
                title: string;
                url: string;
                timeSpent: number;
                totalTimeSpent: number;
                users: string[];
                estimate: number;
                labels: string[];
              }
            > = {};
            currentSprintLogs.forEach((log) => {
              if (!issuesMap[log.issueUrl]) {
                const totalSec = timelogs
                  .filter((t) => t.issueUrl === log.issueUrl)
                  .reduce((sum, t) => sum + t.timeSpent, 0);

                issuesMap[log.issueUrl] = {
                  title: log.issueTitle,
                  url: log.issueUrl,
                  timeSpent: 0,
                  totalTimeSpent: totalSec,
                  users: [],
                  estimate: log.issueTimeEstimate || 0,
                  labels: log.issueLabels || [],
                };
              }
              issuesMap[log.issueUrl].timeSpent += log.timeSpent;
              if (log.username && !issuesMap[log.issueUrl].users.includes(log.username.toString())) {
                issuesMap[log.issueUrl].users.push(log.username.toString());
              }
            });
            const topIssues = Object.values(issuesMap)
              .sort((a, b) => b.timeSpent - a.timeSpent);

            // Filter MRs to the current sprint by date range
            const sprintMRs = mergeRequests.filter((mr) => {
              if (selectedSprint === 1000) return true;
              const created = mr.createdAt.slice(0, 10);
              const merged = mr.mergedAt ? mr.mergedAt.slice(0, 10) : null;
              const closed = mr.closedAt ? mr.closedAt.slice(0, 10) : null;
              if (selectedSprint && selectedSprint >= 10000) {
                const yearStr = (selectedSprint - 10000).toString();
                return mr.createdAt.startsWith(yearStr) ||
                  (mr.mergedAt && mr.mergedAt.startsWith(yearStr)) ||
                  (mr.closedAt && mr.closedAt.startsWith(yearStr));
              }
              const sprint = sprints.find((sp) => sp.sprintNumber === selectedSprint);
              if (!sprint) return true;
              return created <= sprint.endDate &&
                (merged === null || merged >= sprint.startDate) &&
                (closed === null || closed >= sprint.startDate);
            });

            // Build Cycle Table Data
            const columns = [
              ...CATEGORY_DEFINITIONS.map((d) => ({ id: d.id, title: d.shortLabel })),
              { id: "other", title: "Other" },
            ];

            const memberTableData: Record<string, Record<string, number>> = {};
            const activeMembers = members.filter((m) => !m.bot && m.verified);

            activeMembers.forEach((m) => {
              memberTableData[m.id] = {};
              columns.forEach((c) => {
                memberTableData[m.id][c.id] = 0;
              });
              memberTableData[m.id]["__sum"] = 0;
            });

            currentSprintLogs.forEach((log) => {
              const memberId = log.username || "unknown";
              if (!memberTableData[memberId]) return;

              let assignedCol = "other";
              for (const label of log.issueLabels || []) {
                const catDef = matchLabelToCategory(label);
                if (catDef) {
                  assignedCol = catDef.id;
                  break;
                }
              }
              memberTableData[memberId][assignedCol] += log.timeSpent;
              memberTableData[memberId]["__sum"] += log.timeSpent;
            });

            // Compute column sums and only remove 'other' if empty
            const columnSums: Record<string, number> = {};
            columns.forEach((col) => { columnSums[col.id] = 0; });
            Object.values(memberTableData).forEach((row) => {
              columns.forEach((col) => {
                columnSums[col.id] += row[col.id];
              });
            });

            if (columnSums["other"] === 0) {
              const otherIdx = columns.findIndex((c) => c.id === "other");
              if (otherIdx > -1) {
                columns.splice(otherIdx, 1);
                delete columnSums["other"];
              }
            }
            const visibleColumns = columns;

            return (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  p: 2.5,
                  height: "100vh",
                  maxHeight: "100vh",
                  overflow: "hidden",
                  bgcolor: "#ffffff",
                  color: "#0f172a",
                }}
              >
                {/* Header Row: Title & Total Hours Callout + Exit button */}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "2px solid #e2e8f0",
                    pb: 1.5,
                    flexShrink: 0,
                  }}
                >
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "#1e293b" }}>
                      Cycle {selectedSprint === 1000 ? "All Time" : selectedSprint} Overview
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, mt: 0.25 }}>
                      Active group performance and work breakdowns
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.5,
                        px: 3,
                        bgcolor: "rgba(124, 58, 237, 0.08)",
                        border: "1px solid rgba(124, 58, 237, 0.2)",
                        borderRadius: 2.5,
                        textAlign: "center",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main", textTransform: "uppercase", letterSpacing: "0.08em", display: "block" }}>
                        Total Logged Hours
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: "primary.dark", mt: 0.25, lineHeight: 1 }}>
                        {totalCycleHours}h
                      </Typography>
                    </Paper>

                    <IconButton
                      onClick={togglePresentationMode}
                      sx={{
                        bgcolor: "error.main",
                        color: "#ffffff",
                        boxShadow: 2,
                        p: 1.5,
                        borderRadius: 2.5,
                        transition: "transform 0.2s ease, background-color 0.2s ease",
                        "&:hover": {
                          bgcolor: "error.dark",
                          transform: "scale(1.08)",
                        },
                      }}
                      title="Exit Presentation Mode"
                    >
                      <FullscreenExitIcon sx={{ fontSize: 24 }} />
                    </IconButton>
                  </Box>
                </Box>

                {/* Main Content Layout (Split Vertically: Table/Pie on Top, Issues on Bottom) */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minHeight: 0 }}>

                  {/* Top Block: Table (span 8) & Category Pie Chart (span 4) */}
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, flex: "0 0 250px" }}>
                    {/* Cycle Table */}
                    <Box sx={{ gridColumn: "span 8", display: "flex", flexDirection: "column", minHeight: 0 }}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          border: "1px solid #e2e8f0",
                          borderRadius: 2.5,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: 0,
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: "#334155" }}>
                          Team Timesheet Breakdown
                        </Typography>
                        <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 800, color: "#475569" }}>Member</TableCell>
                                {visibleColumns.map((col) => (
                                  <TableCell key={col.id} align="right" sx={{ fontWeight: 800, color: "#475569" }}>
                                    {col.title}
                                  </TableCell>
                                ))}
                                <TableCell align="right" sx={{ fontWeight: 800, color: "#475569" }}>Total (hrs)</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {activeMembers.map((member) => {
                                const sum = (memberTableData[member.id]?.["__sum"] || 0) / 3600;
                                return (
                                  <TableRow key={member.id} hover>
                                    <TableCell>
                                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                        <UserAvatar member={member} size="small" showTooltip={false} />
                                        <Typography sx={{ fontWeight: 600, color: "#1e293b", fontSize: "0.95rem" }}>
                                          {member.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    {visibleColumns.map((col) => (
                                      <TableCell key={col.id} align="right" sx={{ fontWeight: 600, color: "#334155" }}>
                                        {((memberTableData[member.id]?.[col.id] || 0) / 3600).toFixed(1)}
                                      </TableCell>
                                    ))}
                                    <TableCell align="right" sx={{ fontWeight: 700, color: "primary.main" }}>
                                      {sum.toFixed(1)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}

                              {/* Totals row */}
                              <TableRow sx={{ "& td": { fontWeight: "bold", bgcolor: "#f8fafc", borderTop: "2px solid #e2e8f0" } }}>
                                <TableCell>Total</TableCell>
                                {visibleColumns.map((col) => (
                                  <TableCell key={col.id} align="right">
                                    {((columnSums[col.id] || 0) / 3600).toFixed(1)}
                                  </TableCell>
                                ))}
                                <TableCell align="right" sx={{ color: "primary.dark" }}>
                                  {(totalCycleSeconds / 3600).toFixed(1)}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </Box>
                      </Paper>
                    </Box>

                    {/* Category Pie Chart */}
                    <Box sx={{ gridColumn: "span 4", display: "flex", flexDirection: "column", minHeight: 0 }}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          border: "1px solid #e2e8f0",
                          borderRadius: 2.5,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: 0,
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5, color: "#334155" }}>
                          Category Distribution
                        </Typography>
                        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius="45%"
                                outerRadius="75%"
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <RechartsTooltip formatter={(value) => `${value}h`} />
                              <RechartsLegend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                          </ResponsiveContainer>
                        </Box>
                      </Paper>
                    </Box>
                  </Box>

                  {/* Bottom Block: Issues (left) + Merge Requests (right) */}
                  <Box sx={{ flex: "1 1 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, minHeight: 0 }}>

                    {/* LEFT: Top Issues Scrollable List */}
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        border: "1px solid #e2e8f0",
                        borderRadius: 2.5,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        overflow: "hidden",
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: "#334155", flexShrink: 0 }}>
                        Top Issues Worked On
                        <Typography component="span" variant="body2" sx={{ ml: 1, color: "#94a3b8", fontWeight: 500 }}>
                          ({topIssues.length})
                        </Typography>
                      </Typography>
                      <Box sx={{ overflowY: "auto", flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        {topIssues.map((issue, idx) => {
                          const loggedHours = (issue.timeSpent / 3600).toFixed(1);
                          const totalHours = (issue.totalTimeSpent / 3600).toFixed(1);
                          const estimateHours = (issue.estimate / 3600).toFixed(1);
                          const deviation = issue.estimate > 0
                            ? (((issue.totalTimeSpent - issue.estimate) / issue.estimate) * 100).toFixed(0)
                            : "N/A";

                          return (
                            <Box
                              key={issue.url}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                p: 1.25,
                                pr: 1.5,
                                borderRadius: 2,
                                bgcolor: "#f8fafc",
                                border: "1px solid #f1f5f9",
                                minWidth: 0,
                                flexShrink: 0,
                              }}
                            >
                              {/* Rank badge */}
                              <Typography
                                sx={{
                                  fontWeight: 900,
                                  color: "primary.main",
                                  fontSize: "0.85rem",
                                  minWidth: 28,
                                  textAlign: "center",
                                  flexShrink: 0,
                                }}
                              >
                                #{idx + 1}
                              </Typography>

                              {/* Title + meta */}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                  noWrap
                                  title={issue.title}
                                  sx={{
                                    fontWeight: 700,
                                    color: "#1e293b",
                                    fontSize: "0.9rem",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {issue.title}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 0.25 }}>
                                  <Typography component="span" sx={{ fontSize: "0.7rem", color: "#64748b" }}>
                                    Cycle: <b>{loggedHours}h</b>
                                  </Typography>
                                  <Typography component="span" sx={{ fontSize: "0.7rem", color: "#64748b" }}>
                                    Total: <b>{totalHours}h</b>
                                  </Typography>
                                  {issue.estimate > 0 && (
                                    <>
                                      <Typography component="span" sx={{ fontSize: "0.7rem", color: "#64748b" }}>
                                        Est: <b>{estimateHours}h</b>
                                      </Typography>
                                      <Typography
                                        component="span"
                                        sx={{
                                          fontSize: "0.7rem",
                                          fontWeight: 700,
                                          color: Math.abs(Number(deviation)) > 20 ? "#ef4444" : "#10b981",
                                        }}
                                      >
                                        Dev: {deviation}%
                                      </Typography>
                                    </>
                                  )}
                                </Box>
                              </Box>

                              {/* Contributor avatars */}
                              <Box sx={{ display: "flex", gap: 0.4, flexShrink: 0 }}>
                                {issue.users.slice(0, 3).map((username) => {
                                  const member = members.find((m) => m.id === username);
                                  return member ? (
                                    <UserAvatar
                                      key={username}
                                      member={member}
                                      size="medium"
                                      showTooltip={true}
                                      sx={{ width: 26, height: 26 }}
                                    />
                                  ) : null;
                                })}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Paper>

                    {/* RIGHT: Merge Requests Scrollable List */}
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        border: "1px solid #e2e8f0",
                        borderRadius: 2.5,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        overflow: "hidden",
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: "#334155", flexShrink: 0 }}>
                        Merge Requests
                        <Typography component="span" variant="body2" sx={{ ml: 1, color: "#94a3b8", fontWeight: 500 }}>
                          ({sprintMRs.length})
                        </Typography>
                      </Typography>
                      <Box sx={{ overflowY: "auto", flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        {sprintMRs.length === 0 ? (
                          <Typography sx={{ color: "#94a3b8", fontSize: "0.85rem", textAlign: "center", mt: 4 }}>
                            No merge requests for this period
                          </Typography>
                        ) : (
                          sprintMRs.map((mr) => {
                            const stateColor =
                              mr.state === "merged" ? "#7C3AED"
                                : mr.state === "opened" ? "#10B981"
                                  : "#94a3b8";
                            const stateLabel =
                              mr.state === "merged" ? "Merged"
                                : mr.state === "opened" ? "Open"
                                  : "Closed";
                            const author = members.find((m) => m.id === mr.username);

                            return (
                              <Box
                                key={mr.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                  p: 1.25,
                                  pr: 1.5,
                                  borderRadius: 2,
                                  bgcolor: "#f8fafc",
                                  border: "1px solid #f1f5f9",
                                  borderLeft: `3px solid ${stateColor}`,
                                  minWidth: 0,
                                  flexShrink: 0,
                                }}
                              >
                                {/* Author avatar */}
                                {author && (
                                  <UserAvatar
                                    member={author}
                                    size="medium"
                                    showTooltip={true}
                                    sx={{ width: 26, height: 26, flexShrink: 0 }}
                                  />
                                )}

                                {/* Title + meta */}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography
                                    noWrap
                                    title={mr.title}
                                    sx={{
                                      fontWeight: 700,
                                      color: "#1e293b",
                                      fontSize: "0.9rem",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {mr.title}
                                  </Typography>
                                  <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mt: 0.25 }}>
                                    <Typography
                                      component="span"
                                      sx={{
                                        fontSize: "0.68rem",
                                        fontWeight: 700,
                                        color: stateColor,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                      }}
                                    >
                                      {stateLabel}
                                    </Typography>
                                    <Typography
                                      component="span"
                                      noWrap
                                      sx={{
                                        fontSize: "0.68rem",
                                        color: "#64748b",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        maxWidth: 140,
                                      }}
                                      title={`${mr.sourceBranch} → ${mr.targetBranch}`}
                                    >
                                      {mr.sourceBranch} → {mr.targetBranch}
                                    </Typography>
                                    {(mr.additions != null || mr.deletions != null) && (
                                      <Typography component="span" sx={{ fontSize: "0.68rem", color: "#64748b" }}>
                                        {mr.additions != null && (
                                          <span style={{ color: "#10b981", fontWeight: 700 }}>+{mr.additions}</span>
                                        )}
                                        {mr.additions != null && mr.deletions != null && " "}
                                        {mr.deletions != null && (
                                          <span style={{ color: "#ef4444", fontWeight: 700 }}>-{mr.deletions}</span>
                                        )}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>

                                {/* Approval count badge */}
                                {mr.approvedBy.length > 0 && (
                                  <Box
                                    sx={{
                                      flexShrink: 0,
                                      px: 1,
                                      py: 0.25,
                                      borderRadius: 1,
                                      bgcolor: "rgba(124, 58, 237, 0.08)",
                                      border: "1px solid rgba(124, 58, 237, 0.2)",
                                    }}
                                  >
                                    <Typography sx={{ fontSize: "0.68rem", fontWeight: 700, color: "#7C3AED" }}>
                                      ✓ {mr.approvedBy.length}
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            );
                          })
                        )}
                      </Box>
                    </Paper>

                  </Box>

                </Box>
              </Box>
            );
          })()
        ) : (
          /* Standard Responsive Dashboard Grid */
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(12, 1fr)" },
              gap: 3,
            }}
          >
            {/* Row 1: Summary Cards (Full Width) */}
            <Box sx={{ gridColumn: { xs: "span 12" } }}>
              <HeaderCards />
            </Box>

            {/* Row 1.5: Group Level Card (Full Width) */}
            {groupLevelInfo && (
              <Box sx={{ gridColumn: { xs: "span 12" } }}>
                <Card
                  sx={{
                    background: `linear-gradient(135deg, ${groupLevelInfo.tierColor}15, rgba(255,255,255,0.01))`,
                    border: `1px solid ${groupLevelInfo.tierColor}30`,
                  }}
                >
                  <CardContent
                    sx={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", py: 2.5, "&:last-child": { pb: 2.5 } }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Box
                        sx={{
                          width: 52,
                          height: 52,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: `${groupLevelInfo.tierColor}20`,
                          border: `2px solid ${groupLevelInfo.tierColor}`,
                        }}
                      >
                        <Typography sx={{ fontWeight: 900, fontSize: "1.25rem", color: groupLevelInfo.tierColor, lineHeight: 1 }}>
                          {groupLevelInfo.level}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "text.secondary", lineHeight: 1.2 }}>
                          Group Level
                        </Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.1rem", color: groupLevelInfo.tierColor, lineHeight: 1.3 }}>
                          {groupLevelInfo.tierLabel}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1, minWidth: 200, maxWidth: 500 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {groupLevelInfo.totalXp.toLocaleString()} Total XP
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {Math.max(0, (groupLevelInfo.xpForNextLevel * groupLevelInfo.memberCount) - groupLevelInfo.totalXp).toLocaleString()} XP to Level {groupLevelInfo.level + 1}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={groupLevelInfo.xpPercent}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "rgba(255,255,255,0.08)",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 4,
                            backgroundColor: groupLevelInfo.tierColor,
                          },
                        }}
                      />
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Group sx={{ color: "text.secondary", fontSize: 20 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {groupLevelInfo.memberCount} members
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Row 2: Heatmap (Full Width on desktop) */}
            <Box sx={{ gridColumn: { xs: "span 12" }, height: { xs: 360, md: 480 } }}>
              <Heatmap />
            </Box>

            {/* Row 3: Cycle Overview Workspace (Full Width) */}
            <Box sx={{ gridColumn: { xs: "span 12" } }}>
              <SprintOverview />
            </Box>

            {/* Row 4: Sprint Radar + Member Performance (4 + 4 + 4 columns) */}
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 4" }, height: { xs: "auto", md: 480 } }}>
              <SprintRadar />
            </Box>
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 4" }, height: { xs: "auto", md: 480 } }}>
              <TimePerMember />
            </Box>
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 4" }, height: { xs: "auto", md: 480 } }}>
              <EstimateAccuracy />
            </Box>

            {/* Row 5: Categories & Sprint Members (6 columns + 6 columns) */}
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 6" }, height: { xs: "auto", md: 420 } }}>
              <TimePerCategory />
            </Box>
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 6" }, height: { xs: "auto", md: 420 } }}>
              <TimePerSprintMember />
            </Box>

            {/* Row 6: Temporal Trends (6 columns + 6 columns) */}
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 6" }, height: { xs: "auto", md: 420 } }}>
              <TimePerWeek />
            </Box>
            <Box sx={{ gridColumn: { xs: "span 12", md: "span 6" }, height: { xs: "auto", md: 420 } }}>
              <TimePerWeekday />
            </Box>

            {/* Row 7: Group XP History */}
            {groupXpHistory.length > 0 && (
              <Box sx={{ gridColumn: { xs: "span 12" }, height: { xs: "auto", md: 400 } }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                      Group Average XP Over Sprints
                    </Typography>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={groupXpHistory} margin={{ top: 10, right: 40, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="sprint" tick={{ fill: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.75)", fontSize: 10 }} />
                          <YAxis tick={{ fill: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.75)", fontSize: 10 }} />
                          <ChartTooltip
                            contentStyle={{
                              backgroundColor: isDark ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.95)",
                              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                              borderRadius: 8,
                              color: isDark ? "#f3f4f6" : "#0f172a",
                              fontSize: 12,
                            }}
                            formatter={(value) => `${Number(value).toLocaleString()} XP`}
                          />
                          {visibleThresholds.map((t) => (
                            <ReferenceLine key={t.label} y={t.value} stroke={t.color} strokeDasharray="4 4" label={{ value: t.label, fill: t.color, position: "right", fontSize: 9, fontWeight: "bold" }} />
                          ))}
                          <Line type="monotone" dataKey="xp" stroke={groupTierColor} strokeWidth={3} activeDot={{ r: 6 }} name="Avg XP" />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}
          </Box>
        )}
          </>
        )}
      </Box>
      <StaleIndicator />
      <ProblemsModal
        open={showProblems}
        onClose={() => setShowProblems(false)}
        groupId={groupIdStr}
      />
    </GroupContext.Provider>
  );
}
