import { Temporal } from "@js-temporal/polyfill";

export type TaskRecurrenceFrequency = "daily" | "weekly" | "monthly";

export function nextTaskOccurrence(
  current: Date,
  frequency: TaskRecurrenceFrequency,
  interval: number,
  timezone: string,
) {
  const zoned = Temporal.Instant.from(current.toISOString()).toZonedDateTimeISO(timezone);
  const duration = frequency === "daily"
    ? { days: interval }
    : frequency === "weekly"
      ? { weeks: interval }
      : { months: interval };
  return new Date(zoned.add(duration).toInstant().epochMilliseconds);
}
