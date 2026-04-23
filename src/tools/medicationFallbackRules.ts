import type { MedicationFallbackRecord } from '../tools/medicationGuidanceTypes.js';

export const MEDICATION_FALLBACK_RULES: MedicationFallbackRecord[] = [
  {
    canonicalName: 'metformin',
    aliases: ['metformin hcl', 'glucophage'],
    rxnormNames: ['metformin'],
    rules: [
      {
        type: 'take_with_food',
        severity: 'info',
        plainText: 'This medication is often taken with food.',
        rationale: 'Food may help reduce stomach upset.',
        source: 'fallback_kb',
      },
      {
        type: 'possible_gi_irritation_food_buffer',
        severity: 'caution',
        plainText: 'If it causes stomach discomfort, taking it with meals may help.',
        rationale: 'GI side effects are common with this medication.',
        source: 'fallback_kb',
      },
      {
        type: 'avoid_alcohol',
        severity: 'warning',
        plainText: 'Alcohol should be used cautiously with this medication.',
        rationale: 'Alcohol may increase side-effect risk and complicate glucose-related management.',
        source: 'fallback_kb',
      },
    ],
    priority: 100,
  },
  {
    canonicalName: 'warfarin',
    aliases: ['warfarin sodium', 'coumadin', 'jantoven'],
    rxnormNames: ['warfarin'],
    rules: [
      {
        type: 'maintain_consistent_vitamin_k',
        severity: 'warning',
        plainText: 'Keep vitamin K intake consistent rather than making large sudden changes.',
        rationale: 'Large changes in vitamin K intake can affect how this medication works.',
        source: 'fallback_kb',
      },
      {
        type: 'avoid_alcohol',
        severity: 'caution',
        plainText: 'Alcohol should be limited or confirmed with a clinician or pharmacist.',
        rationale: 'Alcohol may affect safety and medication response.',
        source: 'fallback_kb',
      },
    ],
    priority: 100,
  },
  {
    canonicalName: 'simvastatin',
    aliases: ['zocor'],
    rxnormNames: ['simvastatin'],
    rules: [
      {
        type: 'avoid_grapefruit',
        severity: 'warning',
        plainText: 'Avoid grapefruit or grapefruit juice unless a pharmacist or clinician says it is okay.',
        rationale: 'Grapefruit can affect how this medication is processed.',
        source: 'fallback_kb',
      },
    ],
    priority: 90,
  },
  {
    canonicalName: 'atorvastatin',
    aliases: ['lipitor'],
    rxnormNames: ['atorvastatin'],
    rules: [
      {
        type: 'avoid_grapefruit',
        severity: 'caution',
        plainText: 'Ask before regularly consuming grapefruit or grapefruit juice with this medication.',
        rationale: 'Grapefruit may affect medication levels for some statins.',
        source: 'fallback_kb',
      },
    ],
    priority: 85,
  },
  {
    canonicalName: 'levothyroxine',
    aliases: ['synthroid', 'levoxyl'],
    rxnormNames: ['levothyroxine'],
    rules: [
      {
        type: 'take_on_empty_stomach',
        severity: 'warning',
        plainText: 'This medication is usually taken on an empty stomach.',
        rationale: 'Food may reduce absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_calcium',
        severity: 'warning',
        plainText: 'Keep calcium supplements separate from this medication.',
        rationale: 'Calcium can interfere with absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_iron',
        severity: 'warning',
        plainText: 'Keep iron supplements separate from this medication.',
        rationale: 'Iron can interfere with absorption.',
        source: 'fallback_kb',
      },
    ],
    priority: 95,
  },
  {
    canonicalName: 'alendronate',
    aliases: ['fosamax'],
    rxnormNames: ['alendronate'],
    rules: [
      {
        type: 'take_on_empty_stomach',
        severity: 'warning',
        plainText: 'This medication is usually taken on an empty stomach.',
        rationale: 'Food can interfere with absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_calcium',
        severity: 'warning',
        plainText: 'Do not take it at the same time as calcium supplements.',
        rationale: 'Calcium can reduce absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_iron',
        severity: 'warning',
        plainText: 'Do not take it at the same time as iron supplements.',
        rationale: 'Iron can reduce absorption.',
        source: 'fallback_kb',
      },
    ],
    priority: 90,
  },
  {
    canonicalName: 'ciprofloxacin',
    aliases: ['cipro'],
    rxnormNames: ['ciprofloxacin'],
    rules: [
      {
        type: 'separate_from_dairy',
        severity: 'warning',
        plainText: 'Do not take this medication at the same time as dairy alone.',
        rationale: 'Dairy can reduce absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_calcium',
        severity: 'warning',
        plainText: 'Keep calcium supplements separate from this medication.',
        rationale: 'Calcium can interfere with absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'increase_hydration',
        severity: 'info',
        plainText: 'Staying hydrated may be helpful unless a clinician told you to restrict fluids.',
        rationale: 'Hydration support may be useful while taking this medication.',
        source: 'fallback_kb',
      },
    ],
    priority: 90,
  },
  {
    canonicalName: 'tetracycline',
    aliases: ['sumycin'],
    rxnormNames: ['tetracycline'],
    rules: [
      {
        type: 'separate_from_dairy',
        severity: 'warning',
        plainText: 'Do not take it at the same time as dairy foods like milk or yogurt.',
        rationale: 'Dairy can reduce absorption.',
        source: 'fallback_kb',
      },
      {
        type: 'separate_from_calcium',
        severity: 'warning',
        plainText: 'Keep calcium supplements separate from this medication.',
        rationale: 'Calcium can interfere with absorption.',
        source: 'fallback_kb',
      },
    ],
    priority: 85,
  },
];