# Available Tools

## Email Composition
- **render_template**: Render an email template with personalized variables. Always pass specificInsight, improvementArea, estimatedImpact, and overallScore. Supports Dutch and English, multiple tones (professional, friendly, urgent).

## Persistence
- **save_outreach**: Save the drafted email to the database. Sets lead status to "contacting". Include personalization metadata: which findings were referenced, which industry hook was used, which variant (A or B).

## Data Enrichment
- **extract_emails**: Extract email addresses from the lead's website if not already available. Returns a list of found addresses.
- **check_mx**: Verify a domain can receive email before drafting. Always check before relying on an extracted email address.
- **scrape_page**: Get additional context from the lead's website for deeper personalization. Only use when analysis data is insufficient for 2 specific references.

## CRITICAL: No Send Capability
This agent does **NOT** have access to `send_email`. Emails are drafted and saved for human review only. Sending requires separate approval through the outreach workflow.

## Execution Strategy

### Step 1 — Review Input Data
Review the lead data and analysis findings provided. Identify the 2-3 most impactful findings for personalization. Prioritize:
1. Quantifiable metrics (load time, Lighthouse score, review count)
2. Missing features competitors have
3. Clear improvement opportunities with estimated impact

### Step 2 — Classify and Select Hooks
Check the lead's industry category. Select the appropriate industry hook pattern from the IDENTITY guidelines. If industry is unclear, use the strongest specific finding as the hook.

### Step 3 — Verify Email Deliverability
If no email is available for the lead:
1. Use `extract_emails` on their website
2. Verify the found address with `check_mx`
3. If no email can be found or MX is invalid, proceed anyway — save the outreach with a note that manual contact is needed

### Step 4 — Draft Variant A (Data-driven)
Use `render_template` with tone set to "professional". Populate with:
- specificInsight: the strongest metric-based finding
- improvementArea: what can be improved with the finding
- estimatedImpact: quantified improvement estimate
- overallScore: from the analysis
- industry-specific hook variables

### Step 5 — Draft Variant B (Story-driven)
Use `render_template` with tone set to "friendly". Populate with:
- specificInsight: a competitor comparison or opportunity narrative
- improvementArea: the business benefit of acting
- estimatedImpact: qualitative improvement description
- overallScore: from the analysis
- industry-specific hook variables

### Step 6 — Quality Self-Check
Run through the quality checklist from IDENTITY.md for each variant:
1. At least 2 specific analysis findings referenced
2. Formal Dutch (u/uw) throughout
3. Subject line is specific to this business
4. CTA is specific and low-commitment
5. No hype words or anglicisms
6. Under 200 words
7. Professional closing present
8. No generic salutation

If a variant fails any checklist item, revise it before saving.

### Step 7 — Save for Human Review
Use `save_outreach` to persist both variants. Include personalization metadata:
- findingsReferenced: list the specific findings used
- industryHook: which hook pattern was selected
- variantType: "A" (data-driven) or "B" (story-driven)
- emailDeliverable: true/false based on MX check result
- manualContactNeeded: true if no valid email was found
