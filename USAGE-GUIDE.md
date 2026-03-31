# FindX Usage Guide

Step-by-step instructions for discovering, analyzing, and reaching out to Dutch businesses.

---

## Prerequisites Checklist

Before using FindX, ensure you have:
- [ ] Docker Desktop running
- [ ] Node.js 20+ installed
- [ ] API keys ready: Anthropic, Resend, KVK (optional), Google Maps (optional)

- [ ] A domain or email sender configured in Resend with DKIM/SPF/DMARC set up

---

## Step 1: Start the Infrastructure

Open a terminal in the project root:

```bash
docker compose up -d
```
Verify services are running:
```bash
docker compose ps
```
You should see `postgres` and `redis` with status "running".

**Ports:**
- PostgreSQL: `localhost:5432` (user: findx, password: findx, database: findx)
- Redis: `localhost:6379`

---

## Step 2: Configure Environment
Copy the example env file and edit it it it```bash
cp .env.example .env
```

Open `.env` and fill in your API keys:
```env
# Database (pre-configured for Docker)
DATABASE_URL=postgresql://findx:findx@localhost:5432/findx

# Redis (pre-configured for Docker)
REDIS_URL=redis://localhost:6379

# Required: Anthropic Claude API key for AI features
ANTHROPIC_API_KEY=sk-ant-...

# Required: Resend API key for sending emails
RESEND_API_KEY=re_...

# Required: Your verified sender email
EMAIL_FROM=findx@yourdomain.com

# Optional: For Dutch business data discovery
KVK_API_KEY=...

# Optional: For Google Places business discovery
GOOGLE_MAPS_API_KEY=...

# Server config
PORT=3001
NODE_ENV=development
```

---

## Step 3: Install Dependencies
```bash
# From project root
npm install
```
This installs both the API and frontend dependencies (npm workspaces).

---
## Step 4: Set Up the Database
```bash
npx prisma migrate dev --name init
```
This creates the database tables from running the migration. On first run, Prisma generates the Prisma Client.

 To start fresh:
```bash
npx prisma migrate dev --name init
```

**(Optional)** Seed the database with sample pipeline stages:
```bash
npm run db:seed
```

**(Optional)** Browse your database visually:
```bash
npm run db:studio
```
Opens Prisma Studio at http://localhost:5555.

 ---

## Step 5: Start the Application
You need two terminals:

**Terminal 1 -- API Server:**
```bash
npm run dev
```
This starts the Fastify API with hot reload on http://127.0.0.1:3001.
 ---

**Terminal 2 -- Frontend:**
```bash
npm run dev:web
```
This starts the Next.js dashboard on http://localhost:3000. ---

**(Optional) Terminal 3 -- Background Workers:**
If you want to process discovery/analysis/outreach jobs asynchronously, you worker processes:
```bash
npx tsx src/workers/discovery.ts
npx tsx src/workers/analysis.ts
npx tsx src/workers/outreach.ts
```

---
## Step 6: Using the Dashboard
Open http://localhost:3000 in your browser.

 -- ### Pipeline Page (Home)
- **Kanban View**: Drag and drop leads between pipeline stages
- **List View**: Sort and filter leads in a table
- Click any lead to see details (analyses, outreach emails, notes)
- **Metrics Bar**: Shows total leads, contacted, responded, won counts, conversion rate

 lead this week
 ---

### Discover Page (/discover)
- Enter a **city** (e.g., Amsterdam, Rotterdam, Utrecht)
- Optionally enter **industry** (e.g., IT consulting, horeca, bouw)
- Optionally enter **SBI code** (Dutch business classification)
- Select **sources** (KVK, Google, or both)
- Set **limit** (100-1000 leads per batch)
- Click **Discover** to start the job
 ---

### Settings Page (/settings)
- View current API endpoint URLs
- **Note**: Settings are display-only in current version. Configure via `.env` file. ---

## Step 7: Typical Workflow

Here's the complete workflow to go from discovering to closing a deal:
 ---

### 7a. Discover Leads
Use the Discover page or API:
```bash
curl -X POST http://localhost:3001/api/leads/discover \
  -H "Content-Type: application/json" \
  -d '{"city":"Amsterdam","industry":"horeca","limit":100,"sync":true}'
```
Or use the dashboard UI at http://localhost:3000/discover.

 ---

### 7b. Analyze a Website
Once leads are discovered, analyze those with websites:
```bash
curl -X POST http://localhost:3001/api/leads/{leadId}/analyze \
  -H "Content-Type: application/json" \
  -d '{"sync":true}'
```
Or click the **Analyze** button in the lead detail panel. ---

The analysis runs:
  - Lighthouse audit (Performance, Accessibility, SEO, Best Practices)
- Technology detection (CMS, hosting, analytics)
- AI automation opportunity detection
- Overall score (0-100)
 with category breakdown
 ---

### 7c. Generate Outreach Email
For leads with analysis results, generate a personalized email:
```bash
curl -X POST http://localhost:3001/api/leads/{leadId}/outreach/generate \
  -H "Content-Type: application/json" \
  -d '{"sync":true,"tone":"friendly","language":"nl"}'
```
Or click **Generate Email** in the lead detail panel. ---

Available options:
- `tone`: `professional`, `friendly`, `urgent`
- `language`: `nl` (Dutch) or `en` (English)
- `generateVariants`: `true` to get multiple tone options
 ---

### 7d. Review and Send
Review the generated email, make edits if needed, then send:
 ---

```bash
# Edit the draft
curl -X PATCH http://localhost:3001/api/outreaches/{outreachId} \
  -H "Content-Type: application/json" \
  -d '{"subject":"New subject","body":"Updated body text"}'

# Approve and send
curl -X POST http://localhost:3001/api/leads/{leadId}/outreach/send \
  -H "Content-Type: application/json" \
  -d '{"outreachId":"{outreachId}","sync":true}'
```
 ---

### 7e. Track Results
Email tracking happens automatically via Resend webhooks:
 - **Opened**: When a recipient opens the email
- **Replied**: When the recipient responds
- **Bounced**: When delivery fails

Check the rate limit status:
```bash
curl http://localhost:3001/api/outreach/rate-limit
```
Max 200 emails/day for cold outreach. ---

## Step 8: Common Operations

### List leads with filters
```bash
# All leads, page 1
curl "http://localhost:3001/api/leads?page=1&pageSize=25"

# Filter by city
curl "http://localhost:3001/api/leads?city=Amsterdam"

# Filter by status
curl "http://localhost:3001/api/leads?status=discovered"

# Only leads without websites
curl "http://localhost:3001/api/leads?hasWebsite=false"

# Search by name
curl "http://localhost:3001/api/leads?search=bert"
```
 ---

### Get lead details
```bash
curl "http://localhost:3001/api/leads/{leadId}"
```
Returns the lead with all analyses, outreaches, and pipeline stage. ---

### Update lead status
```bash
curl -X PATCH "http://localhost:3001/api/leads/{leadId}" \
  -H "Content-Type: application/json" \
  -d '{"status":"qualified"}'
```
Valid statuses: `discovered`, `analyzing`, `analyzed`, `contacting`, `responded`, `qualified`, `won`, `lost` ---

### Download analysis report
```bash
curl -o report.pdf "http://localhost:3001/api/analyses/{analysisId}/report"
```
Downloads a branded PDF report with findings and scores. ---

## Step 9: Email Setup (Resend)
To send outreach emails, you need a Resend configured:
  1. Sign up at [resend.com](https://resend.com)
2. Add your domain and verify DNS (DKIM, SPF, DMARC records)
3. Copy your API key to `RESEND_API_KEY` in `.env`
4. Set `EMAIL_FROM` to your verified sender address

 ---

## Step 10: Stopping Everything
```bash
# Stop the app (Ctrl+C in each terminal)

# Stop infrastructure
docker compose down
```

To also remove data:
```bash
docker compose down -v
```

---

## Troubleshooting
 **API won't start**
  - Check `.env` has valid `DATABASE_URL` and `REDIS_URL`
  - Ensure PostgreSQL and Redis are running: `docker compose ps`
  - Check Node.js version: `node --version` (need 20+)

**No leads found**
  - Verify KVK API key is valid and active
  - Try broader search terms (city only, no industry filter)
  - Check discovery worker logs for errors

**Analysis fails**
  - Ensure `ANTHROPIC_API_KEY` is set and valid
  - Some sites block automated access — try with a different lead
  - Check worker logs for timeout errors

**Emails not sending**
  - Verify Resend domain is verified (DKIM/SPF/DMARC)
  - Check `RESEND_API_KEY` and `EMAIL_FROM` are correct
  - Verify rate limit is not exceeded: `GET /api/outreach/rate-limit`

**Database issues**
  - Reset and re-migrate: `npx prisma migrate reset && npx prisma migrate dev`
  - View data: `npm run db:studio`

---

## Project Files
| File | Purpose |
|------|---------|
| `.env.example` | Template for all required environment variables |
| `docker-compose.yml` | PostgreSQL 16 + Redis 7 containers |
| `prisma/schema.prisma` | Database tables and relationships |
| `findx-brand-kit.md` | Email templates, brand voice, messaging guide |
| `src/server.ts` | API entry point |
| `src/routes/index.ts` | All API endpoint definitions |
| `web/app/page.tsx` | Pipeline dashboard UI |
| `web/app/discover/page.tsx` | Lead discovery UI |
