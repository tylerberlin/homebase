// Shimmering glass placeholders shown until the first sample arrives.
function SkeletonCard({ sections }: { sections: number }) {
  return (
    <article className="card" aria-hidden="true">
      <div className="card-head">
        <div style={{ flex: 1 }}>
          <div className="sk" style={{ width: "45%", height: 18 }} />
          <div className="sk" style={{ width: "30%", height: 12, marginTop: 10 }} />
        </div>
        <div className="sk" style={{ width: 92, height: 20, borderRadius: 999 }} />
      </div>
      <div className="section">
        <div className="gauges">
          {[0, 1, 2].map((i) => (
            <div key={i} className="gauge">
              <div className="sk sk-ring" />
            </div>
          ))}
        </div>
      </div>
      {Array.from({ length: sections }, (_, i) => (
        <div className="section" key={i}>
          <div className="sk" style={{ width: 80, height: 10 }} />
          <div className="sk" style={{ width: "100%", height: 8, marginTop: 16 }} />
        </div>
      ))}
    </article>
  );
}

export default function Skeleton() {
  return (
    <div className="grid" role="status" aria-label="Loading server status">
      <SkeletonCard sections={3} />
      <SkeletonCard sections={1} />
    </div>
  );
}
