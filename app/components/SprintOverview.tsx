"use client";
import React from "react";
import { GroupContext } from "../GroupContext";
import Box from "@mui/material/Box";
import {
  Card,
  CardContent,
  CardHeader,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Accordion,
  AccordionSummary,
  Typography,
  AccordionDetails,
  useMediaQuery,
  useTheme,
  Chip,
} from "@mui/material";
import type { GroupTimelogsResponse } from "../types/group";
import { matchLabelToCategory } from "../utils/categoryUtils";
import { CATEGORY_DEFINITIONS } from "../config/categories";
import Label from "./Label";
import { UserAvatar } from "./UserAvatar";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import IssueDetailModal from "./IssueDetailModal";
import MergeRequestDetailModal from "./MergeRequestDetailModal";
import { useUserProfile } from "../UserProfileContext";
import { createSprintOverviewSvg } from "../utils/sprintSvg";


export default function SprintOverview() {
  const {
    sprints,
    timelogs,
    members,
    labels,
    groupId,
    selectedSprint,
    setSelectedSprint,
    mergeRequests,
  } = React.useContext(GroupContext);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));

  const [selectedIssueUrl, setSelectedIssueUrl] = React.useState<string | null>(null);
  const [selectedIssueTitle, setSelectedIssueTitle] = React.useState<string>("");
  const [selectedMrUrl, setSelectedMrUrl] = React.useState<string | null>(null);
  const { openProfile } = useUserProfile();

  const categoryColumns = [
    ...CATEGORY_DEFINITIONS.map((d) => ({ id: d.id, title: d.label })),
    { id: "other", title: "Other" },
  ];

  // Build a map: memberId -> column -> timeSpent (seconds)
  const tableData: Record<string, Record<string, number>> = {};

  members
    .filter((m) => !m.bot && m.verified)
    .forEach((m) => {
      tableData[m.id] = {};
      categoryColumns.forEach((c) => {
        tableData[m.id][c.id] = 0;
      });
      tableData[m.id]["__sum"] = 0;
    });

  // Helper: determine if a timelog belongs to the selected sprint
  const inSelectedSprint = (log: GroupTimelogsResponse[number]) =>
    log.sprintNumber === selectedSprint ||
    selectedSprint === 1000 ||
    (selectedSprint &&
      selectedSprint >= 10000 &&
      log.spentAt.startsWith((selectedSprint - 10000).toString()));

  timelogs.forEach((logRaw) => {
    const log = logRaw as GroupTimelogsResponse[number];
    if (!inSelectedSprint(log)) return;
    const memberId = log.username || "unknown";
    if (!tableData[memberId]) {
      tableData[memberId] = {};
      categoryColumns.forEach((c) => {
        tableData[memberId][c.id] = 0;
      });
      tableData[memberId]["__sum"] = 0;
    }

    let assignedColumn = "other";
    for (const label of log.issueLabels || []) {
      const catDef = matchLabelToCategory(label);
      if (catDef) {
        assignedColumn = catDef.id;
        break;
      }
    }

    if (!tableData[memberId][assignedColumn])
      tableData[memberId][assignedColumn] = 0;
    tableData[memberId][assignedColumn] += log.timeSpent;
    tableData[memberId]["__sum"] += log.timeSpent;
  });

  // Column sums
  const columnSums: Record<string, number> = {};
  categoryColumns.forEach((g) => {
    columnSums[g.id] = 0;
  });
  columnSums["__sum"] = 0;

  Object.values(tableData).forEach((groupMap) => {
    categoryColumns.forEach((g) => {
      columnSums[g.id] = (columnSums[g.id] || 0) + (groupMap[g.id] || 0);
    });
    columnSums["__sum"] += groupMap["__sum"] || 0;
  });

  // Remove Other column when empty (unconditional — no toggle needed)
  if (columnSums["other"] === 0) {
    const index = categoryColumns.findIndex((c) => c.id === "other");
    if (index > -1) {
      categoryColumns.splice(index, 1);
      delete columnSums["other"];
      Object.keys(tableData).forEach((memberId) => {
        delete tableData[memberId]["other"];
      });
    }
  }

  const visibleColumns = categoryColumns;

  const handleDownloadSvg = () => {
    if (selectedSprint === null) return;

    const rows = Object.keys(tableData).map((memberId) => ({
      name: members.find((member) => member.id === memberId)?.name || memberId,
      seconds: visibleColumns.map(
        (column) => tableData[memberId][column.id] || 0,
      ),
    }));
    const sprintLabel =
      selectedSprint === 1000
        ? "All timelogs"
        : selectedSprint >= 10000
          ? `Year ${selectedSprint - 10000}`
          : `Sprint ${selectedSprint}`;
    const svg = createSprintOverviewSvg(
      `${groupId} - ${sprintLabel}`,
      visibleColumns,
      rows,
    );
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    const svgWindow = window.open(url, "_blank");
    if (!svgWindow) {
      URL.revokeObjectURL(url);
      window.alert("Allow pop-ups to open the sprint overview SVG in a new tab.");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const sprintIssues = React.useMemo(() => {
    if (selectedSprint === null) return {};
    if (selectedSprint === 1000) {
      const issuesMap: Record<
        string,
        { title: string; url: string; timelogs: GroupTimelogsResponse }
      > = {};
      timelogs.forEach((log) => {
        if (!issuesMap[log.issueUrl]) {
          issuesMap[log.issueUrl] = {
            title: log.issueTitle,
            url: log.issueUrl,
            timelogs: [],
          };
        }
        issuesMap[log.issueUrl].timelogs.push(log);
      });
      return issuesMap;
    }
    const timelogsInSprint = timelogs.filter(
      (log) => log.sprintNumber === selectedSprint,
    ) as GroupTimelogsResponse;
    const issuesMap: Record<
      string,
      { title: string; url: string; timelogs: GroupTimelogsResponse }
    > = {};
    timelogsInSprint.forEach((log) => {
      if (!issuesMap[log.issueUrl]) {
        issuesMap[log.issueUrl] = {
          title: log.issueTitle,
          url: log.issueUrl,
          timelogs: [],
        };
      }
      issuesMap[log.issueUrl].timelogs.push(log);
    });
    return issuesMap;
  }, [timelogs, selectedSprint]);

  const sprintMergeRequests = React.useMemo(() => {
    if (selectedSprint === null) return [];
    if (selectedSprint === 1000) {
      return mergeRequests;
    }
    const currentSprint = sprints.find((s) => s.sprintNumber === selectedSprint);
    if (!currentSprint) return [];

    const cycleStart = currentSprint.startDate;
    const cycleEnd = currentSprint.endDate;

    return mergeRequests.filter((mr) => {
      const created = mr.createdAt.slice(0, 10);
      const merged = mr.mergedAt ? mr.mergedAt.slice(0, 10) : null;
      const closed = mr.closedAt ? mr.closedAt.slice(0, 10) : null;
      return created <= cycleEnd && 
             (merged === null || merged >= cycleStart) && 
             (closed === null || closed >= cycleStart);
    });
  }, [mergeRequests, sprints, selectedSprint]);

  return (
    <Card>
      <CardHeader title="Cycle Overview" />
       <CardContent sx={{ overflowX: "auto" }}>
         <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
           {!isMobile && (
             <IconButton
               size="small"
               onClick={handleDownloadSvg}
               disabled={selectedSprint === null}
               aria-label="Open sprint overview as SVG in a new tab"
               title="Open sprint overview as SVG in a new tab"
             >
               <DownloadIcon />
             </IconButton>
           )}

         </Box>

         {isMobile ? (
           // Mobile card-based layout
           <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
             {Object.keys(tableData).map((memberId) => {
               const member = members.find((m) => m.id === memberId);
               const memberTotal = (tableData[memberId]["__sum"] || 0) / 3600;

               // Skip members with 0 time on mobile
               if (memberTotal === 0) return null;

               return (
                  <Card key={memberId} sx={{ p: 1.5, backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)" }}>
                   <Box
                     sx={{
                       display: "flex",
                       alignItems: "center",
                       gap: 1,
                       mb: 1,
                       cursor: "pointer",
                       "&:hover": { color: "primary.light" },
                     }}
                     onClick={() => openProfile(memberId)}
                   >
                     {member && (
                       <UserAvatar member={member} size="small" showTooltip={false} />
                     )}
                     <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>
                       {member ? member.name : memberId}
                     </Typography>
                     <Typography sx={{ ml: "auto", fontWeight: 600, fontSize: "0.9rem" }}>
                       {memberTotal.toFixed(1)}h
                     </Typography>
                   </Box>
                   <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                     {visibleColumns.map((col) => (
                       <Box key={col.id}>
                         <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                           {col.title}
                         </Typography>
                         <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                           {((tableData[memberId][col.id] || 0) / 3600).toFixed(1)}h
                         </Typography>
                       </Box>
                     ))}
                   </Box>
                 </Card>
               );
             })}
             {/* Mobile totals card */}
              <Card sx={{ p: 1.5, backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)", border: "1px solid var(--border-color)" }}>
               <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", mb: 1 }}>
                 Total
               </Typography>
               <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                 {visibleColumns.map((col) => (
                   <Box key={col.id}>
                     <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                       {col.title}
                     </Typography>
                     <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                       {(columnSums[col.id] / 3600).toFixed(1)}h
                     </Typography>
                   </Box>
                 ))}
               </Box>
             </Card>
           </Box>
         ) : (
           // Desktop/tablet table layout
           <Table size="small">
             <TableHead>
               <TableRow>
                 <TableCell />
                 {visibleColumns.map((col) => (
                   <TableCell key={col.id} align="right">
                     {col.title}
                   </TableCell>
                 ))}
                 <TableCell align="right">Sum (hrs)</TableCell>
               </TableRow>
             </TableHead>
             <TableBody>
               {Object.keys(tableData).map((memberId) => {
                 const member = members.find((m) => m.id === memberId);
                 return (
                   <TableRow key={memberId}>
                     <TableCell
                       onClick={() => openProfile(memberId)}
                       sx={{ cursor: "pointer", "&:hover": { color: "primary.light" } }}
                     >
                       <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                         {member && (
                           <UserAvatar member={member} size="small" showTooltip={false} />
                         )}
                         <span>{member ? member.name : memberId}</span>
                       </Box>
                     </TableCell>
                     {visibleColumns.map((col) => (
                       <TableCell key={col.id} align="right">
                         {((tableData[memberId][col.id] || 0) / 3600).toFixed(2)}
                       </TableCell>
                     ))}
                     <TableCell align="right">
                       {((tableData[memberId]["__sum"] || 0) / 3600).toFixed(2)}
                     </TableCell>
                   </TableRow>
                 );
               })}

               {/* Totals row */}
               <TableRow>
                 <TableCell style={{ fontWeight: "bold" }}>Total</TableCell>
                 {visibleColumns.map((col) => (
                   <TableCell key={col.id} align="right" style={{ fontWeight: "bold" }}>
                     {(columnSums[col.id] / 3600).toFixed(2)}
                   </TableCell>
                 ))}
                 <TableCell align="right" style={{ fontWeight: "bold" }}>
                   {(columnSums["__sum"] / 3600).toFixed(2)}
                 </TableCell>
               </TableRow>
             </TableBody>
           </Table>
         )}

        <Accordion>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="panel2-content"
            id="panel2-header"
          >
            <Typography component="span">Issues</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {selectedSprint !== null ? (
                Object.values(sprintIssues).map((issue) => {
                  const logged = issue.timelogs.reduce(
                    (sum, log) => sum + log.timeSpent,
                    0,
                  );
                  const loggedTotal = timelogs.reduce(
                    (sum, log) =>
                      log.issueUrl === issue.url ? sum + log.timeSpent : sum,
                    0,
                  );
                  const estimate = issue.timelogs[0]?.issueTimeEstimate || 0;
                  const deviationPercent =
                    estimate > 0
                      ? (((loggedTotal - estimate) / estimate) * 100).toFixed(2)
                      : "N/A";

                  return (
                    <Card
                      key={issue.url}
                      onClick={() => {
                        setSelectedIssueUrl(issue.url);
                        setSelectedIssueTitle(issue.title);
                      }}
                      sx={{
                        mb: 1,
                        p: 1.5,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        "&:hover": {
                          boxShadow: 2,
                          transform: "translateY(-2px)",
                           backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)",
                        },
                      }}
                    >
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                        {/* Title and Workers Row */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            sx={{
                              fontSize: "1.1rem",
                              fontWeight: 600,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {issue.title}
                          </Typography>
                          <Box sx={{ display: "flex", gap: 0.25, alignItems: "center" }}>
                            {(() => {
                              // Get unique users who worked on this issue
                              const usersOnIssue = [
                                ...new Set(issue.timelogs.map((log) => log.username)),
                              ];
                              return usersOnIssue.slice(0, 4).map((username) => {
                                const member = members.find(
                                  (m) => m.id === username
                                );
                                return member ? (
                                  <Box
                                    key={username}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openProfile(username);
                                    }}
                                    sx={{ cursor: "pointer" }}
                                  >
                                    <UserAvatar
                                      member={member}
                                      size="small"
                                      showTooltip={true}
                                      sx={{ width: 20, height: 20 }}
                                    />
                                  </Box>
                                ) : null;
                              });
                            })()}
                          </Box>
                        </Box>

                         {/* Time and Deviation Row */}
                         <Box
                           sx={{
                             display: "grid",
                             gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
                             gap: 1,
                              fontSize: "0.8rem",
                              color: "text.primary",
                              opacity: 0.85,
                           }}
                         >
                           <Box>
                              <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>Cycle</span>
                             <div style={{ fontWeight: 600 }}>
                               {(logged / 3600).toFixed(1)}h
                             </div>
                           </Box>
                           <Box>
                              <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>Total</span>
                             <div style={{ fontWeight: 600 }}>
                               {(loggedTotal / 3600).toFixed(1)}h
                             </div>
                           </Box>
                           {!isMobile && (
                             <Box>
                                <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>Estimate</span>
                               <div style={{ fontWeight: 600 }}>
                                 {(estimate / 3600).toFixed(1)}h
                               </div>
                             </Box>
                           )}
                         </Box>

                         {/* Deviation and Labels Row */}
                         <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                           <Box sx={{ fontSize: "0.8rem" }}>
                              <span style={{ color: theme.palette.text.secondary, opacity: 0.8 }}>Deviation: </span>
                             <span
                               style={{
                                 fontWeight: "bold",
                                   color:
                                    deviationPercent === "N/A"
                                      ? "text.secondary"
                                     : (() => {
                                         const deviation = Number(deviationPercent);
                                         const thresholdBad = 20;
                                         const thresholdGood = 5;
                                         let t = 0;
                                         if (Math.abs(deviation) >= thresholdBad) {
                                           t = 1;
                                         } else if (Math.abs(deviation) <= thresholdGood) {
                                           t = 0;
                                         } else {
                                           t =
                                             (Math.abs(deviation) - thresholdGood) /
                                             (thresholdBad - thresholdGood);
                                         }
                                         const green = { r: 56, g: 142, b: 60 };
                                         const red = { r: 211, g: 47, b: 47 };
                                         const colorR = Math.round(
                                           green.r + (red.r - green.r) * t
                                         );
                                         const colorG = Math.round(
                                           green.g + (red.g - green.g) * t
                                         );
                                         const colorB = Math.round(
                                           green.b + (red.b - green.b) * t
                                         );
                                         return `rgb(${colorR},${colorG},${colorB})`;
                                       })(),
                               }}
                             >
                               {deviationPercent}%
                             </span>
                           </Box>
                           <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                             {(issue.timelogs[0]?.issueLabels || []).slice(0, isMobile ? 2 : 3).map((label) => (
                               <Label
                                 key={label}
                                 name={label}
                                 color={
                                   Object.values(labels || {})
                                     .flat()
                                     .find((l) => l.id === label)?.color || "#428fdc"
                                 }
                               />
                             ))}
                           </Box>
                         </Box>
                      </Box>
                    </Card>
                  );
                })
                ) : (
                  <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
                    No cycle selected
                  </Box>
                )}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion sx={{ mt: 2 }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="panel3-content"
            id="panel3-header"
          >
            <Typography component="span">Merge Requests</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {selectedSprint !== null ? (
                sprintMergeRequests.map((mr) => {
                  const authorMember = members.find((m) => m.id === mr.username);
                  const stateLower = mr.state.toLowerCase();
                  
                  let stateColor = "text.secondary";
                  if (stateLower === "opened") stateColor = "info.main";
                  else if (stateLower === "merged") stateColor = "success.main";
                  else if (stateLower === "closed") stateColor = "error.main";

                  return (
                    <Card
                      key={mr.webUrl}
                      onClick={() => {
                        setSelectedMrUrl(mr.webUrl);
                      }}
                      sx={{
                        mb: 1,
                        p: 1.5,
                        cursor: "pointer",
                        borderLeft: `4px solid ${
                          stateLower === "opened"
                            ? theme.palette.info.main
                            : stateLower === "merged"
                            ? theme.palette.success.main
                            : theme.palette.error.main
                        }`,
                        transition: "all 0.2s ease",
                        "&:hover": {
                          boxShadow: 2,
                          transform: "translateY(-2px)",
                          backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)",
                        },
                      }}
                    >
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            sx={{
                              fontSize: "1.1rem",
                              fontWeight: 600,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {mr.title}
                          </Typography>
                          {authorMember && (
                            <UserAvatar
                              member={authorMember}
                              size="small"
                              showTooltip={true}
                              sx={{ width: 20, height: 20 }}
                            />
                          )}
                        </Box>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 1,
                            fontSize: "0.8rem",
                            color: "text.primary",
                            opacity: 0.85,
                          }}
                        >
                          <Box>
                            <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>State</span>
                            <div style={{ fontWeight: 700, color: stateColor }}>
                              {mr.state.toUpperCase()}
                            </div>
                          </Box>
                          <Box>
                            <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>Target Branch</span>
                            <div style={{ fontWeight: 600 }}>
                              {mr.targetBranch}
                            </div>
                          </Box>
                          <Box>
                            <span style={{ color: theme.palette.text.secondary, opacity: 0.8, fontSize: "0.7rem" }}>Approvals</span>
                            <div style={{ fontWeight: 600 }}>
                              {mr.approvedBy.length}
                            </div>
                          </Box>
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                            Created: {new Date(mr.createdAt).toLocaleDateString()}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {mr.additions !== undefined && mr.deletions !== undefined && mr.additions !== null && mr.deletions !== null && (
                              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, mr: 1 }}>
                                <span style={{ color: "#2da44e" }}>+{mr.additions}</span>{" "}
                                <span style={{ color: "#cf222e" }}>-{mr.deletions}</span>
                              </Typography>
                            )}
                            {mr.discussionCount > 0 && (
                              <Chip
                                label={`${mr.discussionCount} comments`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: "0.7rem", height: 20 }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </Card>
                  );
                })
              ) : (
                <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
                  No cycle selected
                </Box>
              )}
              {selectedSprint !== null && sprintMergeRequests.length === 0 && (
                <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
                  No merge requests found for this cycle
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      </CardContent>
      {selectedIssueUrl && (
        <IssueDetailModal
          open={!!selectedIssueUrl}
          onClose={() => setSelectedIssueUrl(null)}
          issueUrl={selectedIssueUrl}
          issueTitle={selectedIssueTitle}
        />
      )}
      {selectedMrUrl && (
        <MergeRequestDetailModal
          open={!!selectedMrUrl}
          onClose={() => setSelectedMrUrl(null)}
          mrUrl={selectedMrUrl}
        />
      )}
    </Card>
  );
}
