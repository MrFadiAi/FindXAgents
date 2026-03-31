// CSV parser for lead import — auto-detects column headers, validates rows, deduplicates.

import { prisma } from "../../lib/db/client.js";

// Flexible header mapping — supports English, Dutch, and snake_case variants
const HEADER_MAP: Record<string, string> = {
  // businessName
  businessname: "businessName",
  "business name": "businessName",
  bedrijfsnaam: "businessName",
  company: "businessName",
  "company name": "businessName",
  name: "businessName",
  // city
  city: "city",
  stad: "city",
  plaats: "city",
  location: "city",
  // address
  address: "address",
  adres: "address",
  street: "address",
  "street address": "address",
  // industry
  industry: "industry",
  branche: "industry",
  sector: "industry",
  type: "industry",
  // website
  website: "website",
  url: "website",
  domain: "website",
  web: "website",
  "website url": "website",
  // phone
  phone: "phone",
  telefoon: "phone",
  telephone: "phone",
  tel: "phone",
  "phone number": "phone",
  // email
  email: "email",
  "e-mail": "email",
  "email address": "email",
  mail: "email",
  // kvkNumber
  kvknumber: "kvkNumber",
  kvk: "kvkNumber",
  "kvk nummer": "kvkNumber",
  "chamber of commerce": "kvkNumber",
  "registration number": "kvkNumber",
};

interface ImportError {
  row: number;
  message: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: ImportError[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function mapHeaders(rawHeaders: string[]): { mapped: Map<number, string>; warnings: string[] } {
  const mapped = new Map<number, string>();
  const warnings: string[] = [];

  for (let i = 0; i < rawHeaders.length; i++) {
    const normalized = rawHeaders[i].toLowerCase().trim();
    const field = HEADER_MAP[normalized];
    if (field) {
      mapped.set(i, field);
    } else if (normalized) {
      warnings.push(`Unknown column: "${rawHeaders[i]}"`);
    }
  }

  return { mapped, warnings };
}

export async function importCsv(csvText: string, skipDuplicates = true): Promise<ImportResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { created: 0, skipped: 0, errors: [{ row: 0, message: "CSV must have a header row and at least one data row" }] };
  }

  const headers = parseCsvLine(lines[0]);
  const { mapped } = mapHeaders(headers);

  // Check required fields
  const mappedFields = new Set(mapped.values());
  if (!mappedFields.has("businessName")) {
    return { created: 0, skipped: 0, errors: [{ row: 0, message: "CSV must have a 'businessName' (or 'name', 'company', 'bedrijfsnaam') column" }] };
  }
  if (!mappedFields.has("city")) {
    return { created: 0, skipped: 0, errors: [{ row: 0, message: "CSV must have a 'city' (or 'stad', 'plaats', 'location') column" }] };
  }

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  // Cap at 5000 rows
  const dataLines = lines.slice(1, 5001);

  for (let i = 0; i < dataLines.length; i++) {
    const rowNumber = i + 2; // 1-indexed, plus header row
    const values = parseCsvLine(dataLines[i]);

    // Map values to fields
    const record: Record<string, string> = {};
    for (const [colIndex, fieldName] of mapped) {
      const value = values[colIndex];
      if (value) record[fieldName] = value;
    }

    // Validate required fields
    if (!record.businessName) {
      result.errors.push({ row: rowNumber, message: "Missing required field: businessName" });
      continue;
    }
    if (!record.city) {
      result.errors.push({ row: rowNumber, message: "Missing required field: city" });
      continue;
    }

    try {
      // Dedup check
      if (skipDuplicates) {
        const existing = await prisma.lead.findFirst({
          where: {
            OR: [
              ...(record.kvkNumber ? [{ kvkNumber: record.kvkNumber }] : []),
              ...(record.website ? [{ website: record.website }] : []),
              { businessName: { equals: record.businessName, mode: "insensitive" as const }, city: { equals: record.city, mode: "insensitive" as const } },
            ],
          },
        });
        if (existing) {
          result.skipped++;
          continue;
        }
      }

      const website = record.website || undefined;
      await prisma.lead.create({
        data: {
          businessName: record.businessName,
          city: record.city,
          address: record.address || undefined,
          industry: record.industry || undefined,
          website,
          hasWebsite: !!website,
          phone: record.phone || undefined,
          email: record.email || undefined,
          kvkNumber: record.kvkNumber || undefined,
          source: "csv_import",
        },
      });
      result.created++;
    } catch (err) {
      result.errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "Failed to create lead",
      });
    }
  }

  return result;
}

export function leadsToCsv(leads: Array<Record<string, unknown>>): string {
  if (leads.length === 0) return "";

  const headers = ["businessName", "city", "address", "industry", "website", "phone", "email", "kvkNumber", "status", "source", "discoveredAt"];
  const csvHeaders = ["Business Name", "City", "Address", "Industry", "Website", "Phone", "Email", "KVK Number", "Status", "Source", "Discovered At"];

  const rows = leads.map((lead) =>
    headers.map((h) => {
      const val = lead[h];
      const str = val == null ? "" : String(val);
      // Escape commas and quotes
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return [csvHeaders.join(","), ...rows].join("\n");
}

export function outreachesToCsv(outreaches: Array<Record<string, unknown>>): string {
  if (outreaches.length === 0) return "";

  const headers = ["leadBusinessName", "leadCity", "leadWebsite", "subject", "status", "tone", "language", "sentAt", "openedAt", "repliedAt", "createdAt"];
  const csvHeaders = ["Business Name", "City", "Website", "Subject", "Status", "Tone", "Language", "Sent At", "Opened At", "Replied At", "Created At"];

  const rows = outreaches.map((o) =>
    headers.map((h) => {
      const val = o[h];
      const str = val == null ? "" : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return [csvHeaders.join(","), ...rows].join("\n");
}
