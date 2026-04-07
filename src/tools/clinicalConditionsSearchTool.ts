export async function clinicalConditionsSearch(input: {
  query: string;
  maxResults?: number;
  includeExtraFields?: boolean;
}) {
  const { query, maxResults = 5, includeExtraFields = true } = input;

  const params = new URLSearchParams({
    terms: query,
    maxList: String(maxResults),
    df: 'consumer_name,primary_name',
    sf: 'consumer_name,primary_name,synonyms,word_synonyms',
  });

  if (includeExtraFields) {
    params.set('ef', 'icd10cm,icd10cm_codes,synonyms,info_link_data');
  }

  const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  const total = data[0];
  const codes = data[1];
  const extraFields = data[2];
  const displayStrings = data[3];

  if (!codes || codes.length === 0) {
    return { success: false, message: `No conditions found matching: ${query}`, results: [] };
  }

  const conditions = codes.map((code: string, index: number) => {
    const condition: Record<string, unknown> = {
      code,
      consumer_name: displayStrings?.[index]?.[0] || null,
      primary_name: displayStrings?.[index]?.[1] || null,
      query,
    };

    if (includeExtraFields && extraFields) {
      condition.icd10cm = extraFields.icd10cm?.[index] || null;
      condition.icd10cm_codes = extraFields.icd10cm_codes?.[index] || null;
      condition.synonyms = extraFields.synonyms?.[index] || null;
      condition.info_link_data = extraFields.info_link_data?.[index] || null;
    }

    return condition;
  });

  return { success: true, total, query, conditions };
}

// Anthropic tool definition for the API
export const clinicalConditionsToolDef = {
  name: 'clinical_conditions_search' as const,
  description:
    'Search for medical conditions and symptoms using the NLM Clinical Tables API. Returns matching conditions with consumer-friendly names, ICD-10 codes, synonyms, and info links.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: "The symptom or condition term to search for (e.g., 'headache', 'gastroenteritis')",
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
      includeExtraFields: {
        type: 'boolean',
        description: 'Whether to include extra fields like ICD-10 codes, synonyms, and info links (default: true)',
      },
    },
    required: ['query'],
  },
};
