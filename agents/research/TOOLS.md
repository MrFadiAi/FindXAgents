# Available Tools

## Search & Discovery
- **web_search**: Search the web via SearXNG. Use multiple query variations (city + industry, Dutch keywords).
- **kvk_search**: Query the Dutch Chamber of Commerce (KVK) registry. Returns structured business data with trade names, addresses, and SBI codes. Gracefully degrades if KVK_API_KEY is not configured.
- **google_places_search**: Search Google Places for businesses by location and category. Good for finding businesses with physical locations. Gracefully degrades if GOOGLE_MAPS_API_KEY is not configured.

## Verification & Enrichment
- **check_website**: Verify a URL resolves and is accessible before scraping.
- **scrape_page**: Extract content, contact info, and metadata from a web page. Use renderJs=true for JavaScript-heavy sites.
- **extract_emails**: Extract email addresses from a webpage. Prioritize info@, contact@, hallo@ addresses.
- **extract_social_links**: Find social media profiles (LinkedIn, Facebook, Instagram, etc.).
- **check_mx**: Verify a domain can receive email via MX records. Always run this before trusting an email address.
- **get_place_details**: Fetch detailed Google Business profile for a business -- rating, review count, reviews, opening hours, and category. Pass a business name and city, or a Google placeId. Use after `google_places_search` to get richer data.
- **check_ssl**: Check the SSL/TLS certificate of a website. Returns validity status, issuer, expiry date, and days remaining. Flag businesses with expired or missing SSL certificates.

## Persistence
- **save_lead**: Save a discovered business as a lead. Always include businessName and city. Deduplicates automatically by KVK number, then website, then businessName+city.

## Tool Execution Strategy

Follow this order for each search query:

### Step 1: Discovery
Call `kvk_search` or `google_places_search` to find businesses matching the query.
- If KVK returns 0 results, fall back to `google_places_search`
- If both return 0, use `web_search` with broader Dutch-language terms

### Step 2: Per-result enrichment (call independent tools in parallel)
For each business found:
1. `check_website` -- verify the URL is live
2. If website exists (parallel calls):
   - `scrape_page` -- extract contact details and description
   - `extract_emails` -- find email addresses
   - `extract_social_links` -- find social profiles
   - `check_ssl` -- check certificate status
3. If no website found, note this explicitly in the lead

### Step 3: Google Places enrichment
For results from `google_places_search`:
- Call `get_place_details` to get reviews, ratings, and opening hours

### Step 4: Email verification
- Run `check_mx` on every email address found before saving it

### Step 5: Save
- Save each verified business immediately with `save_lead`
- Include all collected data in a single call -- do not save incrementally

### Parallel execution
Call independent tools in parallel when possible. The runner supports concurrent tool calls. Examples of safe parallel calls:
- `check_website` + `get_place_details` (different data sources)
- `extract_emails` + `extract_social_links` + `check_ssl` (same site, different data)

## Planned Tools (not yet available)
These tools are planned for a future release. Reference them in your reasoning but do not attempt to call them:
- **domain_age_check**: Check how old a domain is. Useful for identifying new businesses (higher outreach potential) vs. established ones.
- **competitor_compare**: Find competitors in the same city/industry. When available, use for the top 5 most promising leads only -- it is an expensive call.
