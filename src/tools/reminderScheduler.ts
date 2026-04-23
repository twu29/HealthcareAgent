import type { DailyScheduleItem } from "./medReminderGenerator.js";

type CreatedReminder = {
  medicationName: string;
  timeLabel: string;
  scheduledMessageId: string;
  message: string;
};

function getNextOccurrenceTimestamp(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();

  next.setHours(hour, minute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime();
}

function buildReminderMessage(item: DailyScheduleItem): string {
  const quantityPrefix = item.quantityText ? `${item.quantityText} of ` : "";
  let message = `Reminder: Take ${quantityPrefix}${item.medicationName} now.`;

  if (item.mealTiming) {
    message += ` ${capitalizeFirst(item.mealTiming)}.`;
  }

  return message;
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function createMedicationReminderSchedule(args: {
  sdk: any;
  chatGuid: string;
  schedule: DailyScheduleItem[];
}): Promise<CreatedReminder[]> {
  const { sdk, chatGuid, schedule } = args;
  const created: CreatedReminder[] = [];

  for (const item of schedule) {
    const reminderMessage = buildReminderMessage(item);

    const scheduled = await sdk.scheduledMessages.createScheduledMessage({
      type: "send-message",
      payload: {
        chatGuid,
        message: reminderMessage,
        method: "apple-script",
      },
      scheduledFor: getNextOccurrenceTimestamp(
        item.time.hour,
        item.time.minute
      ),
      schedule: {
        type: "recurring",
        intervalType: "daily",
        interval: 1,
      },
    });

    created.push({
      medicationName: item.medicationName,
      timeLabel: item.time.label,
      scheduledMessageId: scheduled.id,
      message: reminderMessage,
    });
  }

  return created;
}

export function formatCreatedReminderConfirmation(
  reminders: CreatedReminder[]
): string {
  if (!reminders.length) {
    return "I could not create reminders yet because I did not have enough confirmed schedule information.";
  }

  const lines: string[] = [];
  lines.push("Your medicine reminders are now set:");
  lines.push("");

  for (const reminder of reminders) {
    lines.push(`${reminder.timeLabel}  ${reminder.medicationName}`);
  }

  lines.push("");
  lines.push("I’ll message you at those times each day.");

  return lines.join("\n");
}