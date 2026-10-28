export default function Sparkline({ values }: { values: number[] }) {
  const w = 200, h = 48, n = values?.length ?? 0;
  if (n < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const pts = values.map((v, i) => [(i / (n - 1)) * w, h - 3 - (Math.min(v, 100) / 100) * (h - 6)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  const last = pts[n - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`CPU over the last ${n} samples`}>
      {/* faint 50% guide so typical low CPU still reads against a scale */}
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="var(--muted)" strokeOpacity=".35" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      <path d={`${line}L${w},${h}L0,${h}Z`} fill="var(--spark)" opacity=".12" />
      <path d={line} fill="none" stroke="var(--spark)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--spark)" />
    </svg>
  );
}
