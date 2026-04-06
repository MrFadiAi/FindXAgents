// Enhanced Google Business Profile details — reviews, photos, posts, categories
import type { Tool } from "../core/types.js";

interface ReviewSummary {
  rating: number;
  text: string;
  time: string;
}

export const deepPlaceDetailsTool: Tool = {
  name: "deep_place_details",
  description:
    "Get enhanced Google Business Profile details including reviews, categories, photos count, posts, business hours, and attributes. Requires GOOGLE_MAPS_API_KEY.",
  input_schema: {
    type: "object",
    properties: {
      placeId: { type: "string", description: "Google Place ID to get details for" },
      fields: {
        type: "string",
        description: "Comma-separated fields to request (default: comprehensive set)",
      },
    },
    required: ["placeId"],
  },
  async execute(input: Record<string, unknown>) {
    const placeId = input.placeId as string;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" });
    }

    const defaultFields = [
      "name", "formatted_address", "formatted_phone_number", "website",
      "rating", "user_ratings_total", "price_level", "business_status",
      "opening_hours", "utc_offset", "geometry",
      "types", "icon", "photos",
      "editorial_summary",
      "international_phone_number",
      "secondary_opening_hours",
      "serves_breakfast", "serves_lunch", "serves_dinner",
      "delivery", "dine_in", "takeout", "reservable",
      "wheelchair_accessible_entrance",
      "good_for_children", "good_for_groups",
      "curbside_pickup", "outdoor_seating",
    ].join(",");

    const fields = (input.fields as string) || defaultFields;

    try {
      // Fetch place details
      const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${apiKey}`;
      const detailsResp = await fetch(detailsUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!detailsResp.ok) {
        const errText = await detailsResp.text();
        return JSON.stringify({ error: `Places API error: ${detailsResp.status}`, details: errText.slice(0, 200) });
      }

      const data = await detailsResp.json() as Record<string, unknown>;

      // Extract reviews (requires separate call in v1 API)
      let reviews: ReviewSummary[] = [];
      try {
        const reviewsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews&key=${apiKey}`;
        const reviewsResp = await fetch(reviewsUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (reviewsResp.ok) {
          const reviewsData = await reviewsResp.json() as { reviews?: Array<Record<string, unknown>> };
          if (reviewsData.reviews) {
            reviews = reviewsData.reviews.slice(0, 5).map((r) => ({
              rating: (r.rating as number) || 0,
              text: ((r.text as Record<string, string>)?.text || "").slice(0, 200),
              time: (r.publishTime as string) || "",
            }));
          }
        }
      } catch { /* reviews are optional */ }

      // Summarize
      const result: Record<string, unknown> = {
        placeId,
        name: data.name || data.displayName,
        address: data.formattedAddress,
        phone: data.internationalPhoneNumber || data.formattedPhoneNumber,
        website: data.websiteUri,
        rating: data.rating,
        totalRatings: data.userRatingsCount,
        businessStatus: data.businessStatus,
        types: data.types || data.primaryType,
        priceLevel: data.priceLevel,
        location: data.location,
        openingHours: data.currentOpeningHours || data.regularOpeningHours,
        reviews,
        hasPhotos: !!(data.photos && (data.photos as unknown[]).length > 0),
        photoCount: data.photos ? (data.photos as unknown[]).length : 0,
        editorialSummary: data.editorialSummary,
        attributes: {
          delivery: data.delivery,
          dineIn: data.dineIn,
          takeout: data.takeout,
          reservable: data.reservable,
          wheelchairAccessible: data.wheelchairAccessibleEntrance,
          goodForChildren: data.goodForChildren,
          goodForGroups: data.goodForGroups,
          outdoorSeating: data.outdoorSeating,
        },
      };

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
