import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import type { InstrumentMarket } from '../types';

const VB_W = 220;
const VB_H = 80;
const LEFT_MARGIN = 20;
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
const MAX_X_LABELS = 5;
const H_POINT_PAD = 10;

export interface EpsHistoryRow {
  fiscalYear: string;
  eps: number;
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

function fmtYLabel(eps: number, market: InstrumentMarket): string {
  const abs = Math.abs(eps);
  if (market === 'TW') return eps.toFixed(0);
  if (abs >= 100) return eps.toFixed(0);
  if (abs >= 10) return eps.toFixed(1);
  return eps.toFixed(2);
}

function getXLabelIndices(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n <= MAX_X_LABELS) return Array.from({ length: n }, (_, i) => i);
  const result = new Set([0, n - 1]);
  const innerCount = MAX_X_LABELS - 2;
  for (let k = 1; k <= innerCount; k++) {
    result.add(Math.round((k * (n - 1)) / (innerCount + 1)));
  }
  return [...result].sort((a, b) => a - b);
}

function buildChartGeometry(data: EpsHistoryRow[], market: InstrumentMarket): ChartGeometry {
  const n = data.length;

  if (n === 0) {
    return { polylinePoints: null, dots: [], zeroY: null, yLabels: [], xLabels: [] };
  }

  const values = data.map((d) => d.eps);
  const minEps = Math.min(...values);
  const maxEps = Math.max(...values);
  const epsRange = maxEps - minEps;
  const safeRange = epsRange > 0 ? epsRange : 1;
  const paddedMin = minEps - safeRange * DOMAIN_PADDING_RATIO;
  const paddedMax = maxEps + safeRange * DOMAIN_PADDING_RATIO;
  const paddedRange = paddedMax - paddedMin;

  const toSvgX = (i: number) => {
    const ratioX = n > 1 ? i / (n - 1) : 0.5;
    return PLOT_X + H_POINT_PAD + ratioX * (PLOT_W - 2 * H_POINT_PAD);
  };
  const toSvgY = (v: number) => {
    const ratioY = (v - paddedMin) / paddedRange;
    return PLOT_BOTTOM - ratioY * PLOT_H;
  };

  const dots: Dot[] = data.map((d, i) => ({ x: toSvgX(i), y: toSvgY(d.eps) }));

  const polylinePoints =
    n >= 2 ? dots.map((d) => `${d.x},${d.y}`).join(' ') : null;

  const zeroY =
    paddedMin < 0 && paddedMax > 0 ? toSvgY(0) : null;

  // +3 offset approximates cap-height/2 for vertical centering without dominantBaseline
  const Y_TEXT_OFFSET = 3;
  const midEps = (minEps + maxEps) / 2;
  const yLabels: YLabel[] = [
    { y: PLOT_Y + Y_TEXT_OFFSET, text: fmtYLabel(maxEps, market) },
    { y: PLOT_Y + PLOT_H / 2 + Y_TEXT_OFFSET, text: fmtYLabel(midEps, market) },
    { y: PLOT_BOTTOM + Y_TEXT_OFFSET, text: fmtYLabel(minEps, market) },
  ];

  const xLabelIndices = getXLabelIndices(n);
  const lastIdx = xLabelIndices[xLabelIndices.length - 1];
  const xLabels: XLabel[] = xLabelIndices.map((i) => ({
    x: toSvgX(i),
    text: data[i].fiscalYear,
    anchor: i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle',
  }));

  return { polylinePoints, dots, zeroY, yLabels, xLabels };
}

interface EpsHistoryChartProps {
  data: EpsHistoryRow[];
  width: number;
  height?: number;
  market: InstrumentMarket;
  lineColor?: string;
  emptyText?: string;
}

export default function EpsHistoryChart({
  data,
  width,
  height = 110,
  market,
  lineColor = LINE_COLOR_DEFAULT,
  emptyText = '資料不足',
}: EpsHistoryChartProps): React.JSX.Element {
  const validData = useMemo(
    () => data.filter((d) => Number.isFinite(d.eps)),
    [data],
  );

  const geometry = useMemo(
    () => buildChartGeometry(validData, market),
    [validData, market],
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
