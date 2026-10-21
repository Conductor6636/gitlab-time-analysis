"use client";
import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { CATEGORY_DEFINITIONS } from "@/app/config/categories";
import type {
  UserLeaderboardResponse,
  UserLeaderboardEntry,
  CategoryEntry,
} from "@/app/types/analytics";
import { useUserAuth } from "../UserAuthContext";
import { useThemeMode } from "../ThemeContext";
import { useUserProfile } from "../UserProfileContext";
import { loadUserLeaderboard } from "../gitlab/client";

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
const OTHER_COLOR = "rgba(255,255,255,0.15)";

const getTierColor = (level: number) => {
  if (level < 10) return "#cd7f32"; // Bronze
  if (level < 20) return "#c0c0c0"; // Silver
  if (level < 30) return "#ffd700"; // Gold
  return "#a855f7"; // Legend
};

function LeaderboardRank({ rank }: { rank: number }) {
  const medalColors = {
    1: "#FFD700", // Gold
    2: "#C0C0C0", // Silver
    3: "#CD7F32", // Bronze
  };
  const bgColor = rank <= 3 ? medalColors[rank as 1 | 2 | 3] : "rgba(255,255,255,0.1)";
  const textColor = rank <= 3 ? "#000" : "inherit";

  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: bgColor,
        fontWeight: 700,
        fontSize: "1rem",
        color: textColor,
      }}
    >
      {rank}
    </Box>
  );
}

function CategoryBar({
  categoryBreakdown,
  otherHours,
  totalHours,
  maxTotalHours,
}: {
  categoryBreakdown: CategoryEntry[];
  otherHours: number;
  totalHours: number;
  maxTotalHours: number;
}) {
  const theme = useTheme();
  const { colorTheme } = useThemeMode();
  const isDark = theme.palette.mode === "dark";

  const filteredCategories = categoryBreakdown.filter((c) => c.hours > 0);
  const showOther = otherHours > 0;
  const segments = [
    ...filteredCategories.map((c) => ({
      ...c,
      color: PALETTE[CATEGORY_DEFINITIONS.findIndex(d => d.id === c.categoryId) % PALETTE.length],
    })),
    ...(showOther
      ? [
          {
            label: "Other",
            hours: otherHours,
            color: PALETTE[CATEGORY_DEFINITIONS.length % PALETTE.length],
          },
        ]
      : []),
  ];

  const barWidthPct = maxTotalHours > 0 ? Math.max((totalHours / maxTotalHours) * 100, 5) : 100;

  return (
    <Tooltip
      title={
        <Box>
          {segments.map((seg) => (
            <Typography key={seg.label} variant="body2" sx={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
              {seg.label}: {seg.hours.toFixed(1)}h ({totalHours > 0 ? (((seg.hours / totalHours) * 100).toFixed(0)) : 0}%)
            </Typography>
          ))}
        </Box>
      }
      arrow
    >
      <Box
        sx={{
          width: `${barWidthPct}%`,
          height: 24,
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          bgcolor: "rgba(255,255,255,0.05)",
        }}
      >
        {segments.map((seg) => {
          const pct = totalHours > 0 ? (seg.hours / totalHours) * 100 : 0;
          if (pct < 1) return null;
          return (
            <Box
              key={seg.label}
              sx={{
                width: `${pct}%`,
                height: "100%",
                bgcolor: seg.color,
                transition: "width 0.3s ease",
              }}
            />
          );
        })}
      </Box>
    </Tooltip>
  );
}

function LeaderboardTable({ data }: { data: UserLeaderboardResponse }) {
  const maxTotalHours = Math.max(...data.map((u) => u.totalHours), 0);
  const { openProfile } = useUserProfile();

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 700, width: 50 }}>Rank</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
          <TableCell sx={{ fontWeight: 700 }} align="right">Total Hours</TableCell>
          <TableCell sx={{ fontWeight: 700, minWidth: 250 }}>Category Breakdown</TableCell>
          <TableCell sx={{ fontWeight: 700, maxWidth: 150 }}>Groups</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map((user, idx) => {
          const tierColor = getTierColor(user.level || 1);
          return (
            <TableRow
              key={user.userId}
              sx={{
                "&:last-child td": { borderBottom: 0 },
              }}
            >
              <TableCell sx={{ textAlign: "center" }}>
                <LeaderboardRank rank={idx + 1} />
              </TableCell>
              <TableCell>
                <Box
                  onClick={() => openProfile(user.userId)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    cursor: "pointer",
                    width: "fit-content",
                    "&:hover .username": {
                      color: "primary.light",
                      textDecoration: "underline",
                    },
                  }}
                >
                  <Avatar
                    alt={user.name}
                    src={user.avatarUrl || undefined}
                    sx={{
                      width: 36,
                      height: 36,
                      border: `2px solid ${tierColor}`,
                      boxShadow: `0 0 6px ${tierColor}33`,
                    }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" className="username" sx={{ fontWeight: 500, transition: "color 0.2s" }}>
                    {user.name}
                  </Typography>
                  <Chip
                    label={`Lv. ${user.level || 1}`}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: "0.65rem",
                      fontWeight: 800,
                      backgroundColor: tierColor,
                      color: (user.level || 1) >= 10 && (user.level || 1) < 30 ? "#0f172a" : "#ffffff",
                      px: 0.5,
                      cursor: "pointer",
                    }}
                  />
                </Box>
              </TableCell>
              <TableCell align="right">
                <Chip
                  label={`${user.totalHours.toFixed(1)}h`}
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    backgroundColor: idx <= 2 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
                  }}
                />
              </TableCell>
              <TableCell>
                <CategoryBar
                  categoryBreakdown={user.categoryBreakdown}
                  otherHours={user.otherHours}
                  totalHours={user.totalHours}
                  maxTotalHours={maxTotalHours}
                />
              </TableCell>
              <TableCell sx={{ maxWidth: 150 }}>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {user.groups.slice(0, 2).map((group) => (
                    <Chip
                      key={group}
                      label={group}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 20 }}
                    />
                  ))}
                  {user.groups.length > 2 && (
                    <Tooltip title={user.groups.slice(2).join(", ")} arrow>
                      <Chip
                        label={`+${user.groups.length - 2}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.7rem", height: 20 }}
                      />
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function LeaderboardCards({ data }: { data: UserLeaderboardResponse }) {
  const maxTotalHours = Math.max(...data.map((u) => u.totalHours), 0);
  const { openProfile } = useUserProfile();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data.map((user, idx) => {
        const tierColor = getTierColor(user.level || 1);
        return (
          <Card key={user.userId}>
            <CardContent>
              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 2 }}>
                <LeaderboardRank rank={idx + 1} />
                <Box sx={{ flex: 1 }}>
                  <Box
                    onClick={() => openProfile(user.userId)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      cursor: "pointer",
                      width: "fit-content",
                      "&:hover .username": {
                        color: "primary.light",
                        textDecoration: "underline",
                      },
                    }}
                  >
                    <Avatar
                      alt={user.name}
                      src={user.avatarUrl || undefined}
                      sx={{
                        width: 40,
                        height: 40,
                        border: `2px solid ${tierColor}`,
                        boxShadow: `0 0 6px ${tierColor}33`,
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="subtitle2" className="username" sx={{ fontWeight: 700, transition: "color 0.2s" }}>
                          {user.name}
                        </Typography>
                        <Chip
                          label={`Lv. ${user.level || 1}`}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: "0.6rem",
                            fontWeight: 800,
                            backgroundColor: tierColor,
                            color: (user.level || 1) >= 10 && (user.level || 1) < 30 ? "#0f172a" : "#ffffff",
                            px: 0.5,
                            cursor: "pointer",
                          }}
                        />
                      </Box>
                      <Chip
                        label={`${user.totalHours.toFixed(1)}h`}
                        size="small"
                        sx={{ fontWeight: 700, fontSize: "0.8rem", mt: 0.5 }}
                      />
                    </Box>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Category Breakdown
                </Typography>
                <CategoryBar
                  categoryBreakdown={user.categoryBreakdown}
                  otherHours={user.otherHours}
                  totalHours={user.totalHours}
                  maxTotalHours={maxTotalHours}
                />
              </Box>
              {user.groups.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Groups ({user.groups.length})
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {user.groups.map((group) => (
                      <Chip
                        key={group}
                        label={group}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.75rem", height: 20 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

export function UserLeaderboard() {
  const [data, setData] = React.useState<UserLeaderboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { token, loading: authLoading } = useUserAuth();
  const [sortBy, setSortBy] = React.useState<"hours" | "level">("hours");

  const sortedData = React.useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      if (sortBy === "level") {
        return (b.xp || 0) - (a.xp || 0);
      }
      return b.totalHours - a.totalHours;
    });
  }, [data, sortBy]);
  
  React.useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const fetchData = async () => {
      setData(null);
      setLoading(true);
      if (!token) {
        setError("Sign in with GitLab to load the user leaderboard.");
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const result = await loadUserLeaderboard(token);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [token, authLoading]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 4 }}>
        <Box sx={{ width: "60%", maxWidth: 400 }}>
          <LinearProgress />
        </Box>
        <Typography variant="body2" color="text.secondary">
          Loading user leaderboard…
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Card sx={{ p: 2 }}>
        <Typography color="error" sx={{ mb: 1, fontWeight: 600 }}>
          Failed to load leaderboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error}
        </Typography>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary">
          No user data available yet.
        </Typography>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
            <span>
              User Leaderboard{" "}
              <Typography component="span" variant="body2" color="text.secondary">
                ({data.length} users)
              </Typography>
            </span>
            <ToggleButtonGroup
              value={sortBy}
              exclusive
              onChange={(_, value) => {
                if (value) setSortBy(value);
              }}
              size="small"
              aria-label="sort leaderboard by"
            >
              <ToggleButton value="hours" aria-label="sort by hours">
                Hours
              </ToggleButton>
              <ToggleButton value="level" aria-label="sort by level / xp">
                XP & Level
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        }
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ px: { xs: 1, sm: 2 } }}>
        {isMobile ? (
          <LeaderboardCards data={sortedData} />
        ) : (
          <LeaderboardTable data={sortedData} />
        )}
      </CardContent>
    </Card>
  );
}
