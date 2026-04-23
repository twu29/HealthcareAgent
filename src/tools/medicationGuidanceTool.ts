import {
  GuidanceRule,
  GuidanceRuleType,
  MedicationFallbackRecord,
  MedicationGuidanceInput,
  MedicationGuidanceResult,
} from './medicationGuidanceTypes.js';
import { MEDICATION_FALLBACK_RULES } from '../tools/medicationFallbackRules.js';

type RxNormStringMatchResponse = {
  idGroup?: {
    name?: string;
    rxnormId?: string[];
  };
};

type RxNormApproximateResponse = {
  approximateGroup?: {
    candidate?: Array<{
      rxcui: string;
      score: string;
      rank: string;
    }>;
  };
};

type RxNormPropertiesResponse = {
  properties?: {
    rxcui?: string;
    name?: string;
    tty?: string;
  };
};

type DailyMedSplListResponse = {
  data?: Array<{
    setid: string;
    title: string;
    published_date: string;
    spl_version?: string;
  }>;
};

type RulePattern = {
  type: GuidanceRuleType;
  severity: 'info' | 'caution' | 'warning';
  plainText: string;
  rationale: string;
  patterns: RegExp[];
};

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const DAILYMED_BASE = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';

const RULE_PATTERNS: RulePattern[] = [
  {
    type: 'take_with_food',
    severity: 'info',
    plainText: 'This medication may be intended to be taken with food.',
    rationale: 'Food may improve tolerance or match labeled administration guidance.',
    patterns: [
      /\btake (?:this medication|it)?\s*(?:with food|with meals?)\b/i,
      /\badminister(?:ed)?\s*(?:with food|with meals?)\b/i,
      /\bwith food\b/i,
      /\bwith meals\b/i,
    ],
  },
  {
    type: 'take_on_empty_stomach',
    severity: 'warning',
    plainText: 'This medication may be intended to be taken on an empty stomach.',
    rationale: 'Food may reduce absorption or conflict with the labeled administration instructions.',
    patterns: [
      /\bon an empty stomach\b/i,
      /\bpreferably on an empty stomach\b/i,
      /\bone-half to one hour before breakfast\b/i,
      /\b1 hour before meals?\b/i,
      /\b2 hours after meals?\b/i,
    ],
  },
  {
    type: 'avoid_alcohol',
    severity: 'warning',
    plainText: 'Alcohol may need to be avoided or used cautiously with this medication.',
    rationale: 'Alcohol can worsen side effects or create safety issues with some medications.',
    patterns: [
      /\bavoid alcohol\b/i,
      /\bdo not drink alcohol\b/i,
      /\balcohol may\b/i,
      /\bdrinking alcohol\b/i,
    ],
  },
  {
    type: 'avoid_grapefruit',
    severity: 'warning',
    plainText: 'Grapefruit or grapefruit juice may need to be avoided.',
    rationale: 'Grapefruit can affect the metabolism or absorption of some medications.',
    patterns: [
      /\bgrapefruit juice\b/i,
      /\bavoid grapefruit\b/i,
      /\bgrapefruit may\b/i,
    ],
  },
  {
    type: 'separate_from_dairy',
    severity: 'warning',
    plainText: 'Do not take this medication at the same time as dairy unless the label or pharmacist says it is okay.',
    rationale: 'Dairy can interfere with absorption for some medications.',
    patterns: [
      /\bdo not take .* with dairy\b/i,
      /\bdo not take .* with dairy products\b/i,
      /\bdo not take .* with milk\b/i,
      /\bnot be taken with dairy products\b/i,
      /\bnot be taken with milk or yogurt\b/i,
      /\bavoid taking .* with dairy\b/i,
      /\bdairy products? may (?:interfere|reduce absorption|decrease absorption)\b/i,
      /\bmilk(?: products?)? may (?:interfere|reduce absorption|decrease absorption)\b/i,
    ],
  },
  {
    type: 'separate_from_calcium',
    severity: 'warning',
    plainText: 'Calcium supplements may need to be taken separately from this medication.',
    rationale: 'Calcium can interfere with absorption for some medications.',
    patterns: [
      /\bcalcium supplements? (?:can|may) (?:interfere|decrease absorption|reduce absorption)\b/i,
      /\bcalcium carbonate (?:can|may) (?:interfere|decrease absorption|reduce absorption)\b/i,
      /\bcalcium-fortified juices?\b/i,
      /\bat least \d+ hours before or after .* calcium\b/i,
      /\badminister .* at least \d+ hours apart from .* calcium\b/i,
      /\bdo not take .* with calcium\b/i,
      /\bseparate .* from calcium\b/i,
      /\bagents such as iron and calcium supplements .* decrease the absorption\b/i,
      /\biron and calcium supplements .* decrease the absorption\b/i,
      /\bcalcium supplements and antacids can decrease the absorption\b/i,
      /\biron and calcium supplements and antacids can decrease the absorption\b/i,
      /\bcalcium supplements .* can decrease the absorption\b/i
    ],
  },
  {
    type: 'separate_from_iron',
    severity: 'warning',
    plainText: 'Iron supplements may need to be taken separately from this medication.',
    rationale: 'Iron can interfere with absorption for some medications.',
    patterns: [
      /\biron supplements? (?:can|may) (?:interfere|decrease absorption|reduce absorption)\b/i,
      /\bferrous sulfate (?:can|may) (?:interfere|decrease absorption|reduce absorption)\b/i,
      /\bat least \d+ hours before or after .* iron\b/i,
      /\badminister .* at least \d+ hours apart from .* iron\b/i,
      /\bdo not take .* with iron\b/i,
      /\bseparate .* from iron\b/i,
      /\bagents such as iron and calcium supplements .* decrease the absorption\b/i,
      /\biron and calcium supplements .* decrease the absorption\b/i,
      /\bcalcium supplements and antacids can decrease the absorption\b/i,
      /\biron and calcium supplements and antacids can decrease the absorption\b/i,
      /\biron supplements .* can decrease the absorption\b/i
    ],
  },
  {
    type: 'maintain_consistent_vitamin_k',
    severity: 'warning',
    plainText: 'Vitamin K intake may need to stay consistent rather than changing suddenly.',
    rationale: 'Large changes in vitamin K intake can matter for certain medications.',
    patterns: [
      /\bdietary vitamin k\b/i,
      /\bthe amount of vitamin k in food may affect\b/i,
      /\bmaintain consistency in .* vitamin k\b/i,
      /\bconsistent intake of vitamin k\b/i,
    ],
  },
  {
    type: 'increase_hydration',
    severity: 'info',
    plainText: 'Hydration may be important while taking this medication, unless a clinician told you to restrict fluids.',
    rationale: 'Some labels include hydration-related intake guidance.',
    patterns: [
      /\bdrink plenty of fluids\b/i,
      /\bdrink extra fluids\b/i,
      /\bstay well hydrated\b/i,
      /\badequate hydration\b/i,
    ],
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMedicationCandidate(input: MedicationGuidanceInput): string | null {
  if (input.medicationName?.trim()) return input.medicationName.trim();
  if (!input.rawText?.trim()) return null;

  const raw = input.rawText.trim();
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;

  let cleaned = firstLine
    .replace(/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?)\b/gi, ' ')
    .replace(/\b(tablet|tablets|capsule|capsules|solution|injection|suspension|cream|ointment)\b/gi, ' ')
    .replace(/\b(by mouth|orally|po|take|takes|taking)\b/gi, ' ')
    .replace(/\b(once|twice)\s+(daily|a day)\b/gi, ' ')
    .replace(/\b(every|each)\s+\d+\s*(hours?|hrs?)\b/gi, ' ')
    .replace(/\b(before meals?|after meals?|with meals?|with food|on an empty stomach)\b/gi, ' ')
    .replace(/[,:;()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep only the first few words to avoid instruction spillover
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length > 4) {
    cleaned = words.slice(0, 4).join(' ');
  }

  return cleaned || null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'application/xml,text/xml,text/plain,*/*' },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function normalizeMedicationName(candidate: string): Promise<{
  canonicalName: string | null;
  rxcui: string | null;
  matchType: 'exact' | 'approximate' | 'fallback_name_only' | 'none';
  confidence: number;
}> {
  const encoded = encodeURIComponent(candidate);

  try {
    const byStringUrl = `${RXNAV_BASE}/rxcui.json?name=${encoded}&search=2`;
    const byString = await fetchJson<RxNormStringMatchResponse>(byStringUrl);
    const exactRxcui = byString.idGroup?.rxnormId?.[0];

    if (exactRxcui) {
      const propsUrl = `${RXNAV_BASE}/rxcui/${exactRxcui}/properties.json`;
      const props = await fetchJson<RxNormPropertiesResponse>(propsUrl);

      return {
        canonicalName: props.properties?.name ?? candidate,
        rxcui: exactRxcui,
        matchType: 'exact',
        confidence: 0.96,
      };
    }
  } catch {
    // continue
  }

  try {
    const approxUrl = `${RXNAV_BASE}/approximateTerm.json?term=${encoded}&maxEntries=1`;
    const approx = await fetchJson<RxNormApproximateResponse>(approxUrl);
    const topCandidate = approx.approximateGroup?.candidate?.[0];

    if (topCandidate?.rxcui) {
      const propsUrl = `${RXNAV_BASE}/rxcui/${topCandidate.rxcui}/properties.json`;
      const props = await fetchJson<RxNormPropertiesResponse>(propsUrl);
      const numericScore = Number(topCandidate.score || 0);
      const confidence = Math.max(0.45, Math.min(0.9, numericScore / 100));

      return {
        canonicalName: props.properties?.name ?? candidate,
        rxcui: topCandidate.rxcui,
        matchType: 'approximate',
        confidence,
      };
    }
  } catch {
    // continue
  }

  if (candidate.trim()) {
    return {
      canonicalName: candidate,
      rxcui: null,
      matchType: 'fallback_name_only',
      confidence: 0.35,
    };
  }

  return {
    canonicalName: null,
    rxcui: null,
    matchType: 'none',
    confidence: 0,
  };
}

async function findDailyMedLabel(
  canonicalName: string | null,
  rxcui: string | null,
): Promise<{
  setid: string | null;
  title: string | null;
  publishedDate: string | null;
  labelXml: string | null;
}> {
  try {
    let listUrl: string | null = null;

    if (rxcui) {
      listUrl = `${DAILYMED_BASE}/spls.json?rxcui=${encodeURIComponent(rxcui)}&pagesize=1`;
    } else if (canonicalName) {
      listUrl = `${DAILYMED_BASE}/spls.json?drug_name=${encodeURIComponent(canonicalName)}&pagesize=1`;
    }

    if (!listUrl) {
      return { setid: null, title: null, publishedDate: null, labelXml: null };
    }

    const list = await fetchJson<DailyMedSplListResponse>(listUrl);
    const first = list.data?.[0];

    if (!first?.setid) {
      return { setid: null, title: null, publishedDate: null, labelXml: null };
    }

    const xmlUrl = `${DAILYMED_BASE}/spls/${first.setid}.xml`;
    const labelXml = await fetchText(xmlUrl);

    return {
      setid: first.setid,
      title: first.title ?? null,
      publishedDate: first.published_date ?? null,
      labelXml,
    };
  } catch {
    return { setid: null, title: null, publishedDate: null, labelXml: null };
  }
}

function stripXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectEvidenceWindows(text: string, regex: RegExp, windowSize = 140): string[] {
  const results: string[] = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = Math.max(0, match.index - windowSize);
    const end = Math.min(text.length, match.index + match[0].length + windowSize);
    const snippet = text.slice(start, end).trim();
    if (snippet) results.push(snippet);
    if (results.length >= 3) break;
  }

  return results;
}

function dedupeRules(rules: GuidanceRule[]): GuidanceRule[] {
  const seen = new Set<string>();
  const output: GuidanceRule[] = [];

  for (const rule of rules) {
    const key = `${rule.type}:${rule.plainText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(rule);
  }

  return output;
}

function extractRelevantLabelText(labelXml: string): string {
  const plain = stripXml(labelXml);

  const sectionHints = [
    'DOSAGE AND ADMINISTRATION',
    'PATIENT COUNSELING INFORMATION',
    'DRUG INTERACTIONS',
    'HOW SHOULD I TAKE',
    'PATIENT INFORMATION',
    'ADMINISTRATION',
  ];

  const upper = plain.toUpperCase();
  let collected = '';

  for (const hint of sectionHints) {
    const start = upper.indexOf(hint);
    if (start === -1) continue;

    // grab a limited window after each matched section heading
    const slice = plain.slice(start, Math.min(start + 2500, plain.length));
    collected += '\n' + slice;
  }

  return collected.trim() || plain;
}

function isFalsePositive(ruleType: GuidanceRuleType, snippet: string): boolean {
  const s = snippet.toLowerCase();

  if (ruleType === 'separate_from_dairy') {
    return (
      s.includes('human milk') ||
      s.includes('breastfed') ||
      s.includes('breastfeeding') ||
      s.includes('milk production') ||
      s.includes('lactation')
    );
  }

  if (ruleType === 'separate_from_calcium') {
    return (
      s.includes('calcium channel blocker') ||
      s.includes('calcium channel blockers') ||
      s.includes('calciphylaxis') ||
      s.includes('serum calcium') ||
      s.includes('urinary excretion of calcium')
    );
  }

  if (ruleType === 'separate_from_iron') {
    return (
      s.includes('iron oxides') ||
      s.includes('inactive ingredients') ||
      s.includes('ferric oxide')
    );
  }

  return false;
}

function extractGuidanceRules(labelXml: string | null): GuidanceRule[] {
  if (!labelXml) return [];

  const text = extractRelevantLabelText(labelXml);
  const foundRules: GuidanceRule[] = [];

  for (const rule of RULE_PATTERNS) {
    const matchedEvidence = rule.patterns
      .flatMap((pattern) => collectEvidenceWindows(text, pattern))
      .filter((snippet) => !isFalsePositive(rule.type, snippet));

    if (matchedEvidence.length === 0) continue;

    foundRules.push({
      type: rule.type,
      severity: rule.severity,
      plainText: rule.plainText,
      rationale: rule.rationale,
      evidence: [...new Set(matchedEvidence)].slice(0, 3),
      source: 'dailymed_label',
    });
  }

  return dedupeRules(foundRules);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim();
}

function findFallbackRecord(args: {
  canonicalName: string | null;
  extractedMedicationName: string | null;
  rxcui: string | null;
}): MedicationFallbackRecord | null {
  const candidates = [args.canonicalName, args.extractedMedicationName]
    .filter(Boolean)
    .map((v) => normalizeKey(v as string));

  for (const record of MEDICATION_FALLBACK_RULES) {
    const names = [record.canonicalName, ...record.aliases, ...(record.rxnormNames ?? [])].map(normalizeKey);

    if (args.rxcui && record.rxcuis?.includes(args.rxcui)) {
      return record;
    }

    if (candidates.some((candidate) => names.includes(candidate))) {
      return record;
    }

    if (
      candidates.some((candidate) =>
        names.some((name) => candidate.includes(name) || name.includes(candidate)),
      )
    ) {
      return record;
    }
  }

  return null;
}

function mergeGuidanceRules(apiRules: GuidanceRule[], fallbackRules: GuidanceRule[]): GuidanceRule[] {
  const seen = new Set<string>();
  const merged: GuidanceRule[] = [];

  for (const rule of [...apiRules, ...fallbackRules]) {
    const key = `${rule.type}:${rule.plainText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(rule);
  }

  return merged;
}

function buildSafetyNotes(args: {
  matchType: 'exact' | 'approximate' | 'fallback_name_only' | 'none';
  confidence: number;
  labelFound: boolean;
  ruleCount: number;
  fallbackUsed: boolean;
}): string[] {
  const notes: string[] = [
    'This is educational guidance only and does not replace a pharmacist, clinician, or dietitian.',
  ];

  if (args.matchType === 'none') {
    notes.push('I could not identify the medication confidently enough to give reliable intake guidance.');
    return notes;
  }

  if (args.matchType === 'approximate' || args.confidence < 0.8) {
    notes.push('The medication match is not fully certain, so please confirm the exact name on the label.');
  }

  if (!args.labelFound && args.fallbackUsed) {
    notes.push('I could not retrieve a usable DailyMed label, so some guidance came from a limited fallback knowledge base.');
  } else if (!args.labelFound) {
    notes.push('I could not retrieve a current DailyMed label, so the result may be incomplete.');
  }

  if (args.labelFound && args.ruleCount === 0 && args.fallbackUsed) {
    notes.push('A label was found, but I supplemented the result with fallback guidance for common intake rules.');
  } else if (args.labelFound && args.ruleCount === 0) {
    notes.push('A label was found, but I did not detect one of the supported intake-rule patterns in this MVP parser.');
  }

  notes.push('If your prescription bottle or pharmacist instructions say something different, follow those and confirm with a pharmacist.');
  return notes;
}

function buildFollowUpQuestion(args: {
  canonicalName: string | null;
  matchType: 'exact' | 'approximate' | 'fallback_name_only' | 'none';
  labelFound: boolean;
  ruleCount: number;
}): string | null {
  if (args.matchType === 'none' || args.matchType === 'fallback_name_only') {
    return 'Can you send the exact medication name from the prescription label?';
  }

  if (args.matchType === 'approximate' && args.canonicalName) {
    return `I may have matched this to ${args.canonicalName}. Can you confirm the exact name on the label?`;
  }

  if (args.labelFound && args.ruleCount === 0) {
    return 'Do you want me to focus on food interactions, timing with meals, or both?';
  }

  return null;
}

export async function medicationGuidanceSearch(
  input: MedicationGuidanceInput,
): Promise<MedicationGuidanceResult> {
  const extractedMedicationName = extractMedicationCandidate(input);

  if (!extractedMedicationName) {
    return {
      success: false,
      source: 'fallback_only',
      extractedMedicationName: null,
      normalizedMedication: {
        canonicalName: null,
        rxcui: null,
        matchType: 'none',
        confidence: 0,
      },
      dailymed: {
        setid: null,
        title: null,
        publishedDate: null,
        labelFound: false,
      },
      foodGuidance: [],
      safetyNotes: [
        'This is educational guidance only and does not replace a pharmacist, clinician, or dietitian.',
        'No medication name was detected from the input.',
      ],
      followUpQuestion: 'Can you send the exact medication name from the prescription label?',
      fallbackUsed: false,
      fallbackMedication: null,
    };
  }

  const normalized = await normalizeMedicationName(extractedMedicationName);
  const dailymed = await findDailyMedLabel(normalized.canonicalName, normalized.rxcui);
  const apiRules = extractGuidanceRules(dailymed.labelXml);

  const shouldUseFallback =
    !dailymed.labelXml ||
    apiRules.length === 0 ||
    normalized.matchType === 'fallback_name_only' ||
    normalized.confidence < 0.8;

  const fallbackRecord = findFallbackRecord({
    canonicalName: normalized.canonicalName,
    extractedMedicationName,
    rxcui: normalized.rxcui,
  });

  const fallbackRules = shouldUseFallback && fallbackRecord ? fallbackRecord.rules : [];
  const mergedRules = mergeGuidanceRules(apiRules, fallbackRules);

  let source: MedicationGuidanceResult['source'];
  if (apiRules.length > 0 && fallbackRules.length > 0) {
    source = 'rxnorm_dailymed_plus_fallback';
  } else if (apiRules.length > 0) {
    source = 'rxnorm_dailymed';
  } else {
    source = 'fallback_only';
  }

  const fallbackUsed = fallbackRules.length > 0;

  const safetyNotes = buildSafetyNotes({
    matchType: normalized.matchType,
    confidence: normalized.confidence,
    labelFound: !!dailymed.labelXml,
    ruleCount: apiRules.length,
    fallbackUsed,
  });

  const followUpQuestion = buildFollowUpQuestion({
    canonicalName: normalized.canonicalName,
    matchType: normalized.matchType,
    labelFound: !!dailymed.labelXml,
    ruleCount: mergedRules.length,
  });

  return {
    success: normalized.matchType !== 'none' && mergedRules.length > 0,
    source,
    extractedMedicationName,
    normalizedMedication: {
      canonicalName: normalized.canonicalName,
      rxcui: normalized.rxcui,
      matchType: normalized.matchType,
      confidence: normalized.confidence,
    },
    dailymed: {
      setid: dailymed.setid,
      title: dailymed.title,
      publishedDate: dailymed.publishedDate,
      labelFound: !!dailymed.labelXml,
    },
    foodGuidance: mergedRules,
    safetyNotes,
    followUpQuestion,
    fallbackUsed,
    fallbackMedication: fallbackRecord?.canonicalName ?? null,
  };
}

export const medicationGuidanceToolDef = {
  name: 'medication_guidance_search' as const,
  description:
    'Normalize a medication name with RxNorm/RxNav, retrieve the current DailyMed SPL label, extract supported food or intake guidance patterns, and fall back to a curated MVP medication knowledge base when needed.',
  input_schema: {
    type: 'object' as const,
    properties: {
      medicationName: {
        type: 'string',
        description: 'The medication name if the user provided it directly.',
      },
      rawText: {
        type: 'string',
        description: 'Prescription text, medication-label text, or OCR text that may contain the medication name.',
      },
      questionFocus: {
        type: 'string',
        enum: ['food_interactions', 'meal_guidance', 'timing', 'general'],
        description: 'Optional hint about whether the user wants food interactions, meal timing guidance, or general support.',
      },
    },
  },
};