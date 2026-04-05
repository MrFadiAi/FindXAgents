import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { importCsv, leadsToCsv, outreachesToCsv } from './csv-parser';
import { prisma } from '../../lib/db/client.js';

describe('importCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no duplicate found
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    // Default: successful creation
    (prisma.lead.create as any).mockResolvedValue({ id: '1' });
  });

  it('returns an error when CSV has only a header row', async () => {
    const csv = 'businessName,city\n';
    const result = await importCsv(csv);
    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: [{ row: 0, message: 'CSV must have a header row and at least one data row' }],
    });
  });

  it('returns an error when CSV is completely empty', async () => {
    const result = await importCsv('');
    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: [{ row: 0, message: 'CSV must have a header row and at least one data row' }],
    });
  });

  it('returns an error when businessName column is missing', async () => {
    const csv = 'city,email\nAmsterdam,test@test.com\n';
    const result = await importCsv(csv);
    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: [{ row: 0, message: "CSV must have a 'businessName' (or 'name', 'company', 'bedrijfsnaam') column" }],
    });
  });

  it('returns an error when city column is missing', async () => {
    const csv = 'businessName,email\nTest Co,test@test.com\n';
    const result = await importCsv(csv);
    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: [{ row: 0, message: "CSV must have a 'city' (or 'stad', 'plaats', 'location') column" }],
    });
  });

  it('imports a single valid row with standard headers', async () => {
    const csv = 'businessName,city,address,industry,website,phone,email,kvkNumber\nTest Co,Amsterdam,Main St 1,Tech,https://example.com,061234,te@te.nl,1234\n';
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: {
        businessName: 'Test Co',
        city: 'Amsterdam',
        address: 'Main St 1',
        industry: 'Tech',
        website: 'https://example.com',
        hasWebsite: true,
        phone: '061234',
        email: 'te@te.nl',
        kvkNumber: '1234',
        source: 'csv_import',
      },
    });
  });

  it('imports multiple rows', async () => {
    const csv = `businessName,city
Company A,Rotterdam
Company B,Utrecht
Company C,Eindhoven
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(prisma.lead.create).toHaveBeenCalledTimes(3);
  });

  it('maps Dutch and variant headers correctly', async () => {
    const csv = `bedrijfsnaam,stad,adres,branche,website,telefoon,e-mail,kvk
Acme,Den Haag,Weg 1,IT,acme.nl,0612,info@acme.nl,9999
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: 'Acme',
          city: 'Den Haag',
          address: 'Weg 1',
          industry: 'IT',
          website: 'acme.nl',
          phone: '0612',
          email: 'info@acme.nl',
          kvkNumber: '9999',
        }),
      })
    );
  });

  it('maps snake_case headers correctly', async () => {
    const csv = `name,location,url,tel
Company X,Berlin,https://x.de,0049
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: 'Company X',
          city: 'Berlin',
          website: 'https://x.de',
          phone: '0049',
        }),
      })
    );
  });

  it('skips duplicate when skipDuplicates is true and duplicate found by kvkNumber', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'existing' });
    const csv = 'businessName,city,kvkNumber\nDup Co,Amsterdam,12345\n';
    const result = await importCsv(csv, true);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('creates duplicate when skipDuplicates is false', async () => {
    const csv = 'businessName,city,kvkNumber\nDup Co,Amsterdam,12345\n';
    const result = await importCsv(csv, false);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it('skips duplicate when duplicate found by website', async () => {
    let callCount = 0;
    (prisma.lead.findFirst as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(null);
      return Promise.resolve({ id: 'existing' });
    });
    const csv = `businessName,city,website
Dup A,Amsterdam,https://dup.com
Dup B,Rotterdam,https://dup.com
`;
    const result = await importCsv(csv, true);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips duplicate when matching businessName+city case insensitive', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'existing' });
    const csv = 'businessName,city\nTEST COMPANY,AMSTERDAM\n';
    const result = await importCsv(csv, true);
    expect(result.skipped).toBe(1);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { businessName: { equals: 'TEST COMPANY', mode: 'insensitive' }, city: { equals: 'AMSTERDAM', mode: 'insensitive' } },
          ]),
        }),
      })
    );
  });

  it('reports error for row with missing businessName value', async () => {
    const csv = `businessName,city
,Amsterdam
`;
    const result = await importCsv(csv);
    expect(result.errors).toEqual([{ row: 2, message: 'Missing required field: businessName' }]);
    expect(result.created).toBe(0);
  });

  it('reports error for row with missing city value', async () => {
    const csv = `businessName,city
Test Co,
`;
    const result = await importCsv(csv);
    expect(result.errors).toEqual([{ row: 2, message: 'Missing required field: city' }]);
    expect(result.created).toBe(0);
  });

  it('reports error when prisma.create throws', async () => {
    (prisma.lead.create as any).mockRejectedValue(new Error('DB connection lost'));
    const csv = 'businessName,city\nTest Co,Amsterdam\n';
    const result = await importCsv(csv);
    expect(result.errors).toEqual([{ row: 2, message: 'DB connection lost' }]);
    expect(result.created).toBe(0);
  });

  it('reports error with generic message when prisma.create throws non-Error', async () => {
    (prisma.lead.create as any).mockRejectedValue('string error');
    const csv = 'businessName,city\nTest Co,Amsterdam\n';
    const result = await importCsv(csv);
    expect(result.errors).toEqual([{ row: 2, message: 'Failed to create lead' }]);
  });

  it('handles mixed valid and invalid rows', async () => {
    const csv = `businessName,city
Good Co,Amsterdam
,Berlin
Also Good,Rotterdam
Bad City,
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({ row: 3, message: 'Missing required field: businessName' });
    expect(result.errors[1]).toEqual({ row: 5, message: 'Missing required field: city' });
  });

  it('handles quoted CSV fields with commas', async () => {
    const csv = `businessName,city,address
"Company, Inc",Amsterdam,"Main St, 1A"
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: 'Company, Inc',
          address: 'Main St, 1A',
        }),
      })
    );
  });

  it('handles Windows-style line endings (CRLF)', async () => {
    const csv = 'businessName,city\r\nTest Co,Amsterdam\r\n';
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
  });

  it('skips blank lines', async () => {
    const csv = `businessName,city

Test Co,Amsterdam

Another Co,Rotterdam
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(2);
  });

  it('caps at 5000 data rows', async () => {
    const header = 'businessName,city\n';
    const rows = Array.from({ length: 5002 }, (_, i) => `Company ${i},City ${i}`).join('\n');
    const csv = header + rows + '\n';
    const result = await importCsv(csv);
    expect(prisma.lead.create).toHaveBeenCalledTimes(5000);
    expect(result.created).toBe(5000);
  });

  it('sets hasWebsite to false when no website provided', async () => {
    const csv = 'businessName,city\nTest Co,Amsterdam\n';
    const result = await importCsv(csv);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          website: undefined,
          hasWebsite: false,
        }),
      })
    );
  });

  it('handles header case insensitively', async () => {
    const csv = `BUSINESSNAME,CITY
Test Co,Amsterdam
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
  });

  it('handles header with extra whitespace', async () => {
    const csv = ` businessName , city 
Test Co,Amsterdam
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
  });

  it('does not add unknown columns to record but still processes known ones', async () => {
    const csv = `businessName,city,fax_number,notes
Test Co,Amsterdam,123,good lead
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          fax_number: expect.anything(),
          notes: expect.anything(),
        }),
      })
    );
  });

  it('continues processing after a db error on one row', async () => {
    let callCount = 0;
    (prisma.lead.create as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('unique constraint'));
      return Promise.resolve({ id: '2' });
    });
    const csv = `businessName,city
Co A,Amsterdam
Co B,Rotterdam
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ row: 2, message: 'unique constraint' });
  });

  it('dedup check uses OR with kvkNumber, website, and businessName+city', async () => {
    const csv = `businessName,city,website,kvkNumber
Test Co,Amsterdam,https://test.com,12345
`;
    await importCsv(csv, true);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { kvkNumber: '12345' },
          { website: 'https://test.com' },
          { businessName: { equals: 'Test Co', mode: 'insensitive' }, city: { equals: 'Amsterdam', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('dedup check excludes kvkNumber and website clauses when not present', async () => {
    const csv = `businessName,city
Test Co,Amsterdam
`;
    await importCsv(csv, true);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { businessName: { equals: 'Test Co', mode: 'insensitive' }, city: { equals: 'Amsterdam', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('trims whitespace from cell values', async () => {
    const csv = `businessName,city
  Test Co  ,  Amsterdam  
`;
    const result = await importCsv(csv);
    expect(result.created).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: 'Test Co',
          city: 'Amsterdam',
        }),
      })
    );
  });
});

describe('leadsToCsv', () => {
  it('returns empty string for empty array', () => {
    expect(leadsToCsv([])).toBe('');
  });

  it('produces correct headers', () => {
    const csv = leadsToCsv([{ businessName: 'Test', city: 'Amsterdam' }]);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('Business Name,City,Address,Industry,Website,Phone,Email,KVK Number,Status,Source,Discovered At');
  });

  it('maps lead fields to correct CSV columns', () => {
    const csv = leadsToCsv([{
      businessName: 'Acme Corp',
      city: 'Utrecht',
      address: 'Main St 42',
      industry: 'Tech',
      website: 'https://acme.com',
      phone: '061234',
      email: 'info@acme.com',
      kvkNumber: '12345678',
      status: 'new',
      source: 'google_maps',
      discoveredAt: '2024-01-01',
    }]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    const values = lines[1].split(',');
    expect(values[0]).toBe('Acme Corp');
    expect(values[1]).toBe('Utrecht');
    expect(values[2]).toBe('Main St 42');
    expect(values[3]).toBe('Tech');
    expect(values[4]).toBe('https://acme.com');
    expect(values[5]).toBe('061234');
    expect(values[6]).toBe('info@acme.com');
    expect(values[7]).toBe('12345678');
    expect(values[8]).toBe('new');
    expect(values[9]).toBe('google_maps');
    expect(values[10]).toBe('2024-01-01');
  });

  it('handles null/undefined values as empty strings', () => {
    const csv = leadsToCsv([{ businessName: 'Test', city: null, address: undefined }]);
    const values = csv.split('\n')[1].split(',');
    expect(values[1]).toBe('');
    expect(values[2]).toBe('');
  });

  it('escapes commas in values', () => {
    const csv = leadsToCsv([{ businessName: 'Company, Inc.', city: 'Amsterdam' }]);
    const dataLine = csv.split('\n')[1];
    // The first field should be quoted
    expect(dataLine.startsWith('"Company, Inc."')).toBe(true);
  });

  it('escapes double quotes by doubling them', () => {
    const csv = leadsToCsv([{ businessName: 'Company "Best"', city: 'Amsterdam' }]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine.startsWith('"Company ""Best"""')).toBe(true);
  });

  it('escapes newlines in values', () => {
    const csv = leadsToCsv([{ businessName: 'Line1\nLine2', city: 'Amsterdam' }]);
    // The value with newline gets quoted, so CSV starts with header then the quoted data
    // csv.split('\n') would break the embedded newline, so check the raw CSV string
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('handles multiple leads', () => {
    const leads = [
      { businessName: 'A', city: 'A1' },
      { businessName: 'B', city: 'B1' },
      { businessName: 'C', city: 'C1' },
    ];
    const csv = leadsToCsv(leads);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 data rows
  });

  it('handles numeric values by converting to string', () => {
    const csv = leadsToCsv([{ businessName: 'Test', city: 'Amsterdam', kvkNumber: 12345 }]);
    const values = csv.split('\n')[1].split(',');
    expect(values[7]).toBe('12345');
  });
});

describe('outreachesToCsv', () => {
  it('returns empty string for empty array', () => {
    expect(outreachesToCsv([])).toBe('');
  });

  it('produces correct headers', () => {
    const csv = outreachesToCsv([{ leadBusinessName: 'Test', leadCity: 'Amsterdam' }]);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('Business Name,City,Website,Subject,Status,Tone,Language,Sent At,Opened At,Replied At,Created At');
  });

  it('maps outreach fields to correct CSV columns', () => {
    const csv = outreachesToCsv([{
      leadBusinessName: 'Acme Corp',
      leadCity: 'Rotterdam',
      leadWebsite: 'https://acme.com',
      subject: 'Hello',
      status: 'sent',
      tone: 'formal',
      language: 'en',
      sentAt: '2024-01-01',
      openedAt: '2024-01-02',
      repliedAt: '2024-01-03',
      createdAt: '2024-01-01',
    }]);
    const values = csv.split('\n')[1].split(',');
    expect(values[0]).toBe('Acme Corp');
    expect(values[1]).toBe('Rotterdam');
    expect(values[2]).toBe('https://acme.com');
    expect(values[3]).toBe('Hello');
    expect(values[4]).toBe('sent');
    expect(values[5]).toBe('formal');
    expect(values[6]).toBe('en');
    expect(values[7]).toBe('2024-01-01');
    expect(values[8]).toBe('2024-01-02');
    expect(values[9]).toBe('2024-01-03');
    expect(values[10]).toBe('2024-01-01');
  });

  it('handles null/undefined values as empty strings', () => {
    const csv = outreachesToCsv([{
      leadBusinessName: 'Test',
      leadCity: null,
      leadWebsite: undefined,
      subject: 'Hi',
      status: null,
      tone: null,
      language: null,
      sentAt: null,
      openedAt: null,
      repliedAt: null,
      createdAt: null,
    }]);
    const values = csv.split('\n')[1].split(',');
    expect(values[1]).toBe('');
    expect(values[2]).toBe('');
    expect(values[4]).toBe('');
  });

  it('escapes commas in values', () => {
    const csv = outreachesToCsv([{ leadBusinessName: 'Co, Ltd', leadCity: 'Amsterdam', subject: 'Hi' }]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine.startsWith('"Co, Ltd"')).toBe(true);
  });

  it('escapes double quotes by doubling them', () => {
    const csv = outreachesToCsv([{ leadBusinessName: 'Test "Quoted"', leadCity: 'A', subject: 'Sub' }]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine.startsWith('"Test ""Quoted"""')).toBe(true);
  });

  it('handles multiple outreaches', () => {
    const outreaches = [
      { leadBusinessName: 'A', leadCity: 'A1', subject: 'S1' },
      { leadBusinessName: 'B', leadCity: 'B1', subject: 'S2' },
    ];
    const csv = outreachesToCsv(outreaches);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('handles numeric values by converting to string', () => {
    const csv = outreachesToCsv([{ leadBusinessName: 12345, leadCity: 'A', subject: 'S' }]);
    const values = csv.split('\n')[1].split(',');
    expect(values[0]).toBe('12345');
  });
});