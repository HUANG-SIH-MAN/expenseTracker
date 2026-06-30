/**
 * 計算機鍵盤
 * 佈局：C +/- ⌫ ÷ / 7 8 9 × / 4 5 6 - / 1 2 3 + / . 0 = OK
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { parseAmountInput, sanitizeAmountInput } from '../utils/amountExpression';

// ── 色票 ──────────────────────────────────────────────────────────────
const BG = '#f2f2f7';

const NUM_BG = '#ffffff';
const NUM_TEXT = '#1c1c1e';

const OP_BG = '#dbeafe';
const OP_TEXT = '#1d4ed8';

const UTIL_BG = '#e5e7eb';
const UTIL_TEXT = '#374151';

const CLEAR_BG = '#fee2e2';
const CLEAR_TEXT = '#dc2626';

const EVAL_BG = '#eff6ff';
const EVAL_TEXT = '#2563eb';

const OK_BG = '#2563eb';
const OK_TEXT = '#ffffff';

// ── 尺寸 ──────────────────────────────────────────────────────────────
const GAP = 8;
const RADIUS = 14;
const PAD_H = 12;
const PAD_V = 10;

type KeyType = 'digit' | 'op' | 'clear' | 'toggleSign' | 'backspace' | 'equals' | 'confirm';

interface Key {
  id: string;
  label: string;
  type: KeyType;
  value?: string;
}

const ROWS: Key[][] = [
  [
    { id: 'c',   label: 'C',   type: 'clear' },
    { id: 'pm',  label: '+/-', type: 'toggleSign' },
    { id: 'back',label: '⌫',  type: 'backspace' },
    { id: 'div', label: '÷',   type: 'op', value: '÷' },
  ],
  [
    { id: '7', label: '7', type: 'digit' },
    { id: '8', label: '8', type: 'digit' },
    { id: '9', label: '9', type: 'digit' },
    { id: 'mul', label: '×', type: 'op', value: '×' },
  ],
  [
    { id: '4', label: '4', type: 'digit' },
    { id: '5', label: '5', type: 'digit' },
    { id: '6', label: '6', type: 'digit' },
    { id: 'sub', label: '−', type: 'op', value: '-' },
  ],
  [
    { id: '1', label: '1', type: 'digit' },
    { id: '2', label: '2', type: 'digit' },
    { id: '3', label: '3', type: 'digit' },
    { id: 'add', label: '+', type: 'op', value: '+' },
  ],
  [
    { id: 'dot', label: '.', type: 'digit', value: '.' },
    { id: '0',   label: '0', type: 'digit' },
    { id: 'eq',  label: '=', type: 'equals' },
    { id: 'ok',  label: 'OK', type: 'confirm' },
  ],
];

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

  const handleKey = (key: Key) => {
    switch (key.type) {
      case 'digit':
        append(key.value ?? key.label);
        break;
      case 'op':
        append(key.value ?? key.label);
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

  const keyStyle = (key: Key) => {
    switch (key.type) {
      case 'confirm':   return [styles.key, styles.keyOk];
      case 'equals':    return [styles.key, styles.keyEval];
      case 'op':        return [styles.key, styles.keyOp];
      case 'clear':     return [styles.key, styles.keyClear];
      case 'toggleSign':
      case 'backspace': return [styles.key, styles.keyUtil];
      default:          return [styles.key, styles.keyNum];
    }
  };

  const textStyle = (key: Key) => {
    switch (key.type) {
      case 'confirm':   return [styles.keyText, styles.textOk];
      case 'equals':    return [styles.keyText, styles.textEval];
      case 'op':        return [styles.keyText, styles.textOp];
      case 'clear':     return [styles.keyText, styles.textClear];
      case 'toggleSign':
      case 'backspace': return [styles.keyText, styles.textUtil];
      default:          return [styles.keyText, styles.textNum];
    }
  };

  return (
    <View style={styles.container}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => (
            <TouchableOpacity
              key={key.id}
              style={keyStyle(key)}
              onPress={() => handleKey(key)}
              activeOpacity={0.65}
            >
              <Text style={textStyle(key)} adjustsFontSizeToFit numberOfLines={1}>
                {key.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: PAD_H,
    paddingTop: PAD_V,
    paddingBottom: PAD_V,
    gap: GAP,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: GAP,
  },

  // ── 各類按鍵底色 ────────────────────────────────────────────────────
  key: {
    flex: 1,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  keyNum:   { backgroundColor: NUM_BG },
  keyOp:    { backgroundColor: OP_BG },
  keyUtil:  { backgroundColor: UTIL_BG },
  keyClear: { backgroundColor: CLEAR_BG },
  keyEval:  { backgroundColor: EVAL_BG },
  keyOk:    { backgroundColor: OK_BG },

  // ── 各類按鍵文字 ────────────────────────────────────────────────────
  keyText: {
    fontSize: 22,
    fontWeight: '500',
  },
  textNum:   { color: NUM_TEXT },
  textOp:    { color: OP_TEXT,    fontSize: 24, fontWeight: '600' },
  textUtil:  { color: UTIL_TEXT },
  textClear: { color: CLEAR_TEXT, fontWeight: '600' },
  textEval:  { color: EVAL_TEXT,  fontSize: 24, fontWeight: '600' },
  textOk:    { color: OK_TEXT,    fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
});
