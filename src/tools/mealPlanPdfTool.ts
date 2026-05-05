import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';

export const mealPlanPdfToolDef: Anthropic.Tool = {
  name: 'generate_meal_plan_pdf',
  description:
    "Generates a printable PDF that contains the user's full 7-day meal plan with recipes and a consolidated grocery list. Call this once you have collected all intake info and are ready to deliver the plan. Returns a file path that the system will attach to the iMessage automatically.",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: "Title for the PDF, e.g. 'Your 7-Day Meal Plan'.",
      },
      summary: {
        type: 'object',
        description: "Top-of-PDF summary of the user's intake info.",
        properties: {
          condition: { type: 'string' },
          condition_detail: { type: 'string' },
          weight_goal: { type: 'string' },
          sex: { type: 'string' },
          age_range: { type: 'string' },
          activity_level: { type: 'string' },
          allergies_or_restrictions: { type: 'string' },
          household_size: { type: 'string' },
          cooking_level: { type: 'string' },
          daily_calorie_target: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      days: {
        type: 'array',
        description:
          'Exactly 7 days, each with breakfast, lunch, dinner, and one snack. Recipes should be brief and practical.',
        items: {
          type: 'object',
          properties: {
            day_label: {
              type: 'string',
              description: "e.g. 'Day 1 - Monday'",
            },
            meals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  meal_type: {
                    type: 'string',
                    description: 'Breakfast, Lunch, Dinner, or Snack',
                  },
                  name: { type: 'string' },
                  ingredients: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Ingredient lines with quantities.',
                  },
                  steps: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Short cooking steps.',
                  },
                },
                required: ['meal_type', 'name', 'ingredients', 'steps'],
              },
            },
          },
          required: ['day_label', 'meals'],
        },
      },
      grocery_list: {
        type: 'object',
        description: 'Consolidated grocery list grouped by store section.',
        properties: {
          produce: { type: 'array', items: { type: 'string' } },
          proteins: { type: 'array', items: { type: 'string' } },
          grains_and_bread: { type: 'array', items: { type: 'string' } },
          dairy_and_alternatives: { type: 'array', items: { type: 'string' } },
          pantry_staples: { type: 'array', items: { type: 'string' } },
          frozen: { type: 'array', items: { type: 'string' } },
          other: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['title', 'summary', 'days', 'grocery_list'],
  },
};

type Meal = {
  meal_type: string;
  name: string;
  ingredients: string[];
  steps: string[];
};

type Day = {
  day_label: string;
  meals: Meal[];
};

type Summary = Record<string, string | undefined>;

type GroceryList = Record<string, string[] | undefined>;

export type MealPlanPdfInput = {
  title: string;
  summary: Summary;
  days: Day[];
  grocery_list: GroceryList;
};

export type MealPlanPdfResult = {
  file_path: string;
  file_name: string;
};

const SUMMARY_LABELS: Array<[keyof Summary | string, string]> = [
  ['condition', 'Condition'],
  ['condition_detail', 'Condition Details'],
  ['weight_goal', 'Goal'],
  ['sex', 'Sex'],
  ['age_range', 'Age'],
  ['activity_level', 'Activity Level'],
  ['allergies_or_restrictions', 'Allergies / Restrictions'],
  ['household_size', 'Household'],
  ['cooking_level', 'Cooking Level'],
  ['daily_calorie_target', 'Daily Calorie Target'],
  ['notes', 'Notes'],
];

const GROCERY_SECTIONS: Array<[keyof GroceryList | string, string]> = [
  ['produce', 'Produce'],
  ['proteins', 'Proteins'],
  ['grains_and_bread', 'Grains & Bread'],
  ['dairy_and_alternatives', 'Dairy & Alternatives'],
  ['pantry_staples', 'Pantry Staples'],
  ['frozen', 'Frozen'],
  ['other', 'Other'],
];

export async function generateMealPlanPdf(
  input: MealPlanPdfInput
): Promise<MealPlanPdfResult> {
  const fileName = `meal-plan-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
  const filePath = join(tmpdir(), fileName);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const stream = createWriteStream(filePath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    doc.font('Helvetica-Bold').fontSize(22).text(input.title, { align: 'left' });
    doc.moveDown(0.5);

    renderSummary(doc, input.summary);
    renderDays(doc, input.days);
    renderGroceryList(doc, input.grocery_list);

    doc.end();
  });

  return { file_path: filePath, file_name: fileName };
}

function renderSummary(doc: PDFKit.PDFDocument, summary: Summary): void {
  doc.font('Helvetica-Bold').fontSize(14).text('Plan Summary');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(11);

  for (const [key, label] of SUMMARY_LABELS) {
    const value = summary[key as string];
    if (!value) continue;
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value);
  }

  doc.moveDown(0.8);
}

function renderDays(doc: PDFKit.PDFDocument, days: Day[]): void {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(18).text('7-Day Meal Plan');
  doc.moveDown(0.5);

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (i > 0) doc.moveDown(0.6);
    if (doc.y > doc.page.height - 200) doc.addPage();

    doc.font('Helvetica-Bold').fontSize(14).text(day.day_label);
    doc.moveDown(0.2);

    for (const meal of day.meals) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${meal.meal_type}: `, { continued: true })
        .font('Helvetica')
        .text(meal.name);

      if (meal.ingredients.length) {
        doc.font('Helvetica-Oblique').fontSize(10).text('Ingredients:');
        doc.font('Helvetica').fontSize(10);
        for (const ing of meal.ingredients) {
          doc.text(`  - ${ing}`);
        }
      }

      if (meal.steps.length) {
        doc.font('Helvetica-Oblique').fontSize(10).text('Steps:');
        doc.font('Helvetica').fontSize(10);
        meal.steps.forEach((step, idx) => {
          doc.text(`  ${idx + 1}. ${step}`);
        });
      }

      doc.moveDown(0.4);
    }
  }
}

function renderGroceryList(doc: PDFKit.PDFDocument, list: GroceryList): void {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(18).text('Grocery List');
  doc.moveDown(0.5);

  for (const [key, label] of GROCERY_SECTIONS) {
    const items = list[key as string];
    if (!items || items.length === 0) continue;

    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).text(label);
    doc.font('Helvetica').fontSize(11);
    for (const item of items) {
      doc.text(`  - ${item}`);
    }
    doc.moveDown(0.5);
  }
}
