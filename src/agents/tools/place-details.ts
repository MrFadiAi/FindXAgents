// Google Place Details tool — fetches reviews, rating, and business profile data
// Uses Google Places API (New) Place Details endpoint

import type { Tool } from "../core/types.js";

export const placeDetailsTool: Tool = {
  name: "get_place_details",
  description:
    "Get detailed Google Business profile for a business: rating, review count, reviews, opening hours, and category. Pass a business name and city, or a Google placeId. Useful for checking their online reputation and review presence.",
  input_schema: {
    type: "object",
    properties: {
      businessName: {
        type: "string",
        description: "Business name to search for",
      },
      city: {
        type: "string",
        description: "City where the business is located",
      },
      placeId: {
        type: "string",
        description: "Google Place ID (if known from a previous google_places_search)",
      },
    },
    required: [],
  },
  async execute(input: Record<string, unknown>) {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return JSON.stringify({
        available: false,
        message: "Google Places API is not configured (missing GOOGLE_MAPS_API_KEY).",
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let placeId = input.placeId as string | undefined;

    try {
      // If no placeId, search for the business first
      if (!placeId) {
        const businessName = input.businessName as string;
        const city = (input.city as string) || "";
        if (!businessName) {
          return JSON.stringify({ error: "Provide either placeId or businessName" });
        }

        const query = `${businessName} ${city}`.trim();
        // Use Text Search (New) to find the place
        const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
        const searchRes = await fetch(searchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
          },
          body: JSON.stringify({
            textQuery: query,
            languageCode: "nl",
            pageSize: 1,
          }),
        });

        if (!searchRes.ok) {
          const errText = await searchRes.text();
          return JSON.stringify({ error: `Places search failed: ${searchRes.status}`, details: errText });
        }

        const searchData = await searchRes.json() as { places?: Array<{ id: string; displayName?: { text: string }; formattedAddress?: string }> };
        if (!searchData.places?.length) {
          return JSON.stringify({ found: false, message: `No Google Business profile found for "${query}"` });
        }

        placeId = searchData.places[0].id;
      }

      // Fetch place details with reviews
      const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;
      const detailsRes = await fetch(detailsUrl, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,reviews,regularOpeningHours,businessStatus,primaryType,types,googleMapsUri",
        },
      });

      if (!detailsRes.ok) {
        return JSON.stringify({ error: `Place details fetch failed: ${detailsRes.status}` });
      }

      const place = await detailsRes.json() as {
        id: string;
        displayName?: { text: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        websiteUri?: string;
        rating?: number;
        userRatingCount?: number;
        reviews?: Array<{
          name?: string;
          relativePublishTimeDescription?: string;
          rating?: number;
          text?: { text: string; languageCode?: string };
          authorAttribution?: { displayName: string; uri?: string; photoUri?: string };
        }>;
        regularOpeningHours?: { weekdayDescriptions?: string[] };
        businessStatus?: string;
        primaryType?: string;
        types?: string[];
        googleMapsUri?: string;
      };

      // Summarize reviews — extract sentiment patterns
      const reviews = (place.reviews || []).slice(0, 5).map((r) => ({
        author: r.authorAttribution?.displayName || "Anonymous",
        rating: r.rating || 0,
        text: r.text?.text || "",
        timeAgo: r.relativePublishTimeDescription || "",
      }));

      const avgReviewRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

      // Identify common complaints in negative reviews (rating <= 3)
      const complaints = reviews
        .filter((r) => r.rating <= 3)
        .map((r) => r.text)
        .filter((t) => t.length > 0)
        .slice(0, 3);

      return JSON.stringify({
        found: true,
        businessName: place.displayName?.text || input.businessName,
        address: place.formattedAddress,
        phone: place.nationalPhoneNumber,
        website: place.websiteUri,
        googleMapsUrl: place.googleMapsUri,
        businessStatus: place.businessStatus,
        category: place.primaryType,
        rating: place.rating || null,
        totalReviews: place.userRatingCount || 0,
        recentReviewAvg: avgReviewRating,
        openingHours: place.regularOpeningHours?.weekdayDescriptions || null,
        recentReviews: reviews,
        topComplaints: complaints.length > 0 ? complaints : null,
        hasGoogleProfile: true,
      });
    } catch (err) {
      return JSON.stringify({
        error: `Place details lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
};
