import { medicationGuidanceSearch } from '../tools/medicationGuidanceTool.js';

async function main() {
  console.log(
    JSON.stringify(
      await medicationGuidanceSearch({ medicationName: 'metformin' }),
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      await medicationGuidanceSearch({ medicationName: 'warfarin' }),
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      await medicationGuidanceSearch({ medicationName: 'levothyroxine' }),
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      await medicationGuidanceSearch({ medicationName: 'simvastatin' }),
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      await medicationGuidanceSearch({
        rawText: 'ciprofloxacin 500 mg tablet take twice daily',
      }),
      null,
      2,
    ),
  );
}

main().catch(console.error);