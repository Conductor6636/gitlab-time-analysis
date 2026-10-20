export const {
  GITLAB_TOKEN,
  GITLAB_GROUP_PATH,
  GITLAB_DOMAIN,
  APP_URL,
  PROJECT_START_DATE,
  PROJECT_END_DATE,
  SPRINT_START_WEEKDAY,
  SPRINT_DURATION_WEEKS,
  GITLAB_DISPLAY_NAMES: displayNamesJson,
} = process.env;

const displayNames: Record<string, string> = {};

if (displayNamesJson) {
  try {
    const parsed: unknown = JSON.parse(displayNamesJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [username, name] of Object.entries(parsed)) {
        if (username.trim() && typeof name === "string" && name.trim()) {
          displayNames[username.toLowerCase()] = name.trim();
        }
      }
    } else {
      console.warn("GITLAB_DISPLAY_NAMES must be a JSON object of usernames and display names.");
    }
  } catch {
    console.warn("GITLAB_DISPLAY_NAMES is not valid JSON; GitLab names will be used.");
  }
}

export function getDisplayName(username: string, fallback = ""): string {
  return displayNames[username.toLowerCase()] || fallback;
}
