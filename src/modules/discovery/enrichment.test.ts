import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichLeads, mergeLeads } from './enrichment.js';
import type { DiscoveredLead } from './discovery.service.js';
import type { WebsiteStatus } from './website-checker.js';
import type { EnrichedLead } from './enrichment.js';

const createMockLead = (overrides: Partial<DiscoveredLead> = {}): DiscoveredLead => ({
  businessName: 'Test Bedrijf',
  kvkNumber: '12345678',
  address: 'Teststraat 1',
  city: 'Amsterdam',
  industry: 'IT',
  website: 'https://example.com',
  phone: '+31612345678',
  email: 'test@example.com',
  source: 'kvk',
  sourceId: 'kvk-123',
  ...overrides,
});

describe('enrichLeads', () => {
  it('should return an empty array when given an empty leads array', () => {
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    const result = enrichLeads([], websiteResults);
    expect(result).toEqual([]);
  });

  it('should enrich leads with active website status and follow finalUrl', () => {
    const leads = [createMockLead({ website: 'http://example.com' })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    websiteResults.set('http://example.com', { status: 'active', finalUrl: 'https://example.com/en' });

    const result = enrichLeads(leads, websiteResults);

    expect(result).toHaveLength(1);
    expect(result[0].website).toBe('https://example.com/en');
    expect(result[0].hasWebsite).toBe(true);
    expect(result[0].websiteStatus).toBe('active');
    expect(result[0].enrichmentSources).toEqual(['kvk']);
  });

  it('should enrich leads with redirect website status but keep original URL', () => {
    const leads = [createMockLead({ website: 'http://example.com' })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    websiteResults.set('http://example.com', { status: 'redirect', finalUrl: 'https://example.com/redirected' });

    const result = enrichLeads(leads, websiteResults);

    expect(result).toHaveLength(1);
    expect(result[0].website).toBe('http://example.com'); // doesn't change for redirect
    expect(result[0].hasWebsite).toBe(true);
    expect(result[0].websiteStatus).toBe('redirect');
  });

  it('should handle leads with inactive or error website status', () => {
    const leads = [createMockLead({ website: 'http://down.com' })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    websiteResults.set('http://down.com', { status: 'inactive' });

    const result = enrichLeads(leads, websiteResults);

    expect(result[0].website).toBe('http://down.com');
    expect(result[0].hasWebsite).toBe(false);
    expect(result[0].websiteStatus).toBe('inactive');
  });

  it('should handle leads without a website property', () => {
    const leads = [createMockLead({ website: undefined })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();

    const result = enrichLeads(leads, websiteResults);

    expect(result[0].website).toBeUndefined();
    expect(result[0].hasWebsite).toBe(false);
    expect(result[0].websiteStatus).toBeUndefined();
  });

  it('should handle leads with a website that has no matching website result', () => {
    const leads = [createMockLead({ website: 'http://unknown.com' })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();

    const result = enrichLeads(leads, websiteResults);

    expect(result[0].website).toBe('http://unknown.com');
    expect(result[0].hasWebsite).toBe(false);
    expect(result[0].websiteStatus).toBeUndefined();
  });

  it('should default to original website if active but finalUrl is missing', () => {
    const leads = [createMockLead({ website: 'http://example.com' })];
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    websiteResults.set('http://example.com', { status: 'active' }); // No finalUrl

    const result = enrichLeads(leads, websiteResults);

    expect(result[0].website).toBe('http://example.com');
    expect(result[0].hasWebsite).toBe(true);
    expect(result[0].websiteStatus).toBe('active');
  });

  it('should process multiple leads with different website statuses', () => {
    const leads = [
      createMockLead({ id: '1', website: 'http://active.com' }),
      createMockLead({ id: '2', website: 'http://redirect.com' }),
      createMockLead({ id: '3', website: 'http://inactive.com' }),
      createMockLead({ id: '4', website: undefined }),
    ];

    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();
    websiteResults.set('http://active.com', { status: 'active', finalUrl: 'https://active.com' });
    websiteResults.set('http://redirect.com', { status: 'redirect', finalUrl: 'https://redirect.com' });
    websiteResults.set('http://inactive.com', { status: 'inactive' });

    const result = enrichLeads(leads, websiteResults);

    expect(result).toHaveLength(4);
    
    // Active
    expect(result[0].hasWebsite).toBe(true);
    expect(result[0].websiteStatus).toBe('active');
    
    // Redirect
    expect(result[1].hasWebsite).toBe(true);
    expect(result[1].websiteStatus).toBe('redirect');
    
    // Inactive
    expect(result[2].hasWebsite).toBe(false);
    expect(result[2].websiteStatus).toBe('inactive');
    
    // Undefined website
    expect(result[3].hasWebsite).toBe(false);
    expect(result[3].websiteStatus).toBeUndefined();
  });

  it('should correctly assign enrichmentSources from the lead source', () => {
    const kvkLead = createMockLead({ source: 'kvk' });
    const googleLead = createMockLead({ source: 'google', website: undefined });
    
    const websiteResults = new Map<string, { status: WebsiteStatus; finalUrl?: string }>();

    const result = enrichLeads([kvkLead, googleLead], websiteResults);

    expect(result[0].enrichmentSources).toEqual(['kvk']);
    expect(result[1].enrichmentSources).toEqual(['google']);
  });
});

describe('mergeLeads', () => {
  it('should prefer KVK data for authoritative fields', () => {
    const kvkLead = createMockLead({
      businessName: 'KVK Business',
      address: 'KVK Address',
      industry: 'KVK Industry',
      kvkNumber: '11111111',
      city: 'Amsterdam',
      source: 'kvk',
    });

    const googleLead = createMockLead({
      businessName: 'Google Business',
      address: 'Google Address',
      industry: 'Google Industry',
      kvkNumber: '22222222',
      city: 'Rotterdam',
      source: 'google',
    });

    const result = mergeLeads(kvkLead, googleLead);

    expect(result.businessName).toBe('KVK Business');
    expect(result.address).toBe('KVK Address');
    expect(result.industry).toBe('KVK Industry');
    expect(result.kvkNumber).toBe('11111111');
    expect(result.city).toBe('Amsterdam');
  });

  it('should prefer Google data for contact and website fields', () => {
    const kvkLead = createMockLead({
      website: 'http://kvk.com',
      phone: '+31600000001',
      email: 'kvk@test.com',
      source: 'kvk',
    });

    const googleLead = createMockLead({
      website: 'http://google.com',
      phone: '+31600000002',
      email: 'google@test.com',
      source: 'google',
    });

    const result = mergeLeads(kvkLead, googleLead);

    expect(result.website).toBe('http://google.com');
    expect(result.phone).toBe('+31600000002');
    expect(result.email).toBe('google@test.com');
  });

  it('should fallback to Google data for KVK authoritative fields if KVK lead is null', () => {
    const googleLead = createMockLead({
      businessName: 'Google Business',
      address: 'Google Address',
      city: 'Utrecht',
      source: 'google',
    });

    const result = mergeLeads(null, googleLead);

    expect(result.businessName).toBe('Google Business');
    expect(result.address).toBe('Google Address');
    expect(result.city).toBe('Utrecht');
  });

  it('should fallback to KVK data for Google authoritative fields if Google lead is null', () => {
    const kvkLead = createMockLead({
      website: 'http://kvk.com',
      phone: '+31600000001',
      email: 'kvk@test.com',
      source: 'kvk',
    });

    const result = mergeLeads(kvkLead, null);

    expect(result.website).toBe('http://kvk.com');
    expect(result.phone).toBe('+31600000001');
    expect(result.email).toBe('kvk@test.com');
  });

  it('should correctly set hasWebsite to true when website exists from either source', () => {
    const kvkLead = createMockLead({ website: 'http://kvk.com', source: 'kvk' });
    const googleLead = createMockLead({ website: undefined, source: 'google' });
    
    const result = mergeLeads(kvkLead, googleLead);
    expect(result.hasWebsite).toBe(true);
  });

  it('should correctly set hasWebsite to false when neither source provides a website', () => {
    const kvkLead = createMockLead({ website: undefined, source: 'kvk' });
    const googleLead = createMockLead({ website: undefined, source: 'google' });
    
    const result = mergeLeads(kvkLead, googleLead);
    expect(result.hasWebsite).toBe(false);
  });

  it('should correctly build the enrichmentSources array based on provided leads', () => {
    const kvkLead = createMockLead({ source: 'kvk' });
    const googleLead = createMockLead({ source: 'google' });

    const bothResult = mergeLeads(kvkLead, googleLead);
    expect(bothResult.enrichmentSources).toEqual(['kvk', 'google']);

    const kvkOnlyResult = mergeLeads(kvkLead, null);
    expect(kvkOnlyResult.enrichmentSources).toEqual(['kvk']);

    const googleOnlyResult = mergeLeads(null, googleLead);
    expect(googleOnlyResult.enrichmentSources).toEqual(['google']);
  });

  it('should set base source and sourceId to KVK if KVK lead is provided', () => {
    const kvkLead = createMockLead({ source: 'kvk', sourceId: 'kvk-123' });
    const googleLead = createMockLead({ source: 'google', sourceId: 'google-456' });

    const result = mergeLeads(kvkLead, googleLead);

    expect(result.source).toBe('kvk');
    expect(result.sourceId).toBe('kvk-123');
  });

  it('should set base source and sourceId to Google if KVK lead is null', () => {
    const googleLead = createMockLead({ source: 'google', sourceId: 'google-456' });

    const result = mergeLeads(null, googleLead);

    expect(result.source).toBe('google');
    expect(result.sourceId).toBe('google-456');
  });

  it('should return empty result when both leads are null', () => {
    // The code uses `const base = kvkLead ?? googleLead!;`
    // Passing both null returns object with empty strings
    const result = mergeLeads(null, null);
    expect(result.businessName).toBe('');
    expect(result.city).toBe('');
    expect(result.enrichmentSources).toEqual([]);
  });

  it('should merge successfully when only Google lead is provided without KVK lead', () => {
    const googleLead = createMockLead({
      businessName: 'Google Only',
      kvkNumber: '12345678',
      source: 'google',
      sourceId: 'g-1'
    });

    const result = mergeLeads(null, googleLead);

    expect(result.businessName).toBe('Google Only');
    expect(result.kvkNumber).toBe('12345678');
    expect(result.source).toBe('google');
    expect(result.enrichmentSources).toEqual(['google']);
  });
});