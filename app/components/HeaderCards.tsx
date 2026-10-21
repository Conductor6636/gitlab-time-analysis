import React from "react";
import { GroupContext } from "../GroupContext";
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  AvatarGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { UserAvatar } from "./UserAvatar";
import { matchLabelToCategory } from "../utils/categoryUtils";
import { CATEGORY_DEFINITIONS } from "../config/categories";
import type { GroupTimelogsResponse, GroupSprintsResponse } from "../types/group";
import { useUserProfile } from "../UserProfileContext";

const getTopCategoryForSprint = (
  sprint: GroupSprintsResponse[number] | undefined,
  timelogs: GroupTimelogsResponse,
): string | null => {
  if (!sprint) return null;

  const categorySeconds: Record<string, number> = {};
  for (const def of CATEGORY_DEFINITIONS) {
    categorySeconds[def.label] = 0;
  }

  timelogs.forEach((log: GroupTimelogsResponse[number]) => {
    if (log.sprintNumber !== sprint.sprintNumber) return;

    for (const label of log.issueLabels || []) {
      const catDef = matchLabelToCategory(label);
      if (catDef) {
        categorySeconds[catDef.label] =
          (categorySeconds[catDef.label] || 0) + log.timeSpent;
        return;
      }
    }
  });

  let topCategory: string | null = null;
  let maxTime = 0;
  for (const [cat, seconds] of Object.entries(categorySeconds)) {
    if (seconds > maxTime) {
      maxTime = seconds;
      topCategory = cat;
    }
  }
  return topCategory;
};

export default function HeaderCards() {
  const { members, sprints, timelogs } = React.useContext(GroupContext);
  const { openProfile } = useUserProfile();

  const totalTimeSpent = timelogs.reduce(
    (total, log) => total + log.timeSpent,
    0,
  );
  const totalHours = totalTimeSpent / 3600;

  const todayStr = new Date().toISOString().slice(0, 10);

  const totalSprints = sprints.filter(
    (sprint) => sprint.endDate < todayStr,
  ).length;

  const currentSprint = React.useMemo(
    () => sprints.find((s) => s.startDate <= todayStr && s.endDate >= todayStr),
    [sprints, todayStr],
  );

  const lastSprint = React.useMemo(() => {
    if (currentSprint) {
      return sprints.find(
        (s) => s.sprintNumber === currentSprint.sprintNumber - 1,
      );
    }
    return sprints
      .filter((s) => s.endDate < todayStr)
      .sort((a, b) => b.sprintNumber - a.sprintNumber)[0];
  }, [sprints, currentSprint, todayStr]);

  const focusLastSprint = React.useMemo(() => {
    return getTopCategoryForSprint(lastSprint, timelogs);
  }, [lastSprint, timelogs]);

  const focusThisSprint = React.useMemo(() => {
    return getTopCategoryForSprint(currentSprint, timelogs);
  }, [currentSprint, timelogs]);

  const humanMembers = members.filter((m) => !m.bot && m.verified);
  const botMembers = members.filter((m) => m.bot);

  const workWeeks = totalHours / 40;
  const meanHours = humanMembers.length > 0 ? totalHours / humanMembers.length : 0;

  // Effort dispersion stats (same as comparison table)
  const effortStats = React.useMemo(() => {
    const userHoursArr: number[] = [];
    for (const log of timelogs) {
      const uid = log.username?.toString() || "unknown";
      const uidLower = uid.toLowerCase();
      const member = humanMembers.find((m) => m.id.toLowerCase() === uidLower);
      if (member) {
        const idx = humanMembers.findIndex((m) => m.id.toLowerCase() === uidLower);
        userHoursArr[idx] = (userHoursArr[idx] || 0) + log.timeSpent;
      }
    }
    const vals = userHoursArr.filter((h) => h > 0).sort((a, b) => a - b);
    const minH = vals.length > 0 ? vals[0] / 3600 : 0;
    const maxH = vals.length > 0 ? vals[vals.length - 1] / 3600 : 0;
    const effortMultiplier = minH > 0 ? maxH / minH : 0;
    const effortGap = maxH - minH;
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length / 3600 : 0;
    const variance = vals.length > 1
      ? vals.reduce((acc, v) => acc + ((v / 3600) - mean) ** 2, 0) / vals.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    return { effortMultiplier, effortGap, coefficientOfVariation };
  }, [timelogs, humanMembers]);

  const effColor = effortStats.effortMultiplier > 2.5 ? "#ef4444" : effortStats.effortMultiplier > 1.5 ? "#f59e0b" : "#22c55e";
  const gapColor = effortStats.effortGap > 40 ? "#ef4444" : effortStats.effortGap > 20 ? "#f59e0b" : "#22c55e";
  const cvColor = effortStats.coefficientOfVariation > 0.5 ? "#ef4444" : effortStats.coefficientOfVariation > 0.25 ? "#f59e0b" : "#22c55e";

  return (
    <Card>
      <CardHeader title="Summary" />
      <CardContent
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          gap: 2,
        }}
      >
        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Team Members" />
          <CardContent>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ fontSize: 18, fontWeight: "bold" }}>
                {humanMembers.length}
                {botMembers.length > 0 && (
                  <Box
                    sx={{
                      fontSize: "0.875rem",
                      fontWeight: "normal",
                      color: "text.secondary",
                    }}
                  >
                    + {botMembers.length} SA
                  </Box>
                )}
              </Box>
              <AvatarGroup
                max={8}
                sx={{
                  "& .MuiAvatar-root": {
                    width: 28,
                    height: 28,
                    fontSize: "0.7rem",
                  },
                }}
              >
                {humanMembers.map((member) => (
                  <Tooltip key={member.id} title={member.name} arrow>
                    <div onClick={() => openProfile(member.id)} style={{ cursor: "pointer" }}>
                      <UserAvatar
                        member={member}
                        size="small"
                        showTooltip={false}
                        sx={{ width: 28, height: 28 }}
                      />
                    </div>
                  </Tooltip>
                ))}
                {botMembers.map((member) => (
                  <Tooltip
                    key={member.id}
                    title={`${member.name} (service account)`}
                    arrow
                  >
                    <div onClick={() => openProfile(member.id)} style={{ cursor: "pointer" }}>
                      <UserAvatar
                        member={member}
                        size="small"
                        showTooltip={false}
                        sx={{ width: 28, height: 28 }}
                      />
                    </div>
                  </Tooltip>
                ))}
              </AvatarGroup>
            </Box>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Total Cycles" />
          <CardContent
            sx={{ textAlign: "right", fontWeight: "bold", fontSize: 18 }}
          >
            {totalSprints}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Total Time" />
          <CardContent sx={{ textAlign: "right" }}>
            <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>
              {totalHours.toFixed(0)}h
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Averages" />
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  Mean
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>
                  {meanHours.toFixed(1)}h
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  Weeks
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>
                  {workWeeks.toFixed(1)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  /Cycle
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>
                  {totalSprints > 0 ? `${(totalHours / totalSprints).toFixed(0)}h` : "N/A"}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Effort Dispersion" />
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  Effort
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2, color: effColor }}>
                  {effortStats.effortMultiplier.toFixed(1)}×
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  Δ h
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2, color: gapColor }}>
                  {effortStats.effortGap.toFixed(1)}h
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", fontWeight: 600, display: "block" }}>
                  CV
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2, color: cvColor }}>
                  {effortStats.coefficientOfVariation.toFixed(2)}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ p: 1, m: 0 }}>
          <CardHeader title="Focus" />
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", fontWeight: 600, display: "block" }}>
                  Last Cycle
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2 }}>
                  {focusLastSprint || "N/A"}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", fontWeight: 600, display: "block" }}>
                  This Cycle
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2 }}>
                  {focusThisSprint || "N/A"}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
