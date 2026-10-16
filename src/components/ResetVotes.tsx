'use client';

import { useState } from 'react';

export default function ResetVotes() {
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetBallots() {
    if (confirmation !== 'reset' || busy) return;
    if (!confirm('This permanently deletes every recorded ballot and lets devices vote again. Continue?')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/voting', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_ballots', confirmation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset votes.');
      setConfirmation('');
      setMessage({ type: 'ok', text: 'All recorded ballots have been reset. Devices can vote again.' });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adm-wrap">
      <section className="adm adm-card reset-card">
        <p className="eyebrow">Admin only</p>
        <h1 className="adm-title">Reset votes</h1>
        <p className="muted">This permanently removes all submitted ballots and lets every device vote again. Close voting first.</p>
        {message && <p className={`notice ${message.type}`} role={message.type === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        <label htmlFor="reset-confirmation">Type <strong>reset</strong> to continue</label>
        <input id="reset-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
        <button type="button" className="btn-danger" onClick={resetBallots} disabled={confirmation !== 'reset' || busy}>{busy ? 'Resetting…' : 'Reset all votes'}</button>
      </section>
    </main>
  );
}
