import { useMemo, useState } from "react";
import "./charts.css";

/**
 * Hand-rolled SVG charts (no chart library).
 * - Single series only: the title names the measure, so no legend needed.
 * - Grid lines are recessive; axis text never uses a series color.
 * - Tooltips follow the pointer/clicked bar.
 */

interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LineChartPoint[];
  color?: string;
  height?: number;
  ariaLabel: string;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  value: number;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 34 };

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function LineChart({
  points,
  color = "var(--chart-series-1)",
  height = 200,
  ariaLabel,
}: LineChartProps) {
  const width = 560;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxValue = niceMax(Math.max(...points.map((p) => p.value), 1));

  const xFor = (index: number) =>
    PAD.left +
    (index / Math.max(points.length - 1, 1)) * (width - PAD.left - PAD.right);
  const yFor = (value: number) =>
    PAD.top + (1 - value / maxValue) * (height - PAD.top - PAD.bottom);

  const path = useMemo(
    () =>
      points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(point.value).toFixed(1)}`,
        )
        .join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, maxValue, height],
  );

  const areaPath = useMemo(
    () =>
      `${path} L${xFor(points.length - 1).toFixed(1)},${(height - PAD.bottom).toFixed(1)} L${xFor(0).toFixed(1)},${(height - PAD.bottom).toFixed(1)} Z`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, points.length, height],
  );

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  function showTooltip(_event: React.MouseEvent<SVGCircleElement>, point: LineChartPoint, index: number) {
    setTooltip({
      x: xFor(index),
      y: yFor(point.value),
      label: point.label,
      value: point.value,
    });
  }

  return (
    <div className="chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {gridLines.map((ratio) => {
          const y = PAD.top + ratio * (height - PAD.top - PAD.bottom);
          const value = Math.round(maxValue * (1 - ratio));
          return (
            <g key={ratio}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                className="chart-grid-line"
              />
              <text x={PAD.left - 6} y={y + 3} className="chart-axis-text" textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) => (
          <g key={point.label}>
            <circle
              cx={xFor(index)}
              cy={yFor(point.value)}
              r={tooltip?.label === point.label ? 5 : 3.5}
              fill={color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              className="chart-point"
              onMouseEnter={(event) => showTooltip(event, point, index)}
              onMouseLeave={() => setTooltip(null)}
            />
            <text
              x={xFor(index)}
              y={height - 8}
              className="chart-axis-text"
              textAnchor="middle"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${(tooltip.y / height) * 100}%`,
          }}
        >
          <div className="chart-tooltip-label">{tooltip.label}</div>
          <div className="chart-tooltip-value">{tooltip.value}</div>
        </div>
      )}
    </div>
  );
}

interface BarChartProps {
  bars: { label: string; value: number }[];
  color?: string;
  height?: number;
  ariaLabel: string;
}

export function BarChart({
  bars,
  color = "var(--chart-series-1)",
  height = 200,
  ariaLabel,
}: BarChartProps) {
  const width = 560;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxValue = niceMax(Math.max(...bars.map((bar) => bar.value), 1));
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = height - PAD.top - PAD.bottom;
  const slot = innerWidth / bars.length;
  const barWidth = Math.min(48, slot * 0.55);

  return (
    <div className="chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = PAD.top + ratio * innerHeight;
          return (
            <line
              key={ratio}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y}
              y2={y}
              className="chart-grid-line"
            />
          );
        })}

        {bars.map((bar, index) => {
          const barHeight = (bar.value / maxValue) * innerHeight;
          const x = PAD.left + index * slot + (slot - barWidth) / 2;
          const y = height - PAD.bottom - barHeight;
          return (
            <g key={bar.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, bar.value > 0 ? 4 : 0)}
                rx={4}
                fill={color}
                className="chart-bar"
                onMouseEnter={() =>
                  setTooltip({
                    x: x + barWidth / 2,
                    y,
                    label: bar.label,
                    value: bar.value,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                className="chart-value-text"
                textAnchor="middle"
              >
                {bar.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 8}
                className="chart-axis-text"
                textAnchor="middle"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${(tooltip.y / height) * 100}%`,
          }}
        >
          <div className="chart-tooltip-label">{tooltip.label}</div>
          <div className="chart-tooltip-value">{tooltip.value}</div>
        </div>
      )}
    </div>
  );
}
