/**
 * 計算機風格鍵盤：數字、小數點、+ - × ÷、= +/- C OK 倒退
 * 佈局參考：第一列 = +/- C OK，第二列 ÷ 7 8 9，第三列 × 4 5 6，
 * 第四列 - 1 2 3，第五列 + . 0 倒退
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { parseAmountInput, sanitizeAmountInput } from '../utils/amountExpression';

const KEYPAD_BG = '#ffffff';
const KEY_BG = '#f3f4f6';
const KEY_SPECIAL_BG = '#e5e7eb';
const KEY_TEXT = '#1a1a1a';
const KEY_OPERATOR = '#0a84ff';

const ROW1_KEYS = [
  { id: 'eq', label: '=', type: 'equals' as const },
  { id: 'pm', label: '+/-', type: 'toggleSign' as const },
  { id: 'c', label: 'C', type: 'clear' as const },
  { id: 'ok', label: 'OK', type: 'confirm' as const },
];
const ROW2_KEYS = [
  { id: 'div', label: '÷', type: 'op' as const, value: '\u00F7' },
  { id: '7', label: '7', type: 'digit' as const },
  { id: '8', label: '8', type: 'digit' as const },
  { id: '9', label: '9', type: 'digit' as const },
];
const ROW3_KEYS = [
  { id: 'mul', label: '×', type: 'op' as const, value: '\u00D7' },
  { id: '4', label: '4', type: 'digit' as const },
  { id: '5', label: '5', type: 'digit' as const },
  { id: '6', label: '6', type: 'digit' as const },
];
const ROW4_KEYS = [
  { id: 'sub', label: '-', type: 'op' as const, value: '-' },
  { id: '1', label: '1', type: 'digit' as const },
  { id: '2', label: '2', type: 'digit' as const },
  { id: '3', label: '3', type: 'digit' as const },
];
const ROW5_KEYS = [
  { id: 'add', label: '+', type: 'op' as const, value: '+' },
  { id: 'dot', label: '.', type: 'digit' as const, value: '.' },
  { id: '0', label: '0', type: 'digit' as const },
  { id: 'back', label: '⌫', type: 'backspace' as const },
];

const ROWS = [ROW1_KEYS, ROW2_KEYS, ROW3_KEYS, ROW4_KEYS, ROW5_KEYS];
const KEY_GAP = 0;
const KEY_BORDER_RADIUS = 0;
const KEYPAD_PADDING_HORIZONTAL = 0;
const KEYPAD_PADDING_VERTICAL = 0;
const KEY_FONT_SIZE = 24;
const KEY_OPERATOR_FONT_SIZE = 26;
const KEY_CONFIRM_FONT_SIZE = 19;

export interface CalculatorKeypadProps {
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
}

export default function CalculatorKeypad({
  value,
  onValueChange,
  onConfirm,
}: CalculatorKeypadProps): React.JSX.Element {
  const append = (char: string) => {
    onValueChange(sanitizeAmountInput(value + char, value));
  };

  type KeyItem = (typeof ROW1_KEYS)[number] | (typeof ROW2_KEYS)[number] | (typeof ROW5_KEYS)[number];
  const handleKey = (key: KeyItem) => {
    switch (key.type) {
      case 'digit':
        append(key.value ?? key.label);
        break;
      case 'op':
        append(key.value);
        break;
      case 'equals': {
        const parsed = parseAmountInput(value);
        if (parsed.valid && parsed.value !== 0) {
          onValueChange(String(parsed.value));
        }
        break;
      }
      case 'toggleSign': {
        if (value === '' || value === '0') {
          onValueChange('-');
        } else {
          const res = parseAmountInput(value);
          if (res.valid) {
            onValueChange(String(-res.value));
          } else if (value.startsWith('-')) {
            onValueChange(value.slice(1));
          } else {
            onValueChange('-' + value);
          }
        }
        break;
      }
      case 'clear':
        onValueChange('');
        break;
      case 'confirm':
        onConfirm();
        break;
      case 'backspace':
        onValueChange(value.slice(0, -1));
        break;
    }
  };

  const isOperatorKey = (key: { type: string }) =>
    key.type === 'op' || key.type === 'equals';
  const isConfirmKey = (key: { type: string }) => key.type === 'confirm';

  return (
    <View style={styles.container}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => {
            const isOp = isOperatorKey(key);
            const isOk = isConfirmKey(key);
            return (
              <TouchableOpacity
                key={key.id}
                style={[
                  styles.key,
                  isOp && !isOk && styles.keyOperator,
                  isOk && styles.keyConfirm,
                ]}
                onPress={() => handleKey(key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.keyText,
                    isOp && !isOk && styles.keyTextOperator,
                    isOk && styles.keyTextConfirm,
                  ]}
                >
                  {key.label}
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
    flex: 1,
    backgroundColor: KEYPAD_BG,
    paddingHorizontal: KEYPAD_PADDING_HORIZONTAL,
    paddingVertical: KEYPAD_PADDING_VERTICAL,
    gap: KEY_GAP,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: KEY_GAP,
  },
  key: {
    flex: 1,
    backgroundColor: KEY_BG,
    borderRadius: KEY_BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOperator: {
    backgroundColor: KEY_SPECIAL_BG,
  },
  keyConfirm: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
  },
  keyText: {
    fontSize: KEY_FONT_SIZE,
    color: KEY_TEXT,
    fontWeight: '400',
  },
  keyTextOperator: {
    color: KEY_OPERATOR,
    fontSize: KEY_OPERATOR_FONT_SIZE,
    fontWeight: '400',
  },
  keyTextConfirm: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: KEY_CONFIRM_FONT_SIZE,
  },
});
