"use client";
import React from "react";
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { CATEGORY_DEFINITIONS } from "./config/categories";
import { UserLeaderboard } from "./components/UserLeaderboard";
import GroupDashboard from "./components/GroupDashboard";
import { useUserAuth } from "./UserAuthContext";
import type { GroupComparisonResponse, GroupComparisonItem } from "./types/analytics";
import { useThemeMode } from "./ThemeContext";
import { loadGroupComparison } from "./gitlab/client";
import {
  groupRouteHref,
  handleGroupRouteClick,
  navigateToGroup,
  useClientGroupRoute,
} from "./ClientRoute";
// Fixed color palette for categories
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

function EffortMultChip({ value }: { value: number }) {
  const color = value > 2.5 ? "#ef4444" : value > 1.5 ? "#f59e0b" : "#22c55e";
  return (
    <Tooltip
      title={
        <Typography variant="caption">
          {value > 2.5
            ? "High variance — top member works 2.5×+ the lowest"
            : value > 1.5
              ? "Moderate variance — some effort disparity"
              : "Low variance — members contribute similar effort"}
        </Typography>
      }
      arrow
    >
      <Chip
        label={`${value.toFixed(1)}×`}
        size="small"
        sx={{
          height: 18,
          fontSize: "0.65rem",
          fontWeight: 800,
          bgcolor: `${color}20`,
          color,
          border: `1px solid ${color}50`,
          px: 0.3,
        }}
      />
    </Tooltip>
  );
}

function DeltaChip({ value }: { value: number }) {
  const color = value > 40 ? "#ef4444" : value > 20 ? "#f59e0b" : "#22c55e";
  return (
    <Tooltip
      title={
        <Typography variant="caption">
          {value > 40
            ? "Large absolute gap — 40+ hours between top and bottom"
            : value > 20
              ? "Moderate gap — 20–40 hours difference"
              : "Tight spread — under 20 hours between extremes"}
        </Typography>
      }
      arrow
    >
      <Chip
        label={`${value.toFixed(1)}h`}
        size="small"
        sx={{
          height: 18,
          fontSize: "0.65rem",
          fontWeight: 800,
          bgcolor: `${color}20`,
          color,
          border: `1px solid ${color}50`,
          px: 0.3,
        }}
      />
    </Tooltip>
  );
}

function CvChip({ value }: { value: number }) {
  const color = value > 0.5 ? "#ef4444" : value > 0.25 ? "#f59e0b" : "#22c55e";
  return (
    <Tooltip
      title={
        <Typography variant="caption">
          {value > 0.5
            ? "High relative dispersion — CV > 0.5"
            : value > 0.25
              ? "Moderate dispersion — CV 0.25–0.5"
              : "Low dispersion — CV < 0.25"}
        </Typography>
      }
      arrow
    >
      <Chip
        label={`CV ${value.toFixed(2)}`}
        size="small"
        sx={{
          height: 18,
          fontSize: "0.6rem",
          fontWeight: 800,
          bgcolor: `${color}20`,
          color,
          border: `1px solid ${color}50`,
          px: 0.2,
        }}
      />
    </Tooltip>
  );
}

function ReviewCovChip({ value }: { value: number }) {
  const color = value >= 80 ? "#22c55e" : value >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <Tooltip
      title={
        <Typography variant="caption">
          {value >= 80
            ? "Strong review culture — 80%+ merged MRs are reviewed"
            : value >= 50
              ? "Moderate review culture — half of merged MRs get reviewed"
              : "Weak review culture — most merged MRs lack peer review"}
        </Typography>
      }
      arrow
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 14,
            borderRadius: "7px",
            bgcolor: "rgba(255,255,255,0.06)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: `${Math.min(value, 100)}%`,
              height: "100%",
              bgcolor: color,
              borderRadius: "7px",
              opacity: 0.8,
              transition: "width 0.3s ease",
            }}
          />
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.65rem", color }}>
          {value.toFixed(0)}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

function StackedBar({
  segments,
  otherHours,
  otherLabels,
  totalHours,
  maxTotalHours,
}: {
  segments: {
    id?: string;
    label: string;
    hours: number;
    color: string;
    matchedLabels?: string[];
  }[];
  otherHours: number;
  otherLabels: string[];
  totalHours: number;
  maxTotalHours: number;
}) {
  const theme = useTheme();
  const { colorTheme } = useThemeMode();
  const isDark = theme.palette.mode === "dark";

  const otherSegment =
    otherHours > 0
      ? [
        {
          label: "Other",
          hours: otherHours,
          color: PALETTE[CATEGORY_DEFINITIONS.length % PALETTE.length],
          matchedLabels: otherLabels,
        },
      ]
      : [];
  const allSegments = [
    ...segments.map((s) => ({
      ...s,
      color: s.id ? PALETTE[CATEGORY_DEFINITIONS.findIndex(d => d.id === s.id) % PALETTE.length] : s.color,
    })),
    ...otherSegment,
  ];

  const barWidthPct =
    maxTotalHours > 0 ? Math.max((totalHours / maxTotalHours) * 100, 10) : 100;

  return (
    <Box
      sx={{
        width: `${barWidthPct}%`,
        height: 20,
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        bgcolor: "rgba(255,255,255,0.05)",
      }}
    >
      {allSegments.map((seg) => {
        const pct = totalHours > 0 ? (seg.hours / totalHours) * 100 : 0;
        if (pct < 0.5) return null;
        return (
          <Tooltip
            key={seg.label}
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {seg.label}: {seg.hours.toFixed(1)}h ({pct.toFixed(0)}%)
                </Typography>
                {seg.matchedLabels && seg.matchedLabels.length > 0 && (
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      px: 1.5,
                      listStyle: "none",
                      "& li": {
                        fontSize: "0.75rem",
                        lineHeight: 1.6,
                        opacity: 0.85,
                      },
                    }}
                  >
                    {seg.matchedLabels.map((l: string) => (
                      <li key={l}>{l}</li>
                    ))}
                  </Box>
                )}
              </Box>
            }
            arrow
          >
            <Box
              sx={{
                width: `${pct}%`,
                minWidth: 4,
                height: "100%",
                bgcolor: seg.color,
                transition: "width 0.3s ease",
                "&:hover": { opacity: 0.8 },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

function MemberAvatars({
  members,
}: {
  members: {
    id: string;
    name: string;
    avatarUrl: string | null;
    bot: boolean;
    verified?: boolean;
  }[];
}) {
  const humanMembers = members.filter((m) => !m.bot && m.verified !== false);
  if (humanMembers.length === 0)
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );

  return (
    <AvatarGroup
      max={7}
      total={humanMembers.length}
      sx={{
        justifyContent: "flex-start",
        "& .MuiAvatar-root": { width: 26, height: 26, fontSize: "0.7rem" },
      }}
    >
      {humanMembers.map((m) => (
        <Tooltip key={m.id} title={m.name} arrow>
          <Avatar
            alt={m.name}
            src={m.avatarUrl || undefined}
            sx={{ width: 26, height: 26 }}
          >
            {m.name.charAt(0).toUpperCase()}
          </Avatar>
        </Tooltip>
      ))}
    </AvatarGroup>
  );
}

function CategoryLegend() {
  const theme = useTheme();
  const { colorTheme } = useThemeMode();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}
    >
      {CATEGORY_DEFINITIONS.map((def) => (
        <Box
          key={def.id}
          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "2px",
              bgcolor: PALETTE[CATEGORY_DEFINITIONS.findIndex(d => d.id === def.id) % PALETTE.length],
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {def.label}
          </Typography>
        </Box>
      ))}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "2px",
            bgcolor: PALETTE[CATEGORY_DEFINITIONS.length % PALETTE.length],
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Other
        </Typography>
      </Box>
    </Box>
  );
}

function ComparisonTable({ data }: { data: GroupComparisonItem[] }) {
  // data contains top-level groups; calculate maxTotalHours across all groups including subgroups for consistent scale
  const allGroups = data.flatMap((g) => [g, ...(g.subgroups || [])]);
  const maxTotalHours = Math.max(...allGroups.map((g) => g.totalHours), 0);
  // Expanded state for tree rows
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const hasAnySubgroups = data.some((g) => g.subgroups && g.subgroups.length > 0);
  const allExpanded = hasAnySubgroups && data.filter((g) => g.subgroups && g.subgroups.length > 0).every((g) => expandedGroups[g.id]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      data.forEach((g) => {
        if (g.subgroups && g.subgroups.length > 0) next[g.id] = true;
      });
      setExpandedGroups(next);
    }
  };

  return (
    <>
      {hasAnySubgroups && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={toggleAll}
            sx={{ fontSize: "0.75rem", textTransform: "none" }}
          >
            {allExpanded ? "Collapse All Subgroups" : "Expand All Subgroups"}
          </Button>
        </Box>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Group</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Level</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Members</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Category split</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Hours
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Wks
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Avg h
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Effort</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Δ h</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>CV</TableCell>
            <TableCell sx={{ fontWeight: 700, minWidth: 80 }}>Reviews</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((group) => {
            const hasSub = group.subgroups && group.subgroups.length > 0;
            const isExpanded = !!expandedGroups[group.id];

            return (
              <React.Fragment key={group.id}>
                <TableRow
                  onClick={() => navigateToGroup(group.id)}
                  sx={{
                    cursor: "pointer",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.04)" },
                    "&:last-child td": { borderBottom: hasSub && isExpanded ? "1px solid rgba(255,255,255,0.08)" : 0 },
                    "& td": { textDecoration: "none" },
                  }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      {hasSub ? (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(group.id);
                          }}
                          sx={{ p: 0.5, color: "text.secondary" }}
                        >
                          {isExpanded ? (
                            <KeyboardArrowDownIcon fontSize="small" />
                          ) : (
                            <KeyboardArrowRightIcon fontSize="small" />
                          )}
                        </IconButton>
                      ) : (
                        <Box sx={{ width: 28 }} />
                      )}
                      <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <span>{group.name}</span>
                          {hasSub && (
                            <Chip
                              label={`${group.subgroups!.length} sub`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: "0.62rem",
                                fontWeight: 700,
                                bgcolor: "primary.dark",
                                color: "primary.contrastText",
                                px: 0.2,
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`Lv. ${group.groupLevel}`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        backgroundColor: group.groupTierColor,
                        color: group.groupLevel >= 10 && group.groupLevel < 30 ? "#0f172a" : "#ffffff",
                        px: 0.5,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    <MemberAvatars members={group.members} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 250 }}>
                    <StackedBar
                      segments={group.categoryBreakdown}
                      otherHours={group.otherHours}
                      otherLabels={group.otherLabels}
                      totalHours={group.totalHours}
                      maxTotalHours={maxTotalHours}
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    {group.totalHours.toFixed(0)}h
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.85rem" }}>
                    {group.groupWorkWeeks}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.85rem" }}>
                    {group.groupMeanHours.toFixed(0)}
                  </TableCell>
                  <TableCell>
                    <EffortMultChip value={group.effortMultiplier} />
                  </TableCell>
                  <TableCell>
                    <DeltaChip value={group.effortGap} />
                  </TableCell>
                  <TableCell>
                    <CvChip value={group.coefficientOfVariation} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 80 }}>
                    <ReviewCovChip value={group.reviewCoverage} />
                  </TableCell>
                </TableRow>

                {/* Subgroup nested rows */}
                {hasSub &&
                  isExpanded &&
                  group.subgroups!.map((sub) => (
                    <TableRow
                      key={sub.id}
                      onClick={() => navigateToGroup(sub.id)}
                      sx={{
                        cursor: "pointer",
                        bgcolor: "rgba(124, 58, 237, 0.04)",
                        "&:hover": { backgroundColor: "rgba(124, 58, 237, 0.09)" },
                        "& td": { borderBottom: "1px dashed rgba(255,255,255,0.06)", py: 1 },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500, pl: 4.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="caption" sx={{ color: "primary.light", fontWeight: 700 }}>
                            ↳
                          </Typography>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                              {sub.name}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`Lv. ${sub.groupLevel}`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            backgroundColor: sub.groupTierColor,
                            color: sub.groupLevel >= 10 && sub.groupLevel < 30 ? "#0f172a" : "#ffffff",
                            px: 0.3,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <MemberAvatars members={sub.members} />
                      </TableCell>
                      <TableCell sx={{ minWidth: 250 }}>
                        <StackedBar
                          segments={sub.categoryBreakdown}
                          otherHours={sub.otherHours}
                          otherLabels={sub.otherLabels}
                          totalHours={sub.totalHours}
                          maxTotalHours={maxTotalHours}
                        />
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 600, whiteSpace: "nowrap", fontSize: "0.85rem" }}
                      >
                        {sub.totalHours.toFixed(0)}h
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.8rem" }}>
                        {sub.groupWorkWeeks}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.8rem" }}>
                        {sub.groupMeanHours.toFixed(0)}
                      </TableCell>
                      <TableCell>
                        <EffortMultChip value={sub.effortMultiplier} />
                      </TableCell>
                      <TableCell>
                        <DeltaChip value={sub.effortGap} />
                      </TableCell>
                      <TableCell>
                        <CvChip value={sub.coefficientOfVariation} />
                      </TableCell>
                      <TableCell sx={{ minWidth: 80 }}>
                        <ReviewCovChip value={sub.reviewCoverage} />
                      </TableCell>
                    </TableRow>
                  ))}
              </React.Fragment>
            );
          })}
        </TableBody>
        {data.length > 0 && (
          <TableFooter>
            <TableRow sx={{ "& td": { borderTop: "2px solid rgba(255,255,255,0.15)" } }}>
              <TableCell sx={{ fontWeight: 700 }}>All groups</TableCell>
              <TableCell>
                {(() => {
                  const avgLevel = data.reduce((s, g) => s + g.groupLevel, 0) / data.length;
                  const tierColor =
                    avgLevel < 10 ? "#cd7f32" :
                      avgLevel < 20 ? "#c0c0c0" :
                        avgLevel < 30 ? "#ffd700" : "#a855f7";
                  return (
                    <Chip
                      label={`Lv. ${avgLevel.toFixed(1)}`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        backgroundColor: tierColor,
                        color: avgLevel >= 10 && avgLevel < 30 ? "#0f172a" : "#ffffff",
                        px: 0.5,
                      }}
                    />
                  );
                })()}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                {data.reduce((s, g) => s + g.totalHours, 0).toFixed(0)}h
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: "text.secondary", fontSize: "0.85rem" }}>
                {data.reduce((s, g) => s + g.groupWorkWeeks, 0).toFixed(1)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: "text.secondary", fontSize: "0.85rem" }}>
                {(data.reduce((s, g) => s + g.totalHours, 0) / Math.max(data.reduce((s, g) => s + g.members.length, 0), 1)).toFixed(0)}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell sx={{ minWidth: 80 }}>
                <ReviewCovChip value={data.reduce((s, g) => s + g.reviewCoverage, 0) / data.length} />
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </>
  );
}

function ComparisonCards({ data }: { data: GroupComparisonItem[] }) {
  const allGroups = data.flatMap((g) => [g, ...(g.subgroups || [])]);
  const maxTotalHours = Math.max(...allGroups.map((g) => g.totalHours), 0);
  const [expandedCards, setExpandedCards] = React.useState<Record<string, boolean>>({});

  const toggleCard = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data.map((group) => {
        const hasSub = group.subgroups && group.subgroups.length > 0;
        const isExpanded = !!expandedCards[group.id];

        return (
          <Card
            key={group.id}
            sx={{
              transition: "all 0.2s ease",
              "&:hover": { transform: "translateY(-2px)", boxShadow: 4 },
            }}
          >
            <CardContent>
              <Box
                component="a"
                href={groupRouteHref(group.id)}
                onClick={(event) => handleGroupRouteClick(event, group.id)}
                sx={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {group.name}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                    {hasSub && (
                      <Chip
                        label={`${group.subgroups!.length} sub`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          bgcolor: "primary.dark",
                          color: "primary.contrastText",
                        }}
                      />
                    )}
                    <Chip
                      label={`Lv. ${group.groupLevel}`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        backgroundColor: group.groupTierColor,
                        color: group.groupLevel >= 10 && group.groupLevel < 30 ? "#0f172a" : "#ffffff",
                        px: 0.5,
                      }}
                    />
                  </Box>
                </Box>
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    Members
                  </Typography>
                  <MemberAvatars members={group.members} />
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Category split
                </Typography>
                <StackedBar
                  segments={group.categoryBreakdown}
                  otherHours={group.otherHours}
                  otherLabels={group.otherLabels}
                  totalHours={group.totalHours}
                  maxTotalHours={maxTotalHours}
                />
                <Box sx={{ display: "flex", gap: 2, mt: 1.5, flexWrap: "wrap" }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Hours
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {group.totalHours.toFixed(0)}h
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Wks
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {group.groupWorkWeeks}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Avg
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {group.groupMeanHours.toFixed(0)}h
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Effort
                    </Typography>
                    <EffortMultChip value={group.effortMultiplier} />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Δ h
                    </Typography>
                    <DeltaChip value={group.effortGap} />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      CV
                    </Typography>
                    <CvChip value={group.coefficientOfVariation} />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                      Reviews
                    </Typography>
                    <ReviewCovChip value={group.reviewCoverage} />
                  </Box>
                </Box>
              </Box>

              {/* Subgroups accordion in mobile card */}
              {hasSub && (
                <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e: React.MouseEvent) => toggleCard(group.id, e)}
                    endIcon={isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    fullWidth
                    sx={{ textTransform: "none", fontSize: "0.8rem", borderRadius: 1.5 }}
                  >
                    {isExpanded ? "Hide Subgroups" : `View ${group.subgroups!.length} Subgroups`}
                  </Button>

                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1.5 }}>
                      {group.subgroups!.map((sub) => (
                        <Card
                          key={sub.id}
                          component="a"
                          href={groupRouteHref(sub.id)}
                          onClick={(event) => handleGroupRouteClick(event, sub.id)}
                          sx={{
                            textDecoration: "none",
                            bgcolor: "rgba(124, 58, 237, 0.05)",
                            border: "1px solid rgba(124, 58, 237, 0.15)",
                            p: 1.5,
                            borderRadius: 1.5,
                          }}
                        >
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                              <Typography variant="caption" sx={{ color: "primary.light" }}>↳</Typography>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                {sub.name}
                              </Typography>
                            </Box>
                            <Chip
                              label={`Lv. ${sub.groupLevel}`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                backgroundColor: sub.groupTierColor,
                                color: sub.groupLevel >= 10 && sub.groupLevel < 30 ? "#0f172a" : "#ffffff",
                              }}
                            />
                          </Box>
                          <StackedBar
                            segments={sub.categoryBreakdown}
                            otherHours={sub.otherHours}
                            otherLabels={sub.otherLabels}
                            totalHours={sub.totalHours}
                            maxTotalHours={maxTotalHours}
                          />
                          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {sub.totalHours.toFixed(0)}h total
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {sub.members.filter((m) => !m.bot).length} members
                            </Typography>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  </Collapse>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

function GroupComparisonPage() {
  const [data, setData] = React.useState<GroupComparisonResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { token, loading: authLoading } = useUserAuth();

  React.useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const fetchData = async () => {
      setData(null);
      setLoading(true);
      if (!token) {
        setError("Sign in with GitLab to load group analytics.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const result = await loadGroupComparison(token);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [token, authLoading]);

  const groups = data?.groups ?? [];

  return (
    <Box
      sx={{
        width: "100%",
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        GitLab Time Analysis
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a group to view its time tracking dashboard
      </Typography>

      {loading && (
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
            Loading group comparison data…
          </Typography>
        </Box>
      )}

      {error && (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography color="error" sx={{ mb: 1 }}>
            Failed to load groups
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {error}
          </Typography>
        </Card>
      )}

      {data && groups.length === 0 && (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            No groups found. Check your NEXT_PUBLIC_GITLAB_GROUP_PATH configuration.
          </Typography>
        </Card>
      )}

      {data && groups.length > 0 && (
        <>
          <Box sx={{ mt: 3 }}>
            <Card>
              <CardHeader
                title={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 1,
                    }}
                  >
                    <span>
                      Groups{" "}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        ({groups.length})
                      </Typography>
                    </span>
                    <CategoryLegend />
                  </Box>
                }
                sx={{ pb: 0 }}
              />
              <CardContent sx={{ px: { xs: 1, sm: 2 } }}>
                {isMobile ? (
                  <ComparisonCards data={groups} />
                ) : (
                  <ComparisonTable data={groups} />
                )}
              </CardContent>
            </Card>
          </Box>

          <br />
          <UserLeaderboard />
        </>
      )}
    </Box>
  );
}

export default function Home() {
  const groupId = useClientGroupRoute();
  return groupId ? (
    <GroupDashboard key={groupId} groupId={groupId} />
  ) : (
    <GroupComparisonPage />
  );
}
