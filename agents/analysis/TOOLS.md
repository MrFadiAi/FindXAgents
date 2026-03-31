# Available Tools

## Verification
- **check_website**: Verify a URL resolves, returns 200, and is accessible. Run this FIRST — it gates all other tools.

## Auditing
- **run_lighthouse**: Run a Lighthouse audit. Returns performance, accessibility, SEO, and best practices scores. Takes 10-30 seconds per run. Run TWICE (average scores), third run as tiebreaker if scores diverge by more than 15 points on any metric.
- **detect_tech**: Detect technologies used by a website — CMS, hosting, analytics, JS frameworks. Use `renderJs: true` to catch client-side frameworks (React, Vue, Angular).
- **scrape_page**: Extract page content for context — business info, contact details, opening hours, services.

## Security & Compliance
- **check_ssl**: Check TLS certificate status — validity, expiry date, protocol version (TLS 1.2/1.3), chain integrity.

## Visual & UX
- **take_screenshot**: Capture a screenshot of the page for visual record. Useful for before/after comparisons and spotting layout issues.
- **check_mobile_friendly**: Evaluate mobile usability — tap target sizes, viewport configuration, font sizes, responsive behavior.

## Competitive Analysis
- **competitor_compare**: Compare the website against local competitors in the same industry and region. Provides relative ranking.

## Domain Intelligence
- **domain_age_check**: Check domain registration date and age. Older domains get a slight trust bonus; very new domains may indicate less established businesses.

## Persistence
- **save_analysis**: Save analysis results to database. Updates lead status to "analyzed". Must include all collected fields.

## Execution Strategy

Run tools in this sequence. The order matters — early tools gate later ones.

### Phase 1: Prerequisite (sequential)
1. `check_website` — Verify the site is up. If this fails, skip to `save_analysis` with status "unreachable".

### Phase 2: Lighthouse (sequential, at least 2 runs)
2. `run_lighthouse` — First run
3. `run_lighthouse` — Second run. Average the scores.
   - If any metric differs by more than 15 points between runs, execute a third run and take the median.

### Phase 3: Deep analysis (parallel)
Steps 4-9 can run in parallel since they are independent. The runner supports parallel execution.

4. `detect_tech` — Identify technology stack (use `renderJs: true`)
5. `scrape_page` — Extract content and business info
6. `check_ssl` — Certificate status and expiry
7. `take_screenshot` — Visual record
8. `check_mobile_friendly` — Mobile UX audit
9. `competitor_compare` — Competitive context

### Phase 4: Save
10. `save_analysis` — Persist ALL findings in a single call

## save_analysis Fields

The `save_analysis` call must include these fields when available:

| Field | Source | Required |
|-------|--------|----------|
| lighthouseScores | run_lighthouse (averaged) | Yes |
| techStack | detect_tech | Yes |
| pageContent | scrape_page | Yes |
| sslStatus | check_ssl | Yes |
| mobileScore | check_mobile_friendly | Yes |
| competitorComparison | competitor_compare | Yes |
| domainAge | domain_age_check | No |
| screenshot | take_screenshot | No |
| overallScore | Calculated from all above | Yes |
| recommendations | Generated from findings | Yes |
| industryContext | Inferred from business type | Yes |

If any tool in Phase 3 fails, save the results from successful tools and mark the failed fields as unavailable with a reason.
