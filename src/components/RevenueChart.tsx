import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

const VB_W = 220;
const VB_H = 80;
const LEFT_MARGIN = 24;
const RIGHT_MARGIN = 8;
const TOP_MARGIN = 8;
const BOTTOM_MARGIN = 16;
const PLOT_X = LEFT_MARGIN;
const PLOT_Y = TOP_MARGIN;
const PLOT_W = VB_W - LEFT_MARGIN - RIGHT_MARGIN;
const PLOT_H = VB_H - TOP_MARGIN - BOTTOM_MARGIN;
const PLOT_RIGHT = PLOT_X + PLOT_W;
const PLOT_BOTTOM = PLOT_Y + PLOT_H;
const Y_LABEL_X = LEFT_MARGIN - 2;
const X_LABEL_Y = VB_H - 4;
const AXIS_FONT_SIZE = 8;
const AXIS_COLOR = '#9ca3af';
const LINE_COLOR_DEFAULT = '#2563eb';
const DOT_RADIUS = 2;
const DOMAIN_PADDING_RATIO = 0.1;
const H_POINT_PAD = 10;
const DEFAULT_MAX_X_LABELS = 5;

export interface RevenueChartRow {
  label: string;
  value: number;
}

interface YLabel {
  y: number;
  text: string;
}

interface XLabel {
  x: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

interface Dot {
  x: number;
  y: number;
}

interface ChartGeometry {
  polylinePoints: string | null;
  dots: Dot[];
  zeroY: number | null;
  yLabels: YLabel[];
  xLabels: XLabel[];
}

function fmtRevenueLabel(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (abs >= 100e9) return `${Math.round(v / 1e9)}B`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 100e6) return `${Math.round(v / 1e6)}M`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
}

function getXLabelIndices(n: number, maxLabels: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const result = new Set([0, n - 1]);
  const innerCount = maxLabels - 2;
  for (let k = 1; k <= innerCount; k++) {
    result.add(Math.round((k * (n - 1)) / (innerCount + 1)));
  }
  return [...result].sort((a, b) => a - b);
}

function buildChartGeometry(data: RevenueChartRow[], maxXLabels: number, fmtY: (v: number) => string): ChartGeometry {
  const n = data.length;

  if (n === 0) {
    return { polylinePoints: null, dots: [], zeroY: null, yLabels: [], xLabels: [] };
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal;
  const safeRange = valRange > 0 ? valRange : 1;
  const paddedMin = minVal - safeRange * DOMAIN_PADDING_RATIO;
  const paddedMax = maxVal + safeRange * DOMAIN_PADDING_RATIO;
  const paddedRange = paddedMax - paddedMin;

  const toSvgX = (i: number) => {
    const ratioX = n > 1 ? i / (n - 1) : 0.5;
    return PLOT_X + H_POINT_PAD + ratioX * (PLOT_W - 2 * H_POINT_PAD);
  };
  const toSvgY = (v: number) => {
    const ratioY = (v - paddedMin) / paddedRange;
    return PLOT_BOTTOM - ratioY * PLOT_H;
  };

  const dots: Dot[] = data.map((d, i) => ({ x: toSvgX(i), y: toSvgY(d.value) }));
  const polylinePoints = n >= 2 ? dots.map((d) => `${d.x},${d.y}`).join(' ') : null;
  const zeroY = paddedMin < 0 && paddedMax > 0 ? toSvgY(0) : null;

  const Y_TEXT_OFFSET = 3;
  const midVal = (minVal + maxVal) / 2;
  const yLabels: YLabel[] = [
    { y: PLOT_Y + Y_TEXT_OFFSET, text: fmtY(maxVal) },
    { y: PLOT_Y + PLOT_H / 2 + Y_TEXT_OFFSET, text: fmtY(midVal) },
    { y: PLOT_BOTTOM + Y_TEXT_OFFSET, text: fmtY(minVal) },
  ];

  const xLabelIndices = getXLabelIndices(n, maxXLabels);
  const lastIdx = xLabelIndices[xLabelIndices.length - 1];
  const xLabels: XLabel[] = xLabelIndices.map((i) => ({
    x: toSvgX(i),
    text: data[i].label,
    anchor: i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle',
  }));

  return { polylinePoints, dots, zeroY, yLabels, xLabels };
}

interface RevenueChartProps {
  data: RevenueChartRow[];
  width: number;
  height?: number;
  maxXLabels?: number;
  lineColor?: string;
  emptyText?: string;
  fmtYLabel?: (v: number) => string;
}

export default function RevenueChart({
  data,
  width,
  height = 110,
  maxXLabels = DEFAULT_MAX_X_LABELS,
  lineColor = LINE_COLOR_DEFAULT,
  emptyText = '資料不足',
  fmtYLabel = fmtRevenueLabel,
}: RevenueChartProps): React.JSX.Element {
  const validData = useMemo(
    () => data.filter((d) => Number.isFinite(d.value)),
    [data],
  );

  const geometry = useMemo(
    () => buildChartGeometry(validData, maxXLabels, fmtYLabel),
    [validData, maxXLabels, fmtYLabel],
  );

  if (validData.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const { polylinePoints, dots, zeroY, yLabels, xLabels } = geometry;

  return (
    <View style={{ width, height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {zeroY != null && (
          <Line
            x1={PLOT_X}
            y1={zeroY}
            x2={PLOT_RIGHT}
            y2={zeroY}
            stroke="#e5e7eb"
            strokeWidth={0.75}
            strokeDasharray="2 2"
          />
        )}
        {yLabels.map((label) => (
          <SvgText
            key={`y-${label.y}`}
            x={Y_LABEL_X}
            y={label.y}
            fontSize={AXIS_FONT_SIZE}
            fill={AXIS_COLOR}
            textAnchor="end"
          >
            {label.text}
          </SvgText>
        ))}
        {xLabels.map((label) => (
          <SvgText
            key={`x-${label.x}`}
            x={label.x}
            y={X_LABEL_Y}
            fontSize={AXIS_FONT_SIZE}
            fill={AXIS_COLOR}
            textAnchor={label.anchor}
          >
            {label.text}
          </SvgText>
        ))}
        {polylinePoints != null && (
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {dots.map((dot, i) => (
          <Circle
            key={`dot-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={DOT_RADIUS}
            fill={lineColor}
            stroke="#ffffff"
            strokeWidth={1}
          />
        ))}
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
