import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { placeDetailsTool } from './place-details.js';

describe('placeDetailsTool', () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
  });

  describe('tool configuration', () => {
    it('should have the correct tool name', () => {
      expect(placeDetailsTool.name).toBe('get_place_details');
    });

    it('should have a description', () => {
      expect(placeDetailsTool.description).toBeTruthy();
    });

    it('should define an object input_schema with businessName, city, and placeId', () => {
      expect(placeDetailsTool.input_schema.type).toBe('object');
      expect(Object.keys(placeDetailsTool.input_schema.properties!)).toEqual(
        expect.arrayContaining(['businessName', 'city', 'placeId'])
      );
      expect(placeDetailsTool.input_schema.required).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should return an unavailable message if GOOGLE_MAPS_API_KEY is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const result = await placeDetailsTool.execute({});
      expect(JSON.parse(result)).toEqual({
        available: false,
        message: 'Google Places API is not configured (missing GOOGLE_MAPS_API_KEY).',
      });
    });

    it('should return an error if neither placeId nor businessName is provided', async () => {
      const result = await placeDetailsTool.execute({ city: 'Amsterdam' });
      expect(JSON.parse(result)).toEqual({
        error: 'Provide either placeId or businessName',
      });
    });

    describe('Search failures', () => {
      it('should return an error if the text search API fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ businessName: 'Test Biz' });
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual({
          error: 'Places search failed: 500',
          details: 'Internal Server Error',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('should return found: false if text search returns no places', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ places: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ businessName: 'Ghost Biz', city: 'Nowhere' });
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual({
          found: false,
          message: 'No Google Business profile found for "Ghost Biz Nowhere"',
        });
      });
    });

    describe('Details fetching with placeId', () => {
      it('should skip text search if placeId is provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id: 'place-123', displayName: { text: 'Test' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await placeDetailsTool.execute({ placeId: 'direct-place-id' });
        
        // Should only be called once (for details, not search)
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          'https://places.googleapis.com/v1/places/direct-place-id',
          expect.any(Object)
        );
      });

      it('should return an error if the place details API fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ placeId: 'bad-place-id' });
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual({
          error: 'Place details fetch failed: 403',
        });
      });
    });

    describe('Happy path & Data transformation', () => {
      const mockSearchResponse = {
        ok: true,
        json: () => Promise.resolve({
          places: [{ id: 'searched-place-id', displayName: { text: 'Found Biz' }, formattedAddress: '123 St' }],
        }),
      };

      const mockDetailsResponse = {
        ok: true,
        json: () => Promise.resolve({
          id: 'searched-place-id',
          displayName: { text: 'Found Biz' },
          formattedAddress: '123 Main St',
          nationalPhoneNumber: '+1234567890',
          websiteUri: 'https://found.biz',
          rating: 4.5,
          userRatingCount: 100,
          businessStatus: 'OPERATIONAL',
          primaryType: 'restaurant',
          types: ['restaurant', 'food'],
          googleMapsUri: 'https://maps.google.com/?cid=123',
          regularOpeningHours: { weekdayDescriptions: ['Mon: 9-5'] },
          reviews: [
            {
              relativePublishTimeDescription: '2 days ago',
              rating: 5,
              text: { text: 'Great!', languageCode: 'en' },
              authorAttribution: { displayName: 'Alice', uri: 'http://a.com', photoUri: 'http://a.pic' },
            },
            {
              relativePublishTimeDescription: '5 days ago',
              rating: 2,
              text: { text: 'Terrible service', languageCode: 'en' },
              authorAttribution: { displayName: 'Bob' },
            },
            {
              relativePublishTimeDescription: '1 week ago',
              rating: 3,
              text: { text: 'Underwhelming experience', languageCode: 'en' },
              authorAttribution: { displayName: 'Charlie' },
            },
            {
              rating: 1,
              text: {},
              authorAttribution: {},
            },
            {
              relativePublishTimeDescription: '1 month ago',
              rating: 4,
              text: { text: 'Pretty good' },
              authorAttribution: { displayName: 'Eve' },
            },
            {
              relativePublishTimeDescription: '2 months ago',
              rating: 4,
              text: { text: 'Also good' },
              authorAttribution: { displayName: 'Frank' },
            },
          ],
        }),
      };

      it('should execute a full search and details fetch flow, limiting reviews to 5', async () => {
        const fetchMock = vi.fn()
          .mockResolvedValueOnce(mockSearchResponse)
          .mockResolvedValueOnce(mockDetailsResponse);
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ businessName: 'Test Biz', city: 'Amsterdam' });
        const parsed = JSON.parse(result);

        // Verify fetch was called twice (Search + Details)
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
          1,
          'https://places.googleapis.com/v1/places:searchText',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-api-key' }),
          })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
          2,
          'https://places.googleapis.com/v1/places/searched-place-id',
          expect.any(Object)
        );

        // Validate output structure and values
        expect(parsed.found).toBe(true);
        expect(parsed.businessName).toBe('Found Biz');
        expect(parsed.address).toBe('123 Main St');
        expect(parsed.phone).toBe('+1234567890');
        expect(parsed.website).toBe('https://found.biz');
        expect(parsed.rating).toBe(4.5);
        expect(parsed.totalReviews).toBe(100);
        expect(parsed.hasGoogleProfile).toBe(true);
        expect(parsed.openingHours).toEqual(['Mon: 9-5']);
        
        // Only top 5 reviews should be present
        expect(parsed.recentReviews).toHaveLength(5);
        
        // Average rating of the 5 reviews: (5+2+3+1+4)/5 = 3.0
        // (4th review has rating:1, which is truthy so stays as 1)
        expect(parsed.recentReviewAvg).toBe(3);
        
        // Extract complaints (rating <= 3 and text not empty)
        // Bob (2, "Terrible service"), Charlie (3, "Underwhelming experience"), 4th review (1, "") -> skipped
        expect(parsed.topComplaints).toEqual(['Terrible service', 'Underwhelming experience']);
      });

      it('should handle missing optional fields gracefully', async () => {
        const minimalDetailsResponse = {
          ok: true,
          json: () => Promise.resolve({ id: 'minimal-id' }),
        };

        const fetchMock = vi.fn().mockResolvedValue(minimalDetailsResponse);
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ placeId: 'minimal-id' });
        const parsed = JSON.parse(result);

        expect(parsed.found).toBe(true);
        expect(parsed.businessName).toBeUndefined(); // Falls back to input.businessName which is also missing
        expect(parsed.address).toBeUndefined();
        expect(parsed.phone).toBeUndefined();
        expect(parsed.rating).toBeNull();
        expect(parsed.totalReviews).toBe(0);
        expect(parsed.recentReviewAvg).toBeNull();
        expect(parsed.recentReviews).toEqual([]);
        expect(parsed.topComplaints).toBeNull();
        expect(parsed.openingHours).toBeNull();
      });

      it('should fallback to input.businessName if displayName is missing', async () => {
        const partialDetailsResponse = {
          ok: true,
          json: () => Promise.resolve({ id: 'partial-id' }),
        };

        const fetchMock = vi.fn().mockResolvedValue(partialDetailsResponse);
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ placeId: 'partial-id', businessName: 'Fallback Name' });
        const parsed = JSON.parse(result);

        expect(parsed.found).toBe(true);
        expect(parsed.businessName).toBe('Fallback Name');
      });
    });

    describe('Error handling', () => {
      it('should catch and format unexpected thrown errors', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network Failure'));
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ placeId: 'crash-id' });
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual({
          error: 'Place details lookup failed: Network Failure',
        });
      });

      it('should catch and format non-Error exceptions', async () => {
        const fetchMock = vi.fn().mockRejectedValue('String error');
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDetailsTool.execute({ placeId: 'crash-id' });
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual({
          error: 'Place details lookup failed: String error',
        });
      });
    });
  });
});