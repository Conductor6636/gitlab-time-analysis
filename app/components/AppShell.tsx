"use client";
import React, { useState, useEffect } from "react";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Button,
  IconButton,
  Divider,
  useMediaQuery,
  useTheme,
  Tooltip,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard,
  Settings,
  Logout,
  Group,
  ChevronLeft,
  ChevronRight,
  AutoGraph,
  Login,
  LightMode,
  DarkMode,
  SettingsBrightness,
  Tv as TvIcon,
} from "@mui/icons-material";
import { useUserAuth } from "../UserAuthContext";
import { useThemeMode } from "../ThemeContext";
import { useUserProfile } from "../UserProfileContext";
import SettingsDialog from "./SettingsDialog";
import UserDetailModal from "./UserDetailModal";
import type { GroupResponse } from "../types/analytics";
import { getGroups } from "../gitlab/client";
import {
  groupRouteHref,
  handleGroupRouteClick,
  useClientGroupRoute,
} from "../ClientRoute";

const drawerWidth = 260;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const currentGroupId = useClientGroupRoute() || "";
  const isHome = !currentGroupId;
  const { user, logout, token, loading } = useUserAuth();
  const { themeMode, setThemeMode, presentationMode, setPresentationMode } = useThemeMode();
  const { openProfile, profileUsername, closeProfile } = useUserProfile();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [themeAnchorEl, setThemeAnchorEl] = useState<null | HTMLElement>(null);
  const [groups, setGroups] = useState<GroupResponse>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Collapsible sidebar state
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved) {
      setCollapsed(saved === "true");
    }
  }, []);

  const handleSidebarCollapse = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem("sidebarCollapsed", String(val));
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  // Fetch groups list for sidebar navigation
  useEffect(() => {
    if (loading) return; // Wait until authentication state is loaded
    if (!token) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }
    const fetchGroups = async () => {
      setGroupsLoading(true);
      try {
        const { data } = await getGroups(token);
        setGroups(data);
      } catch (err) {
        console.error("Failed to load groups in sidebar:", err);
      } finally {
        setGroupsLoading(false);
      }
    };
    fetchGroups();
  }, [token, loading]);

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

  useEffect(() => {
    const handleFullscreen = () => {
      setPresentationMode(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, [setPresentationMode]);

  const currentDrawerWidth = presentationMode ? 0 : (collapsed ? 72 : 260);

  const sidebarContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "var(--background-sidebar)", transition: "background-color 0.2s ease, border-color 0.2s ease" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          p: collapsed ? 2 : 2.5,
          borderBottom: "1px solid var(--border-color)",
          height: 64,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <AutoGraph color="primary" sx={{ fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, color: "text.primary", fontSize: "1.1rem" }}>
              GitLab Analytics
            </Typography>
          </Box>
        )}
        {collapsed && <AutoGraph color="primary" sx={{ fontSize: 28 }} />}
        {!isMobile && (
          <IconButton onClick={() => handleSidebarCollapse(!collapsed)} size="small" sx={{ color: "text.secondary" }}>
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        )}
      </Box>
      
      <List sx={{ px: 1.5, py: 2 }}>
        <ListItem disablePadding>
          {collapsed ? (
            <Tooltip title="Group Comparison" placement="right" arrow>
              <ListItemButton
                component="a"
                href="/"
                selected={isHome}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  justifyContent: "center",
                  minHeight: 48,
                  "&.Mui-selected": {
                    bgcolor: "primary.dark",
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: "auto", justifyContent: "center" }}>
                  <Dashboard sx={{ color: isHome ? "primary.contrastText" : "text.secondary" }} />
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          ) : (
            <ListItemButton
              component="a"
              href="/"
              selected={isHome}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "primary.dark",
                  "&:hover": { bgcolor: "primary.dark" },
                },
              }}
            >
              <ListItemIcon>
                <Dashboard sx={{ color: isHome ? "primary.contrastText" : "text.secondary" }} />
              </ListItemIcon>
              <ListItemText primary="Group Comparison" primaryTypographyProps={{ fontSize: "0.9rem", fontWeight: isHome ? 600 : 500 }} />
            </ListItemButton>
          )}
        </ListItem>
      </List>

      <Divider sx={{ mx: collapsed ? 1 : 2, opacity: 0.5 }} />

      {!collapsed && (
        <Box sx={{ px: 3, pt: 2, pb: 1 }}>
          <Typography variant="caption" sx={{ textTransform: "uppercase", fontWeight: 700, color: "text.secondary", fontSize: "0.7rem", letterSpacing: "0.05em" }}>
            Your Groups
          </Typography>
        </Box>
      )}

      <Box sx={{ flexGrow: 1, overflowY: "auto", px: 1.5, py: collapsed ? 2 : 0 }}>
        <List>
          {(() => {
            const topLevelGroups = groups.filter((g) => !g.parentId || g.level === 1);
            return topLevelGroups.map((group) => {
              const isSelected = currentGroupId === group.id;
              const initials = group.name.slice(0, 2).toUpperCase();
              const childSubgroups = groups.filter((g) => g.parentId === group.id);

              const groupItem = (
                <ListItemButton
                  component="a"
                  href={groupRouteHref(group.id)}
                  onClick={(event) => handleGroupRouteClick(event, group.id)}
                  selected={isSelected}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    justifyContent: collapsed ? "center" : "flex-start",
                    minHeight: 44,
                    px: collapsed ? 1 : 2,
                    "&.Mui-selected": {
                      bgcolor: "rgba(124, 58, 237, 0.15)",
                      color: "primary.light",
                      "& .MuiListItemIcon-root": { color: "primary.light" },
                      "&:hover": { bgcolor: "rgba(124, 58, 237, 0.2)" },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed ? "auto" : 36, justifyContent: "center" }}>
                    {collapsed ? (
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          bgcolor: isSelected ? "primary.main" : "rgba(124, 58, 237, 0.15)",
                          color: isSelected ? "primary.contrastText" : "primary.main",
                          border: isSelected ? "none" : "1px solid rgba(124, 58, 237, 0.2)",
                        }}
                      >
                        {initials}
                      </Avatar>
                    ) : (
                      <Group sx={{ fontSize: 20, color: isSelected ? "primary.light" : "text.secondary" }} />
                    )}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={group.name}
                      primaryTypographyProps={{
                        fontSize: "0.85rem",
                        fontWeight: isSelected ? 600 : 500,
                        noWrap: true,
                      }}
                    />
                  )}
                </ListItemButton>
              );

              return (
                <React.Fragment key={group.id}>
                  <ListItem disablePadding>
                    {collapsed ? (
                      <Tooltip title={group.name} placement="right" arrow>
                        {groupItem}
                      </Tooltip>
                    ) : (
                      groupItem
                    )}
                  </ListItem>

                  {/* Render child subgroups when sidebar is not collapsed */}
                  {!collapsed &&
                    childSubgroups.map((sub) => {
                      const isSubSelected = currentGroupId === sub.id;
                      return (
                        <ListItem key={sub.id} disablePadding sx={{ pl: 3 }}>
                          <ListItemButton
                            component="a"
                            href={groupRouteHref(sub.id)}
                            onClick={(event) => handleGroupRouteClick(event, sub.id)}
                            selected={isSubSelected}
                            sx={{
                              borderRadius: 1.5,
                              mb: 0.5,
                              minHeight: 34,
                              py: 0.5,
                              px: 1.5,
                              "&.Mui-selected": {
                                bgcolor: "rgba(124, 58, 237, 0.12)",
                                color: "primary.light",
                                "&:hover": { bgcolor: "rgba(124, 58, 237, 0.18)" },
                              },
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                mr: 1,
                                color: isSubSelected ? "primary.light" : "text.secondary",
                                fontWeight: 700,
                              }}
                            >
                              ↳
                            </Typography>
                            <ListItemText
                              primary={sub.name}
                              primaryTypographyProps={{
                                fontSize: "0.8rem",
                                fontWeight: isSubSelected ? 700 : 400,
                                noWrap: true,
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                </React.Fragment>
              );
            });
          })()}
          {groups.length === 0 && !groupsLoading && !collapsed && (
            <Typography variant="body2" sx={{ px: 2, py: 1, color: "text.secondary", fontStyle: "italic", fontSize: "0.8rem" }}>
              No groups found
            </Typography>
          )}
        </List>
      </Box>

      <Divider sx={{ mx: collapsed ? 1 : 2, opacity: 0.5 }} />

      <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
        {collapsed ? (
          <Tooltip title="Settings" placement="right" arrow>
            <IconButton
              onClick={() => setSettingsOpen(true)}
              sx={{
                color: "text.secondary",
                border: "1px solid var(--border-color)",
                bgcolor: "background.paper",
                "&:hover": {
                  borderColor: "primary.light",
                  color: "primary.light",
                },
              }}
            >
              <Settings />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            fullWidth
            variant="outlined"
            color="inherit"
            startIcon={<Settings />}
            onClick={() => setSettingsOpen(true)}
            sx={{
              borderColor: "var(--border-color)",
              color: "text.secondary",
              fontSize: "0.8rem",
              "&:hover": {
                borderColor: "primary.light",
                color: "primary.light",
              },
            }}
          >
            Settings
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "var(--background-default)", transition: "background-color 0.2s ease" }}>
      {/* Header Bar */}
      {!presentationMode && (
        <AppBar
          position="fixed"
          sx={{
            width: { md: `calc(100% - ${currentDrawerWidth}px)` },
            ml: { md: `${currentDrawerWidth}px` },
            transition: theme.transitions.create(["width", "margin"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            bgcolor: theme.palette.mode === "dark" ? "rgba(9, 13, 22, 0.7)" : "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            backgroundImage: "none",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 2, display: { md: "none" } }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, display: { xs: "none", sm: "block" } }}>
                {isHome ? "Dashboard Home" : `Active Group: ${currentGroupId}`}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {/* Theme Selector Button */}
              <Tooltip title="Theme mode">
                <IconButton
                  onClick={(e) => setThemeAnchorEl(e.currentTarget)}
                  size="small"
                  sx={{
                    color: "text.secondary",
                    border: "1px solid var(--border-color)",
                    borderRadius: 2,
                    p: 1,
                    bgcolor: "rgba(255,255,255,0.02)",
                    "&:hover": {
                      borderColor: "primary.light",
                      color: "primary.light",
                    },
                  }}
                >
                  {themeMode === "light" && <LightMode sx={{ fontSize: 20 }} />}
                  {themeMode === "dark" && <DarkMode sx={{ fontSize: 20 }} />}
                  {themeMode === "system" && <SettingsBrightness sx={{ fontSize: 20 }} />}
                </IconButton>
              </Tooltip>

              {/* Presentation Mode Button */}
              <Tooltip title="Presentation mode">
                <IconButton
                  onClick={togglePresentationMode}
                  size="small"
                  sx={{
                    color: "text.secondary",
                    border: "1px solid var(--border-color)",
                    borderRadius: 2,
                    p: 1,
                    bgcolor: "rgba(255,255,255,0.02)",
                    "&:hover": {
                      borderColor: "primary.light",
                      color: "primary.light",
                    },
                  }}
                >
                  <TvIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={themeAnchorEl}
                open={Boolean(themeAnchorEl)}
                onClose={() => setThemeAnchorEl(null)}
                slotProps={{
                  paper: {
                    sx: {
                      mt: 1.5,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      boxShadow: "var(--card-shadow)",
                    },
                  },
                }}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              >
                <MenuItem 
                  onClick={() => { setThemeMode("light"); setThemeAnchorEl(null); }}
                  selected={themeMode === "light"}
                  sx={{ gap: 1.5, fontSize: "0.85rem" }}
                >
                  <LightMode fontSize="small" /> Light
                </MenuItem>
                <MenuItem 
                  onClick={() => { setThemeMode("dark"); setThemeAnchorEl(null); }}
                  selected={themeMode === "dark"}
                  sx={{ gap: 1.5, fontSize: "0.85rem" }}
                >
                  <DarkMode fontSize="small" /> Dark
                </MenuItem>
                <MenuItem 
                  onClick={() => { setThemeMode("system"); setThemeAnchorEl(null); }}
                  selected={themeMode === "system"}
                  sx={{ gap: 1.5, fontSize: "0.85rem" }}
                >
                  <SettingsBrightness fontSize="small" /> System
                </MenuItem>
              </Menu>

              {user ? (
                <>
                  <Tooltip title={`Logged in as ${user.name}`}>
                    <IconButton
                      onClick={handleProfileMenuOpen}
                      size="small"
                      sx={{ p: 0.5, border: "1px solid var(--border-color)" }}
                    >
                      <Avatar
                        alt={user.name}
                        src={user.avatarUrl || undefined}
                        sx={{ width: 32, height: 32 }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </Avatar>
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleProfileMenuClose}
                    onClick={handleProfileMenuClose}
                    slotProps={{
                      paper: {
                        sx: {
                          mt: 1.5,
                          width: 220,
                          border: "1px solid",
                          borderColor: "divider",
                          bgcolor: "background.paper",
                          boxShadow: "var(--card-shadow)",
                        },
                      },
                    }}
                    transformOrigin={{ horizontal: "right", vertical: "top" }}
                    anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                  >
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                        {user.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        @{user.username}
                      </Typography>
                    </Box>
                    <Divider />
                    <MenuItem component="a" href={user.webUrl} target="_blank" rel="noopener noreferrer">
                      GitLab Profile
                    </MenuItem>
                    <MenuItem onClick={() => openProfile(user.username)}>
                      My Profile
                    </MenuItem>
                    <MenuItem onClick={() => setSettingsOpen(true)}>
                      Settings
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={logout}>
                      <ListItemIcon>
                        <Logout fontSize="small" />
                      </ListItemIcon>
                      Logout
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Login />}
                  onClick={() => setSettingsOpen(true)}
                >
                  Link GitLab Account
                </Button>
              )}
            </Box>
          </Toolbar>
        </AppBar>
      )}

      {/* Side Navigation Drawer (Mobile) */}
      {!presentationMode && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Side Navigation Drawer (Desktop) */}
      {!presentationMode && (
        <Drawer
          variant="permanent"
          sx={{
            width: currentDrawerWidth,
            flexShrink: 0,
            display: { xs: "none", md: "block" },
            transition: theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: currentDrawerWidth,
              borderRight: "1px solid var(--border-color)",
              transition: theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: "hidden",
            },
          }}
          open
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: presentationMode ? 0 : { xs: 1.5, md: 2 },
          mt: presentationMode ? 0 : "64px",
          minHeight: presentationMode ? "100vh" : "calc(100vh - 64px)",
          transition: theme.transitions.create(["margin", "padding"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {children}
      </Box>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Global User Detail Modal */}
      {profileUsername && (
        <UserDetailModal
          open={Boolean(profileUsername)}
          onClose={closeProfile}
          username={profileUsername}
        />
      )}
    </Box>
  );
}
