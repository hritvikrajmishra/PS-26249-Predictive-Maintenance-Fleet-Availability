import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface TimeSeriesAnomalyWindow {
  startDate: string;
  endDate: string;
  label?: string;
  color?: string;
}

interface TimeSeriesChartProps {
  title?: string;
  subtitle?: string;
  height?: string | number;
  series: Array<{
    name: string;
    data: Array<[string, number] | { value: [string, number]; [key: string]: unknown }>;
    color?: string;
    type?: 'line' | 'bar' | 'scatter';
    area?: boolean;
    dashed?: boolean;
  }>;
  anomalyWindows?: TimeSeriesAnomalyWindow[];
  forecastStartDate?: string;
  yAxisLabel?: string;
  yAxisMin?: number;
  yAxisMax?: number;
  loading?: boolean;
}

const MUTED_PALETTE = ['#2F5D8A', '#4F759B', '#608070', '#8C7A6B', '#8F6580', '#A66A00'];

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  title,
  subtitle,
  height = 280,
  series,
  anomalyWindows = [],
  forecastStartDate,
  yAxisLabel,
  yAxisMin,
  yAxisMax,
  loading = false,
}) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
      });
    }

    const chart = chartInstance.current;

    if (loading) {
      chart.showLoading({
        text: 'Loading series data...',
        color: '#2F5D8A',
        textColor: '#5C5C57',
        maskColor: 'rgba(255, 255, 255, 0.85)',
      });
      return;
    } else {
      chart.hideLoading();
    }

    // Construct markArea pieces for forecast & anomalies
    const markAreaPieces: Array<[
      { coord: [string, number | undefined]; itemStyle?: { color?: string } },
      { coord: [string, number | undefined] }
    ]> = [];

    // Add forecast shading if provided
    if (forecastStartDate) {
      markAreaPieces.push([
        {
          coord: [forecastStartDate, undefined],
          itemStyle: {
            color: 'rgba(47, 93, 138, 0.05)',
          },
        },
        {
          coord: ['9999-12-31', undefined],
        },
      ]);
    }

    // Add anomaly window shadings in desaturated tint
    anomalyWindows.forEach((win) => {
      markAreaPieces.push([
        {
          coord: [win.startDate, undefined],
          itemStyle: {
            color: win.color || 'rgba(179, 64, 47, 0.10)',
          },
        },
        {
          coord: [win.endDate, undefined],
        },
      ]);
    });

    const echartsSeries = series.map((s, idx) => {
      const seriesColor = s.color || MUTED_PALETTE[idx % MUTED_PALETTE.length];
      return {
        name: s.name,
        type: s.type || 'line',
        smooth: false,
        showSymbol: false,
        lineStyle: {
          width: 1.75,
          color: seriesColor,
          type: s.dashed ? 'dashed' : 'solid',
        },
        itemStyle: {
          color: seriesColor,
        },
        areaStyle: s.area
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: seriesColor + '25' },
                { offset: 1, color: seriesColor + '04' },
              ]),
            }
          : undefined,
        data: s.data as unknown as echarts.SeriesOption['data'],
        markArea:
          idx === 0 && markAreaPieces.length > 0
            ? {
                silent: true,
                data: markAreaPieces as unknown as echarts.MarkAreaComponentOption['data'],
              }
            : undefined,
      };
    }) as unknown as echarts.SeriesOption[];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      title: title
        ? {
            text: title,
            subtext: subtitle,
            textStyle: {
              color: '#1A1A1A',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: '"IBM Plex Sans", sans-serif',
            },
            subtextStyle: {
              color: '#5C5C57',
              fontSize: 11,
              fontFamily: '"IBM Plex Sans", sans-serif',
            },
            left: 0,
            top: 0,
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FFFFFF',
        borderColor: '#E3E3DE',
        borderWidth: 1,
        textStyle: {
          color: '#1A1A1A',
          fontSize: 11,
          fontFamily: '"IBM Plex Mono", monospace',
        },
        extraCssText: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); border-radius: 4px;',
        padding: [6, 10],
      },
      legend: {
        top: title ? 2 : 0,
        right: 0,
        textStyle: {
          color: '#5C5C57',
          fontSize: 11,
          fontFamily: '"IBM Plex Sans", sans-serif',
        },
        icon: 'plain',
        itemWidth: 16,
        itemHeight: 2,
      },
      grid: {
        top: title ? (subtitle ? 50 : 36) : 24,
        left: '1%',
        right: '2%',
        bottom: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#E3E3DE' } },
        axisTick: { lineStyle: { color: '#E3E3DE' } },
        axisLabel: {
          color: '#5C5C57',
          fontSize: 10,
          fontFamily: '"IBM Plex Mono", monospace',
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        min: yAxisMin,
        max: yAxisMax,
        nameTextStyle: {
          color: '#5C5C57',
          fontSize: 10,
          fontFamily: '"IBM Plex Sans", sans-serif',
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#5C5C57',
          fontSize: 10,
          fontFamily: '"IBM Plex Mono", monospace',
        },
        splitLine: {
          lineStyle: {
            color: '#ECECE8',
            type: 'solid',
          },
        },
      },
      series: echartsSeries,
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [title, subtitle, series, anomalyWindows, forecastStartDate, yAxisLabel, yAxisMin, yAxisMax, loading]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div className="w-full relative">
      <div ref={chartRef} style={{ width: '100%', height }} />
    </div>
  );
};
