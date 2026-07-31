/**
 * Inline 7-day trend line. Deliberately hand-rolled SVG rather than recharts:
 * this renders inside a server component, needs no interactivity, and pulling
 * a charting library into the dashboard's critical path for a 60×20 sparkline
 * would cost far more than it's worth.
 */
export function Sparkline({
  points, className = '', stroke = 'currentColor',
}: { points: number[]; className?: string; stroke?: string }) {
  if (points.length < 2) return null

  const W = 64, H = 20, PAD = 2
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1

  const coords = points.map((v, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2)
    return [x, y] as const
  })

  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${d} L${coords[coords.length - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`
  const last = coords[coords.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={stroke} />
    </svg>
  )
}
