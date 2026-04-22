export async function nutritionSearch(input: {
  query: string;
  maxResults?: number;
}) {
  const { query, maxResults = 5 } = input;

  const params = new URLSearchParams({
    query,
    pageSize: String(maxResults),
    dataType: 'Survey (FNDDS)',
    api_key: process.env.USDA_API_KEY || 'DEMO_KEY',
  });

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.foods || data.foods.length === 0) {
    return { success: false, message: `No foods found matching: ${query}`, results: [] };
  }

  const foods = data.foods.map((food: any) => {
    const nutrients: Record<string, string> = {};
    for (const n of food.foodNutrients || []) {
      if (
        [
          'Energy',
          'Protein',
          'Total lipid (fat)',
          'Carbohydrate, by difference',
          'Fiber, total dietary',
          'Sugars, total including NLEA',
          'Sodium, Na',
          'Potassium, K',
          'Calcium, Ca',
          'Iron, Fe',
          'Vitamin C, total ascorbic acid',
          'Vitamin D (D2 + D3)',
          'Cholesterol',
        ].includes(n.nutrientName)
      ) {
        nutrients[n.nutrientName] = `${n.value} ${n.unitName}`;
      }
    }

    return {
      fdcId: food.fdcId,
      description: food.description,
      foodCategory: food.foodCategory || null,
      nutrients,
    };
  });

  return { success: true, total: data.totalHits, query, foods };
}

// Anthropic tool definition
export const nutritionSearchToolDef = {
  name: 'nutrition_search' as const,
  description:
    'Search the USDA FoodData Central database for foods and their nutritional information. Use this to look up specific foods, find nutrient-dense options for health conditions, or verify nutritional content when building meal plans.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          "The food item to search for (e.g., 'salmon', 'quinoa', 'spinach')",
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
  },
};
