/**
 * 簡易圓餅圖：使用 react-native-svg 繪製，相容 Web / Native
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const FULL_CIRCLE_RADIANS = 2 * Math.PI;
const START_OFFSET_RADIANS = -Math.PI / 2;

export interface PieChartSlice {
  name: string;
  amount: number;
  color: string;
}

interface PieChartProps {
  data: PieChartSlice[];
  size: number;
}

function getPathForSlice(
  startAngle: number,
  endAngle: number,
  cx: number,
  cy: number,
  r: number
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export default function PieChart({ data, size }: PieChartProps): React.JSX.Element {
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.min(cx, cy) * 0.9;

  let currentAngle = START_OFFSET_RADIANS;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total > 0 &&
          data.map((slice, i) => {
            const ratio = slice.amount / total;
            const startAngle = currentAngle;
            currentAngle += ratio * FULL_CIRCLE_RADIANS;
            const endAngle = currentAngle;
            const d = getPathForSlice(startAngle, endAngle, cx, cy, r);
            return <Path key={`${slice.name}-${i}`} d={d} fill={slice.color} />;
          })}
      </Svg>
    </View>
  );
}
