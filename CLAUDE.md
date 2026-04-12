# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FindX is an AI-powered business prospecting platform targeting the Dutch SMB market. It discovers businesses (via KVK and Google Places APIs), analyzes their websites (Lighthouse + tech detection + AI scoring), and generates personalized outreach emails (Dutch-first, using GLM AI). The pipeline is: Discover → Analyze → Outreach → Track.

## Commands

```bash
# Backend
npm run dev              # Start API server with hot reload (tsx watch, port 3001)
npm run build            # TypeScript compile check
npm run typecheck        # tsc --noEmit

# Database
npm run db:migrate       # Run Prisma migrations (dev)
npm run db:migrate:deploy # Run migrations (production)
npm run db:seed          # Seed pipeline stages + 3 agents (research, analysis, outreach)
npm run db:studio        # Prisma Studio GUI

# Testing
npm run test             # Run all tests (vitest)
npm run test:watch       # Watch mode
# Run a single test file:
npx vitest run src/path/to/file.test.ts

# Web frontend (Next.js workspace)
npm run dev:web          # Start Next.js dev server (port 3000)
npm run build:web        # Build Next.js

# Infrastructure
docker compose up -d     # Start Postgres (5432), Redis (6379), and Lightpanda (9222)
```

## Architecture

### Two-Workspace Monorepo
- **Root** (`/`): Fastify API server + BullMQ workers (Node.js, ESM, TypeScript)
- **`web/`**: Next.js 15 dashboard (React 19, Tailwind 4, App Router)

### Agent Pipeline System (`src/agents/`)
Configurable 3-phase agent pipeline: Research → Analysis → Outreach. Agents are defined in the database (not hardcoded) with editable identity, personality, and tool configs.

- **Agent Registry** (`src/agents/core/agent-registry.ts`): Loads agent configs from DB with skills, resolves tools via tool-registry, builds system prompts
- **Tool Registry** (`src/agents/core/tool-registry.ts`): Maps 16 tool names to Tool instances (`getTools(names)`, `getAllToolDefinitions()`)
- **Prompt Builder** (`src/agents/core/prompt-builder.ts`): Assembles system prompt from agent's `identityMd` + `soulMd` + `toolsMd` + active skills
- **Runner** (`src/agents/core/runner.ts`): `runAgentWithLogging()` — tool-use loop that writes `AgentLog` entries to DB for real-time monitoring
- **Orchestrator** (`src/agents/orchestrator/orchestrator.ts`): Chains the 3 agents sequentially, extracts lead IDs from research output, batches analysis (3 leads), runs outreach per analyzed lead
- **Agent Identity Files** (`agents/{research,analysis,outreach}/`): `IDENTITY.md`, `SOUL.md`, `TOOLS.md` — dev source of truth, seeded into DB

### Data Pipeline (4 stages)
1. **Discovery** (`src/modules/discovery/`): Scrapes KVK API and Google Places → deduplicates → checks websites → enriches → persists Leads
2. **Analysis** (`src/modules/analyzer/`): Lighthouse audits → tech detection → scoring → AI opportunity detection → optional PDF report
3. **Outreach** (`src/modules/outreach/`): AI generates personalized emails (GLM via OpenAI-compatible API) → template rendering (NL/EN, 3 tones) → sends via Resend → webhook tracking
4. **Pipeline** (`src/modules/pipeline/`): Lead stage definitions (discovered → analyzing → analyzed → contacting → responded → qualified → won/lost)

### Job Processing
BullMQ queues backed by Redis. Nine named queues in `src/workers/queues.ts`:
- `discovery:kvk`, `discovery:google` — lead scraping jobs
- `analysis:website` — Lighthouse + AI analysis
- `outreach:generate`, `outreach:send`, `outreach:track` — email lifecycle
- `email-scheduler` — checks for and sends scheduled emails at the right time
- `email-followup` — sends follow-up emails after 3 days if no response

Workers in `src/workers/` (discovery.ts, analysis.ts, outreach.ts, scheduler.ts, followup.ts). Most API routes support both `sync: true` (immediate) and background (queued) modes.

### Key Libraries
- **Database**: Prisma with PostgreSQL (`src/lib/db/client.ts`)
- **Queue**: BullMQ with Redis (`src/lib/queue/index.ts`) — use `createQueue()` / `createWorker()`
- **AI**: OpenAI-compatible client pointed at GLM (`src/lib/ai/client.ts`, `src/modules/outreach/generator.ts`) — configured via `GLM_API_KEY`, `GLM_BASE_URL`, `GLM_MODEL` env vars
- **Email**: Resend (`src/lib/email/client.ts`)
- **Notifications**: Telegram (`src/lib/notifications/telegram.ts`) — sends event notifications via Telegram Bot API
- **Web scraping**: Cheerio + Playwright (for tech detection)
- **Browser**: Lightpanda (CDP, low RAM JS rendering) via `src/lib/browser/client.ts` — falls back to Playwright Chromium. Used for `scrape_page(renderJs:true)` and `detect_tech(renderJs:true)`. Lighthouse and screenshots always use full Chromium.

### API Structure
All routes in `src/routes/index.ts` on Fastify. All endpoints under `/api/`:
- `POST /api/leads/discover` — trigger discovery
- `GET /api/leads`, `GET /api/leads/:id`, `PATCH /api/leads/:id` — lead CRUD
- `POST /api/leads/:id/analyze` — trigger analysis
- `POST /api/leads/:id/outreach/generate` — generate AI email
- `POST /api/leads/:id/outreach/send` — send approved email
- `POST /api/webhooks/resend` — Resend tracking webhook
- `GET /api/dashboard/stats` — dashboard metrics
- `GET /api/agents`, `GET /api/agents/:id`, `GET /api/agents/name/:name` — agent listing and lookup
- `PATCH /api/agents/:id`, `PATCH /api/agents/name/:name` — update agent config
- `GET /api/agents/tools` — list all 16 registered tools
- `POST /api/agents/seed` — re-seed agents from defaults
- `GET /api/agents/:id/skills`, `POST/PATCH/DELETE` — agent skill CRUD
- `GET /api/agents/logs`, `GET /api/agents/runs/:id/logs` — agent log monitoring
- `POST /api/agents/run` — trigger agent pipeline, `GET /api/agents/runs` — list runs
- `GET /api/telegram/settings`, `POST /api/telegram/settings`, `DELETE /api/telegram/settings` — Telegram notification settings
- `POST /api/telegram/test` — test Telegram connection
- `POST /api/outreaches/:id/schedule`, `DELETE /api/outreaches/:id/schedule` — schedule/cancel email sending

### Database Schema
PostgreSQL via Prisma (`prisma/schema.prisma`). Core models: `Lead`, `Analysis`, `Outreach`, `PipelineStage`, `Agent`, `AgentSkill`, `AgentLog`, `AgentPipelineRun`, `EmailSetting`, `TelegramSetting`. Enums: `LeadStatus`, `OutreachStatus` (includes `scheduled`).

### Frontend (`web/`)
Next.js App Router with pages: Dashboard (`/`), Agents (`/agents` — tabbed pipeline runner + agent cards), Agent Detail (`/agents/[name]` — editable identity/soul/tools + settings + skills), Discovery (`/discover`), Settings (`/settings` — tabbed: AI Providers, Email, Notifications, Data). Key components: `AgentMonitor` (live log viewer with polling), `KanbanBoard`, lead list/detail, analysis panel, outreach panel.

## Environment Variables

Required for full operation:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection (default: `redis://localhost:6379`)
- `KVK_API_KEY` — KVK API access
- `GOOGLE_MAPS_API_KEY` — Google Places API
- `GLM_API_KEY` — GLM AI API key
- `GLM_BASE_URL` — GLM API base URL (default: `https://open.bigmodel.cn/api/paas/v4`)
- `GLM_MODEL` — Model name (default: `glm-5.1`)
- `RESEND_API_KEY` — Resend email API
- `EMAIL_FROM` — Sender email address
- `PORT` — API server port (default: 3001)
- `LIGHTPANDA_URL` — Lightpanda CDP endpoint (default: `http://localhost:9222`, optional — tools fall back to Chromium)
- `SEARXNG_URL` — SearXNG meta search endpoint (default: `http://localhost:8080`, optional — included in docker-compose)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token for notifications (optional — feature disabled without it)
- `TELEGRAM_CHAT_ID` — Telegram chat ID for notifications (optional — feature disabled without it)
- `APP_TIMEZONE` — Timezone for timestamps (default: `Europe/Amsterdam`, optional)

## Code Conventions

- TypeScript with strict mode, ESM modules (`"type": "module"` in package.json)
- Imports use `.js` extensions (Node16 module resolution): `import { foo } from "./bar.js"`
- Path alias `@/*` maps to `./src/*` (configured but imports generally use relative paths)
- Zod for request validation in routes
- All API responses are JSON (`{ key: value }` pattern)
