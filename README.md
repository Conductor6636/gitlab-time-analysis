# GitLab Time Analysis

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

- Node.js 21 or newer is recommended, matching the container image used in [Dockerfile](Dockerfile).
- A GitLab personal access token with permission to read groups, labels, issues, timelogs, and merge requests.
- A GitLab group path that acts as the root for all analyzed descendant groups.

## Configuration

The application reads configuration from environment variables. In a local setup, place them in `.env.local`.

| Variable                  | Required | Purpose                                                                                                                        |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GITLAB_TOKEN`            | Yes      | Bearer token used for GitLab GraphQL and REST requests.                                                                        |
| `GITLAB_GROUP_PATH`       | Yes      | Full path to the parent GitLab group whose descendant groups will be listed.                                                   |
| `GITLAB_DOMAIN`           | No       | GitLab base URL. Defaults to `https://gitlab.com`.                                                                             |
| `APP_URL`                 | No       | Base URL for Open Graph image generation and metadata. Defaults to the GitLab domain.                                          |
| `PROJECT_START_DATE`      | Yes      | Start date used for fetching timelogs and calculating sprint boundaries.                                                       |
| `PROJECT_END_DATE`        | Yes      | End date used for fetching timelogs and generating sprint windows.                                                             |
| `SPRINT_START_WEEKDAY`    | No       | Sprint start weekday. Accepts a weekday name or numeric day index. Defaults to the weekday of `PROJECT_START_DATE` if omitted. |
| `SPRINT_DURATION_WEEKS`   | No       | Sprint length in weeks. Defaults to `1` when omitted in sprint calculations.                                                   |
| `GITLAB_DISPLAY_NAMES`    | No       | JSON object mapping GitLab usernames to display names. Matching is case-insensitive.                                             |

Optional personalization tokens (stored in the browser and passed via headers):

| Token (sent as Authorization header) | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `GITLAB_PERSONAL_RW_TOKEN`           | Read/write token for updating issues and labels from the UI. |

Example `.env.local`:

```env
GITLAB_TOKEN=glpat-your-token
GITLAB_GROUP_PATH=org/team
GITLAB_DOMAIN=https://gitlab.com
APP_URL=https://your-deployment.example.com
PROJECT_START_DATE=2025-01-01
PROJECT_END_DATE=2025-12-31
SPRINT_START_WEEKDAY=Monday
SPRINT_DURATION_WEEKS=2
GITLAB_DISPLAY_NAMES='{"gitlab-nickname":"Display Name"}'
```

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run start` runs the production server after a build.
- `npm run lint` runs ESLint across the codebase.

## How the App Works

### Data Flow

1. The home page calls `/api/groups/comparison` to load cross-group data with member hours, category breakdowns, gamification stats, and review coverage.
2. Selecting a group opens `/[groupId]`, which loads the group's members, labels, timelogs, merge requests, and sprint definitions from local API routes.
3. Those API routes proxy GitLab GraphQL (via Apollo Client) and REST data, applying domain-specific caching and normalization.
4. The dashboard components render charts, tables, and summaries from a shared React context (`GroupContext`).
5. The user leaderboard at the bottom of the home page aggregates data across all groups via `/api/users/leaderboard`.

### GitLab Integration

The app uses two helper functions in [app/api/gitlab.ts](app/api/gitlab.ts):

- `runGitlabGraphQLQuery()` for GraphQL queries.
- `runGitlabRESTQuery()` for REST requests.

GraphQL requests are also made through [Apollo Client](https://www.apollographql.com/docs/react) configured in [app/api/apollo-client.ts](app/api/apollo-client.ts).

Requests are authenticated with `GITLAB_TOKEN` and sent to `GITLAB_DOMAIN` when configured, otherwise to `https://gitlab.com`.

### Caching

Each data domain (members, labels, timelogs, merge requests, descendant groups) has its own in-memory cache module under [app/api/](app/api). Caches use a stale-while-revalidate pattern with a configurable TTL (default 3 minutes). The API can serve cached data immediately while refreshing in the background.

A background cache warmup module (`cache-warmup.ts`) can pre-populate caches on startup.

Reactivity is handled with RxJS subjects, allowing cache invalidations to propagate across dependent modules.

### Authentication

Users can optionally provide a personal GitLab token in the UI (stored in localStorage). This token is sent as an `Authorization` header on API requests and enables write operations (updating issues and labels) and personalized views. The token is verified against the GitLab API on page load.

### Category Configuration

Work categories are defined in [app/config/categories.ts](app/config/categories.ts). Labels are matched to categories by regex patterns on the label name (e.g., `pm`, `requirements`, `implementation`, `architecture`). Labels can be scoped (`Category::pm`) or flat (`pm`).

### Theme

The dashboard supports light, dark, and system color modes, plus selectable color palettes (default, DHBW, green, purple). Theme preference is persisted to localStorage. Presentation mode reduces visual chrome for display scenarios.

## API Routes

| Method | Route                                     | Purpose                                                         |
| ------ | ----------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/groups`                             | Lists descendant groups under the configured root group.        |
| GET    | `/api/groups/comparison`                  | Cross-group comparison data with hours, categories, gamification. |
| GET    | `/api/group/[...id]/members`              | Group members used by the dashboard (supports nested subgroups). |
| GET    | `/api/group/[...id]/labels`               | Labels grouped by namespace prefix.                             |
| GET    | `/api/group/[...id]/timelogs`             | Mapped timelog entries for the configured project date range.   |
| GET    | `/api/group/[...id]/merge-requests`       | Merge request data used for gamification and review views.      |
| GET    | `/api/group/[...id]/sprints`              | Sprint windows from the configured start/end dates and duration. |
| GET    | `/api/group/[...id]/table.svg`            | Shareable SVG of the sprint overview table.                     |
| GET    | `/api/group/[...id]/og`                   | Per-group Open Graph image.                                     |
| GET    | `/api/og`                                 | Global Open Graph image for the landing page.                   |
| GET    | `/api/users/leaderboard`                  | Cross-group user ranking with hours and gamification data.      |
| GET    | `/api/users/[username]`                   | Per-user profile data (timelogs, merge requests, gamification). |
| POST   | `/api/users/auth`                         | Verify a GitLab personal token and return the authenticated user. |
| POST   | `/api/issues/update`                      | Update an issue (requires write token).                         |
| POST   | `/api/issues/update-labels`               | Update issue labels (requires write token).                     |

## Development Notes

- The dashboard uses [MUI](https://mui.com/) for cards, tables, selectors, and charts.
- Charts are powered by `recharts`.
- SVG and Open Graph image generation uses `satori` and downloads the Inter font from a CDN at render time.
- GraphQL requests use [Apollo Client](https://www.apollographql.com/docs/react) with `@apollo/client` and `graphql`.
- Reactivity for cache invalidation is handled with `rxjs`.
- The project is built with the Next.js App Router and client-side data fetching for the dashboard.
- Styling uses Tailwind CSS v4 alongside MUI's `sx` prop.
- Linting and formatting use [Biome](https://biomejs.dev) alongside ESLint.

## Docker

The repository includes a production Dockerfile that builds the app with Node.js 21 Alpine and serves it with `npm start`.

Build and run locally:

```bash
docker build -t gitlab-time-analysis .
docker run --rm -p 3000:3000 --env-file .env.local gitlab-time-analysis
```

## Deployment

The repository includes a GitHub Actions workflow in [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml) that builds and publishes the Docker image to GHCR on pushes to `main` and on manual dispatch.

For non-Docker deployments, run the standard Next.js production flow:

```bash
npm run build
npm run start
```

## Troubleshooting

- If the home page is empty, verify that `GITLAB_GROUP_PATH` points to a parent group that actually has descendant groups.
- If dashboards return empty data, confirm that the token can read the group's timelogs, labels, members, and merge requests.
- If sprint windows look wrong, recheck `PROJECT_START_DATE`, `PROJECT_END_DATE`, `SPRINT_START_WEEKDAY`, and `SPRINT_DURATION_WEEKS`.
- If the SVG export route fails, confirm that the selected sprint number exists and that the chosen label group exists in the label data.
- If gamification data is missing, ensure the token has access to merge request data for the group.

## Repository Layout

- [app/page.tsx](app/page.tsx) — landing page with group comparison table and user leaderboard.
- [app/[groupId]/page.tsx](app/[groupId]/page.tsx) — main analytics dashboard for a single group.
- [app/[groupId]/layout.tsx](app/[groupId]/layout.tsx) — layout that provides GroupContext and data loading.
- [app/api/](app/api) — GitLab-backed API routes, Apollo client, and cache modules.
- [app/components/](app/components) — dashboard widgets (charts, tables, modals, leaderboard).
- [app/config/](app/config) — category definitions and label pattern matching.
- [app/utils/](app/utils) — gamification engine, category utilities, theme colors, issue helpers.
- [app/GroupContext.tsx](app/GroupContext.tsx) — shared React context for group dashboard data.
- [app/ThemeContext.tsx](app/ThemeContext.tsx) — theme mode, color palette, and presentation mode state.
- [app/UserAuthContext.tsx](app/UserAuthContext.tsx) — optional GitLab personal token authentication.
- [app/UserProfileContext.tsx](app/UserProfileContext.tsx) — cross-group user profile aggregation.
- [Dockerfile](Dockerfile) — container build and runtime image.

## License

GNU General Public License v3.0
