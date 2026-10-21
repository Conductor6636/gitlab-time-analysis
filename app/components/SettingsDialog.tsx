"use client";
import { Login, Logout, Palette } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useThemeMode } from "../ThemeContext";
import { useUserAuth } from "../UserAuthContext";

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { user, login, logout } = useUserAuth();
  const { colorTheme, setColorTheme } = useThemeMode();

  const [themeInput, setThemeInput] = useState(colorTheme);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync themeInput with colorTheme if it changes from outside or on reopen
  useEffect(() => {
    if (open) {
      setThemeInput(colorTheme);
      setError(null);
      setSuccess(false);
    }
  }, [open, colorTheme]);

  const handleLogin = async () => {
    setError(null);
    try {
      await login();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start GitLab login",
      );
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      setColorTheme(themeInput);
      setSuccess(true);
      window.setTimeout(onClose, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Settings</DialogTitle>
      <form onSubmit={handleSave}>
        <DialogContent>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 1, color: "primary.main" }}
          >
            GitLab Authentication
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in with GitLab to authorize access to your account. Your OAuth
            session is kept in this browser tab.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3 }}>
              Successfully saved settings!
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {user ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Typography variant="body2">
                  Signed in as <strong>{user.username}</strong>
                </Typography>
                <Button
                  color="inherit"
                  startIcon={<Logout />}
                  onClick={logout}
                  disabled={loading}
                >
                  Sign out
                </Button>
              </Box>
            ) : (
              <Button
                variant="outlined"
                startIcon={<Login />}
                onClick={handleLogin}
                disabled={loading}
              >
                Sign in with GitLab
              </Button>
            )}

            <Divider sx={{ my: 1.5 }} />

            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, color: "primary.main" }}
            >
              Appearance Accent Theme
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Choose a color theme preset that adjusts core app accents and
              category colors.
            </Typography>

            <FormControl fullWidth disabled={loading}>
              <InputLabel id="theme-select-label">
                Color Theme Preset
              </InputLabel>
              <Select
                labelId="theme-select-label"
                id="theme-select"
                value={themeInput}
                label="Color Theme Preset"
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "default" ||
                    value === "dhbw" ||
                    value === "green" ||
                    value === "purple"
                  ) {
                    setThemeInput(value);
                  }
                }}
                startAdornment={
                  <InputAdornment position="start">
                    <Palette
                      fontSize="small"
                      color="action"
                      style={{ marginRight: 8 }}
                    />
                  </InputAdornment>
                }
              >
                <MenuItem value="default">Default (Amethyst / Violet)</MenuItem>
                <MenuItem value="dhbw">DHBW Theme (Crimson Red)</MenuItem>
                <MenuItem value="green">Emerald Green</MenuItem>
                <MenuItem value="purple">Royal Purple</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ minWidth: 100 }}
          >
            Save Settings
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
