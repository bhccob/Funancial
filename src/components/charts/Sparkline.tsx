export interface SparklineProps {
  values: number[];
  height: number;
  color: string;
  /**
   * Read out by screen readers in place of the line. Without one the line is a picture only, for a
   * place whose figures are written beside it (Home's tiles).
   */
  label?: string;
  /** Ends the line on a round dot. */
  dot?: boolean;
}

const WIDTH = 300;
/** Room above and below the line so the round caps, the dot and the stroke are not clipped. */
const PAD = 4;

/** The points of a line through `values`, left to right; flat when they are all equal or too few. */
function linePoints(values: number[], height: number): Array<[string, string]> {
  const points = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...points);
  const span = Math.max(...points) - min;
  const usable = height - PAD * 2;
  return points.map((v, i) => {
    const level = span === 0 ? 0.5 : (v - min) / span;
    return [
      ((i / (points.length - 1)) * WIDTH).toFixed(1),
      (PAD + (1 - level) * usable).toFixed(1),
    ];
  });
}

export function Sparkline({ values, height, color, label, dot = false }: SparklineProps) {
  const points = linePoints(values, height);
  const [endX, endY] = points.at(-1)!;
  return (
    <svg
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      width="100%"
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <path
        d={points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* A point the round cap draws as a circle: a <circle> would stretch with the line's width. */}
      {dot && (
        <path
          d={`M${endX},${endY} l0,0`}
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
