"use client";

export function DuplicateReviewDialog({ urls, busy, onChoose, onClose }: { urls: string[]; busy?: boolean; onChoose: (action: "replace" | "skip") => void; onClose: () => void }) {
  return <div className="confirm-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title" aria-describedby="duplicate-description">
    <div className="drawer-head"><div><h2 id="duplicate-title">Duplicate URLs found</h2><p id="duplicate-description">These URLs already exist. Please confirm whether you want to replace them or skip these URLs.</p></div><button className="icon-btn" aria-label="Close duplicate review" disabled={busy} onClick={onClose}>×</button></div>
    <div className="duplicate-review-list">{urls.map((url) => <div className="mono" key={url}>{url}</div>)}</div>
    <div className="field-help">Replace updates the existing records with the newly supplied details. Skip keeps the current records unchanged.</div>
    <div className="drawer-actions"><button className="btn" disabled={busy} onClick={() => onChoose("skip")}>Skip</button><button className="btn primary" disabled={busy} onClick={() => onChoose("replace")}>{busy ? "Updating…" : "Replace"}</button></div>
  </section></div>;
}
