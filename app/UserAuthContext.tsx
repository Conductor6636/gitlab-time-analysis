"use client";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { clearGitLabClientCache } from "./gitlab/client";

const GITLAB_URL = (
  process.env.NEXT_PUBLIC_GITLAB_DOMAIN || "https://gitlab.com"
).replace(/\/$/, "");
const OAUTH_CALLBACK_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/oauth/callback`;
const OAUTH_SCOPE = "api";
const TOKEN_STORAGE_KEY = "gitlab_oauth_token";
const REFRESH_TOKEN_STORAGE_KEY = "gitlab_oauth_refresh_token";
const TOKEN_EXPIRY_STORAGE_KEY = "gitlab_oauth_expires_at";
const USER_STORAGE_KEY = "gitlab_oauth_user";
const OAUTH_STATE_STORAGE_KEY = "gitlab_oauth_state";
const CODE_VERIFIER_STORAGE_KEY = "gitlab_oauth_code_verifier";

const GITLAB_OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID;
let refreshInFlight: Promise<string> | null = null;

export type GitLabUser = {
  id: number;
  name: string;
  username: string;
  avatarUrl: string | null;
  webUrl: string;
};

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
};

type UserAuthContextType = {
  token: string | null;
  user: GitLabUser | null;
  loading: boolean;
  login: () => Promise<void>;
  completeOAuthLogin: () => Promise<void>;
  logout: () => void;
};

class GitLabRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

class GitLabOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const UserAuthContext = createContext<UserAuthContextType | undefined>(
  undefined,
);

function getRedirectUri() {
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return encodeBase64Url(bytes);
}

async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

async function requestOAuthToken(
  parameters: URLSearchParams,
): Promise<OAuthTokenResponse> {
  const response = await fetch(`${GITLAB_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new GitLabOAuthError(
      result.error_description || result.error || "GitLab OAuth failed",
      response.status,
    );
  }
  if (!result.access_token) {
    throw new Error("GitLab OAuth response did not contain an access token");
  }
  return result as OAuthTokenResponse;
}

async function fetchGitLabUser(accessToken: string): Promise<GitLabUser> {
  const response = await fetch(`${GITLAB_URL}/api/v4/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new GitLabRequestError(
      `GitLab user request failed (HTTP ${response.status})`,
      response.status,
    );
  }
  const user = await response.json();
  if (!user?.username) {
    throw new Error("GitLab did not return an authenticated user profile");
  }
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatar_url ?? null,
    webUrl: user.web_url,
  };
}

function storeTokens(tokens: OAuthTokenResponse) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, tokens.access_token);
  if (tokens.expires_in) {
    sessionStorage.setItem(
      TOKEN_EXPIRY_STORAGE_KEY,
      String(Date.now() + tokens.expires_in * 1000),
    );
  } else {
    sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  }
  if (tokens.refresh_token) {
    sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token);
  } else {
    sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken || !GITLAB_OAUTH_CLIENT_ID) {
    throw new Error("GitLab session has expired. Please sign in again.");
  }
  refreshInFlight = requestOAuthToken(
    new URLSearchParams({
      client_id: GITLAB_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  )
    .then((tokens) => {
      storeTokens(tokens);
      return tokens.access_token;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function clearStoredAuth() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GitLabUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      // Remove tokens saved by the previous personal-token login flow.
      localStorage.removeItem("gitlab_token");
      localStorage.removeItem("gitlab_user");

      const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = sessionStorage.getItem(USER_STORAGE_KEY);
      if (!storedToken) {
        if (active) setLoading(false);
        return;
      }

      if (active) {
        setToken(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser) as GitLabUser);
          } catch (error) {
            console.error("Failed to restore the GitLab profile:", error);
            sessionStorage.removeItem(USER_STORAGE_KEY);
          }
        }
      }

      try {
        let accessToken = storedToken;
        let profile: GitLabUser;
        try {
          profile = await fetchGitLabUser(accessToken);
        } catch (error) {
          if (!(error instanceof GitLabRequestError) || error.status !== 401) {
            throw error;
          }
          accessToken = await refreshAccessToken();
          profile = await fetchGitLabUser(accessToken);
        }
        if (active) {
          sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
          setToken(accessToken);
          setUser(profile);
        }
      } catch (error) {
        if (
          (error instanceof GitLabRequestError && error.status === 401) ||
          (error instanceof GitLabOAuthError && error.status === 400)
        ) {
          clearStoredAuth();
          if (active) {
            setToken(null);
            setUser(null);
          }
        } else {
          console.error("Failed to restore the GitLab session:", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token || !sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) return;
    const storedExpiry = sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);
    if (!storedExpiry) return;
    const expiresAt = Number(storedExpiry);
    if (!Number.isFinite(expiresAt)) return;

    let timeout: number;
    let cancelled = false;
    const refresh = async () => {
      try {
        const refreshedToken = await refreshAccessToken();
        const profile = await fetchGitLabUser(refreshedToken);
        sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
        setToken(refreshedToken);
        setUser(profile);
      } catch (error) {
        console.error("Failed to refresh the GitLab session:", error);
        if (
          (error instanceof GitLabRequestError && error.status === 401) ||
          (error instanceof GitLabOAuthError && error.status === 400)
        ) {
          clearStoredAuth();
          setToken(null);
          setUser(null);
        } else if (!cancelled) {
          timeout = window.setTimeout(() => void refresh(), 30_000);
        }
      }
    };
    timeout = window.setTimeout(
      () => void refresh(),
      Math.max(0, expiresAt - Date.now() - 60_000),
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [token]);

  const login = async () => {
    if (!GITLAB_OAUTH_CLIENT_ID) {
      throw new Error(
        "GitLab OAuth is not configured. Set NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID.",
      );
    }

    const state = randomBase64Url(32);
    const verifier = randomBase64Url(32);
    const challenge = await createCodeChallenge(verifier);
    sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
    sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, verifier);

    const authorizationUrl = new URL(`${GITLAB_URL}/oauth/authorize`);
    authorizationUrl.search = new URLSearchParams({
      client_id: GITLAB_OAUTH_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      response_type: "code",
      scope: OAUTH_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    window.location.assign(authorizationUrl.toString());
  };

  const completeOAuthLogin = async () => {
    const parameters = new URLSearchParams(window.location.search);
    window.history.replaceState({}, document.title, window.location.pathname);
    const oauthError = parameters.get("error");
    if (oauthError) {
      sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
      sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
      const description = parameters.get("error_description");
      throw new Error(
        description || `GitLab authorization failed: ${oauthError}`,
      );
    }

    const expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
    const verifier = sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
    sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);

    if (!expectedState || parameters.get("state") !== expectedState) {
      throw new Error(
        "GitLab authorization state did not match. Please try again.",
      );
    }
    const code = parameters.get("code");
    if (!verifier || !code) {
      throw new Error(
        "GitLab did not return an authorization code. Please try again.",
      );
    }
    if (!GITLAB_OAUTH_CLIENT_ID) {
      throw new Error(
        "GitLab OAuth is not configured. Set NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID.",
      );
    }

    setLoading(true);
    try {
      const tokens = await requestOAuthToken(
        new URLSearchParams({
          client_id: GITLAB_OAUTH_CLIENT_ID,
          code,
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(),
          code_verifier: verifier,
        }),
      );
      clearGitLabClientCache();
      storeTokens(tokens);
      const profile = await fetchGitLabUser(tokens.access_token);
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
      setToken(tokens.access_token);
      setUser(profile);
    } catch (error) {
      clearStoredAuth();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearGitLabClientCache();
    clearStoredAuth();
    setToken(null);
    setUser(null);
    window.location.reload();
  };

  return (
    <UserAuthContext.Provider
      value={{ token, user, loading, login, completeOAuthLogin, logout }}
    >
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const context = useContext(UserAuthContext);
  if (context === undefined) {
    throw new Error("useUserAuth must be used within a UserAuthProvider");
  }
  return context;
}
