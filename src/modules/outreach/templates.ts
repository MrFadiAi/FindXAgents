// Email template system for FindX outreach
// Supports Dutch (default) and English with tone variants
// Dutch templates use formal "u" register for professional business communication

export type EmailTone = "professional" | "friendly" | "urgent";
export type EmailLanguage = "en" | "nl" | "ar";

export interface TemplateVariables {
  companyName: string;
  contactName: string;
  industry?: string;
  city: string;
  specificInsight: string;
  improvementArea: string;
  estimatedImpact: string;
  overallScore?: string;
  senderName: string;
  meetingLink: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: "cold_no_website" | "cold_has_website" | "followup_1" | "followup_2" | "breakup" | "meeting_confirm" | "proposal_followup";
  language: EmailLanguage;
  subject: string;
  body: string;
}

const TEMPLATES: EmailTemplate[] = [
  // --- Dutch templates (formal "u" register) ---
  {
    id: "nl_cold_no_website",
    name: "Cold Outreach — Geen Website (NL)",
    category: "cold_no_website",
    language: "nl",
    subject: "{{companyName}} is online niet vindbaar",
    body: `Beste {{contactName}},

Ik onderzoek de online aanwezigheid van {{industry}}-bedrijven in {{city}}. Daarbij viel me op dat {{companyName}} geen website heeft.

In de {{industry}} zoekt 7 van de 10 klanten online naar een aanbieder. Zonder website bent u onvindbaar voor die groep. Concurrenten in {{city}} met een website ontvangen die aanvragen automatisch.

Ik kan voor {{companyName}} een website opzetten die:
- Gevonden wordt bij lokale zoekopdrachten in {{city}}
- Past bij uw bedrijfsvoering en uitstraling
- Binnen twee weken online staat

Zal ik u een korte uitleg geven? Een telefoontje van 15 minuten is voldoende.

[Plan een gesprek]({{meetingLink}})

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_cold_has_website",
    name: "Cold Outreach — Verbetermogelijkheden (NL)",
    category: "cold_has_website",
    language: "nl",
    subject: "{{specificInsight}} — bevinding bij {{companyName}}",
    body: `Beste {{contactName}},

Ik heb de website van {{companyName}} geanalyseerd. Eén bevinding springt eruit: {{specificInsight}}.

Uw website scoort {{overallScore}}/100. Bedrijven in de {{industry}} die dit soort punten aanpakken, zien gemiddeld {{estimatedImpact}}. De belangrijkste stap voor {{companyName}}: {{improvementArea}}.

Ik heb de volledige analyse met concrete aanbevelingen klaargezet. Zullen we 15 minuten bellen zodat ik u door de bevindingen loop?

[Plan een gesprek]({{meetingLink}})

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_followup_1",
    name: "Follow-Up 1 — 3 dagen (NL)",
    category: "followup_1",
    language: "nl",
    subject: "Re: {{originalSubject}}",
    body: `Beste {{contactName}},

Ik stuur u een korte follow-up naar aanleiding van mijn analyse van {{companyName}}. Ik begrijp dat u het druk heeft — daarom houd ik het kort.

De bevindingen blijven actueel. Als u wilt, plan ik graag een moment dat u beter uitkomt.

[Plan een gesprek]({{meetingLink}})

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_followup_2",
    name: "Follow-Up 2 — 7 dagen (NL)",
    category: "followup_2",
    language: "nl",
    subject: "Analyse {{companyName}} — nog één opmerking",
    body: `Beste {{contactName}},

Eén laatste ding. Bij vergelijking met andere {{industry}}-bedrijven in {{city}} valt op dat {{companyName}} een duidelijke kans mist: {{specificInsight}}.

Bedrijven die dit oppakken zien doorgaans {{estimatedImpact}}. Ik bewaar de volledige analyse voor u.

Mocht u op een later moment geïnteresseerd zijn: [15 min bellen]({{meetingLink}}). Zo niet, dan stuur ik geen verdere berichten.

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_breakup",
    name: "Break-Up — 14 dagen (NL)",
    category: "breakup",
    language: "nl",
    subject: "Afsluiting — analyse {{companyName}}",
    body: `Beste {{contactName}},

Dit is mijn laatste bericht. Ik begrijp dat de timing nu niet uitkomt.

De analyse van {{companyName}} blijft beschikbaar. Als u in de toekomst de online aanwezigheid wilt verbeteren, kunt u de bevindingen [hier inzien]({{meetingLink}}).

Veel succes met {{companyName}}.

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_meeting_confirm",
    name: "Afspraakbevestiging (NL)",
    category: "meeting_confirm",
    language: "nl",
    subject: "Bevestiging: afspraak over {{companyName}}",
    body: `Beste {{contactName}},

Bedankt voor uw tijd. Ik bevestig hierbij onze afspraak om de website-analyse van {{companyName}} te bespreken.

Ik loop u dan door de bevindingen en geef concrete suggesties voor verbetering. Het gesprek duurt maximaal 15 minuten.

[Bevestig de afspraak]({{meetingLink}})

Met vriendelijke groet,
{{senderName}} | FindX`,
  },
  {
    id: "nl_proposal_followup",
    name: "Voorstel Follow-Up (NL)",
    category: "proposal_followup",
    language: "nl",
    subject: "Voorstel voor {{companyName}} — samenvatting",
    body: `Beste {{contactName}},

Naar aanleiding van ons gesprek stuur ik u hierbij een samenvatting van de verbeterpunten voor {{companyName}}:

{{improvementArea}}

De verwachte impact: {{estimatedImpact}}.

Ik hoor graag of u met dit voorstel verder wilt gaan.

[Bekijk het voorstel]({{meetingLink}})

Met vriendelijke groet,
{{senderName}} | FindX`,
  },

  // --- English templates (professional register) ---
  {
    id: "en_cold_no_website",
    name: "Cold Outreach — No Website (EN)",
    category: "cold_no_website",
    language: "en",
    subject: "{{companyName}} is invisible online",
    body: `Dear {{contactName}},

I have been reviewing the online presence of {{industry}} businesses in {{city}}. I noticed that {{companyName}} does not have a website.

In the {{industry}}, 7 out of 10 customers search online for a provider. Without a website, those potential clients find your competitors instead. Businesses in {{city}} with a web presence receive those inquiries by default.

I can set up a website for {{companyName}} that:
- Ranks for local searches in {{city}}
- Reflects your brand and professionalism
- Is live within two weeks

A 15-minute call is enough for me to explain the approach.

[Book a call]({{meetingLink}})

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_cold_has_website",
    name: "Cold Outreach — Improvement Opportunities (EN)",
    category: "cold_has_website",
    language: "en",
    subject: "{{specificInsight}} — finding for {{companyName}}",
    body: `Dear {{contactName}},

I analyzed {{companyName}}'s website. One finding stands out: {{specificInsight}}.

Your website scores {{overallScore}}/100. Businesses in {{industry}} that address these issues typically see {{estimatedImpact}}. The single most impactful step for {{companyName}}: {{improvementArea}}.

I have the full analysis with concrete recommendations ready. Shall we schedule a 15-minute call so I can walk you through the findings?

[Book a call]({{meetingLink}})

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_followup_1",
    name: "Follow-Up 1 — 3 days (EN)",
    category: "followup_1",
    language: "en",
    subject: "Re: {{originalSubject}}",
    body: `Dear {{contactName}},

A brief follow-up on my analysis of {{companyName}}. I understand you are busy — I will keep this short.

The findings remain relevant. I am happy to schedule a time that works better for you.

[Book a call]({{meetingLink}})

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_followup_2",
    name: "Follow-Up 2 — 7 days (EN)",
    category: "followup_2",
    language: "en",
    subject: "Analysis {{companyName}} — one more observation",
    body: `Dear {{contactName}},

One last thing. Comparing {{companyName}} to other {{industry}} businesses in {{city}}, there is a clear missed opportunity: {{specificInsight}}.

Companies that act on this typically see {{estimatedImpact}}. I will keep the full analysis on file for you.

If you would like to discuss this later: [15-minute call]({{meetingLink}}). If not, I will not follow up again.

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_breakup",
    name: "Break-Up — 14 days (EN)",
    category: "breakup",
    language: "en",
    subject: "Closing — analysis of {{companyName}}",
    body: `Dear {{contactName}},

This is my last message. I understand the timing may not be right.

The analysis of {{companyName}} remains available. If you want to improve your online presence in the future, you can [review the findings here]({{meetingLink}}).

Wishing {{companyName}} all the best.

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_meeting_confirm",
    name: "Meeting Confirmation (EN)",
    category: "meeting_confirm",
    language: "en",
    subject: "Confirmation: appointment about {{companyName}}",
    body: `Dear {{contactName}},

Thank you for your time. This confirms our appointment to discuss the website analysis of {{companyName}}.

I will walk you through the findings and provide concrete improvement suggestions. The call will take no more than 15 minutes.

[Confirm the appointment]({{meetingLink}})

Kind regards,
{{senderName}} | FindX`,
  },
  {
    id: "en_proposal_followup",
    name: "Proposal Follow-Up (EN)",
    category: "proposal_followup",
    language: "en",
    subject: "Proposal for {{companyName}} — summary",
    body: `Dear {{contactName}},

Following our conversation, here is a summary of the improvement areas for {{companyName}}:

{{improvementArea}}

Expected impact: {{estimatedImpact}}.

Please let me know if you would like to proceed with this proposal.

[View the proposal]({{meetingLink}})

Kind regards,
{{senderName}} | FindX`,
  },
];

export function getTemplates(
  language: EmailLanguage = "nl",
  category?: EmailTemplate["category"],
): EmailTemplate[] {
  let filtered = TEMPLATES.filter((t) => t.language === language);
  if (category) {
    filtered = filtered.filter((t) => t.category === category);
  }
  return filtered;
}

export function getTemplate(id: string): EmailTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function renderTemplate(
  template: EmailTemplate,
  vars: TemplateVariables,
): { subject: string; body: string } {
  let { subject, body } = template;
  const allVars: Record<string, string> = {
    ...vars,
    originalSubject: vars.specificInsight, // fallback for follow-ups
    overallScore: vars.overallScore ?? "—",
  };

  for (const [key, value] of Object.entries(allVars)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }

  return { subject, body };
}

export function pickColdTemplate(
  hasWebsite: boolean,
  language: EmailLanguage = "nl",
): EmailTemplate {
  const category = hasWebsite ? "cold_has_website" : "cold_no_website";
  const template = TEMPLATES.find(
    (t) => t.language === language && t.category === category,
  );
  if (!template) {
    throw new Error(`No cold template found for ${category} in ${language}`);
  }
  return template;
}
