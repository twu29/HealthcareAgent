const INSTACART_BASE_URL = 'https://connect.instacart.com/idp/v1';

type LineItemInput = {
  name: string;
  quantity?: number;
  unit?: string;
  display_text?: string;
};

export async function instacartCreateShoppingList(input: {
  title: string;
  line_items: LineItemInput[];
  instructions?: string[];
  image_url?: string;
  expires_in?: number;
}) {
  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      message:
        'INSTACART_API_KEY is not set. Ask the user to add it to their .env file before generating an Instacart shopping link.',
    };
  }

  const { title, line_items, instructions, image_url, expires_in } = input;

  if (!line_items || line_items.length === 0) {
    return { success: false, message: 'line_items cannot be empty.' };
  }

  const body: Record<string, unknown> = {
    title,
    link_type: 'shopping_list',
    line_items: line_items.map((item) => {
      const entry: Record<string, unknown> = { name: item.name };
      if (item.display_text) entry.display_text = item.display_text;
      if (item.quantity !== undefined || item.unit !== undefined) {
        entry.line_item_measurements = [
          { quantity: item.quantity ?? 1, unit: item.unit ?? 'each' },
        ];
      }
      return entry;
    }),
  };
  if (instructions && instructions.length > 0) body.instructions = instructions;
  if (image_url) body.image_url = image_url;
  if (expires_in) body.expires_in = expires_in;

  const response = await fetch(`${INSTACART_BASE_URL}/products/products_link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
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
  return {
    success: true,
    url: data.products_link_url,
    item_count: line_items.length,
  };
}

export const instacartCreateShoppingListToolDef = {
  name: 'instacart_create_shopping_list' as const,
  description:
    "Create an Instacart shopping list from the grocery list and return a URL the user can open. On that page the user picks their retailer, chooses pickup or delivery, reviews items, and checks out. Call this AFTER the user has confirmed the grocery list and provided their postal code. Pass every grocery item as a line_item with a simple quantity and Instacart-compatible unit ('each', 'lb', 'oz', 'fl oz', 'cup', 'gallon', 'package', 'pint', 'quart', 'gram', 'kg'). Example: '2 lbs chicken breast' -> {name: 'chicken breast', quantity: 2, unit: 'lb'}.",
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description:
          "Title of the shopping list shown to the user (e.g. 'Weekly Meal Plan - Diabetes Friendly').",
      },
      line_items: {
        type: 'array',
        description: 'One entry per grocery item.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                "Product name to search for (e.g. 'chicken breast', 'baby spinach'). Keep it generic.",
            },
            quantity: {
              type: 'number',
              description: 'Numeric quantity (e.g. 2, 0.5). Defaults to 1.',
            },
            unit: {
              type: 'string',
              description:
                "Unit such as 'each', 'lb', 'oz', 'fl oz', 'cup', 'gallon', 'package', 'pint', 'quart', 'gram', 'kg'. Defaults to 'each'.",
            },
            display_text: {
              type: 'string',
              description:
                'Optional friendly label shown on the Instacart page if the product name needs clarification.',
            },
          },
          required: ['name'],
        },
      },
      instructions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional notes to display on the shopping list page.',
      },
    },
    required: ['title', 'line_items'],
  },
};
