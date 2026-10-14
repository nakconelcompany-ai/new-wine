// End-to-end acceptance test. Needs a running server (BASE_URL) and the same DATABASE_URL the server uses.
// Run against a DISPOSABLE database only — it creates nominees, codes and ballots.
import pg from 'pg';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'correct horse battery staple';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function req(path, { method = 'GET', body, cookie, origin = BASE, ip } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (origin && method !== 'GET') headers.Origin = origin;
  if (ip) headers['x-real-ip'] = ip;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
const cookieOf = (res) => (res.headers.getSetCookie?.()[0] || '').split(';')[0];

async function main() {
  await db.connect();
  console.log('\n# Public site');
  const home = await req('/');
  ok(home.text.includes('Beyond the Harmony'), 'hero shows "Beyond the Harmony"');
  ok(home.text.includes('Celebrating the bond we share beyond the music'), 'hero shows the tagline');
  ok(!/start voting/i.test(home.text), 'no "Start Voting" button anywhere');
  ok(home.text.includes('Celebrate Your Favourites'), 'voting introduction heading present');
  const hdr = home.headers;
  ok(!!hdr.get('content-security-policy') && hdr.get('x-frame-options') === 'DENY', 'security headers present');

  let b = await req('/api/ballot');
  ok(b.json.phase === 'not_open' && !b.json.categories, 'ballot is not exposed before voting opens');
  ok((await req('/api/results')).status === 404, 'results endpoint is hidden before publication');

  console.log('\n# Admin protection');
  for (const [m, p] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/results'], ['GET', '/api/admin/results/export'], ['GET', '/api/admin/codes'], ['POST', '/api/admin/nominees'], ['POST', '/api/admin/voting'], ['POST', '/api/admin/codes']]) {
    const r = await req(p, { method: m, body: m === 'POST' ? {} : undefined });
    ok(r.status === 401, `${m} ${p} rejects anonymous requests`, `got ${r.status}`);
  }
  const bad = await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'wrong password!!' }, ip: '198.51.100.1' });
  ok(bad.status === 401, 'wrong password rejected');
  const csrf = await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, origin: 'https://evil.example', ip: '198.51.100.1' });
  ok(csrf.status === 403, 'cross-site login request blocked (CSRF)');
  const login = await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, ip: '198.51.100.1' });
  ok(login.status === 200, 'admin can sign in');
  let cookie = cookieOf(login);
  const setCookie = login.headers.getSetCookie()[0];
  ok(/HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Secure/i.test(setCookie), 'session cookie is HttpOnly, Secure, SameSite=Strict');
  const adminPage = await req('/admin', { cookie });
  ok(adminPage.text.includes('Admin dashboard') || adminPage.text.includes('Admin sign-in') === false, 'admin page renders dashboard for signed-in admin');
  const anonAdminPage = await req('/admin');
  ok(anonAdminPage.text.includes('Admin sign-in'), 'admin page shows only the login form to visitors');

  console.log('\n# Categories');
  let ov = (await req('/api/admin/overview', { cookie })).json;
  const EXPECT = ['Voice of the Year (Male)','Voice of the Year (Female)','Upcoming Voice (Male)','Upcoming Voice (Female)','Most Dedicated / Punctual Member','Upcoming Praise Leader (Male)','Upcoming Praise Leader (Female)','Most Compliant in Uniform (Male)','Most Compliant in Uniform (Female)','Most Energetic (Female)','Most Energetic (Male)','Power House Personality (Male)','Power House Personality (Female)','Most Funny','Best Dancer During Praise (Male)','Best Dancer During Praise (Female)','Most Active Musician'];
  ok(JSON.stringify(ov.categories.map((c) => c.name)) === JSON.stringify(EXPECT), '17 predefined categories exist in the exact order');
  ok(ov.config.phase === 'not_open' && ov.config.resultsPublished === false, 'voting starts closed and results hidden');

  console.log('\n# Nominee management');
  const cats = ov.categories;
  const add = (name, categoryId, published = true) => req('/api/admin/nominees', { method: 'POST', cookie, body: { name, categoryId, published } });
  for (let i = 0; i < cats.length; i++) {
    await add(`Nominee ${i + 1}A`, cats[i].id);
    await add(`Nominee ${i + 1}B`, cats[i].id);
  }
  ok((await add('nominee 1a', cats[0].id)).status === 409, 'duplicate nominee in same category rejected (case-insensitive)');
  ok((await add('X', cats[0].id)).status === 400, 'too-short name rejected');
  ok((await add('Ghost', '00000000-0000-4000-8000-000000000000')).status === 400, 'invalid category rejected');
  ok((await add('<script>', cats[0].id)).status === 400, 'markup characters rejected in names');
  await add('Hidden Person', cats[0].id, false);

  console.log('\n# Opening voting');
  const open0 = await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'open' } });
  ok(open0.status === 409, 'voting cannot open without voting codes (no unrestricted voting)');
  const gen = await req('/api/admin/codes', { method: 'POST', cookie, body: { labels: ['Ada', 'Bola', 'Chidi', 'Dayo', 'Efe'] } });
  const codes = gen.json.codes.map((c) => c.code);
  ok(gen.status === 201 && codes.length === 5 && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(codes[0]), 'voting codes generated');
  const [cA, cB, cC, cD, cE] = codes;
  const hashRow = (await db.query('SELECT code_hash FROM voter_codes LIMIT 1')).rows[0];
  ok(!codes.includes(hashRow.code_hash) && hashRow.code_hash.length === 64, 'codes are stored hashed, not in plain text');
  const listed = JSON.stringify((await req('/api/admin/codes', { cookie })).json);
  ok(!codes.some((c) => listed.includes(c)), 'code list never reveals plain codes again');

  // incomplete readiness
  ov = (await req('/api/admin/overview', { cookie })).json;
  await req(`/api/admin/nominees/${ov.nominees.find((n) => n.categoryId === cats[4].id).id}`, { method: 'PATCH', cookie, body: { published: false } });
  await req(`/api/admin/nominees/${ov.nominees.filter((n) => n.categoryId === cats[4].id)[1].id}`, { method: 'PATCH', cookie, body: { published: false } });
  const open1 = await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'open' } });
  ok(open1.status === 409 && /nominee/i.test(open1.json.error), 'voting cannot open while a category has no published nominee');
  ov = (await req('/api/admin/overview', { cookie })).json;
  for (const n of ov.nominees.filter((n) => n.categoryId === cats[4].id)) await req(`/api/admin/nominees/${n.id}`, { method: 'PATCH', cookie, body: { published: true } });
  const sched = await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'schedule', startsAt: new Date(Date.now() + 3600e3).toISOString(), endsAt: new Date(Date.now() + 60e3).toISOString() } });
  ok(sched.status === 400, 'end time before start time rejected');
  const open2 = await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'open' } });
  ok(open2.status === 200, 'voting opens once ballot is ready');

  console.log('\n# Public ballot');
  b = await req('/api/ballot');
  ok(b.json.method === 'codes' && b.json.phase === 'open' && b.json.categories.length === 17, 'open ballot returns all 17 categories');
  ok(JSON.stringify(b.json.categories.map((c) => c.name)) === JSON.stringify(EXPECT), 'categories are in the specified order');
  ok(!JSON.stringify(b.json).includes('Hidden Person'), 'unpublished nominees are not shown publicly');
  ok(b.json.categories.every((c) => c.nominees.length >= 2 && c.nominees.every((n) => Object.keys(n).sort().join() === 'id,name')), 'nominees are loaded from the database as name-only records (no photos)');
  const ballotCats = b.json.categories;
  const pick = (over = {}) => Object.fromEntries(ballotCats.map((c, i) => [c.id, over[i] ?? c.nominees[0].id]));
  const vote = (code, selections, extra = {}) => req('/api/vote', { method: 'POST', body: { code, selections }, ...extra });

  console.log('\n# Ballot validation');
  const partial = pick(); delete partial[ballotCats[2].id]; delete partial[ballotCats[7].id];
  const v1 = await vote(cE, partial);
  ok(v1.status === 422 && v1.json.missing.length === 2, 'server rejects incomplete ballots and names the missing categories', JSON.stringify(v1.json));
  const wrong = pick(); wrong[ballotCats[0].id] = ballotCats[1].nominees[0].id;
  const v2 = await vote(cE, wrong);
  ok(v2.status === 422, 'server rejects a nominee assigned to the wrong category');
  const extraCat = { ...pick(), '11111111-1111-4111-8111-111111111111': ballotCats[0].nominees[0].id };
  ok((await vote(cE, extraCat)).status === 400, 'server rejects unknown categories');
  ok((await vote('ZZZZZ-ZZZZZ', pick())).status === 403, 'invalid voting code rejected');
  ok((await vote(cE, pick(), { origin: 'https://evil.example' })).status === 403, 'cross-site ballot submission blocked');
  ok((await db.query('SELECT count(*)::int n FROM ballots')).rows[0].n === 0, 'rejected ballots leave nothing in the database');
  ok((await db.query('SELECT used_at FROM voter_codes ORDER BY created_at LIMIT 5')).rows.every((r) => r.used_at === null), 'rejected ballots do not burn voting codes');

  console.log('\n# Casting ballots');
  const second = (i) => ballotCats[i].nominees[1].id;
  const vA = await vote(cA, pick({ 0: ballotCats[0].nominees[0].id }));
  ok(vA.status === 201, 'ballot A saved (201)');
  ok((await vote(cA, pick())).status === 409, 'reusing a code is rejected');
  ok((await vote(cB, pick())).status === 201, 'ballot B saved');
  const dbl = await Promise.all([vote(cC, pick({ 0: second(0), 1: second(1) })), vote(cC, pick({ 0: second(0), 1: second(1) }))]);
  ok(dbl.map((r) => r.status).sort().join() === '201,409', 'simultaneous double-submit: exactly one succeeds', dbl.map((r) => r.status).join());
  ok((await vote(cD, pick({ 0: second(0) }))).status === 201, 'ballot D saved');
  const counts = (await db.query('SELECT (SELECT count(*)::int FROM ballots) b, (SELECT count(*)::int FROM ballot_selections) s, (SELECT count(*)::int FROM voter_codes WHERE used_at IS NOT NULL) u')).rows[0];
  ok(counts.b === 4 && counts.s === 68 && counts.u === 4, 'ballots, selections and used codes are consistent (4 / 68 / 4)', JSON.stringify(counts));
  let dbBlocked = false;
  try {
    const ballotId = (await db.query('SELECT id FROM ballots LIMIT 1')).rows[0].id;
    await db.query('BEGIN');
    await db.query('DELETE FROM ballot_selections WHERE ballot_id = $1 AND category_id = $2', [ballotId, ballotCats[0].id]);
    await db.query('INSERT INTO ballot_selections (ballot_id, category_id, nominee_id) VALUES ($1,$2,$3)', [ballotId, ballotCats[0].id, ballotCats[1].nominees[0].id]);
  } catch (e) { dbBlocked = e.code === '23503'; }
  await db.query('ROLLBACK');
  ok(dbBlocked, 'database itself refuses a nominee/category mismatch (foreign key)');

  console.log('\n# Live nominee changes (no redeploy)');
  const late = await add('Late Nominee', cats[3].id);
  b = await req('/api/ballot');
  ok(b.json.categories[3].nominees.some((n) => n.name === 'Late Nominee'), 'newly published nominee appears on the public ballot immediately');
  await req(`/api/admin/nominees/${late.json.id}`, { method: 'PATCH', cookie, body: { name: 'Late Nominee Renamed' } });
  b = await req('/api/ballot');
  ok(b.json.categories[3].nominees.some((n) => n.name === 'Late Nominee Renamed'), 'renamed nominee updates publicly and keeps identity');
  await req(`/api/admin/nominees/${late.json.id}`, { method: 'PATCH', cookie, body: { published: false } });
  b = await req('/api/ballot');
  ok(!b.json.categories[3].nominees.some((n) => n.name.startsWith('Late')), 'unpublished nominee disappears immediately');
  ov = (await req('/api/admin/overview', { cookie })).json;
  const cat3 = ov.nominees.filter((n) => n.categoryId === cats[2].id);
  for (const n of cat3) await req(`/api/admin/nominees/${n.id}`, { method: 'PATCH', cookie, body: { published: false } });
  b = await req('/api/ballot');
  ok(b.json.phase === 'unavailable' && !b.json.categories, 'a category with no nominees makes the ballot unavailable (not silently complete)');
  ok((await vote(cE, pick())).status === 409, 'submission blocked while a category has no nominees');
  for (const n of cat3) await req(`/api/admin/nominees/${n.id}`, { method: 'PATCH', cookie, body: { published: true } });
  b = await req('/api/ballot');
  ok(b.json.phase === 'open', 'ballot reopens when nominees are restored');

  console.log('\n# Archiving keeps history');
  const tied = ov.nominees.find((n) => n.categoryId === cats[0].id && n.name === 'Nominee 1B');
  const mv = await req(`/api/admin/nominees/${tied.id}`, { method: 'PATCH', cookie, body: { categoryId: cats[1].id } });
  ok(mv.status === 409, 'a nominee with votes cannot be moved to another category');
  const arch = await req(`/api/admin/nominees/${tied.id}`, { method: 'PATCH', cookie, body: { archived: true } });
  ok(arch.status === 200, 'nominee with votes can be archived');
  b = await req('/api/ballot');
  ok(!b.json.categories[0].nominees.some((n) => n.id === tied.id), 'archived nominee no longer on the ballot');
  ok((await db.query('SELECT count(*)::int n FROM ballot_selections WHERE nominee_id = $1', [tied.id])).rows[0].n === 2, 'archived nominee keeps their historical votes');

  console.log('\n# Closing, results and publication');
  const pubEarly = await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'publish_results' } });
  ok(pubEarly.status === 409, 'results cannot be published while voting is open');
  ok((await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'close' } })).status === 200, 'admin closes voting');
  ok((await vote(cE, pick())).status === 409, 'ballots rejected after voting closes');
  b = await req('/api/ballot');
  ok(b.json.phase === 'closed' && !b.json.categories, 'closed ballot shows no nominees');
  const priv = await req('/api/results');
  ok(priv.status === 404 && !/vote|winner/i.test(priv.text.replace('Results have not been published.', '')), 'public results endpoint reveals nothing before publication');
  ok(!(await req('/')).text.match(/Nominee 1A.*winner/i), 'home page source contains no result data');
  const res = (await req('/api/admin/results', { cookie })).json;
  ok(res.ballots === 4, 'admin sees total ballots');
  const c1 = res.categories[0], c2 = res.categories[1];
  ok(c1.tie === true && c1.leaders.length === 2 && c1.nominees.find((n) => n.name === 'Nominee 1B').archived, 'tie is reported accurately (and archived nominee still counted)');
  ok(c2.leaders.join() === 'Nominee 2A' && c2.nominees.find((n) => n.name === 'Nominee 2A').votes === 3, 'winner and vote counts are correct');
  const csv = await req('/api/admin/results/export', { cookie });
  ok(csv.status === 200 && csv.text.includes('Category') && csv.text.includes('Tied for lead') && csv.headers.get('content-disposition')?.includes('attachment'), 'CSV export works for the admin');
  ok((await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'publish_results' } })).status === 200, 'admin publishes results');
  const pub = await req('/api/results');
  ok(pub.status === 200 && pub.json.categories.length === 17 && pub.json.categories[0].tie === true, 'published results are public and show the tie');
  ok(!JSON.stringify(pub.json).includes('Nominee 2B'), 'public results only list winners, not full tallies');
  ok((await req('/api/admin/voting', { method: 'POST', cookie, body: { action: 'open' } })).status === 409, 'voting cannot reopen while results are published');

  console.log('\n# Account security');
  const NEWPW = 'a brand new passphrase 2026';
  ok((await req('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: 'nope nope nope', newPassword: NEWPW } })).status === 403, 'password change requires the current password');
  const ch = await req('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: ADMIN_PASSWORD, newPassword: NEWPW } });
  ok(ch.status === 200, 'admin changes password in the dashboard');
  ok((await req('/api/admin/overview', { cookie })).status === 401, 'old sessions stop working after a password change');
  ok((await req('/api/admin/overview', { cookie: cookieOf(ch) })).status === 200, 'fresh session works');
  ok((await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, ip: '198.51.100.2' })).status === 401, 'old password no longer works');
  ok((await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: NEWPW }, ip: '198.51.100.2' })).status === 200, 'new password works');
  cookie = cookieOf(ch);
  const out = await req('/api/admin/logout', { method: 'POST', cookie });
  ok(out.status === 200 && /Max-Age=0/i.test(out.headers.getSetCookie()[0]), 'sign-out clears the session cookie');

  console.log('\n# Rate limiting');
  let got429 = false;
  for (let i = 0; i < 12; i++) if ((await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'guess guess guess' + i }, ip: '203.0.113.50' })).status === 429) got429 = true;
  ok(got429, 'repeated failed logins are rate-limited');

  // Fresh voting window for the code-guessing test
  const cookie2 = cookieOf(await req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: NEWPW }, ip: '198.51.100.3' }));
  await req('/api/admin/voting', { method: 'POST', cookie: cookie2, body: { action: 'unpublish_results' } });
  await req('/api/admin/codes', { method: 'POST', cookie: cookie2, body: { count: 1 } });
  ok((await req('/api/admin/voting', { method: 'POST', cookie: cookie2, body: { action: 'open' } })).status === 200, 'voting reopened for rate-limit test');
  b = await req('/api/ballot');
  const sel2 = Object.fromEntries(b.json.categories.map((c) => [c.id, c.nominees[0].id]));
  let guess429 = false;
  for (let i = 0; i < 12; i++) if ((await vote(`AAAAA-AAAA${i % 9 + 2}`, sel2, { ip: '203.0.113.77' })).status === 429) guess429 = true;
  ok(guess429, 'repeated wrong voting codes are rate-limited');
  ok((await vote(undefined, sel2, { ip: '203.0.113.90' })).status === 403, 'codes mode: a ballot with no code is rejected');

  console.log('\n# Open voting mode (no code, one vote per device)');
  const statsBefore = (await req('/api/admin/overview', { cookie: cookie2 })).json.stats;
  ok((await req('/api/admin/voting', { method: 'POST', cookie: cookie2, body: { action: 'set_method', method: 'open' } })).status === 200, 'admin switches to open voting');
  ok((await req('/api/ballot')).json.method === 'open', 'public ballot reports open mode (page hides the code box)');
  const o1 = await vote(undefined, sel2, { ip: '203.0.113.88' });
  ok(o1.status === 201, 'open mode: ballot accepted without a code');
  const devCookie = (o1.headers.getSetCookie()[0] || '').split(';')[0];
  ok(/^nw_device=[a-f0-9]{64}$/.test(devCookie) && /HttpOnly/i.test(o1.headers.getSetCookie()[0]), 'open mode: device cookie is HttpOnly');
  const o2 = await vote(undefined, sel2, { ip: '203.0.113.88', cookie: devCookie });
  ok(o2.status === 409 && /already voted/i.test(o2.json.error), 'open mode: same device cannot vote twice');
  const o3 = await Promise.all([vote(undefined, sel2, { ip: '203.0.113.89' }), vote(undefined, sel2, { ip: '203.0.113.89', cookie: devCookie })]);
  ok(o3.map((r) => r.status).includes(409), 'open mode: the voted device is still blocked on retry');
  const statsAfter = (await req('/api/admin/overview', { cookie: cookie2 })).json.stats;
  ok(statsAfter.codes.total === statsBefore.codes.total && statsAfter.codes.used === statsBefore.codes.used, 'device votes do not appear as voting codes');
  const codeListAfter = (await req('/api/admin/codes', { cookie: cookie2 })).json.codes;
  ok(codeListAfter.every((c) => c.label !== 'open-link'), 'codes list hides automatic device entries');
  ok((await req('/api/admin/voting', { method: 'POST', cookie: cookie2, body: { action: 'set_method', method: 'codes' } })).status === 200, 'admin switches back to personal codes');

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('TEST CRASHED:', e); await db.end().catch(() => {}); process.exit(2); });
