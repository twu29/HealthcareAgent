export type ReminderTime = {
    hour: number;
    minute: number;
    label: string;
  };
  
  export type MedicationPlanDraft = {
    medicationName: string;
    quantityText: string | null;
    dosageText: string | null;
    frequencyText: string | null;
    timesPerDay: number | null;
    durationText: string | null;
    mealTiming: string | null;
    timingNotes: string[];
    suggestedTimes: ReminderTime[];
    confidence: "high" | "medium" | "low";
  };
  
  export type DailyScheduleItem = {
    time: ReminderTime;
    medicationName: string;
    quantityText: string | null;
    dosageText: string | null;
    mealTiming: string | null;
  };
  
  function normalizeWhitespace(text: string): string {
    return text.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim();
  }
  
  function splitIntoBlocks(rawText: string): string[] {
    const normalized = rawText.replace(/\r/g, "").trim();
  
    const byBlankLine = normalized
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  
    if (byBlankLine.length >= 2) return byBlankLine;
  
    return normalized
      .split(/(?=MEDICATION\s+\d+)|(?=^\d+\.\s)|(?=Name:\s)/gm)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  
  function isAdministrativeBlock(block: string): boolean {
    return /patient name:|prescribing clinic:|visit date:|general reminders|after visit medication summary|family medicine|clinic:/i.test(
      block
    );
  }
  
  function looksLikeMedicationBlock(block: string): boolean {
    return (
      /name:/i.test(block) ||
      /^\d+\.\s/m.test(block) ||
      /\b(tablet|capsule|chewable|solution|suspension)\b/i.test(block) ||
      /instructions?:/i.test(block) ||
      /take\s+\d+/i.test(block)
    );
  }
  
  function extractMedicationName(block: string): string | null {
    const patterns = [
      /Name:\s*(.+)/i,
      /^\d+\.\s*(.+)/m,
      /Medication\s*Name:\s*(.+)/i,
    ];
  
    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
  
        if (/patient name|prescribing clinic|general reminders/i.test(value)) {
          return null;
        }
  
        return value;
      }
    }
  
    return null;
  }
  
  function extractDosageText(block: string): string | null {
    const normalized = normalizeWhitespace(block);
    const match = normalized.match(/\b\d+(?:\.\d+)?\s?(mg|mcg|g|ml)\b/i);
    return match?.[0] ?? null;
  }
  
  function singularizeUnit(unit: string): string {
    const lower = unit.toLowerCase();
    if (lower === "tablets") return "tablet";
    if (lower === "capsules") return "capsule";
    return unit;
  }
  
  function extractQuantityText(block: string): string | null {
    const patterns = [
      /take\s+(\d+)\s+(tablet|tablets|capsule|capsules)/i,
      /take\s+(\d+)\s+(chewable tablet|chewable tablets)/i,
    ];
  
    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match?.[1] && match?.[2]) {
        return `${match[1]} ${singularizeUnit(match[2])}`;
      }
    }
  
    return null;
  }
  
  function extractFrequencyText(block: string): string | null {
    if (/every\s+12\s+hours?/i.test(block)) return "every 12 hours";
    if (/twice daily|2 times daily|two times daily/i.test(block)) return "twice daily";
    if (/three times daily|3 times daily/i.test(block)) return "three times daily";
    if (/every\s+8\s+hours?/i.test(block)) return "every 8 hours";
    if (/every\s+6\s+hours?/i.test(block)) return "every 6 hours";
    if (/once daily|every morning|daily/i.test(block)) return "once daily";
    if (/as needed|prn/i.test(block)) return "as needed";
    return null;
  }
  
  function extractTimesPerDay(frequencyText: string | null): number | null {
    if (!frequencyText) return null;
  
    const f = frequencyText.toLowerCase();
  
    if (f === "once daily") return 1;
    if (f === "twice daily" || f === "every 12 hours") return 2;
    if (f === "three times daily") return 3;
  
    return null;
  }
  
  function extractDurationText(block: string): string | null {
    const patterns = [
      /for\s+\d+\s+days?/i,
      /for\s+\d+\s+weeks?/i,
      /for\s+\d+\s+months?/i,
    ];
  
    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match?.[0]) return match[0];
    }
  
    return null;
  }
  
  function extractMealTiming(block: string): string | null {
    if (/30 minutes before breakfast/i.test(block)) return "30 minutes before breakfast";
    if (/before breakfast/i.test(block)) return "before breakfast";
    if (/with breakfast/i.test(block)) return "with breakfast";
    if (/with milk/i.test(block)) return "with milk";
    if (/with food|with meals?/i.test(block)) return "with food";
    if (/empty stomach|on an empty stomach/i.test(block)) return "on an empty stomach";
    return null;
  }
  
  function extractTimingNotes(block: string): string[] {
    const notes: string[] = [];
    const patterns = [
      /about\s+\d+\s+hours?\s+apart\.?/i,
      /take in the morning(?: and evening)?\.?/i,
      /take with a full glass of water\.?/i,
      /do not lie down for \d+\s+minutes? after taking this medication\.?/i,
      /do not take more than \d+ tablets? in \d+\s+hours?\.?/i,
    ];
  
    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match?.[0]) notes.push(match[0].trim());
    }
  
    return [...new Set(notes)];
  }
  
  function suggestTimes(
    frequencyText: string | null,
    mealTiming: string | null
  ): ReminderTime[] {
    if (!frequencyText) return [];
  
    const f = frequencyText.toLowerCase();
    const meal = mealTiming?.toLowerCase() ?? "";
  
    if (f === "once daily") {
      if (meal.includes("30 minutes before breakfast")) {
        return [{ hour: 7, minute: 30, label: "07:30" }];
      }
      if (meal.includes("before breakfast")) {
        return [{ hour: 7, minute: 30, label: "07:30" }];
      }
      if (meal.includes("with breakfast")) {
        return [{ hour: 8, minute: 0, label: "08:00" }];
      }
      return [{ hour: 9, minute: 0, label: "09:00" }];
    }
  
    if (f === "twice daily" || f === "every 12 hours") {
      return [
        { hour: 8, minute: 0, label: "08:00" },
        { hour: 20, minute: 0, label: "20:00" },
      ];
    }
  
    return [];
  }
  
  function computeConfidence(
    medicationName: string | null,
    frequencyText: string | null,
    suggestedTimes: ReminderTime[]
  ): "high" | "medium" | "low" {
    if (medicationName && frequencyText && suggestedTimes.length > 0) return "high";
    if (medicationName && frequencyText) return "medium";
    return "low";
  }
  
  function hasEnoughSignal(
    medicationName: string | null,
    quantityText: string | null,
    dosageText: string | null,
    frequencyText: string | null
  ): boolean {
    return Boolean(medicationName && (quantityText || dosageText || frequencyText));
  }
  
  export function buildMedicationPlanDrafts(rawText: string): MedicationPlanDraft[] {
    const blocks = splitIntoBlocks(rawText);
    const drafts: MedicationPlanDraft[] = [];
  
    for (const block of blocks) {
      if (isAdministrativeBlock(block)) continue;
      if (!looksLikeMedicationBlock(block)) continue;
  
      const medicationName = extractMedicationName(block);
      const dosageText = extractDosageText(block);
      const quantityText = extractQuantityText(block);
      const frequencyText = extractFrequencyText(block);
      const timesPerDay = extractTimesPerDay(frequencyText);
      const durationText = extractDurationText(block);
      const mealTiming = extractMealTiming(block);
      const timingNotes = extractTimingNotes(block);
      const suggestedTimes = suggestTimes(frequencyText, mealTiming);
  
      if (!hasEnoughSignal(medicationName, quantityText, dosageText, frequencyText)) {
        continue;
      }
  
      if (!medicationName) continue;
  
      drafts.push({
        medicationName,
        quantityText,
        dosageText,
        frequencyText,
        timesPerDay,
        durationText,
        mealTiming,
        timingNotes,
        suggestedTimes,
        confidence: computeConfidence(medicationName, frequencyText, suggestedTimes),
      });
    }
  
    return drafts;
  }
  
  export function formatMedicationPlanForConfirmation(
    drafts: MedicationPlanDraft[]
  ): string {
    if (!drafts.length) {
      return "I could not confidently identify a medicine schedule from this prescription yet.";
    }
  
    const lines: string[] = [];
    lines.push("I found these medications from your prescription:");
    lines.push("");
  
    drafts.forEach((draft, index) => {
      lines.push(`${index + 1}. ${draft.medicationName}`);
  
      if (draft.quantityText) {
        lines.push(`- Take ${draft.quantityText} each time`);
      } else if (draft.dosageText) {
        lines.push(`- Dosage: ${draft.dosageText}`);
      }
  
      if (draft.timesPerDay) {
        lines.push(`- ${draft.timesPerDay} time${draft.timesPerDay > 1 ? "s" : ""} per day`);
      } else if (draft.frequencyText) {
        lines.push(`- Frequency: ${draft.frequencyText}`);
      }
  
      if (draft.durationText) {
        lines.push(`- ${draft.durationText}`);
      }
  
      if (draft.mealTiming) {
        lines.push(`- Timing note: ${draft.mealTiming}`);
      }
  
      lines.push("");
    });
  
    lines.push(`Reply "confirm" if this looks correct, or tell me what needs to change.`);
  
    return lines.join("\n");
  }
  
  export function buildDailySchedule(
    drafts: MedicationPlanDraft[]
  ): DailyScheduleItem[] {
    const items: DailyScheduleItem[] = [];
  
    for (const draft of drafts) {
      if (!draft.suggestedTimes.length) continue;
  
      for (const time of draft.suggestedTimes) {
        items.push({
          time,
          medicationName: draft.medicationName,
          quantityText: draft.quantityText,
          dosageText: draft.dosageText,
          mealTiming: draft.mealTiming,
        });
      }
    }
  
    return items.sort((a, b) => {
      const aMinutes = a.time.hour * 60 + a.time.minute;
      const bMinutes = b.time.hour * 60 + b.time.minute;
      return aMinutes - bMinutes;
    });
  }
  
  export function formatDailySchedule(schedule: DailyScheduleItem[]): string {
    if (!schedule.length) {
      return "I could not build a daily medicine schedule automatically yet. I need you to confirm the reminder times.";
    }
  
    const lines: string[] = [];
    lines.push("Here is your daily medicine intake schedule:");
    lines.push("");
  
    for (const item of schedule) {
      const quantity = item.quantityText
        ? `${item.quantityText} of `
        : "";
      lines.push(`${item.time.label}  ${quantity}${item.medicationName}`);
    }
  
    return lines.join("\n");
  }