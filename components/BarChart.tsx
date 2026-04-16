import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { COLORS } from '@/constants/colors';

interface BarChartProps {
  data: { label: string; income: number; expense: number }[];
  width: number;
  height?: number;
}

export function BarChart({ data, width, height = 120 }: BarChartProps) {
  const padding = { left: 0, right: 0, top: 8, bottom: 24 };
  const chartH = height - padding.top - padding.bottom;
  const chartW = width - padding.left - padding.right;
  const barGroupW = chartW / data.length;
  const barW = Math.min(14, barGroupW * 0.3);
  const gap = 3;

  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);

  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const cx = padding.left + i * barGroupW + barGroupW / 2;
        const incH = (d.income / maxVal) * chartH;
        const expH = (d.expense / maxVal) * chartH;
        const incY = padding.top + chartH - incH;
        const expY = padding.top + chartH - expH;

        return (
          <React.Fragment key={i}>
            <Rect
              x={cx - barW - gap / 2}
              y={incY}
              width={barW}
              height={Math.max(incH, 2)}
              rx={3}
              fill={COLORS.success}
              opacity={0.85}
            />
            <Rect
              x={cx + gap / 2}
              y={expY}
              width={barW}
              height={Math.max(expH, 2)}
              rx={3}
              fill={COLORS.danger}
              opacity={0.85}
            />
            <SvgText
              x={cx}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill={COLORS.muted}
              fontFamily="Inter_400Regular"
            >
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function ChartLegend() {
  const styles = StyleSheet.create({
    legend: {
      flexDirection: 'row',
      gap: 16,
      marginTop: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    legendLabel: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: COLORS.textSecondary,
    },
  });

  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
        <Text style={styles.legendLabel}>Income</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
        <Text style={styles.legendLabel}>Expenses</Text>
      </View>
    </View>
  );
}
