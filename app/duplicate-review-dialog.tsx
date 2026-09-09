"use client";

export function DuplicateReviewDialog({ urls, busy, onChoose, onClose }: { urls: string[]; busy?: boolean; onChoose: (action: "replace" | "skip") => void; onClose: () => void }) {
  return <div className="confirm-backdrop"><section className="confirm-dialog duplicate-confirm" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title" aria-describedby="duplicate-description">
    <header className="duplicate-confirm-head"><span className="duplicate-confirm-icon" aria-hidden="true">⧉</span><div><div className="duplicate-confirm-eyebrow">Duplicate check</div><h2 id="duplicate-title">{urls.length} existing URL{urls.length === 1 ? "" : "s"} found</h2></div><button className="duplicate-confirm-close" aria-label="Close duplicate review" disabled={busy} onClick={onClose}>×</button></header>
    <div className="duplicate-confirm-body">
      <p id="duplicate-description">These URLs are already in All URLs. Choose what should happen before the import continues.</p>
      <div className="duplicate-list-head"><strong>Already monitored</strong><span>{urls.length} URL{urls.length === 1 ? "" : "s"}</span></div>
      <div className="duplicate-review-list">{urls.map((url) => <div key={url}><span aria-hidden="true">⌁</span><span className="mono">{url}</span></div>)}</div>
      <div className="duplicate-choice-help"><div><strong>Skip duplicates</strong><span>Keep existing records unchanged.</span></div><div><strong>Replace existing</strong><span>Update records with the new details.</span></div></div>
    </div>
    <footer className="duplicate-confirm-actions"><button className="btn" disabled={busy} onClick={() => onChoose("skip")}>Skip duplicates</button><button className="btn primary" disabled={busy} onClick={() => onChoose("replace")}>{busy ? "Updating…" : "Replace existing"}</button></footer>
  </section></div>;
}
