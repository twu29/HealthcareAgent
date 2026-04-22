export type GuidanceRuleType =
  | 'take_with_food'
  | 'take_on_empty_stomach'
  | 'avoid_alcohol'
  | 'avoid_grapefruit'
  | 'separate_from_dairy'
  | 'separate_from_calcium'
  | 'separate_from_iron'
  | 'maintain_consistent_vitamin_k'
  | 'increase_hydration'
  | 'possible_gi_irritation_food_buffer';

export type GuidanceSeverity = 'info' | 'caution' | 'warning';

export type GuidanceRule = {
  type: GuidanceRuleType;
  severity: GuidanceSeverity;
  plainText: string;
  rationale: string;
  evidence?: string[];
  source?: 'dailymed_label' | 'fallback_kb';
};

export type MedicationFallbackRecord = {
  canonicalName: string;
  aliases: string[];
  rxnormNames?: string[];
  rxcuis?: string[];
  rules: GuidanceRule[];
  notes?: string[];
  priority?: number;
};

export type MedicationGuidanceInput = {
  medicationName?: string;
  rawText?: string;
  questionFocus?: 'food_interactions' | 'meal_guidance' | 'timing' | 'general';
};

export type MedicationGuidanceResultSource =
  | 'rxnorm_dailymed'
  | 'fallback_only'
  | 'rxnorm_dailymed_plus_fallback';

export type MedicationGuidanceResult = {
  success: boolean;
  source: MedicationGuidanceResultSource;
  extractedMedicationName: string | null;
  normalizedMedication: {
    canonicalName: string | null;
    rxcui: string | null;
    matchType: 'exact' | 'approximate' | 'fallback_name_only' | 'none';
    confidence: number;
  };
  dailymed: {
    setid: string | null;
    title: string | null;
    publishedDate: string | null;
    labelFound: boolean;
  };
  foodGuidance: GuidanceRule[];
  safetyNotes: string[];
  followUpQuestion: string | null;
  fallbackUsed: boolean;
  fallbackMedication: string | null;
};