export type CountedGroupSchedule = {
  count: number;
  firstDate: string;
  weekdayIndex: number;
  startTime: string;
  endTime: string;
};

export function mostFrequentGroupSchedule<T extends CountedGroupSchedule>(
  schedules: Iterable<T>,
) {
  return [...schedules].sort((left, right) => (
    right.count - left.count
    || left.firstDate.localeCompare(right.firstDate)
    || left.weekdayIndex - right.weekdayIndex
    || left.startTime.localeCompare(right.startTime)
    || left.endTime.localeCompare(right.endTime)
  ))[0];
}
