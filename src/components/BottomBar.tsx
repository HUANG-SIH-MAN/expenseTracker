import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { getTodayKey } from '../utils/date';

const BOTTOM_BAR_HEIGHT = 56;
const BOTTOM_ICON_SIZE = 22;
const BOTTOM_LABEL_FONT_SIZE = 10;

const BOTTOM_STATS = '統計';
const BOTTOM_ADD_LABEL = '記一筆';
const BOTTOM_INVEST = '投資';
const BOTTOM_SETTINGS = '設定';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface BottomBarProps {
  selectedDate?: string;
}

export default function BottomBar({ selectedDate }: BottomBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const activeDate = selectedDate || getTodayKey();

  const currentRoute = route.name;

  const isActive = (name: string) => currentRoute === name;

  const getColor = (name: string) => isActive(name) ? '#2563eb' : '#6b7280';

  return (
    <View
      style={[
        styles.bottomBar,
        { paddingBottom: insets.bottom, height: BOTTOM_BAR_HEIGHT + insets.bottom },
      ]}
    >
      <TouchableOpacity
        style={styles.bottomBarItem}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isActive('Home') ? 'home' : 'home-outline'}
          size={BOTTOM_ICON_SIZE}
          color={getColor('Home')}
        />
        <Text style={[styles.bottomBarLabel, { color: getColor('Home') }]}>首頁</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomBarItem}
        onPress={() => navigation.navigate('Statistics')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isActive('Statistics') ? 'stats-chart' : 'stats-chart-outline'}
          size={BOTTOM_ICON_SIZE}
          color={getColor('Statistics')}
        />
        <Text style={[styles.bottomBarLabel, { color: getColor('Statistics') }]}>{BOTTOM_STATS}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.bottomBarItem, styles.bottomBarCenter]}
        onPress={() => navigation.navigate('AddTransaction', { selectedDate: activeDate })}
        activeOpacity={0.8}
      >
        <View style={styles.bottomBarCenterIconWrap}>
          <Ionicons name="add" size={BOTTOM_ICON_SIZE + 4} color="#fff" />
        </View>
        <Text style={styles.bottomBarCenterLabel}>{BOTTOM_ADD_LABEL}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomBarItem}
        onPress={() => navigation.navigate('Portfolio')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isActive('Portfolio') ? 'trending-up' : 'trending-up-outline'}
          size={BOTTOM_ICON_SIZE}
          color={getColor('Portfolio')}
        />
        <Text style={[styles.bottomBarLabel, { color: getColor('Portfolio') }]}>{BOTTOM_INVEST}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomBarItem}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isActive('Settings') ? 'settings' : 'settings-outline'}
          size={BOTTOM_ICON_SIZE}
          color={getColor('Settings')}
        />
        <Text style={[styles.bottomBarLabel, { color: getColor('Settings') }]}>{BOTTOM_SETTINGS}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  bottomBarLabel: {
    fontSize: BOTTOM_LABEL_FONT_SIZE,
    fontWeight: '500',
  },
  bottomBarCenter: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarCenterIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarCenterLabel: {
    fontSize: BOTTOM_LABEL_FONT_SIZE,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 2,
  },
});
