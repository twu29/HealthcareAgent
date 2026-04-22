const INSTACART_BASE_URL = 'https://connect.instacart.com/idp/v1';

export async function instacartNearbyRetailers(input: {
  postal_code: string;
  country_code?: string;
}) {
  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      message:
        'INSTACART_API_KEY is not set. Ask the user to add it to their .env file before looking up retailers.',
    };
  }

  const { postal_code, country_code = 'US' } = input;

  const params = new URLSearchParams({ postal_code, country_code });
  const response = await fetch(`${INSTACART_BASE_URL}/retailers?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      success: false,
      status: response.status,
      message: `Instacart API error: ${text.substring(0, 300)}`,
    };
  }

  const data = await response.json();
  const retailers = (data.retailers ?? []).map((r: any) => ({
    retailer_key: r.retailer_key,
    name: r.name,
  }));

  return {
    success: true,
    postal_code,
    country_code,
    retailer_count: retailers.length,
    retailers,
  };
}

export const instacartNearbyRetailersToolDef = {
  name: 'instacart_nearby_retailers' as const,
  description:
    'Look up Instacart retailers near a given postal code. Call this once you have the user\'s zip code, before generating the shopping list link, so you can confirm stores are available and mention a few by name. Country code defaults to US.',
  input_schema: {
    type: 'object' as const,
    properties: {
      postal_code: {
        type: 'string',
        description: "The user's postal code (e.g. '10001').",
      },
      country_code: {
        type: 'string',
        description: "'US' or 'CA'. Defaults to 'US'.",
      },
    },
    required: ['postal_code'],
  },
};
