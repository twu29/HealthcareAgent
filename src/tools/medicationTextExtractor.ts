import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildDraftFromExtraction,
  type MedicationPlanDraft,
  type RawMedicationExtraction,
} from "./medReminderGenerator.js";

const client = new Anthropic();

const FREQUENCY_OPTIONS = [
  "once daily",
  "twice daily",
  "three times daily",
  "every 12 hours",
  "every 8 hours",
  "every 6 hours",
  "as needed",
  "",
];

const MEAL_TIMING_OPTIONS = [
  "30 minutes before breakfast",
  "before breakfast",
  "with breakfast",
  "with milk",
  "with food",
  "on an empty stomach",
  "",
];

const extractionTool: Anthropic.Tool = {
  name: "record_medications",
  description:
    "Record the structured list of medications, supplements, or vitamins the user described, including dose, frequency, and timing details.",
  input_schema: {
    type: "object",
    properties: {
      medications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description: "The medication, supplement, or vitamin name.",
            },
            quantityText: {
              type: "string",
              description:
                'Per-dose quantity such as "1 tablet" or "2 capsules". Empty string if unspecified.',
            },
            dosageText: {
              type: "string",
              description:
                'Strength such as "10 mg" or "500 mcg". Empty string if unspecified.',
            },
            frequencyText: {
              type: "string",
              enum: FREQUENCY_OPTIONS,
              description:
                "Closest matching frequency from the allowed values. Empty string if unspecified.",
            },
            durationText: {
              type: "string",
              description:
                'Duration such as "for 7 days" or "for 2 weeks". Empty string if unspecified.',
            },
            mealTiming: {
              type: "string",
              enum: MEAL_TIMING_OPTIONS,
              description:
                "Closest matching meal timing from the allowed values. Empty string if unspecified.",
            },
            timingNotes: {
              type: "array",
              items: { type: "string" },
              description:
                "Other timing or safety notes the user mentioned (e.g. 'take with a full glass of water', 'take in the morning'). Empty array if none.",
            },
          },
          required: [
            "medicationName",
            "quantityText",
            "dosageText",
            "frequencyText",
            "durationText",
            "mealTiming",
            "timingNotes",
          ],
        },
      },
    },
    required: ["medications"],
  },
};

const SYSTEM_PROMPT = `You extract structured medication and supplement data from free-form text written by a patient who wants reminders set up.

Rules:
- Only include medications, supplements, or vitamins that the user actually mentioned.
- Do not invent medications, doses, or schedules the user did not state.
- Map frequency and meal-timing fields to the closest value in the allowed list. Use an empty string if the user did not say.
- Return an empty list if no medications were described.`;

export async function extractMedicationsFromText(
  text: string
): Promise<MedicationPlanDraft[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: extractionTool.name },
    messages: [{ role: "user", content: trimmed }],
  });

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    if (block.name !== extractionTool.name) continue;

    const input = block.input as { medications?: unknown };
    const items = Array.isArray(input.medications) ? input.medications : [];

    const drafts: MedicationPlanDraft[] = [];
    for (const item of items) {
      const raw = normalizeRaw(item);
      if (!raw) continue;
      drafts.push(buildDraftFromExtraction(raw));
    }
    return drafts;
  }

  return [];
}

function normalizeRaw(item: unknown): RawMedicationExtraction | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  const name =
    typeof obj.medicationName === "string" ? obj.medicationName.trim() : "";
  if (!name) return null;

  return {
    medicationName: name,
    quantityText: emptyToNull(obj.quantityText),
    dosageText: emptyToNull(obj.dosageText),
    frequencyText: emptyToNull(obj.frequencyText),
    durationText: emptyToNull(obj.durationText),
    mealTiming: emptyToNull(obj.mealTiming),
    timingNotes: Array.isArray(obj.timingNotes)
      ? obj.timingNotes.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0
        )
      : [],
  };
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
