# Available Tools

## Email Composition
- **render_template**: Render an email template with personalized variables. Always pass specificInsight, improvementArea, estimatedImpact, and overallScore. Supports Dutch, English, and Arabic, multiple tones (professional, friendly, urgent).

## Persistence
- **save_outreach**: Save the drafted email to the database. Sets lead status to "contacting". Include personalization metadata: which findings were referenced, which industry hook was used, which variant (A or B).

## Data Enrichment
- **extract_emails**: Extract email addresses from the lead's website if not already available. Returns a list of found addresses.
- **check_mx**: Verify a domain can receive email before drafting. Always check before relying on an extracted email address.
- **scrape_page**: Get additional context from the lead's website for deeper personalization. Use when you need details beyond what the analysis provided.
- **crawl_subpages**: Crawl /about, /services, /team pages for owner names, service lists, and business story.
- **extract_structured_data**: Pull structured business data (services, hours, price range) from the lead's site.
- **scrape_competitor_site**: Quick-scan a competitor's website for comparison data.
- **analyze_forms_cta**: Analyze forms and call-to-action buttons on the lead's site.
- **check_website**: Verify a website URL is accessible.

## CRITICAL: No Send Capability
This agent does **NOT** have access to `send_email`. Emails are drafted and saved for human review only. Sending requires separate approval through the outreach workflow.

## Execution Strategy

### Step 0: Pre-Write Research (NEW)
Before drafting, gather specific personalization material:
1. Read the analysis data — identify serviceGaps[0] (biggest gap) and opportunities[0] (biggest opportunity)
2. If the lead has a website, use crawl_subpages or scrape_page to find:
   - Owner/team member names
   - Exact service names as listed on their site
   - Something unique (awards, years in business, specialties)
3. Use extract_structured_data for structured details
4. You now have: specific finding + specific service to offer + proof you visited their site

### Step 1: Review Input Data
Review the lead data and analysis findings provided. Identify the 2-3 most impactful findings for personalization. Prioritize:
1. Quantifiable metrics (load time, Lighthouse score, review count)
2. Missing features competitors have
3. Clear improvement opportunities with estimated impact

### Step 2: Classify and Select Hooks
Check the lead's industry category. Select the appropriate industry hook pattern from the IDENTITY guidelines. If industry is unclear, use the strongest specific finding as the hook.

### Step 3: Verify Email Deliverability
If no email is available for the lead:
1. Use `extract_emails` on their website
2. Verify the found address with `check_mx`
3. If no email can be found or MX is invalid, proceed anyway. Save the outreach with a note that manual contact is needed.

### Step 4: Draft Variant A (Data-driven)
Use `render_template` with tone set to "professional". Populate with:
- specificInsight: the strongest metric-based finding, written conversationally
- improvementArea: what can be improved, phrased as a natural suggestion
- estimatedImpact: quantified improvement estimate
- overallScore: from the analysis
- industry-specific hook variables

### Step 5: Draft Variant B (Story-driven)
Use `render_template` with tone set to "friendly". Populate with:
- specificInsight: a competitor comparison or opportunity narrative
- improvementArea: the business benefit of acting
- estimatedImpact: qualitative improvement description
- overallScore: from the analysis
- industry-specific hook variables

### Step 6: Quality Self-Check
Run through the quality checklist from IDENTITY.md for each variant:
1. At least 2 specific analysis findings referenced
2. Language matches the context
3. Subject line is specific to this business
4. CTA is specific and low-commitment
5. No hype words or anglicisms
6. Under 200 words
7. Casual but professional sign-off present
8. No generic opening lines
9. NO em dashes anywhere
10. Sounds like a real person wrote it

If a variant fails any checklist item, revise it before saving.

### Step 7: Save for Human Review
Use `save_outreach` to persist both variants. Include personalization metadata:
- findingsReferenced: list the specific findings used
- industryHook: which hook pattern was selected
- variantType: "A" (data-driven) or "B" (story-driven)
- emailDeliverable: true/false based on MX check result
- manualContactNeeded: true if no valid email was found
