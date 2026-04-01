# FindX

<div align="center">
  **Stop cold-calling. Start AI-prospecting.**

  FindX discovers businesses, analyzes their websites, and writes personalized outreach emails — all on autopilot using 3 agents .

  <img src="images/dashboard.png" alt="FindX Dashboard" width="100%" />

  [ العربية ](README_AR.md) | English

  [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20the%20project-FFDD00?style=flat&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/mrarabai)

  ---
</div>

<p align="center">
  <img src="images/agent-pipeline.png" alt="Agent Pipeline" width="100%" />
</p>

## How It Works

Three AI agents work in sequence, fully automated:

1. **Research Agent** — Finds businesses matching your query across multiple countries (Netherlands, UK, Germany, France, Belgium, USA, UAE, and more) via local business registries and Google Places APIs. Supports searches in English, Dutch, and Arabic.
2. **Analysis Agent** — Audits each website with Lighthouse, detects tech stack, scores 0–100, identifies opportunities including AI/automation potential and revenue leakage
3. **Outreach Agent** — Writes personalized cold emails in English, Dutch, or Arabic referencing specific findings (e.g., *"Your website loads in 8.2 seconds"*)

**Discover → Analyze → Outreach → Track**

> **Multilingual support**: Search in English, Dutch, or Arabic. Outreach emails are generated in the selected language — including full Arabic support for businesses in the Middle East and North Africa.

<p align="center">
  <img src="images/pipeline-kanban.png" alt="Pipeline Kanban Board" width="100%" />
</p>

Manage every lead through a drag-and-drop Kanban board — from discovery to won/lost.

---

## Prerequisites

| Requirement | Version | Why |
|------------|---------|-----|
| **Node.js** | 20+ | Runtime for the API server and build tools |
| **npm** | 10+ | Package manager |
| **Docker** | Latest | Runs PostgreSQL, Redis, and Lightpanda browser |
| **Git** | Latest | Version control |
| **AI API key** | — | GLM or OpenAI-compatible API for email generation |

## Setup Guide (Step by Step)

### Step 1: Clone & Install

```bash
git clone https://github.com/MrFadiAi/FinX.git
cd FinX
npm install
```

This installs dependencies for both the backend API and the Next.js dashboard.

### Step 2: Start Infrastructure

```bash
docker compose up -d
```

This starts three Docker containers:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Background job queues |
| Lightpanda | 9222 | Lightweight browser for web scraping |

Verify all are running:

```bash
docker compose ps
```

You should see all three services with status `Up`.

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Open `.env` in your editor. At minimum, fill in these **required** values:

```env
# REQUIRED — the app will crash without these
DATABASE_URL=postgresql://findx:findx@localhost:5432/findx
REDIS_URL=redis://localhost:6379

# REQUIRED — AI features (email generation, analysis, agent pipeline)
GLM_API_KEY=your-api-key-here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODEL=glm-5.1
```

**Optional** (for full functionality):

```env
# Email sending — without this, emails are saved as drafts but not sent
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=hello@yourdomain.com

# Dutch business sources — without these, discovery uses web search instead
KVK_API_KEY=your-kvk-key
GOOGLE_MAPS_API_KEY=your-google-key
```

### Step 4: Set Up the Database

Create the database tables:

```bash
npm run db:migrate
```

Seed the database with default pipeline stages and AI agents:

```bash
npm run db:seed
```

### Step 5: Start the Backend API

```bash
npm run dev
```

The API server starts on **http://localhost:3001**. Verify it's working:

```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Step 6: Start the Web Dashboard

Open a **new terminal** and run:

```bash
npm run dev:web
```

The dashboard starts on **http://localhost:3000**. Open it in your browser.

---

## What FindX Does

1. **Discover** — Finds businesses across multiple countries via local business registries (KVK, Companies House, Handelsregister, etc.) and Google Places APIs
2. **Analyze** — Runs Lighthouse audits, detects tech stacks, scores websites 0-100
3. **Outreach** — Generates personalized cold emails in **English, Dutch, or Arabic** using AI
4. **Track** — Monitors email opens, replies, and bounces via Resend webhooks

## Using the App

### Dashboard (`/`)

Overview of your pipeline — total leads, analyzed, contacted, won. Score distribution chart.

### Pipeline (`/pipeline`)

Kanban board with your leads across stages: Discovered → Analyzing → Analyzed → Contacting → Responded → Qualified → Won/Lost. Click any lead card to see details. Drag leads between stages to move them through the pipeline.

### Agents (`/agents`)

Two tabs:
- **Pipeline** — Run the AI prospecting pipeline. Enter a search query like "restaurants in Amsterdam", pick a language (**Nederlands** or **English**), and hit Run. Three AI agents work in sequence: Research → Analysis → Outreach.
- **Agents** — View and configure each agent (identity, personality, tools, skills).

### Settings (`/settings`)

Manage data — clear all data, re-seed agents, import/export CSV.

## Language Support

Outreach emails can be generated in three languages:

| Language | Code | Style |
|----------|------|-------|
| **English** | `en` | Professional English, British spelling |
| **Dutch** | `nl` | Formal business Dutch (u/uw register), Dutch subject lines |
| **Arabic** | `ar` | Professional Modern Standard Arabic, full RTL support |

Select the language from the dropdown on the **Agents > Pipeline** tab before running a pipeline. Default is English.

## Architecture

```
FindX/
├── src/                          # Backend (Fastify + TypeScript, ESM)
│   ├── server.ts                 # API entry point (port 3001)
│   ├── routes/index.ts           # All API endpoints
│   ├── agents/                   # AI agent pipeline system
│   │   ├── core/                 # Agent registry, runner, tools, prompts
│   │   └── orchestrator/         # Pipeline orchestrator (Research → Analysis → Outreach)
│   ├── lib/
│   │   ├── db/client.ts          # Prisma database client
│   │   ├── ai/client.ts          # AI client (GLM/OpenAI-compatible)
│   │   ├── email/client.ts       # Resend email client
│   │   ├── browser/client.ts     # Lightpanda + Playwright browser
│   │   └── queue/index.ts        # BullMQ queue helpers
│   ├── modules/
│   │   ├── discovery/            # Lead discovery (KVK + Google Places)
│   │   ├── analyzer/             # Website analysis (Lighthouse + AI)
│   │   ├── outreach/             # AI email generation and sending
│   │   ├── pipeline/             # Pipeline stage management
│   │   ├── leads/                # Bulk actions, CSV import/export
│   │   └── import-export/        # CSV parsing utilities
│   └── workers/                  # BullMQ background job workers
│       ├── queues.ts             # 6 named queues
│       ├── discovery.ts           # Discovery worker
│       ├── analysis.ts            # Analysis worker
│       └── outreach.ts            # Outreach worker
├── web/                          # Frontend (Next.js 15, React 19, Tailwind 4)
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── agents/page.tsx       # Agent pipeline runner + management
│   │   ├── agents/[name]/page.tsx # Agent detail (editable config)
│   │   ├── pipeline/page.tsx     # Kanban board
│   │   └── settings/page.tsx     # Settings & data management
│   ├── components/               # React components (kanban, leads, analysis, etc.)
│   └── lib/
│       ├── api.ts                # API client
│       ├── types.ts              # TypeScript types
│       └── hooks/                # Custom hooks (usePolling)
├── agents/                        # Agent identity files (source of truth)
│   ├── research/                 # IDENTITY.md, SOUL.md, TOOLS.md
│   ├── analysis/                 # IDENTITY.md, SOUL.md, TOOLS.md
│   └── outreach/                 # IDENTITY.md, SOUL.md, TOOLS.md
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── seed.ts                   # Seed data
│   └── migrations/               # Database migrations
├── docker-compose.yml            # PostgreSQL + Redis + Lightpanda
├── .env.example                  # Environment variables template
├── CLAUDE.md                     # AI coding assistant instructions
└── package.json                  # Workspace root
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify (Node.js, TypeScript, ESM) |
| Database | PostgreSQL 16 via Prisma ORM |
| Queues | BullMQ (Redis-backed) |
| AI | GLM (OpenAI-compatible API) |
| Email | Resend |
| Browser | Lightpanda (CDP, low RAM) + Playwright Chromium fallback |
| Frontend | Next.js 15, React 19, Tailwind 4 |
| Scraping | Cheerio + Playwright |
| Business Data | KVK Open API, Google Places API |
| Audits | Lighthouse |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with hot reload (tsx watch, port 3001) |
| `npm run dev:web` | Start Next.js dashboard (port 3000) |
| `npm run build` | TypeScript compile check |
| `npm run build:web` | Build Next.js for production |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:migrate:deploy` | Deploy migrations (production) |
| `npm run db:seed` | Seed pipeline stages + 3 agents |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking |

## API Endpoints

All endpoints are under `/api/`.

### Leads

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads/discover` | Trigger lead discovery job |
| POST | `/api/leads` | Create a lead manually |
| GET | `/api/leads` | List leads (paginated, filterable) |
| GET | `/api/leads/:id` | Get lead with analyses and outreaches |
| PATCH | `/api/leads/:id` | Update lead fields/status |
| POST | `/api/leads/bulk/analyze` | Bulk analyze leads |
| POST | `/api/leads/bulk/outreach` | Bulk generate outreach |
| POST | `/api/leads/import` | Import leads from CSV |
| GET | `/api/leads/export` | Export leads as CSV |

### Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads/:id/analyze` | Trigger website analysis |
| GET | `/api/leads/:id/analyses` | List analyses for a lead |
| GET | `/api/analyses/:id` | Get single analysis |
| GET | `/api/analyses/:id/report` | Download PDF report |

### Outreach

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads/:id/outreach/generate` | Generate AI email |
| POST | `/api/leads/:id/outreach/send` | Send an approved email |
| GET | `/api/leads/:id/outreaches` | Get outreach history |
| GET | `/api/outreaches` | List all outreaches (filterable) |
| GET | `/api/outreaches/:id` | Get single outreach |
| PATCH | `/api/outreaches/:id` | Update draft or approve |
| GET | `/api/outreach/rate-limit` | Check daily send limit |

### Agent Pipeline

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/run` | Run pipeline (query, language, maxResults) |
| GET | `/api/agents/runs` | List pipeline runs |
| GET | `/api/agents/runs/:id` | Get run details with leads |
| GET | `/api/agents/runs/:id/emails` | Get email drafts from a run |
| POST | `/api/agents/runs/:id/cancel` | Cancel a running pipeline |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/name/:name` | Get agent by name |
| PATCH | `/api/agents/name/:name` | Update agent config |
| POST | `/api/agents/seed` | Re-seed default agents |
| GET | `/api/agents/tools` | List all 16 registered tools |
| GET | `/api/agents/logs` | View agent execution logs |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/pipeline` | Pipeline stages with lead counts |
| GET | `/api/dashboard/stats` | Dashboard metrics |
| POST | `/api/webhooks/resend` | Resend email tracking (open/reply/bounce) |

## Example Usage

```bash
# Run the full agent pipeline (English emails)
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"restaurants in Amsterdam","language":"en","maxResults":10}'

# Run with Dutch emails
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"tandartsen in Rotterdam","language":"nl","maxResults":5}'

# Run with Arabic emails (e.g., businesses in Dubai)
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"restaurants in Dubai","language":"ar","maxResults":5}'

# Analyze a single lead
curl -X POST http://localhost:3001/api/leads/{leadId}/analyze \
  -H "Content-Type: application/json" \
  -d '{"sync":true}'

# Generate and send an outreach email
curl -X POST http://localhost:3001/api/leads/{leadId}/outreach/generate \
  -H "Content-Type: application/json" \
  -d '{"sync":true,"tone":"professional","language":"nl"}'
```

## Database Schema

| Model | Description | Key Fields |
|-------|-------------|------------|
| **Lead** | Core business record | businessName, city, website, status, leadScore |
| **Analysis** | Website audit results | score (0-100), findings, opportunities, techStack |
| **Outreach** | Email record | subject, body, tone, language, status |
| **PipelineStage** | Kanban columns | name, order |
| **Agent** | AI agent config | identityMd, soulMd, toolsMd, toolNames |
| **AgentLog** | Execution logs | phase, tokens, duration, output |
| **AgentPipelineRun** | Pipeline run record | query, status, leadsFound, emailsDrafted |

**Lead statuses**: `discovered` → `analyzing` → `analyzed` → `contacting` → `responded` → `qualified` → `won` / `lost`

**Outreach statuses**: `draft` → `pending_approval` → `approved` → `sent` → `opened` / `replied` / `bounced` / `failed`

## Agent Pipeline

The core of FindX is a 3-phase AI agent pipeline:

1. **Research Agent** — Takes a search query (e.g., "restaurants in Amsterdam") and finds matching businesses across multiple countries using web search, local business registries (KVK, Companies House, Handelsregister, etc.), and Google Places. Saves them as leads.

2. **Analysis Agent** — For each lead with a website, runs Lighthouse audits, detects the tech stack, checks SSL, scores the website 0-100, Identifies improvement opportunities.

3. **Outreach Agent** — Reads analysis results and generates personalized cold emails in English (`en`), Dutch (`nl`), or Arabic (`ar`). References specific findings (e.g., "Your website loads in 8.2 seconds").

Agents are configurable through the dashboard — edit identity, personality, tools, and skills at `/agents/[name]`.

## Troubleshooting

### "Port 3001 already in use"

The backend didn't shut down cleanly. Find and kill the process:

```bash
netstat -ano | grep ":3001" | grep LISTENING
# Then kill the PID
taskkill /F /PID <PID>
```

Then restart: `npm run dev`

### "Port 3000 already in use"

Same approach — find and kill the process on port 3000.

### "Database connection error"

PostgreSQL might not be running:

```bash
docker compose ps              # Check status
docker compose up -d           # Start if stopped
docker compose restart postgres # Restart if stuck
```

### "Empty pipeline/dashboard"

The backend is likely down. Check:

```bash
curl http://localhost:3001/api/health      # Backend health
curl http://localhost:3001/api/leads?pageSize=10  # Data check
```

### "Docker containers not starting"

```bash
docker compose down          # Stop everything
docker compose up -d          # Start fresh
docker compose logs postgres  # Check logs if issues
```

### "Changes not taking effect"

The `tsx watch` hot reload sometimes misses edits. Kill and restart:

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill /F /PID <PID>
npm run dev
```

## Support the Project

If FindX helped you, consider buying me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee&style=for-the-badge)](https://buymeacoffee.com/mrarabai)

## License

Private — All rights reserved.
