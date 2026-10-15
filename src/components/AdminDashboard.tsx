'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Overview = {
  config: { status: string; phase: 'not_open' | 'open' | 'closed'; resultsPublished: boolean; resultsPublishedAt: string | null };
  readiness: { categoriesMissingNominees: string[]; requiredCategories: number; ready: boolean };
  stats: { categories: number; publishedNominees: number; ballots: number };
  categories: { id: string; name: string; eligibleNominees: number; votesRecorded: number }[];
  nominees: { id: string; categoryId: string; name: string; published: boolean; archived: boolean }[];
};
type ResultCat = { id: string; name: string; totalVotes: number; tie: boolean; noVotes: boolean; leaders: string[]; nominees: { id: string; name: string; votes: number; published: boolean; archived: boolean }[] };

const TABS = ['Overview', 'Nominees', 'Voting', 'Results', 'Account'] as const;
type Tab = (typeof TABS)[number];

async function api<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.reload(); }
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed.');
  return data as T;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');
  const [ov, setOv] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try { setOv(await api<Overview>('/api/admin/overview')); }
    catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const run = useCallback(async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    try { await fn(); setMsg({ type: 'ok', text: okText }); await refresh(); return true; }
    catch (e) { setMsg({ type: 'error', text: (e as Error).message }); return false; }
  }, [refresh]);

  async function signOut() {
    await api('/api/admin/logout', 'POST').catch(() => {});
    router.refresh();
  }

  return (
    <div className="adm">
      <header className="adm-head">
        <div>
          <p className="eyebrow">New Wine Choir Awards</p>
          <h1 className="adm-title">Admin dashboard</h1>
        </div>
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </header>
      <nav className="adm-tabs" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} aria-current={t === tab ? 'page' : undefined} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>
        ))}
      </nav>
      {msg && <p className={`notice ${msg.type === 'ok' ? 'ok' : 'error'}`} role={msg.type === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
      {!ov ? <div className="skeleton" aria-busy="true" /> : (
        <>
          {tab === 'Overview' && <OverviewTab ov={ov} />}
          {tab === 'Nominees' && <NomineesTab ov={ov} run={run} />}
          {tab === 'Voting' && <VotingTab ov={ov} run={run} />}
          {tab === 'Results' && <ResultsTab ov={ov} />}
          {tab === 'Account' && <AccountTab run={run} />}
        </>
      )}
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, okText: string) => Promise<boolean>;

function phaseLabel(c: Overview['config']) {
  if (c.phase === 'open') return 'Open';
  if (c.phase === 'closed') return 'Closed';
  return 'Not open';
}

function OverviewTab({ ov }: { ov: Overview }) {
  const { stats, config } = ov;
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{stats.categories}</b><span>Categories</span></div>
        <div className="stat"><b>{stats.publishedNominees}</b><span>Published nominees</span></div>
        <div className="stat"><b>{stats.ballots}</b><span>Ballots recorded</span></div>
      </div>
      <div className="adm-card">
        <p><strong>Voting:</strong> <span className={`badge ${config.phase}`}>{phaseLabel(config)}</span></p>
        <p><strong>Public results:</strong> <span className={`badge ${config.resultsPublished ? 'open' : ''}`}>{config.resultsPublished ? 'Published' : 'Hidden (admin only)'}</span></p>
      </div>
      <h2 className="adm-h2">Category activity</h2>
      <div className="adm-card flush">
        <table className="tbl">
          <thead><tr><th>Category</th><th>Nominees</th><th>Votes</th></tr></thead>
          <tbody>
            {ov.categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className={c.eligibleNominees === 0 ? 'warn' : ''}>{c.eligibleNominees}</td>
                <td>{c.votesRecorded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NomineesTab({ ov, run }: { ov: Overview; run: Run }) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [publish, setPublish] = useState(true);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    const ok = await run(() => api('/api/admin/nominees', 'POST', { name, categoryId, published: publish }), 'Nominee added.');
    if (ok) setName('');
  }
  const patch = (id: string, body: object, okText: string) => run(() => api(`/api/admin/nominees/${id}`, 'PATCH', body), okText);

  const list = ov.nominees.filter((n) => (!filter || n.categoryId === filter) && (showArchived || !n.archived));

  return (
    <>
      <form className="adm-card" onSubmit={add}>
        <h2 className="adm-h2">Add a nominee</h2>
        <label htmlFor="nn">Full name</label>
        <input id="nn" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
        <label htmlFor="nc">Category</label>
        <select id="nc" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">Choose a category…</option>
          {ov.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="check-row"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish immediately</label>
        <button className="btn-gold">Add nominee</button>
      </form>

      <div className="adm-row">
        <select aria-label="Filter by category" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {ov.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="check-row"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>

      {ov.categories.filter((c) => !filter || c.id === filter).map((c) => {
        const items = list.filter((n) => n.categoryId === c.id);
        return (
          <div key={c.id} className="adm-card">
            <h3 className="adm-h3">{c.name} {c.eligibleNominees === 0 && <span className="badge warn">no published nominees</span>}</h3>
            {items.length === 0 && <p className="muted">No nominees yet.</p>}
            <ul className="nlist">
              {items.map((n) => (
                <li key={n.id}>
                  {editing === n.id ? (
                    <div className="edit-row">
                      <input aria-label="Nominee name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} />
                      <button className="btn-small" onClick={async () => { if (await patch(n.id, { name: editName }, 'Name updated.')) setEditing(null); }}>Save</button>
                      <button className="btn-small ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span className="nm">{n.name} <span className={`badge ${n.archived ? 'closed' : n.published ? 'open' : ''}`}>{n.archived ? 'Archived' : n.published ? 'Published' : 'Unpublished'}</span></span>
                      <span className="acts">
                        {!n.archived && <button className="btn-small" onClick={() => patch(n.id, { published: !n.published }, n.published ? 'Nominee unpublished.' : 'Nominee published.')}>{n.published ? 'Unpublish' : 'Publish'}</button>}
                        {!n.archived && <button className="btn-small ghost" onClick={() => { setEditing(n.id); setEditName(n.name); }}>Rename</button>}
                        <button className="btn-small ghost" onClick={() => patch(n.id, { archived: !n.archived }, n.archived ? 'Nominee restored.' : 'Nominee archived. Their votes are kept.')}>{n.archived ? 'Restore' : 'Archive'}</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function VotingTab({ ov, run }: { ov: Overview; run: Run }) {
  const { config, readiness } = ov;
  const post = (body: object, okText: string) => run(() => api('/api/admin/voting', 'POST', body), okText);

  return (
    <>
      <div className="adm-card">
        <h2 className="adm-h2">Ballot readiness</h2>
        <ul className="checks">
          <li className={readiness.categoriesMissingNominees.length === 0 ? 'good' : 'bad'}>
            {readiness.categoriesMissingNominees.length === 0
              ? `All ${readiness.requiredCategories} categories have published nominees`
              : `Missing nominees: ${readiness.categoriesMissingNominees.join(', ')}`}
          </li>
          <li className="good">Anyone with the link can vote once per device</li>
        </ul>
        <p><strong>Status:</strong> <span className={`badge ${config.phase}`}>{phaseLabel(config)}</span></p>
        <div className="btn-row">
          <button className="btn-gold" onClick={() => post({ action: 'open' }, 'Voting is now open.')} disabled={config.status === 'open' || !readiness.ready}>Open voting</button>
          <button className="btn-ghost" onClick={() => post({ action: 'close' }, 'Voting is now closed.')} disabled={config.status === 'closed'}>Close voting</button>
        </div>
      </div>

      <div className="adm-card">
        <h2 className="adm-h2">Publish results</h2>
        <p className="muted">Results stay hidden from the public until you publish them. Voting must be closed first.</p>
        <p><strong>Public results:</strong> <span className={`badge ${config.resultsPublished ? 'open' : ''}`}>{config.resultsPublished ? `Published ${fmt(config.resultsPublishedAt)}` : 'Hidden'}</span></p>
        <div className="btn-row">
          {!config.resultsPublished
            ? <button className="btn-gold" disabled={config.phase !== 'closed'} onClick={() => { if (confirm('Publish the final results to the public website?')) post({ action: 'publish_results' }, 'Results published.'); }}>Publish results</button>
            : <button className="btn-ghost" onClick={() => post({ action: 'unpublish_results' }, 'Results are hidden again.')}>Unpublish results</button>}
        </div>
      </div>
    </>
  );
}

/*function CodesTab({ ov, refresh, setMsg }: { ov: Overview; refresh: () => Promise<void>; setMsg: (m: { type: 'ok' | 'error'; text: string } | null) => void }) {
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [labelsText, setLabelsText] = useState('');
  const [count, setCount] = useState(10);
  const [fresh, setFresh] = useState<{ code: string; label: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await api<{ codes: CodeRow[] }>('/api/admin/codes')).codes); }
    catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
  }, [setMsg]);
  useEffect(() => { load(); }, [load]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const labels = labelsText.split('\n').map((s) => s.trim()).filter(Boolean);
      const d = await api<{ codes: { code: string; label: string | null }[] }>('/api/admin/codes', 'POST', labels.length ? { labels } : { count });
      setFresh(d.codes);
      setLabelsText('');
      setMsg({ type: 'ok', text: `${d.codes.length} codes generated. Save them now — they are shown only once.` });
      await Promise.all([load(), refresh()]);
    } catch (err) { setMsg({ type: 'error', text: (err as Error).message }); }
    finally { setBusy(false); }
  }

  const csvEscape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  function download() {
    const csv = ['Label,Code', ...fresh.map((f) => `${csvEscape(f.label ?? '')},${f.code}`)].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'new-wine-voting-codes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function copyAll() {
    const text = fresh.map((f) => (f.label ? `${f.label}: ${f.code}` : f.code)).join('\n');
    try { await navigator.clipboard.writeText(text); setMsg({ type: 'ok', text: 'Codes copied.' }); }
    catch { setMsg({ type: 'error', text: 'Could not copy automatically — select the codes and copy them manually.' }); }
  }
  async function toggle(r: CodeRow) {
    try { await api(`/api/admin/codes/${r.id}`, 'PATCH', { action: r.status === 'active' ? 'revoke' : 'reactivate' }); await Promise.all([load(), refresh()]); }
    catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
  }

  return (
    <>
      {ov.config.method === 'open' && <p className="notice">Open voting is on, so voters are not asked for a code right now. Switch back in the Voting tab to use codes.</p>}
      <form className="adm-card" onSubmit={generate}>
        <h2 className="adm-h2">Generate voting codes</h2>
        <p className="muted">One code per voter. Codes are stored as secure hashes, so they can’t be viewed again after this screen.</p>
        <label htmlFor="lb">Names or labels (optional — one per line)</label>
        <textarea id="lb" rows={4} value={labelsText} onChange={(e) => setLabelsText(e.target.value)} placeholder={'Ada\nChidi\n…'} />
        <label htmlFor="ct">…or just a number of codes</label>
        <input id="ct" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!!labelsText.trim()} />
        <button className="btn-gold" disabled={busy}>{busy ? 'Generating…' : 'Generate codes'}</button>
      </form>

      {fresh.length > 0 && (
        <div className="adm-card highlight">
          <h2 className="adm-h2">New codes — save these now</h2>
          <div className="btn-row">
            <button className="btn-small" onClick={copyAll}>Copy all</button>
            <button className="btn-small" onClick={download}>Download CSV</button>
            <button className="btn-small ghost" onClick={() => setFresh([])}>Hide</button>
          </div>
          <ul className="codes">
            {fresh.map((f) => (<li key={f.code}><span>{f.label ?? ''}</span><code>{f.code}</code></li>))}
          </ul>
        </div>
      )}

      <h2 className="adm-h2">All codes ({ov.stats.codes.used} used of {ov.stats.codes.total})</h2>
      <div className="adm-card flush">
        <table className="tbl">
          <thead><tr><th>Label</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="muted">No codes yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.label || <span className="muted">(no label)</span>}</td>
                <td><span className={`badge ${r.usedAt ? 'open' : r.status === 'revoked' ? 'closed' : ''}`}>{r.usedAt ? 'Used' : r.status === 'revoked' ? 'Revoked' : 'Unused'}</span></td>
                <td>{!r.usedAt && <button className="btn-small ghost" onClick={() => toggle(r)}>{r.status === 'active' ? 'Revoke' : 'Reactivate'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}*/

function ResultsTab({ ov }: { ov: Overview }) {
  const [data, setData] = useState<{ ballots: number; categories: ResultCat[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ ballots: number; categories: ResultCat[] }>('/api/admin/results').then(setData).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="notice error">{err}</p>;
  if (!data) return <div className="skeleton" aria-busy="true" />;
  return (
    <>
      <div className="adm-card">
        <p><strong>{data.ballots}</strong> ballots received · results are <strong>{ov.config.resultsPublished ? 'published' : 'private (admin only)'}</strong></p>
        <a className="btn-gold as-link" href="/api/admin/results/export" download>Export results (CSV)</a>
      </div>
      {data.categories.map((c) => (
        <div key={c.id} className="adm-card">
          <h3 className="adm-h3">{c.name}
            {c.noVotes && <span className="badge warn">no votes</span>}
            {c.tie && <span className="badge warn">tie</span>}
          </h3>
          {c.leaders.length > 0 && <p className="lead-line">{c.tie ? 'Tied for the lead: ' : 'Leading: '}<strong>{c.leaders.join(' & ')}</strong></p>}
          <ul className="nlist">
            {c.nominees.map((n) => (
              <li key={n.id}>
                <span className="nm">{n.name}{n.archived && <span className="badge closed">Archived</span>}{!n.archived && !n.published && <span className="badge">Unpublished</span>}</span>
                <b>{n.votes}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function AccountTab({ run }: { run: Run }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => api('/api/admin/password', 'POST', { currentPassword: cur, newPassword: next }), 'Password changed.');
    if (ok) { setCur(''); setNext(''); }
  }
  async function resetBallots() {
    if (resetConfirmation !== 'RESET BALLOTS') return;
    if (!confirm('This permanently deletes every recorded ballot and lets devices vote again. Continue?')) return;
    const ok = await run(() => api('/api/admin/voting', 'POST', { action: 'reset_ballots', confirmation: resetConfirmation }), 'All recorded ballots have been reset.');
    if (ok) setResetConfirmation('');
  }
  return (
    <>
      <form className="adm-card" onSubmit={submit}>
        <h2 className="adm-h2">Change password</h2>
        <label htmlFor="cp">Current password</label>
        <input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <label htmlFor="np">New password (at least 12 characters)</label>
        <input id="np" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required />
        <button className="btn-gold">Change password</button>
      </form>
      <details className="adm-card data-controls">
        <summary>Data controls</summary>
        <p className="muted">Use only when starting the ballot again. This permanently removes all submitted ballots and clears one-vote-per-device records. Voting must be closed first.</p>
        <label htmlFor="reset-confirmation">Type <strong>RESET BALLOTS</strong> to continue</label>
        <input id="reset-confirmation" value={resetConfirmation} onChange={(e) => setResetConfirmation(e.target.value)} autoComplete="off" />
        <button type="button" className="btn-danger" onClick={resetBallots} disabled={resetConfirmation !== 'RESET BALLOTS'}>Reset all votes</button>
      </details>
    </>
  );
}
