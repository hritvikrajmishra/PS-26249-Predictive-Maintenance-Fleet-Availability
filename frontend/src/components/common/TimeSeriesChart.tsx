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

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  title,
  subtitle,
  height = 300,
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
      chartInstance.current = echarts.init(chartRef.current, 'dark', {
        renderer: 'canvas',
      });
    }

    const chart = chartInstance.current;

    if (loading) {
      chart.showLoading({
        text: 'Streaming Telemetry...',
        color: '#3b82f6',
        textColor: '#94a3b8',
        maskColor: 'rgba(11, 17, 32, 0.8)',
      });
      return;
    } else {
      chart.hideLoading();
    }

    // Construct markArea pieces for anomalies
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
            color: 'rgba(59, 130, 246, 0.08)',
          },
        },
        {
          coord: ['9999-12-31', undefined],
        },
      ]);
    }

    // Add anomaly window shadings
    anomalyWindows.forEach((win) => {
      markAreaPieces.push([
        {
          coord: [win.startDate, undefined],
          itemStyle: {
            color: win.color || 'rgba(244, 63, 94, 0.15)',
          },
        },
        {
          coord: [win.endDate, undefined],
        },
      ]);
    });

    const echartsSeries = series.map((s, idx) => ({
      name: s.name,
      type: s.type || 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: 2,
        color: s.color || ['#38bdf8', '#10b981', '#f59e0b', '#ec4899'][idx % 4],
        type: s.dashed ? 'dashed' : 'solid',
      },
      itemStyle: {
        color: s.color || ['#38bdf8', '#10b981', '#f59e0b', '#ec4899'][idx % 4],
      },
      areaStyle: s.area
        ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: (s.color || '#38bdf8') + '33' },
              { offset: 1, color: (s.color || '#38bdf8') + '00' },
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
    })) as unknown as echarts.SeriesOption[];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      title: title
        ? {
            text: title,
            subtext: subtitle,
            textStyle: {
              color: '#f8fafc',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'monospace',
            },
            subtextStyle: {
              color: '#94a3b8',
              fontSize: 11,
              fontFamily: 'sans-serif',
            },
            left: 0,
            top: 0,
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#090e1a',
        borderColor: '#1e293b',
        borderWidth: 1,
        textStyle: {
          color: '#e2e8f0',
          fontSize: 11,
          fontFamily: 'monospace',
        },
        padding: [8, 12],
      },
      legend: {
        top: title ? 2 : 0,
        right: 0,
        textStyle: {
          color: '#94a3b8',
          fontSize: 11,
          fontFamily: 'monospace',
        },
        icon: 'circle',
      },
      grid: {
        top: title ? 48 : 24,
        left: '2%',
        right: '3%',
        bottom: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          fontFamily: 'monospace',
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        min: yAxisMin,
        max: yAxisMax,
        nameTextStyle: {
          color: '#64748b',
          fontSize: 10,
          fontFamily: 'monospace',
        },
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          fontFamily: 'monospace',
        },
        splitLine: {
          lineStyle: {
            color: '#1e293b',
            type: 'dashed',
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
