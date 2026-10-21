"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  Typography,
  Box,
  Divider,
  Avatar,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Tabs,
  Tab,
  LinearProgress,
  IconButton,
  CircularProgress,
  useMediaQuery,
} from "@mui/material";
import { Close, OpenInNew, AccessTime, Assignment, LocalFireDepartment, CallMerge, RateReview, Group } from "@mui/icons-material";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ReferenceLine } from "recharts";
import { CATEGORY_DEFINITIONS } from "../config/categories";
import { matchLabelToCategory } from "../utils/categoryUtils";
import { useTheme } from "@mui/material";
import { useThemeMode } from "../ThemeContext";
import { computeGamification, xpNeededForLevel } from "../utils/gamification";
import { useUserAuth } from "../UserAuthContext";
import { loadUserProfile } from "../gitlab/client";

const PALETTE = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#ff4d4f",
  "#13c2c2",
  "#722ed1",
  "#eb2f96",
  "#faad14",
  "#52c41a",
  "#2f54eb",
  "#fa541c",
  "#a0d911",
  "#1890ff",
  "#f5222d",
];

type UserDetailModalProps = {
  open: boolean;
  onClose: () => void;
  username: string;
};

export default function UserDetailModal({
  open,
  onClose,
  username,
}: UserDetailModalProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { colorTheme } = useThemeMode();
  const { token } = useUserAuth();
  const isDark = theme.palette.mode === "dark";

  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<
    Awaited<ReturnType<typeof loadUserProfile>> | null
  >(null);

  // Fetch independent profile data when username changes
  useEffect(() => {
    if (!open || !username) return;

    setLoading(true);
    setError(null);
    setProfileData(null);
    setActiveTab(0);
    let active = true;

    const fetchUserProfile = async () => {
      if (!token) {
        setError("Sign in with GitLab to load user profiles.");
        setLoading(false);
        return;
      }
      try {
        const data = await loadUserProfile(token, username);
        if (active) setProfileData(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchUserProfile();
    return () => {
      active = false;
    };
  }, [username, open, token]);

  // Find user details from fetched profile data
  const member = profileData?.member;
  const userLogs = profileData?.timelogs || [];
  const allLogsForGamification = profileData?.allTimelogsForGamification || [];
  const allMergeRequestsForGamification = profileData?.allMergeRequestsForGamification || [];
  const sprints = profileData?.sprints || [];
  const validatedTeammates = profileData?.validatedTeammates || [];

  // Total hours logged (seconds to hours)
  const totalHours = React.useMemo(() => {
    return userLogs.reduce((sum, log) => sum + log.timeSpent, 0) / 3600;
  }, [userLogs]);

  const mergedMrsCount = React.useMemo(() => {
    return allMergeRequestsForGamification.filter(
      (mr) => mr.username.toLowerCase() === username.toLowerCase() && mr.state === "merged"
    ).length;
  }, [allMergeRequestsForGamification, username]);

  const reviewedMrsCount = React.useMemo(() => {
    return allMergeRequestsForGamification.filter(
      (mr) => mr.username.toLowerCase() !== username.toLowerCase() &&
        (mr.approvedBy.some((u: string) => u.toLowerCase() === username.toLowerCase()) ||
         mr.discussionAuthors.some((u: string) => u.toLowerCase() === username.toLowerCase()))
    ).length;
  }, [allMergeRequestsForGamification, username]);

  const isBot = member?.bot ?? false;

  // Gamification stats
  const stats = React.useMemo(() => {
    return computeGamification(
      username,
      allLogsForGamification.length > 0 ? allLogsForGamification : userLogs,
      allMergeRequestsForGamification,
      isBot,
      validatedTeammates
    );
  }, [username, allLogsForGamification, userLogs, allMergeRequestsForGamification, isBot, validatedTeammates]);

  // XP progress history per sprint
  const xpHistory = React.useMemo(() => {
    if (!sprints.length || (!allLogsForGamification.length && !userLogs.length)) return [];
    
    const logs = allLogsForGamification.length > 0 ? allLogsForGamification : userLogs;
    
    return sprints.map((sp) => {
      const sprintEndDate = new Date(new Date(sp.endDate).setHours(23, 59, 59, 999));
      
      // Filter & adjust timelogs up to this sprint's end date
      const timelogsUpToSprint = logs
        .filter((log) => new Date(log.spentAt) <= sprintEndDate)
        .map((log) => {
          const wasClosedBeforeSprint = log.issueClosedAt && new Date(log.issueClosedAt) <= sprintEndDate;
          return {
            ...log,
            issueState: wasClosedBeforeSprint ? "closed" : "opened",
          };
        });
      
      // Filter & adjust merge requests up to this sprint's end date
      const mergeRequestsUpToSprint = allMergeRequestsForGamification
        .filter((mr) => new Date(mr.createdAt) <= sprintEndDate)
        .map((mr) => {
          const isMergedBeforeSprint = mr.mergedAt && new Date(mr.mergedAt) <= sprintEndDate;
          return {
            ...mr,
            state: isMergedBeforeSprint ? "merged" : "opened",
            mergedAt: isMergedBeforeSprint ? mr.mergedAt : null,
          };
        });
        
      const statsAtSprint = computeGamification(
        username,
        timelogsUpToSprint,
        mergeRequestsUpToSprint,
        isBot,
        validatedTeammates
      );
      
      return {
        sprint: `Sprint ${sp.sprintNumber}`,
        xp: statsAtSprint.xp,
        level: statsAtSprint.level,
      };
    });
  }, [sprints, allLogsForGamification, userLogs, allMergeRequestsForGamification, username, isBot, validatedTeammates]);

  const getTierColor = (level: number) => {
    if (level < 10) return "#cd7f32"; // Bronze
    if (level < 20) return "#c0c0c0"; // Silver
    if (level < 30) return "#ffd700"; // Gold
    return "#a855f7"; // Legend
  };

  const getTierName = (level: number) => {
    if (level < 10) return "Bronze";
    if (level < 20) return "Silver";
    if (level < 30) return "Gold";
    return "Legend";
  };

  // Group by category
  const categorySummary = React.useMemo(() => {
    const breakdown: Record<string, number> = {};
    CATEGORY_DEFINITIONS.forEach((d) => {
      breakdown[d.id] = 0;
    });
    breakdown["other"] = 0;

    userLogs.forEach((log) => {
      let assigned = "other";
      for (const label of log.issueLabels || []) {
        const cat = matchLabelToCategory(label);
        if (cat) {
          assigned = cat.id;
          break;
        }
      }
      breakdown[assigned] += log.timeSpent;
    });

    return Object.entries(breakdown).map(([id, seconds]) => {
      const def = CATEGORY_DEFINITIONS.find((d) => d.id === id);
      return {
        id,
        label: def ? def.label : "Other",
        hours: seconds / 3600,
        color: PALETTE[CATEGORY_DEFINITIONS.findIndex(d => d.id === def?.id) % PALETTE.length] || "#94a3b8"
      };
    }).sort((a, b) => b.hours - a.hours);
  }, [userLogs, colorTheme, isDark]);

  // Group by issue
  const issueSummary = React.useMemo(() => {
    const issuesMap: Record<string, { title: string; url: string; hours: number }> = {};
    userLogs.forEach((log) => {
      if (!issuesMap[log.issueUrl]) {
        issuesMap[log.issueUrl] = {
          title: log.issueTitle,
          url: log.issueUrl,
          hours: 0,
        };
      }
      issuesMap[log.issueUrl].hours += log.timeSpent / 3600;
    });

    return Object.values(issuesMap).sort((a, b) => b.hours - a.hours);
  }, [userLogs]);

  const userMergeRequests = React.useMemo(() => {
    return allMergeRequestsForGamification.filter(
      (mr) => mr.username.toLowerCase() === username.toLowerCase()
    );
  }, [allMergeRequestsForGamification, username]);

  // Group by sprint
  const sprintSummary = React.useMemo(() => {
    const sprintsMap: Record<number, number> = {};
    sprints.forEach((sp) => {
      sprintsMap[sp.sprintNumber] = 0;
    });

    userLogs.forEach((log) => {
      if (log.sprintNumber !== undefined) {
        if (sprintsMap[log.sprintNumber] === undefined) {
          sprintsMap[log.sprintNumber] = 0;
        }
        sprintsMap[log.sprintNumber] += log.timeSpent / 3600;
      }
    });

    return Object.entries(sprintsMap)
      .map(([sprintNum, hours]) => ({
        sprintNumber: Number(sprintNum),
        hours,
      }))
      .sort((a, b) => a.sprintNumber - b.sprintNumber);
  }, [userLogs, sprints]);

  const maxSprintHours = React.useMemo(() => {
    if (sprintSummary.length === 0) return 0;
    return Math.max(...sprintSummary.map((s) => s.hours), 8);
  }, [sprintSummary]);

  const tierColor = stats ? getTierColor(stats.level) : "#cd7f32";
  const tickColor = isDark ? "rgba(255, 255, 255, 0.75)" : "rgba(15, 23, 42, 0.75)";
  const tooltipBg = isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";
  const tooltipTextColor = isDark ? "#f3f4f6" : "#0f172a";

  const visibleThresholds = React.useMemo(() => {
    if (!xpHistory.length) return [];
    const maxHistoryXp = xpHistory.reduce((max, h) => Math.max(max, h.xp), 0);
    const silverThreshold = xpNeededForLevel(10);
    const goldThreshold = xpNeededForLevel(20);
    const legendThreshold = xpNeededForLevel(30);

    const thresholdsList = [
      { value: silverThreshold, label: "Silver", color: "#c0c0c0" },
      { value: goldThreshold, label: "Gold", color: "#ffd700" },
      { value: legendThreshold, label: "Legend", color: "#a855f7" },
    ];

    return thresholdsList.filter((t, idx) => {
      if (maxHistoryXp >= t.value) return true;
      const prev = thresholdsList[idx - 1];
      if (!prev || maxHistoryXp >= prev.value) return true;
      return false;
    });
  }, [xpHistory]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth>
      <DialogTitle sx={{ m: 0, p: 2, pr: 6, fontWeight: 700 }}>
        User Profile & Achievements
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pb: 4, minHeight: 250 }}>
        {loading && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 8 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading user profile stats…
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="error" sx={{ mb: 1, fontWeight: 600 }}>
              Failed to load profile
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && member && (
          <>
            {/* User Card Header with level tier avatar ring and XP status */}
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3, mb: 4, mt: 1 }}>
              <Avatar
                alt={member.name}
                src={member.avatarUrl || undefined}
                sx={{
                  width: 72,
                  height: 72,
                  fontSize: "1.75rem",
                  border: `3px solid ${tierColor}`,
                  outline: "2px solid rgba(255,255,255,0.08)",
                  outlineOffset: "2px",
                  boxShadow: `0 0 12px ${tierColor}33`,
                }}
              >
                {member.name.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 0.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                    {member.name}
                  </Typography>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      px: 1.25,
                      py: 0.25,
                      borderRadius: "12px",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      backgroundColor: tierColor,
                      color: stats.level >= 10 && stats.level < 30 ? "#0f172a" : "#ffffff",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Lv. {stats.level} · {getTierName(stats.level)}
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  @{member.id} {member.bot && "(Bot)"}
                </Typography>

                {/* XP progress bar */}
                <Box sx={{ width: "100%", maxWidth: 420 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
                      {stats.xp.toLocaleString()} XP
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {stats.level >= 100 ? "Max Level Reached" : `${stats.xpToNextLevel.toLocaleString()} XP to Level ${stats.level + 1}`}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={stats.xpPercent}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 3,
                        backgroundColor: tierColor,
                      },
                    }}
                  />
                </Box>
              </Box>

              {member.url && (
                <Button
                  component="a"
                  href={member.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  variant="outlined"
                  color="inherit"
                  endIcon={<OpenInNew fontSize="inherit" />}
                  sx={{ py: 0.5, px: 1.5, fontSize: "0.75rem", borderColor: "rgba(255,255,255,0.12)", height: "fit-content" }}
                >
                  GitLab Profile
                </Button>
              )}
            </Box>

            {/* Tab Navigation */}
            <Tabs
              value={activeTab}
              onChange={(_, val) => setActiveTab(val)}
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                mb: 4,
                "& .MuiTab-root": {
                  fontWeight: 700,
                  textTransform: "none",
                  fontSize: "0.9rem",
                  minWidth: 120,
                },
              }}
            >
              <Tab label="Overview" />
              <Tab label="Achievements" />
            </Tabs>

            {activeTab === 0 ? (
              /* Tab 1: Overview */
              <Box>
                {/* Highlight Stats */}
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 4 }}>
                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "primary.light" }}>
                        <AccessTime fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Total Hours</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {totalHours.toFixed(1)}h
                      </Typography>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "secondary.light" }}>
                        <Assignment fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Issues Solved</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {issueSummary.length}
                      </Typography>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "error.light" }}>
                        <LocalFireDepartment fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Sprint Streak</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {stats.longestStreak}
                      </Typography>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "success.light" }}>
                        <CallMerge fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>MRs Merged</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {mergedMrsCount}
                      </Typography>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "info.light" }}>
                        <RateReview fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>MRs Reviewed</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {reviewedMrsCount}
                      </Typography>
                    </CardContent>
                  </Card>

                  {/* Individual Work Weeks */}
                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "text.secondary" }}>
                        <AccessTime fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Work Weeks</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {(totalHours / 40).toFixed(1)}
                      </Typography>
                    </CardContent>
                  </Card>

                  {/* Progression Efficiency / Pacing */}
                  {(() => {
                    const pacing = stats.level > 0 ? totalHours / stats.level : 0;
                    const pacingColor = pacing <= 3.5 ? "#22c55e" : pacing <= 5.0 ? "#f59e0b" : "#ef4444";
                    const pacingLabel = pacing <= 3.5 ? "Efficient" : pacing <= 5.0 ? "Average" : "Grinder";
                    return (
                      <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "text.secondary" }}>
                            <AccessTime fontSize="small" />
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Pacing</Typography>
                          </Box>
                          <Typography variant="h4" sx={{ fontWeight: 800, color: pacingColor }}>
                            {pacing.toFixed(1)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: pacingColor, fontWeight: 700, fontSize: "0.6rem", display: "block" }}>
                            {pacingLabel}
                          </Typography>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Group % Share */}
                  <Card variant="outlined" sx={{ p: 1, backgroundColor: "rgba(255,255,255,0.01)" }}>
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, color: "text.secondary" }}>
                        <Group fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Group Share</Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {profileData?.groupSharePercent != null ? `${profileData.groupSharePercent}%` : "—"}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>

                <Card variant="outlined" sx={{ mb: 4, p: 2.5, backgroundColor: "rgba(255,255,255,0.01)" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2.5, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                    XP Progress Over Sprints
                  </Typography>
                  <Box sx={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={xpHistory} margin={{ top: 10, right: 40, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="sprint" tick={{ fill: tickColor, fontSize: 10 }} />
                        <YAxis tick={{ fill: tickColor, fontSize: 10 }} />
                        <ChartTooltip
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            border: `1px solid ${tooltipBorder}`,
                            borderRadius: 8,
                            color: tooltipTextColor,
                            fontSize: 12,
                          }}
                        />
                        {visibleThresholds.map((t) => (
                          <ReferenceLine
                            key={t.label}
                            y={t.value}
                            stroke={t.color}
                            strokeDasharray="4 4"
                            label={{
                              value: t.label,
                              fill: t.color,
                              position: "right",
                              fontSize: 9,
                              fontWeight: "bold",
                            }}
                          />
                        ))}
                        <Line
                          type="monotone"
                          dataKey="xp"
                          stroke={tierColor}
                          strokeWidth={3}
                          activeDot={{ r: 6 }}
                          name="XP"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Card>

                <Divider sx={{ my: 3 }} />

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" }, gap: 4 }}>
                  {/* Left Column: Category & Sprint breakdown */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                      Time by Category
                    </Typography>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.25 }}>
                      {categorySummary.map((cat) => {
                        const pct = totalHours > 0 ? (cat.hours / totalHours) * 100 : 0;
                        return (
                          <Box key={cat.id}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: cat.color }} />
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {cat.label}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {cat.hours.toFixed(1)}h ({pct.toFixed(0)}%)
                              </Typography>
                            </Box>
                            <Box sx={{ width: "100%", height: 6, bgcolor: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                              <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: cat.color, borderRadius: 3 }} />
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>

                    <Divider sx={{ my: 4 }} />

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                      Time by Sprint
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {sprintSummary.map((sp) => (
                        <Box key={sp.sprintNumber} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            Sprint {sp.sprintNumber}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "70%" }}>
                            <Box sx={{ flexGrow: 1, height: 6, bgcolor: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                              <Box
                                sx={{
                                  width: `${maxSprintHours > 0 ? (sp.hours / maxSprintHours) * 100 : 0}%`,
                                  height: "100%",
                                  bgcolor: "primary.main",
                                  borderRadius: 3
                                }}
                              />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 45, textAlign: "right" }}>
                              {sp.hours.toFixed(1)}h
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                      {sprintSummary.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                          No sprint timelogs recorded
                        </Typography>
                      )}
                  </Box>
                  </Box>
                  {/* Right Column: Top Issues & Merge Requests */}
                  <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                        Issues Contributed To
                      </Typography>

                      <List disablePadding sx={{ pr: 1 }}>
                        {issueSummary.map((issue, idx) => (
                          <React.Fragment key={issue.url}>
                            <ListItem
                              sx={{
                                px: 0,
                                py: 1.5,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 600,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    display: "block",
                                    cursor: "pointer",
                                    "&:hover": { color: "primary.light" }
                                  }}
                                  component="a"
                                  href={issue.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={issue.title}
                                >
                                  {issue.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  Rank #{idx + 1}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.light", flexShrink: 0 }}>
                                {issue.hours.toFixed(1)}h
                              </Typography>
                            </ListItem>
                            {idx < issueSummary.length - 1 && <Divider component="li" sx={{ opacity: 0.5 }} />}
                          </React.Fragment>
                        ))}
                        {issueSummary.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", py: 4, textAlign: "center" }}>
                            No issues recorded
                          </Typography>
                        )}
                      </List>
                    </Box>

                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                        Merge Requests Authored
                      </Typography>

                      <List disablePadding sx={{ pr: 1 }}>
                        {userMergeRequests.map((mr, idx) => {
                          let stateColor = "text.secondary";
                          const stateLower = mr.state.toLowerCase();
                          if (stateLower === "opened") stateColor = "info.main";
                          else if (stateLower === "merged") stateColor = "success.main";
                          else if (stateLower === "closed") stateColor = "error.main";

                          return (
                            <React.Fragment key={mr.webUrl}>
                              <ListItem
                                sx={{
                                  px: 0,
                                  py: 1.5,
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 600,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      display: "block",
                                      cursor: "pointer",
                                      "&:hover": { color: "primary.light" }
                                    }}
                                    component="a"
                                    href={mr.webUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={mr.title}
                                  >
                                    {mr.title}
                                  </Typography>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: stateColor, fontWeight: 700, textTransform: "uppercase", fontSize: "0.65rem" }}>
                                      {mr.state}
                                    </Typography>
                                    {mr.additions !== undefined && mr.deletions !== undefined && mr.additions !== null && mr.deletions !== null && (
                                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                        <span style={{ color: "#2da44e" }}>+{mr.additions}</span>{" "}
                                        <span style={{ color: "#cf222e" }}>-{mr.deletions}</span>
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </ListItem>
                              {idx < userMergeRequests.length - 1 && <Divider component="li" sx={{ opacity: 0.5 }} />}
                            </React.Fragment>
                          );
                        })}
                        {userMergeRequests.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", py: 4, textAlign: "center" }}>
                            No merge requests recorded
                          </Typography>
                        )}
                      </List>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ) : (
              /* Tab 2: Achievements */
              <Box>
                {/* Level stats card */}
                <Card variant="outlined" sx={{ mb: 4, p: 2.5, background: `linear-gradient(135deg, ${tierColor}0d, rgba(255,255,255,0.01))` }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 900, color: tierColor, lineHeight: 1 }}>
                        Lv. {stats.level}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mt: 0.5 }}>
                        {getTierName(stats.level)} Tier
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {stats.xp.toLocaleString()} XP
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Total Earned XP
                      </Typography>
                    </Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={stats.xpPercent}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 4,
                        backgroundColor: tierColor,
                      },
                    }}
                  />
                </Card>

                {/* Badge Grid */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                  Badges & Achievements
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
                    gap: 2,
                    mb: 4,
                  }}
                >
                  {stats.badges.map((badge) => (
                    <Card
                      key={badge.id}
                      variant="outlined"
                      sx={{
                        opacity: badge.unlocked ? 1 : 0.45,
                        filter: badge.unlocked ? "none" : "grayscale(85%)",
                        backgroundColor: badge.unlocked ? "rgba(124, 58, 237, 0.02)" : "rgba(255,255,255,0.01)",
                        borderColor: badge.unlocked ? "rgba(124, 58, 237, 0.25)" : "divider",
                        position: "relative",
                        overflow: "hidden",
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          transform: badge.unlocked ? "translateY(-2px)" : "none",
                          boxShadow: badge.unlocked ? `0 4px 12px ${tierColor}1c` : "none",
                          borderColor: badge.unlocked ? tierColor : "divider",
                        },
                      }}
                    >
                      <CardContent sx={{ display: "flex", gap: 2, p: 2, "&:last-child": { pb: 2 } }}>
                        <Box sx={{ fontSize: "2.25rem", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40 }}>
                          {badge.icon}
                        </Box>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: badge.unlocked ? "text.primary" : "text.secondary", textWrap: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                              {badge.name}
                            </Typography>
                            {badge.unlocked ? (
                              <Typography variant="caption" sx={{ color: "success.light", fontWeight: 700, fontSize: "0.65rem", flexShrink: 0 }}>
                                ✓ Unlocked
                              </Typography>
                            ) : (
                              <Typography variant="caption" sx={{ color: "text.secondary", display: "inline-flex", alignItems: "center", gap: 0.25, fontSize: "0.65rem", flexShrink: 0 }}>
                                🔒 Locked
                              </Typography>
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", height: 32, mt: 0.5, mb: 1, lineHeight: 1.25 }}>
                            {badge.description}
                          </Typography>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: badge.unlocked ? "primary.light" : "text.secondary", fontSize: "0.7rem" }}>
                              {badge.progressText}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: badge.unlocked ? "success.light" : "text.secondary", fontSize: "0.7rem" }}>
                              +{badge.xpReward} XP
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>

                <Divider sx={{ my: 4 }} />

                {/* XP Breakdown list */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", color: "text.secondary" }}>
                  Experience Points Breakdown
                </Typography>

                <Card variant="outlined" sx={{ backgroundColor: "rgba(255,255,255,0.01)" }}>
                  <List disablePadding>
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Hours Logged XP</Typography>}
                        secondary="20 XP per hour"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.hoursXp.toLocaleString()} XP</Typography>
                    </ListItem>
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Issues Completed XP</Typography>}
                        secondary="15 XP per estimated hour"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.issuesXp.toLocaleString()} XP</Typography>
                    </ListItem>
                    {stats.xpBreakdown.blindFlightPenalty > 0 && (
                      <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                        <ListItemText
                          primary={<Typography variant="body2" sx={{ fontWeight: 600, color: "error.main" }}>Blind Flight Penalty</Typography>}
                          secondary="-30 XP per issue closed without estimate"
                        />
                        <Typography sx={{ fontWeight: 700, color: "error.main" }}>-{stats.xpBreakdown.blindFlightPenalty.toLocaleString()} XP</Typography>
                      </ListItem>
                    )}
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Iterations Contributed XP</Typography>}
                        secondary="25 XP per active sprint"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.sprintsXp.toLocaleString()} XP</Typography>
                    </ListItem>
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Teammate MRs Reviewed XP</Typography>}
                        secondary="15 XP per teammate MR approved, 10 XP per MR commented (without approval)"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.reviewsXp.toLocaleString()} XP</Typography>
                    </ListItem>
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Authored MRs Merged XP</Typography>}
                        secondary="50 XP per authored MR successfully merged"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.mergesXp.toLocaleString()} XP</Typography>
                    </ListItem>
                    {isBot && stats.xpBreakdown.botActionsXp !== undefined && (
                      <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)" }}>
                        <ListItemText
                          primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Bot Actions XP</Typography>}
                          secondary="2 XP per bot action (discussions contribution on MRs)"
                        />
                        <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.botActionsXp.toLocaleString()} XP</Typography>
                      </ListItem>
                    )}
                    <ListItem sx={{ py: 1.5, px: 2.5, display: "flex", justifyContent: "space-between" }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Unlocked Badges XP</Typography>}
                        secondary="XP earned from all unlocked achievements"
                      />
                      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{stats.xpBreakdown.badgesXp.toLocaleString()} XP</Typography>
                    </ListItem>
                  </List>
                </Card>
              </Box>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
