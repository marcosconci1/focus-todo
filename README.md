# Focus Todo

<img width="1280" height="640" alt="README" src="https://github.com/user-attachments/assets/12715673-daa7-4ecc-9f1c-c33207a86f4f" />


A local-first habit and task tracker with a built-in Pomodoro timer, streak tracking, smart alerts, and optional Google Calendar sync. Built with Next.js, React, and SQLite.

All data stays on your machine. No accounts, no cloud, no telemetry.

## Features

**Three project types**
- **Habit** — tasks reset daily at your configured end-of-day time, with streak tracking
- **Work** — tracks time spent per day, resets the counter daily
- **Project** — persistent task lists that don't reset

**Pomodoro timer**
- Configurable focus, short break, and long break durations
- Overtime tracking with visual color gradient
- Session persistence across page reloads
- Focus mode collapses the UI to just the timer while running

**Smart alerts**
- Inactivity nudges when you haven't started a session
- Habit end-of-day reminders as your reset time approaches
- Break reminders after completing tasks
- Reality checks — periodic mindfulness prompts you can customize
- Elapsed time tracker
- Scream mode — optional sarcastic motivational insults when you're idle too long
- All alerts are individually toggleable, with configurable cooldowns and frequency limits

**Task management**
- Drag-and-drop reordering for projects and tasks
- Progress tracking with daily goals
- Streak counters for habits with color-coded indicators
- Time tracking for work projects

**Daily reset**
- Automatic reset at your configured end-of-day time
- Habits mark incomplete, streaks update based on completion
- Work project time counters reset
- Regular projects are untouched

**Google Calendar sync** (optional)
- OAuth 2.0 connection from the Settings panel
- Creates calendar events when you complete focus sessions
- Configurable event format and color
- Syncs overtime to existing events

**Urgency clock**
- 48-block bar at the bottom of the screen showing the day's progress in half-hour increments

**Settings**
- Timer durations, break frequency, end-of-day time
- Sound toggles and volume for completions and alerts
- Confetti on task completion
- Alert author names and display durations
- Custom reality check and scream mode messages
- Database health, backup, and restore

## Quick Start

### Requirements

- Node.js 20+
- pnpm

### Install and run

```bash
git clone https://github.com/your-username/focus-todo.git
cd focus-todo
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### First use

1. Click the **+** button to create a project or habit.
2. Add tasks to your project.
3. Select a task and start a focus session with the timer.
4. Habits and work projects reset automatically at your configured end-of-day time (default 20:00).

No configuration files are needed to get started. The app creates a local SQLite database on first run.

## Configuration

Copy `.env.example` to `.env.local` and fill in the values you need.

### Basic (no config required for local use)

| Variable | Description | Default |
|---|---|---|
| `FORCE_DB_RESET` | Reset database on next startup (schema changes only) | `false` |
| `DEBUG_DB_INIT` | Verbose database initialization logs | `false` |

### Google Calendar integration

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Callback URL (default: `http://localhost:3000/api/google/callback`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same client ID, exposed to the browser |
| `COOKIE_SECRET` | Encryption key for session cookies (generate with `openssl rand -base64 32`) |

### Optional security tokens

| Variable | Description |
|---|---|
| `DB_HEALTH_TOKEN` | Protects the `/api/db/health` diagnostic endpoint |
| `API_KEY` | Protects the reality checks save endpoint |

## Google Calendar Setup

This is optional. The app works fully offline without it.

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API**.
3. Go to **Credentials** and create an **OAuth 2.0 Client ID** (Web application).
4. Add `http://localhost:3000/api/google/callback` as an authorized redirect URI.
5. Copy the client ID and secret into `.env.local`.
6. Generate a cookie secret: `openssl rand -base64 32` and add it to `.env.local`.
7. Restart the dev server, then connect from **Settings > Integrations** in the app.

## Storage

| Environment | Database path |
|---|---|
| Development | `./public/data/focus-todo.db` |
| Production | `~/.focus-todo/focus-todo.db` |

SQLite WAL mode is used. The `.db-shm` and `.db-wal` sidecar files are created automatically.

## Scripts

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm test             # Run all tests
pnpm cleanup-json     # Preview legacy JSON files for removal
pnpm cleanup-json:force  # Delete legacy JSON files
```

## Tech Stack

- [Next.js](https://nextjs.org/) 16 (App Router)
- [React](https://react.dev/) 19
- TypeScript (strict mode)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/)
- SQLite (via sqlite3 + sqlite-async)
- [Framer Motion](https://www.framer.com/motion/)
- [@dnd-kit](https://dndkit.com/) for drag and drop

## Contributing

1. Fork the repo and create a branch.
2. Run `pnpm install` and `pnpm dev` to get started.
3. Run `pnpm lint` and `pnpm test` before submitting a PR.

## License

[MIT](LICENSE)
