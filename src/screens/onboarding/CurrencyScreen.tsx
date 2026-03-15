import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CurrencyCode } from '../../types';
import { CURRENCY_LABELS } from '../../constants';
import { useOnboarding } from '../../contexts/OnboardingContext';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

const CURRENCY_CODES: CurrencyCode[] = ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'KRW', 'GBP'];
const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = 'TWD';

const LABEL_CURRENCY = '選擇主要貨幣';
const LABEL_CURRENCY_DESC = '記帳時將以此貨幣為預設顯示，之後可在設定中修改。';
const BUTTON_DONE = '完成設定';

type RouteProps = NativeStackScreenProps<OnboardingStackParamList, 'Currency'>['route'];

export default function CurrencyScreen(): React.JSX.Element {
  const route = useRoute<RouteProps>();
  const { accounts } = route.params;
  const { completeOnboarding } = useOnboarding();
  const [selected, setSelected] = useState<CurrencyCode>(DEFAULT_PRIMARY_CURRENCY);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{LABEL_CURRENCY}</Text>
        <Text style={styles.desc}>{LABEL_CURRENCY_DESC}</Text>

        <View style={styles.list}>
          {CURRENCY_CODES.map((code) => {
            const isSelected = selected === code;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelected(code)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {CURRENCY_LABELS[code] ?? code}
                </Text>
                {isSelected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => completeOnboarding(accounts, selected)}
          activeOpacity={0.8}
        >
          <Text style={styles.doneButtonText}>{BUTTON_DONE}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  desc: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  list: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  optionText: {
    fontSize: 16,
    color: '#374151',
  },
  optionTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  check: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  doneButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 32,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
