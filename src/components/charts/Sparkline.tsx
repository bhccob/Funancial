export interface SparklineProps {
  values: number[];
  height: number;
  color: string;
  /** Read out by screen readers in place of the line. */
  label: string;
}

const WIDTH = 300;
/** Room above and below the line so the round caps and the stroke are not clipped. */
const PAD = 4;

/** The path of a line through `values`, left to right; flat when they are all equal or too few. */
function linePath(values: number[], height: number): string {
  const points = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...points);
  const span = Math.max(...points) - min;
  const usable = height - PAD * 2;
  return points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * WIDTH;
      const level = span === 0 ? 0.5 : (v - min) / span;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${(PAD + (1 - level) * usable).toFixed(1)}`;
    })
    .join(' ');
}

export function Sparkline({ values, height, color, label }: SparklineProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      width="100%"
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
    >
      <path
        d={linePath(values, height)}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
