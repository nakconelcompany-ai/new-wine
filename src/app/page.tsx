import Ballot from '@/components/Ballot';

export default function Home() {
  return (
    <main>
      <header className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="notes" aria-hidden="true">
          <span>♪</span><span>♫</span><span>♩</span><span>♬</span><span>♪</span><span>♫</span>
        </div>
        <p className="eyebrow rise r1">
          <span className="stars" aria-hidden="true">★★★★★</span>
          Celebrating Excellence
        </p>
        <h1 className="hero-title rise r2">Beyond the Harmony</h1>
        <div className="ornament rise r3" aria-hidden="true"><span /><i>◆</i><span /></div>
        <p className="tagline rise r4">
          Honouring the voices, dedication, and shared spirit that make our choir extraordinary.
        </p>
        <div className="chevron rise r5" aria-hidden="true">⌄</div>
      </header>
      <Ballot />
      <footer className="site-footer">
        <p>New Wine Choir Awards · Beyond the Harmony</p>
      </footer>
    </main>
  );
}
