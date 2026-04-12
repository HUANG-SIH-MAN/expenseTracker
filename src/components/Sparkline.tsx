import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

const SVG_VIEWBOX_WIDTH = 100;
const SVG_VIEWBOX_HEIGHT = 40;
const SVG_HORIZONTAL_PADDING = 4;
const SVG_VERTICAL_PADDING = 4;
const MIN_POINT_COUNT = 2;

interface SparklineProps {
  values: number[];
  width: number;
  height?: number;
  lineColor?: string;
  emptyText?: string;
}

function buildPolylinePoints(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const safeRange = range > 0 ? range : 1;
  const plotWidth = SVG_VIEWBOX_WIDTH - SVG_HORIZONTAL_PADDING * 2;
  const plotHeight = SVG_VIEWBOX_HEIGHT - SVG_VERTICAL_PADDING * 2;

  return values
    .map((value, index) => {
      const ratioX = values.length > 1 ? index / (values.length - 1) : 0;
      const ratioY = (value - min) / safeRange;
      const x = SVG_HORIZONTAL_PADDING + ratioX * plotWidth;
      const y = SVG_VIEWBOX_HEIGHT - SVG_VERTICAL_PADDING - ratioY * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

export default function Sparkline({
  values,
  width,
  height = 40,
  lineColor = '#2563eb',
  emptyText = '資料不足',
}: SparklineProps): React.JSX.Element {
  const validValues = useMemo(
    () => values.filter((value) => Number.isFinite(value)),
    [values],
  );

  if (validValues.length < MIN_POINT_COUNT) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const points = buildPolylinePoints(validValues);

  return (
    <View style={{ width, height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_VIEWBOX_WIDTH} ${SVG_VIEWBOX_HEIGHT}`}>
        <Polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
