import React, { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  min?: number;
  max?: number;
  color?: string;
  width?: number | string;
  height?: number;
  strokeWidth?: number;
}

const SparklineBase: React.FC<SparklineProps> = ({
  data,
  min = 0,
  max = 100,
  color = '#3b82f6',
  width = '100%',
  height = 40,
  strokeWidth = 2
}) => {
  const path = useMemo(() => {
    const len = data.length;
    if (len < 2) return '';

    const range = max - min || 1;
    const hRatio = 100 / (len - 1);

    let p = '';
    for (let i = 0; i < len; i++) {
      const val = data[i];
      const safeVal = Math.max(min, Math.min(max, val));
      const x = i * hRatio;
      const vRatio = (safeVal - min) / range;
      const y = 100 - (vRatio * 100);
      p += `${i === 0 ? 'M' : ' L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return p;
  }, [data, min, max]);

  if (!path) {
    return <div style={{ width, height }} className="opacity-0" />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 -5 100 110"
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const Sparkline = React.memo(SparklineBase, (prev, next) => {
  if (prev.color !== next.color || prev.height !== next.height || prev.width !== next.width || prev.min !== next.min || prev.max !== next.max || prev.strokeWidth !== next.strokeWidth) {
    return false;
  }
  if (prev.data === next.data) return true;
  if (prev.data.length !== next.data.length) return false;

  const len = prev.data.length;
  if (len === 0) return true;
  return prev.data[len - 1] === next.data[len - 1] && prev.data[0] === next.data[0];
});

