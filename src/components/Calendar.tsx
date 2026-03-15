/**
 * 月曆元件：顯示單月、選擇日期
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_COUNT = 7;

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function toDateKey(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export interface CalendarProps {
  year: number;
  month: number;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** 有記帳紀錄的日期（YYYY-MM-DD），這些日期會以灰色顯示 */
  datesWithRecords?: Set<string>;
}

export default function Calendar({
  year,
  month,
  selectedDate,
  onSelectDate,
  datesWithRecords,
}: CalendarProps): React.JSX.Element {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstDayWeekday(year, month);
  const leadingEmpty = firstWeekday;
  const totalCells = leadingEmpty + daysInMonth;
  const rows = Math.ceil(totalCells / WEEKDAY_COUNT);

  const cells: (number | null)[] = [];
  for (let i = 0; i < leadingEmpty; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.dayRow}>
          {WEEKDAY_LABELS.map((_, colIndex) => {
            const index = rowIndex * WEEKDAY_COUNT + colIndex;
            const day = cells[index] ?? null;
            if (day === null) {
              return <View key={index} style={styles.dayCell} />;
            }
            const dateKey = toDateKey(year, month, day);
            const isSelected = selectedDate === dateKey;
            const hasRecords = datesWithRecords?.has(dateKey) ?? false;
            return (
              <TouchableOpacity
                key={index}
                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                onPress={() => onSelectDate(dateKey)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayText,
                    isSelected && styles.dayTextSelected,
                    hasRecords && !isSelected && styles.dayTextWithRecords,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  dayRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  dayCellSelected: {
    backgroundColor: '#2563eb',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 15,
    color: '#1f2937',
  },
  dayTextWithRecords: {
    color: '#6b7280',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
