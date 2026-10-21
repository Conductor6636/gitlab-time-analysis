"use client";

import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { homeRouteHref } from "@/app/ClientRoute";
import { useUserAuth } from "@/app/UserAuthContext";

export default function OAuthCallbackPage() {
  const { completeOAuthLogin } = useUserAuth();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    completeOAuthLogin()
      .then(() => window.location.replace(homeRouteHref()))
      .catch((authError: unknown) => {
        setError(
          authError instanceof Error
            ? authError.message
            : "GitLab sign-in failed",
        );
      });
  }, [completeOAuthLogin]);

  return (
    <Box
      sx={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 3,
      }}
    >
      {error ? (
        <>
          <Alert severity="error">{error}</Alert>
          <Typography variant="body2">
            Return to the dashboard and try signing in again.
          </Typography>
        </>
      ) : (
        <>
          <CircularProgress />
          <Typography>Completing GitLab sign-in…</Typography>
        </>
      )}
    </Box>
  );
}
