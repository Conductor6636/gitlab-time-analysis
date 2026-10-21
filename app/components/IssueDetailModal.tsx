"use client";
import React, { useState, useEffect, useContext } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
  IconButton,
  CircularProgress,
  Autocomplete,
  TextField,
  Alert,
  Avatar,
  MenuItem,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Close, OpenInNew, Edit, Save, Label as LabelIcon } from "@mui/icons-material";
import { GroupContext } from "../GroupContext";
import { useUserAuth } from "../UserAuthContext";
import { updateGitLabIssue, updateGitLabIssueLabels } from "../gitlab/client";
import { UserAvatar } from "./UserAvatar";
import Label from "./Label";

type IssueDetailModalProps = {
  open: boolean;
  onClose: () => void;
  issueUrl: string;
  issueTitle: string;
};

export default function IssueDetailModal({
  open,
  onClose,
  issueUrl,
  issueTitle,
}: IssueDetailModalProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { timelogs, members, labels: groupLabelsMap, refreshData } = useContext(GroupContext);
  const { token } = useUserAuth();

  // Get all logs for this issue
  const issueLogs = React.useMemo(() => {
    return timelogs.filter((log) => log.issueUrl === issueUrl);
  }, [timelogs, issueUrl]);

  // Compute stats
  const totalLogged = React.useMemo(() => {
    return issueLogs.reduce((sum, log) => sum + log.timeSpent, 0);
  }, [issueLogs]);

  const issueState = React.useMemo(() => {
    return issueLogs[0]?.issueState || "UNKNOWN";
  }, [issueLogs]);

  const currentLabels = React.useMemo(() => {
    return issueLogs[0]?.issueLabels || [];
  }, [issueLogs]);

  const [isEditingLabels, setIsEditingLabels] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [savingLabels, setSavingLabels] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const [updatingState, setUpdatingState] = useState(false);
  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [newEstimateHours, setNewEstimateHours] = useState("");
  const [updatingEstimate, setUpdatingEstimate] = useState(false);

  // Initialize selected labels when edit mode is toggled
  useEffect(() => {
    if (isEditingLabels) {
      setSelectedLabels(currentLabels);
    }
    setLabelError(null);
  }, [isEditingLabels, currentLabels]);

  // Compute estimate
  const estimate = React.useMemo(() => {
    return issueLogs[0]?.issueTimeEstimate || 0;
  }, [issueLogs]);

  // Sync estimate to editing input state
  useEffect(() => {
    setNewEstimateHours(estimate > 0 ? (estimate / 3600).toString() : "");
  }, [estimate]);

  const handleToggleState = async () => {
    setUpdatingState(true);
    try {
      const nextEvent = issueState === "opened" ? "close" : "reopen";
      if (!token) throw new Error("Sign in with GitLab to edit issues");
      await updateGitLabIssue(token, issueUrl, { stateEvent: nextEvent });

      if (refreshData) {
        refreshData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update issue state");
    } finally {
      setUpdatingState(false);
    }
  };

  const handleSaveEstimate = async () => {
    setUpdatingEstimate(true);
    try {
      const hours = parseFloat(newEstimateHours);
      let estimateVal: number | string = 0;
      if (isNaN(hours) || hours <= 0) {
        estimateVal = "reset";
      } else {
        estimateVal = Math.round(hours * 3600); // convert to seconds
      }

      if (!token) throw new Error("Sign in with GitLab to edit issues");
      await updateGitLabIssue(token, issueUrl, { estimate: estimateVal });

      setIsEditingEstimate(false);
      if (refreshData) {
        refreshData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update estimate");
    } finally {
      setUpdatingEstimate(false);
    }
  };

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    setLabelError(null);
    try {
      if (!token) throw new Error("Sign in with GitLab to edit issues");
      await updateGitLabIssueLabels(token, issueUrl, selectedLabels);

      // Success
      setIsEditingLabels(false);
      // Refresh the context data
      if (refreshData) {
        refreshData();
      }
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : "Failed to save labels");
    } finally {
      setSavingLabels(false);
    }
  };

  const progressPercent = estimate > 0 ? Math.min((totalLogged / estimate) * 100, 100) : 0;
  const progressColor = totalLogged > estimate && estimate > 0 ? "error" : "primary";

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Issue Details
          </Typography>
          <Chip
            label={issueState}
            size="small"
            color={issueState === "opened" ? "success" : "default"}
            variant="outlined"
            sx={{ textTransform: "uppercase", fontSize: "0.65rem", fontWeight: 700 }}
          />
          {token && (
            <Button
              size="small"
              onClick={handleToggleState}
              disabled={updatingState}
              variant="outlined"
              color={issueState === "opened" ? "warning" : "success"}
              sx={{ fontSize: "0.7rem", py: 0.25, px: 1, height: 24, textTransform: "none", fontWeight: 700 }}
              startIcon={updatingState ? <CircularProgress size={12} /> : null}
            >
              {issueState === "opened" ? "Close Issue" : "Reopen Issue"}
            </Button>
          )}
        </Box>
        <Box>
          <IconButton
            component="a"
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{ mr: 1 }}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 650, color: "text.primary" }}>
          {issueTitle}
        </Typography>

        {/* Labels Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <LabelIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Labels
            </Typography>
            {token && !isEditingLabels && (
              <IconButton size="small" onClick={() => setIsEditingLabels(true)}>
                <Edit fontSize="small" />
              </IconButton>
            )}
          </Box>

          {isEditingLabels ? (
            <Box sx={{ mt: 1.5 }}>
              {labelError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {labelError}
                </Alert>
              )}
              {/* Grouped Labels Dropdowns */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
                {groupLabelsMap &&
                  Object.entries(groupLabelsMap).map(([groupName, labelsInGroup]) => {
                    if (groupName === "Ungrouped") return null;

                    // Find current selected label from this group
                    const currentValue = selectedLabels.find((l) => l.startsWith(groupName + "::")) || "";

                    return (
                      <TextField
                        key={groupName}
                        select
                        label={groupName}
                        value={currentValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          const filtered = selectedLabels.filter((l) => !l.startsWith(groupName + "::"));
                          if (val) {
                            setSelectedLabels([...filtered, val]);
                          } else {
                            setSelectedLabels(filtered);
                          }
                        }}
                        fullWidth
                        variant="outlined"
                        size="small"
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {labelsInGroup.map((label) => (
                          <MenuItem key={label.id} value={label.id}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: label.color }} />
                              {label.title}
                            </Box>
                          </MenuItem>
                        ))}
                      </TextField>
                    );
                  })}
              </Box>

              {/* Ungrouped Labels Multi-Select */}
              {groupLabelsMap && groupLabelsMap["Ungrouped"] && groupLabelsMap["Ungrouped"].length > 0 && (
                <Autocomplete
                  multiple
                  size="small"
                  options={groupLabelsMap["Ungrouped"].map((l) => l.id)}
                  value={selectedLabels.filter((l) => l.startsWith("Ungrouped::"))}
                  onChange={(_, newValue) => {
                    const filtered = selectedLabels.filter((l) => !l.startsWith("Ungrouped::"));
                    setSelectedLabels([...filtered, ...newValue]);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} variant="outlined" label="Ungrouped Labels" placeholder="Select labels..." />
                  )}
                  getOptionLabel={(option) => {
                    const found = groupLabelsMap["Ungrouped"].find((l) => l.id === option);
                    return found ? found.title : option;
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const found = groupLabelsMap["Ungrouped"].find((g) => g.id === option);
                      const color = found ? found.color : "#6b7280";
                      const labelText = found ? found.title : option;
                      return (
                        <Chip
                          label={labelText}
                          {...getTagProps({ index })}
                          size="small"
                          sx={{
                            bgcolor: color,
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                          }}
                        />
                      );
                    })
                  }
                />
              )}

              <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
                <Button size="small" color="inherit" onClick={() => setIsEditingLabels(false)}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={savingLabels ? <CircularProgress size={16} /> : <Save />}
                  onClick={handleSaveLabels}
                  disabled={savingLabels}
                >
                  Save Labels
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
              {currentLabels.map((l) => {
                let color = "#428fdc";
                if (groupLabelsMap) {
                  const found = Object.values(groupLabelsMap)
                    .flat()
                    .find((g) => g.id === l);
                  if (found) color = found.color;
                }
                return <Label key={l} name={l} color={color} />;
              })}
              {currentLabels.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  No labels assigned
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2.5 }} />

        {/* Time Progress */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Time Progress
              </Typography>
              {token && !isEditingEstimate && (
                <IconButton
                  size="small"
                  onClick={() => {
                    setNewEstimateHours(estimate > 0 ? (estimate / 3600).toString() : "");
                    setIsEditingEstimate(true);
                  }}
                >
                  <Edit fontSize="small" />
                </IconButton>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {(totalLogged / 3600).toFixed(1)}h logged
              {estimate > 0 && ` of ${(estimate / 3600).toFixed(1)}h estimate`}
            </Typography>
          </Box>

          {isEditingEstimate ? (
            <Box sx={{ mt: 1.5, mb: 1.5, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <TextField
                size="small"
                label="Estimate (hours)"
                placeholder="e.g. 8 (or leave empty to reset)"
                value={newEstimateHours}
                onChange={(e) => setNewEstimateHours(e.target.value)}
                sx={{ width: 240 }}
                type="number"
                inputProps={{ step: "any", min: "0" }}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSaveEstimate}
                  disabled={updatingEstimate}
                  startIcon={updatingEstimate ? <CircularProgress size={12} /> : null}
                >
                  Save
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => {
                    setNewEstimateHours(estimate > 0 ? (estimate / 3600).toString() : "");
                    setIsEditingEstimate(false);
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          ) : estimate > 0 ? (
            <>
              <LinearProgress
                variant="determinate"
                value={progressPercent}
                color={progressColor}
                sx={{ height: 10, borderRadius: 5, mb: 1 }}
              />
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="caption" color="text.secondary">
                  {progressPercent.toFixed(0)}% consumed
                </Typography>
                {totalLogged > estimate && (
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                    Over estimate by {((totalLogged - estimate) / 3600).toFixed(1)}h
                  </Typography>
                )}
              </Box>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontStyle: "italic" }}>
              No estimate set for this issue.
            </Typography>
          )}
        </Box>

        {/* Timelog Timeline */}
        <Typography variant="subtitle2" sx={{ fontWeight: 650, mb: 1.5 }}>
          Time Logs Timeline
        </Typography>
        <List disablePadding>
          {issueLogs.map((log, index) => {
            const member = members.find((m) => m.id === log.username);
            return (
              <React.Fragment key={log.id}>
                <ListItem sx={{ py: 1.5, px: 0 }}>
                  <Box sx={{ mr: 2 }}>
                    {member ? (
                      <UserAvatar member={member} size="small" showTooltip={true} />
                    ) : (
                      <Avatar sx={{ width: 28, height: 28, fontSize: "0.8rem" }}>
                        {log.username?.charAt(0).toUpperCase() || "?"}
                      </Avatar>
                    )}
                  </Box>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {member ? member.name : log.username || "Unknown"}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.light" }}>
                          +{(log.timeSpent / 3600).toFixed(2)}h
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        Logged on {new Date(log.spentAt).toLocaleString()}
                        {log.sprintNumber && ` • Sprint ${log.sprintNumber}`}
                      </Typography>
                    }
                  />
                </ListItem>
                {index < issueLogs.length - 1 && <Divider component="li" sx={{ opacity: 0.5 }} />}
              </React.Fragment>
            );
          })}
          {issueLogs.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", py: 2, textAlign: "center" }}>
              No timelogs found for this issue
            </Typography>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
