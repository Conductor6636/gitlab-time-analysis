# GitLab Time Analysis (Static Fork)

A gamified Next.js dashboard for analyzing time tracking data from GitLab groups. The app discovers descendant groups under a configured GitLab path, pulls members, labels, timelogs, merge requests, and sprint windows from GitLab, and renders summary views for workload, sprint, and team health analysis — with leveling, XP, badges, and cross-group comparison.

## What It Shows

### Home Page — Group Comparison

The landing page renders a cross-group comparison table (or cards on mobile):

- **Member avatars** for each group with bot filtering.
- **Category stacked bar** showing how hours split across label categories (Project Management, Requirements Engineering, Implementation, Architecture).
- **Effort variance metrics** — multiplier (top/bottom ratio), absolute gap (hours), coefficient of variation (CV).
- **Review coverage** — percentage of merged MRs that received peer review.
- **Group level and tier** from the gamification engine.
- **Total hours, work weeks, and average hours per member**.
- A footer row with aggregate stats across all groups.

Below the table, a **User Leaderboard** ranks all members across groups by total hours, with category breakdown and gamification level display.

### Group Dashboard `/[groupId]`

Each group page combines several views:

- **Summary cards** for total members, total sprints, total time spent, average time per sprint, and current/previous sprint focus category.
- **Heatmap** of timelog activity by sprint and weekday.
- **Total hours per sprint**, stacked by member.
- **Time spent per category**, including issues with missing estimates and uncategorized work.
- **Time spent per member**, grouped by label category.
- **Estimate accuracy** comparison (logged vs estimated hours per issue).
- **Time per weekday** distribution.
- **Time per week** trend view.
- **Merge request views** — open/merged MR lists with gamification details.
- **Sprint radar chart** for multi-metric sprint overview.
- **Sprint overview table** that can be shared or exported as SVG.
- **Problems modal** — issues with missing estimates, uncategorized work, and uncategorized issues.

### Gamification

Users and groups earn XP and level up based on timelogs and merge request activity:

- **Levels and tiers** — Bronze (1–9), Silver (10–19), Gold (20–29), Legend (30+).
- **Badge tracks** — endurance, velocity, shipping, quality, momentum, automation, one-time.
- **Group-level XP** aggregates all member XP and computes a group tier.
- Levels and XP are displayed on the home page comparison table, user leaderboard, and per-user detail modals.

### Presentation Mode

The dashboard supports a presentation mode that reduces UI chrome for display on screens or projectors. Enable it from the settings dialog or via a URL parameter.

## Requirements

- Node.js 21 or newer to develop and build.
- A GitLab OAuth application with the `api` scope and redirect URI `<app-origin>/oauth/callback`.
- A GitLab group path that acts as the root for all analyzed descendant groups.

## Configuration

Set configuration in `.env.local` for local development. `NEXT_PUBLIC_*` values are embedded into the static build and visible to every visitor; do not put secrets or personal access tokens in them. No server-side GitLab token or API is used.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID` | Yes | Public OAuth application ID. Register `<app-origin>/oauth/callback` as the redirect URI. |
| `NEXT_PUBLIC_GITLAB_GROUP_PATH` | Yes | Root group path to analyze, for example `dhbw-se/software-engineering-i-tinf25b6`. |
| `NEXT_PUBLIC_GITLAB_DOMAIN` | No | GitLab instance URL; defaults to `https://gitlab.com`. |
| `NEXT_PUBLIC_PROJECT_START_DATE` | No | Optional date to constrain timelogs and anchor sprint numbering. |
| `NEXT_PUBLIC_PROJECT_END_DATE` | No | Optional date to constrain timelogs and sprint generation. |
| `NEXT_PUBLIC_SPRINT_START_WEEKDAY` | No | Sprint start weekday; defaults to Monday. |
| `NEXT_PUBLIC_SPRINT_DURATION_WEEKS` | No | Sprint duration in weeks; defaults to two weeks. |
| `NEXT_PUBLIC_GITLAB_DISPLAY_NAMES` | No | Public JSON mapping of usernames to preferred display names. |

Example:

```env
NEXT_PUBLIC_GITLAB_DOMAIN=https://gitlab.com
NEXT_PUBLIC_GITLAB_GROUP_PATH=org/team
NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID=your-oauth-application-id
NEXT_PUBLIC_PROJECT_START_DATE=2025-01-01
NEXT_PUBLIC_PROJECT_END_DATE=2025-12-31
NEXT_PUBLIC_SPRINT_START_WEEKDAY=Monday
NEXT_PUBLIC_SPRINT_DURATION_WEEKS=2
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Available scripts:

- `npm run dev` starts the Next.js development server.
- `npm run build` creates the static site in `out/`.
- `npm run lint` runs ESLint.

The browser uses the signed-in user's OAuth token for GitLab GraphQL and REST calls. OAuth tokens are held in `sessionStorage` and removed on sign-out. The browser data cache is in-memory only.

## Static deployment

Next.js is configured with `output: "export"`. The build emits static HTML, JavaScript, CSS, and assets to `out/`; there are no Next.js API routes or runtime Node.js server. GitLab configuration must therefore be set at build time.

Group pages use client-side paths of the form `/group/<group path>`. The web server must serve exported files when they exist and fall back to `/index.html` for other group paths, so direct loads and reloads work. `/oauth/callback` is a real exported page. The included [nginx.conf](nginx.conf) is an optional example; adapt it to your hosting environment.

Build and publish the static files:

```bash
npm run build
# Publish the contents of out/ to your static host.
```

## Repository layout

- [app/page.tsx](app/page.tsx) — comparison page and client-side group route entry point.
- [app/components/GroupDashboard.tsx](app/components/GroupDashboard.tsx) — group analytics dashboard.
- [app/ClientRoute.ts](app/ClientRoute.ts) — group URL parsing and client-side navigation.
- [app/gitlab/](app/gitlab) — browser-side GitLab API client.
- [app/oauth/](app/oauth) — OAuth callback route.
- [app/components/](app/components) — dashboard widgets, tables, modals, and charts.
- [app/config/](app/config) — category definitions and label matching.
- [app/utils/](app/utils) — gamification and analytics helpers.
- [nginx.conf](nginx.conf) — optional Nginx SPA fallback example for group routes.

## License

GNU General Public License v3.0
