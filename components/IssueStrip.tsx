import { worst, type Issue } from "@/lib/health";

export default function IssueStrip({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <section className={`issues ${worst(issues)}`} aria-label="Current issues" style={{ "--n": issues.length } as React.CSSProperties}>
      <ul>
        {issues.map((i, n) => {
          const body = (
            <>
              <span className={`dot ${i.level}`} />
              <span className="issue-text">{i.text}</span>
              {i.detail && <span className="issue-detail mono">{i.detail}</span>}
            </>
          );
          return (
            <li key={n}>
              {i.target ? (
                <a className="issue" href={`#${i.target}`}>
                  {body}
                </a>
              ) : (
                <div className="issue">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
