# SearXNG Setup & Usage Guide

## What is SearXNG?
A free, self-hosted meta search engine that aggregates 70+ search engines (Google, Bing, DuckDuckGo, Reddit, YouTube, GitHub, news, etc.) into one API. No API keys needed. Completely private.

---

## Installation (WSL2 / Linux)

### Prerequisites
- Docker installed (`docker --version`)

### Step 1: Create config directory
```bash
mkdir -p ~/searxng-config
```

### Step 2: Create settings.yml
The config file must be created inside a Docker container (file ownership issue on WSL):

```bash
docker run --rm -v ~/searxng-config:/etc/searxng:rw searxng/searxng sh -c 'cat > /etc/searxng/settings.yml << EOF
use_default_settings: true

server:
  secret_key: "your-secret-key-here"
  limiter: false
  image_proxy: true

search:
  safe_search: 0
  autocomplete: ""
  default_lang: "en"
  formats:
    - html
    - json
EOF'
```

**Important:** The `formats` section must include `json` or the API will return 403.

### Step 3: Run SearXNG
```bash
docker run -d \
  --name searxng \
  -p 8080:8080 \
  -v ~/searxng-config:/etc/searxng:rw \
  searxng/searxng
```

### Step 4: Verify it works
```bash
curl -s "http://localhost:8080/search?q=test&format=json" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Working! Got {len(d.get(\"results\",[]))} results')
"
```

---

## API Usage

### Basic search (general)
```bash
curl -s "http://localhost:8080/search?q=YOUR+QUERY&format=json"
```

### Search with categories
Available categories: `general`, `news`, `videos`, `images`, `music`, `it`, `science`, `files`, `social media`

```bash
# News only
curl -s "http://localhost:8080/search?q=AI+agents&format=json&categories=news"

# General + News + Videos combined
curl -s "http://localhost:8080/search?q=AI+agents&format=json&categories=general,news,videos"
```

### Search specific engines
```bash
# YouTube only
curl -s "http://localhost:8080/search?q=AI+tutorial&format=json&engines=youtube"

# Reddit only
curl -s "http://localhost:8080/search?q=bitcoin+discussion&format=json&engines=reddit"

# Google + DuckDuckGo + Brave
curl -s "http://localhost:8080/search?q=best+AI+tools&format=json&engines=google,duckduckgo,brave"
```

### Pagination
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json&pageno=2"
```

### Language
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json&language=en"
```

---

## Response Format

Each result has:
```json
{
  "title": "Article Title",
  "url": "https://example.com/article",
  "content": "Short snippet of the article...",
  "engine": "google",
  "score": 1.5,
  "category": "general",
  "publishedDate": "2026-03-29T12:00:00"
}
```

---

## Useful One-Liners for Agents

### Get top 10 results with titles and URLs
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json&categories=general,news" | \
python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{r[\"title\"][:80]} | {r[\"url\"]}') for r in d.get('results',[])[:10]]"
```

### Get results grouped by engine
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json" | \
python3 -c "
import json, sys
d = json.load(sys.stdin)
engines = {}
for r in d.get('results',[]):
    e = r.get('engine','?')
    engines.setdefault(e,[]).append(r.get('title','?')[:60])
for e, titles in sorted(engines.items()):
    print(f'\n{e} ({len(titles)} results):')
    for t in titles[:3]:
        print(f'  - {t}')
"
```

### Get news from last 24h
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json&categories=news&time_range=day"
```

Time range options: `day`, `week`, `month`, `year`

### Extract full article text (combine with Jina Reader)
```bash
# Step 1: Find article URL
URL=$(curl -s "http://localhost:8080/search?q=QUERY&format=json&categories=news" | \
python3 -c "import json,sys; d=json.load(sys.stdin); print(d['results'][0]['url'])")

# Step 2: Read full article
curl -s "https://r.jina.ai/$URL"
```

---

## Available Engines (most useful ones)

| Engine | Category | Notes |
|---|---|---|
| google | general | Best overall |
| bing news | news | Great news coverage |
| duckduckgo | general | Good fallback |
| brave | general | Privacy-focused |
| youtube | videos | Video search |
| reddit | social media | Reddit threads |
| github | it | Code & repos |
| stackoverflow | it | Q&A |
| wikipedia | general | Encyclopedia |
| arxiv | science | Research papers |
| startpage | general | Google proxy |
| qwant news | news | European news |
| reuters | news | Wire service |
| yahoo news | news | Aggregated news |

---

## Management Commands

```bash
# Start
docker start searxng

# Stop
docker stop searxng

# Restart
docker restart searxng

# View logs
docker logs searxng

# Update
docker stop searxng && docker rm searxng
docker pull searxng/searxng
docker run -d --name searxng -p 8080:8080 -v ~/searxng-config:/etc/searxng:rw searxng/searxng

# Auto-start on boot (systemd)
docker update --restart=always searxng
```

---

## Troubleshooting

**403 Forbidden on /search?format=json**
- JSON format not enabled in settings.yml
- Make sure `formats` includes `json`

**No results returned**
- Some engines get rate-limited
- Try `time_range=day` or different categories
- Check logs: `docker logs searxng`

**Permission denied on settings.yml**
- Config file is owned by root inside Docker
- Edit it inside a container: `docker exec -it searxng vi /etc/searxng/settings.yml`
- Or use `sudo chmod 666 ~/searxng-config/settings.yml`

---

## Agent Integration Pattern

For AI agents (OpenClaw, Claude Code, etc.), use this pattern:

```
1. DISCOVER: SearXNG search (fast, broad)
   curl localhost:8080/search?q=TOPIC&format=json&categories=general,news

2. DEEP READ: Jina Reader (full article text)
   curl https://r.jina.ai/URL

3. COMBINE: Merge SearXNG results with Jina full-text for complete intelligence
```

Base URL: `http://localhost:8080`
API endpoint: `/search`
Required params: `q` (query), `format=json`
Optional params: `categories`, `engines`, `pageno`, `language`, `time_range`
