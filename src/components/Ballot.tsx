'use client';
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BANNERS, SQUARE_POSTER_KEYS } from '@/lib/banners';

type Nominee = { id: string; name: string };
type Category = { id: string; key: string; name: string; nominees: Nominee[] };
type BallotData = {
  phase: 'not_open' | 'open' | 'closed' | 'unavailable';
  resultsPublished: boolean;
  ballotResetAt: string | null;
  alreadyVoted: boolean;
  categories?: Category[];
};
type ResultsData = {
  ballots: number;
  categories: { name: string; tie: boolean; totalVotes: number; winners: { name: string; votes: number }[] }[];
};

const STORE = 'nw-selections-v1';
const VOTED = 'nw-voted-v1';
const RESET_MARKER = 'nw-ballot-reset-v1';

export default function Ballot() {
  const [data, setData] = useState<BallotData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [results, setResults] = useState<ResultsData | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [errorCats, setErrorCats] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const [missingList, setMissingList] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [badBanners, setBadBanners] = useState<Set<string>>(new Set());
  const busy = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ballot', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d: BallotData = await res.json();
      setData(d);
      setLoadError('');
      setAlreadyVoted(d.alreadyVoted);
      try {
        if (d.ballotResetAt && localStorage.getItem(RESET_MARKER) !== d.ballotResetAt) {
          localStorage.removeItem(VOTED);
          localStorage.setItem(RESET_MARKER, d.ballotResetAt);
          setAlreadyVoted(false);
        }
      } catch { /* storage unavailable */ }
      if (d.categories) {
        // Restore saved choices, keeping only those that are still valid.
        try {
          const saved = JSON.parse(sessionStorage.getItem(STORE) || '{}') as Record<string, string>;
          const valid: Record<string, string> = {};
          for (const c of d.categories) if (saved[c.id] && c.nominees.some((n) => n.id === saved[c.id])) valid[c.id] = saved[c.id];
          setSel((prev) => ({ ...valid, ...prev }));
        } catch { /* storage unavailable */ }
      }
      if (d.resultsPublished) {
        const r = await fetch('/api/results', { cache: 'no-store' });
        if (r.ok) setResults(await r.json());
      } else {
        setResults(null);
      }
    } catch {
      setLoadError('We could not load the ballot. Please check your connection and refresh.');
    }
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem(VOTED) === '1') setAlreadyVoted(true); } catch { /* ignore */ }
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(sel)); } catch { /* ignore */ }
  }, [sel]);

  const cats = useMemo(() => data?.categories ?? [], [data]);
  const completed = cats.filter((c) => sel[c.id]).length;

  function choose(catId: string, nomId: string) {
    setSel((p) => ({ ...p, [catId]: nomId })); // radio semantics: one value per category replaces the previous
    setErrorCats((p) => { if (!p.has(catId)) return p; const n = new Set(p); n.delete(catId); return n; });
  }

  function showProblem(msg: string, missing: Category[]) {
    setFormError(msg);
    setMissingList(missing);
    setErrorCats(new Set(missing.map((m) => m.id)));
    setTimeout(() => alertRef.current?.focus(), 0);
  }

  function markVoted() {
    try { localStorage.setItem(VOTED, '1'); } catch { /* ignore */ }
    try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
  }

  async function submit() {
    if (busy.current) return; // blocks double-clicks
    const missing = cats.filter((c) => !sel[c.id]);
    if (missing.length) {
      showProblem(`Every category needs one selection — ${missing.length} still to go.`, missing);
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setFormError('');
    setMissingList([]);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: sel }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        markVoted();
        setDone(true);
        setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else if (res.status === 409 && /already voted/i.test(body.error || '')) {
        markVoted();
        setAlreadyVoted(true);
        setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else {
        if (Array.isArray(body.missing)) {
          showProblem(body.error || 'Please review your choices.', cats.filter((c) => body.missing.includes(c.name)));
        } else {
          setFormError(body.error || 'Your ballot could not be submitted. Please try again.');
          setTimeout(() => alertRef.current?.focus(), 0);
        }
        if (res.status === 409 || res.status === 503) load();
      }
    } catch {
      setFormError('Network problem — your choices are still here. Please try again.');
      setTimeout(() => alertRef.current?.focus(), 0);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const showAlreadyVoted = data?.phase === 'open' && alreadyVoted && !done;

  return (
    <>
      <section id="vote" className="vote-intro" ref={topRef} aria-labelledby="vote-heading">
        <p className="eyebrow">Yearly Award</p>
        <h2 id="vote-heading" className="section-title">Celebrate Your Favourites</h2>
        <div className="straight-line" aria-hidden="true" />
        <p className="lead">A joyful moment to celebrate the gifts, service, and memories we share as one choir.</p>
        <p className="once-note">Please vote thoughtfully, with love and appreciation for every member.</p>
      </section>

      {loadError && <p className="notice error" role="alert">{loadError}</p>}
      {!data && !loadError && <div className="skeleton" aria-busy="true" aria-label="Loading the ballot" />}

      {data && data.phase === 'not_open' && (
        <div className="panel center">
          <h3>Voting hasn’t opened yet</h3>
          <p>
            The ballot is being prepared. Please check back soon.
          </p>
        </div>
      )}
      {data && data.phase === 'unavailable' && (
        <div className="panel center">
          <h3>The ballot is being prepared</h3>
          <p>Some categories are still being set up. Please check back shortly.</p>
        </div>
      )}
      {data && data.phase === 'closed' && (
        <div className="panel center">
          <h3>Voting has closed</h3>
          <p>Thank you to everyone who took part.{data.resultsPublished ? '' : ' Results will be announced soon.'}</p>
        </div>
      )}

      {data?.phase === 'open' && done && (
        <div className="panel center success" role="status">
          <div className="check" aria-hidden="true">✓</div>
          <h3>Thank you for voting!</h3>
          <p>Your ballot has been recorded.</p>
        </div>
      )}

      {showAlreadyVoted && (
        <div className="panel center success" role="status">
          <div className="check" aria-hidden="true">✓</div>
          <h3>You have already voted</h3>
          <p>Thank you for taking part. Each person can only vote once.</p>
        </div>
      )}

      {data?.phase === 'open' && !done && !showAlreadyVoted && cats.length > 0 && (
        <>
          <nav className="progress" aria-label="Ballot progress">
            <div className="progress-top">
              <p className="progress-text" aria-live="polite">
                <strong>{completed}</strong> of {cats.length} categories completed
              </p>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={cats.length} aria-valuenow={completed} aria-label="Categories completed">
                <div className="bar-fill" style={{ width: `${(completed / cats.length) * 100}%` }} />
              </div>
            </div>
            <ol className="chips">
              {cats.map((c, i) => {
                const state = errorCats.has(c.id) ? 'error' : sel[c.id] ? 'done' : 'todo';
                return (
                  <li key={c.id}>
                    <a href={`#cat-${c.key}`} className={`chip ${state}`}
                       aria-label={`${c.name}: ${state === 'done' ? 'answered' : state === 'error' ? 'needs a selection' : 'not answered yet'}`}>
                      {i + 1}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="categories">
            {cats.map((c, i) => {
              const err = errorCats.has(c.id);
              const banner = BANNERS[c.key] && !badBanners.has(c.key) ? BANNERS[c.key] : null;
              return (
                <section key={c.id} id={`cat-${c.key}`} className={`category category-${c.key} ${err ? 'has-error' : ''} ${banner ? 'with-banner' : ''} ${SQUARE_POSTER_KEYS.has(c.key) ? 'square-poster' : ''}`} aria-labelledby={`h-${c.key}`}>
                  <fieldset aria-describedby={err ? `e-${c.key}` : undefined}>
                    <legend>
                      <span className="cat-num">Category {i + 1} of {cats.length}</span>
                      <span id={`h-${c.key}`} className="cat-name">{c.name}</span>
                    </legend>
                    {banner && (
                      <div className="cat-banner">
                        <img src={banner} alt={`${c.name} award nominees`} loading="lazy" decoding="async"
                             onError={() => setBadBanners((p) => new Set(p).add(c.key))} />
                      </div>
                    )}
                    {err && <p id={`e-${c.key}`} className="cat-error" role="alert">Please choose one nominee for this category.</p>}
                    <div className="nominees">
                      {c.nominees.map((n) => (
                        <label key={n.id} className="nominee">
                          <input type="radio" name={`cat-${c.id}`} value={n.id} checked={sel[c.id] === n.id} onChange={() => choose(c.id, n.id)} />
                          <span className="card">
                            <span className="radio" aria-hidden="true" />
                            <span className="nname">{n.name}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </section>
              );
            })}
          </div>

          <section id="submit" className="review" aria-labelledby="submit-heading">
            <h2 id="submit-heading" className="sr-only">Submit your ballot</h2>
            <div className="submit-box">
              <div ref={alertRef} tabIndex={-1} className={formError ? 'notice error' : 'sr-only'} role="alert">
                {formError}
                {missingList.length > 0 && (
                  <ul className="missing-links">
                    {missingList.map((m) => (<li key={m.id}><a href={`#cat-${m.key}`}>{m.name}</a></li>))}
                  </ul>
                )}
              </div>

              <button type="button" className="btn-gold" onClick={submit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit My Ballot'}
              </button>
            </div>
          </section>
        </>
      )}

      {results && <ResultsSection results={results} />}
    </>
  );
}

function ResultsSection({ results }: { results: ResultsData }) {
  return (
    <section id="results" className="results" aria-labelledby="results-heading">
      <h2 id="results-heading" className="section-title">The Results</h2>
      <div className="ornament small" aria-hidden="true"><span /><i>◆</i><span /></div>
      <p className="lead">Congratulations to our winners — {results.ballots} ballot{results.ballots === 1 ? '' : 's'} counted.</p>
      <div className="results-grid">
        {results.categories.map((c) => (
          <article key={c.name} className="result-card">
            <h3>{c.name}</h3>
            {c.winners.length === 0 ? (
              <p className="muted">No votes were recorded.</p>
            ) : c.tie ? (
              <>
                <p className="tie-tag">It’s a tie</p>
                <ul>{c.winners.map((w) => (<li key={w.name}>{w.name}</li>))}</ul>
                <p className="muted">{c.winners[0].votes} votes each</p>
              </>
            ) : (
              <>
                <p className="winner">{c.winners[0].name}</p>
                <p className="muted">{c.winners[0].votes} vote{c.winners[0].votes === 1 ? '' : 's'}</p>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
