#!/usr/bin/env node
/*
 * QA für Lernseiten.
 *   node tools/qa.cjs <seite.html> [--final] [--out <ordner>] [--palette blue|green|violet] [--full]
 *
 * Prüft im echten Browser (Chromium via Playwright):
 *   JS-Fehler · doppelte IDs · TOC ↔ Sektionen · Scroll-Spy je Sektion · Mobil ohne horizontales Scrollen
 *   · mobiles Inhaltsverzeichnis · kaputte lokale Bilder · Lernmodus (alle Karten durchspielen) · Dark-Mode (+ Speicherung)
 *   · --final: keine Demo-/Platzhalterreste mehr (data-demo, "KÜRZEL", data-slug="kuerzel")
 * Screenshots landen in <out> (Standard: qa-out/<dateiname>/). Exit-Code 1, wenn etwas fehlschlägt, 2 bei Aufruf-/Setup-Fehlern.
 * Jeder Schritt wird einzeln abgefangen: ein Absturz in einem Schritt wird als Fehler gemeldet, der Bericht erscheint immer.
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e1) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  catch (e2) { console.error('Playwright nicht gefunden (npm i -D playwright, oder NODE_PATH auf die globalen node_modules setzen).'); process.exit(2); }
}

// ── Argumente ───────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(name);
const file = argv.find((a, i) => !a.startsWith('--') && !['--out', '--palette'].includes(argv[i - 1]));
if (!file || !fs.existsSync(file)) { console.error('Aufruf: node tools/qa.cjs <seite.html> [--final] [--out <ordner>] [--palette <name>] [--full]'); process.exit(2); }
const FINAL = flag('--final');
const outDir = opt('--out') || path.join('qa-out', path.basename(file, '.html'));
fs.mkdirSync(outDir, { recursive: true });
const url = 'file://' + path.resolve(file);
const MOBILE_W = 390;

const results = [];
const add = (level, msg) => results.push({ level, msg });
const ok = (m) => add('ok', m), warn = (m) => add('warn', m), fail = (m) => add('fail', m), info = (m) => add('info', m);
const shot = (page, name, o = {}) => page.screenshot({ path: path.join(outDir, name + '.png'), ...o });
const step = async (name, fn) => { try { await fn(); } catch (e) { fail(`${name}: ${String(e && e.message || e).split('\n')[0]}`); } };

(async () => {
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) {
    const dirs = fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')) : [];
    if (!dirs.length) throw e;
    browser = await chromium.launch({ executablePath: path.join('/opt/pw-browsers', dirs[0], 'chrome-linux', 'chrome') });
  }

  async function open(viewport, extra = {}) {
    const ctx = await browser.newContext({ viewport, ...extra });
    ctx.setDefaultTimeout(8000);
    const page = await ctx.newPage();
    const jsErrors = [], localFails = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) jsErrors.push(m.text()); });
    page.on('requestfailed', r => { if (r.url().startsWith('file:')) localFails.push(decodeURIComponent(r.url().replace('file://', ''))); });
    await page.route(/^https?:\/\//, r => r.abort());          // Google Fonts etc. offline → Systemschrift
    await page.goto(url, { waitUntil: 'load' });
    if (opt('--palette')) await page.evaluate(t => document.documentElement.setAttribute('data-palette', t), opt('--palette'));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.waitForTimeout(250);
    return { ctx, page, jsErrors, localFails };
  }

  /* ═════ Desktop ═════ */
  let s = null;
  const d = await open({ width: 1280, height: 900 });
  const page = d.page;

  await step('Struktur', async () => {
    s = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('.main-content section[id]')].filter(x => x.querySelector('.section-header')).map(x => x.id);
      const toc = [...document.querySelectorAll('.toc-item')].map(a => a.dataset.target);
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
      const html = document.documentElement.outerHTML;
      return {
        secs, toc,
        dupIds: ids.filter((x, i) => ids.indexOf(x) !== i),
        h1: document.querySelectorAll('h1').length,
        title: document.title,
        lang: document.documentElement.lang,
        palette: document.documentElement.dataset.palette,
        slug: document.documentElement.dataset.slug,
        demoCount: document.querySelectorAll('[data-demo]').length,
        placeholder: (html.match(/KÜRZEL/g) || []).length,
        inline: document.querySelectorAll('[style]').length,
        imgs: [...document.querySelectorAll('img:not(#lightbox-img)')].map(i => ({ src: (i.getAttribute('src') || '').slice(0, 60), alt: i.getAttribute('alt'), broken: i.complete && i.naturalWidth === 0 })),
        cards: Array.isArray(window.FLASHCARDS) ? window.FLASHCARDS.map(c => ({ cat: c.cat, q: c.q, a: c.a, demo: !!c.demo })) : null,
        cardsWithoutBody: [...document.querySelectorAll('.card')].filter(c => !c.querySelector(':scope > .card-body')).length,
        strongDisplay: (() => { const st = document.querySelector('.highlight-box strong'); return st ? getComputedStyle(st).display : 'inline'; })(),
      };
    });

    d.jsErrors.length ? fail('JavaScript-Fehler: ' + [...new Set(d.jsErrors)].slice(0, 3).join(' | ')) : ok('Keine JavaScript-Fehler');
    s.lang === 'de' ? ok('<html lang="de">') : warn('lang-Attribut ist "' + s.lang + '" (de erwartet)');
    s.h1 === 1 ? ok('Genau eine <h1>') : fail('Anzahl <h1>: ' + s.h1);
    s.dupIds.length ? fail('Doppelte IDs: ' + [...new Set(s.dupIds)].join(', ')) : ok('Keine doppelten IDs');
    s.cardsWithoutBody ? fail(s.cardsWithoutBody + ' .card ohne .card-body (Innenabstand fehlt)') : ok('Jede .card hat einen .card-body');
    s.strongDisplay === 'inline' ? ok('<strong> in Merksatz-Boxen bleibt inline') : fail('<strong> in .highlight-box ist ' + s.strongDisplay + ' → zerhackt Sätze');
    ['amber', 'blue', 'green', 'violet'].includes(s.palette) ? ok('Palette: ' + s.palette) : fail('Unbekanntes data-palette: ' + s.palette);
    s.inline > 80 ? warn(s.inline + ' style-Attribute (viel; besser Klassen aus der Vorlage nutzen)') : info(s.inline + ' style-Attribute');

    const leftovers = [];
    if (s.demoCount) leftovers.push(s.demoCount + '× data-demo');
    if (s.placeholder) leftovers.push(s.placeholder + '× "KÜRZEL"');
    if (s.slug === 'kuerzel') leftovers.push('data-slug="kuerzel"');
    if (s.cards && s.cards.some(c => c.demo)) leftovers.push(s.cards.filter(c => c.demo).length + '× Demo-Karteikarte (demo: true)');
    if (/Thema der Lernseite/.test(s.title)) leftovers.push('Standard-<title>');
    if (leftovers.length) (FINAL ? fail : info)('Vorlagenreste: ' + leftovers.join(', '));
    else ok('Keine Vorlagenreste');

    if (!s.secs.length) fail('Keine <section id> mit .section-header gefunden');
    else if (JSON.stringify(s.secs) === JSON.stringify(s.toc)) ok('TOC enthält alle ' + s.secs.length + ' Sektionen in DOM-Reihenfolge');
    else fail('TOC ≠ Sektionen (TOC: ' + s.toc.join(',') + ' | Sektionen: ' + s.secs.join(',') + ')');

    const broken = s.imgs.filter(i => i.broken);
    const noAlt = s.imgs.filter(i => i.alt === null);   // alt="" gilt als bewusst dekorativ
    d.localFails.length || broken.length ? fail('Bilder nicht ladbar: ' + [...new Set([...d.localFails, ...broken.map(b => b.src)])].slice(0, 5).join(', ')) : ok(s.imgs.length ? s.imgs.length + ' Bild(er) laden' : 'Keine Bilder');
    if (noAlt.length) warn(noAlt.length + ' Bild(er) ohne alt-Text');

    if (!s.cards) warn('window.FLASHCARDS fehlt → Lernmodus-Button ist ausgeblendet');
    else {
      const bad = s.cards.filter(c => !(c.cat && c.q && c.a && [c.cat, c.q, c.a].every(x => typeof x === 'string')));
      const qs = s.cards.map(c => c.q), dup = qs.filter((x, i) => qs.indexOf(x) !== i);
      const long = s.cards.filter(c => c.a.split('\n').length > 8);
      const cats = [...new Set(s.cards.map(c => c.cat))];
      bad.length ? fail(bad.length + ' Karte(n) ohne cat/q/a') : ok(s.cards.length + ' Karteikarten in ' + cats.length + ' Kategorien');
      if (dup.length) warn('Doppelte Fragen: ' + [...new Set(dup)].slice(0, 3).join(' | '));
      if (long.length) warn(long.length + ' Antwort(en) mit mehr als 8 Zeilen (kürzen oder aufteilen)');
      if (FINAL && s.cards.length < 20) warn('Nur ' + s.cards.length + ' Karteikarten (Richtwert: 3–5 pro Abschnitt)');
    }
  });

  // Scroll-Spy je Sektion
  await step('Scroll-Spy', async () => {
    const spy = await page.evaluate(async () => {
      const secs = [...document.querySelectorAll('.main-content section[id]')].filter(x => x.querySelector('.section-header'));
      const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = [];
      for (const sec of secs) {
        window.scrollTo({ top: sec.getBoundingClientRect().top + scrollY - innerHeight * 0.2, behavior: 'instant' });
        await wait(); await wait();
        const reached = sec.getBoundingClientRect().top <= innerHeight * 0.3;
        const act = document.querySelector('.toc-item.active');
        out.push({ id: sec.id, reached, active: act ? act.dataset.target : null });
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      return out;
    });
    const bad = spy.filter(x => x.reached && x.active !== x.id);
    bad.length ? fail('Scroll-Spy hebt falsche TOC-Einträge hervor: ' + bad.map(x => `${x.id}→${x.active}`).join(', '))
               : ok('Scroll-Spy stimmt in ' + spy.filter(x => x.reached).length + '/' + spy.length + ' Sektionen' + (spy.some(x => !x.reached) ? ' (Rest am Seitenende nicht erreichbar)' : ''));
    const last = spy[spy.length - 1];
    if (last && !last.reached) {
      const act = await page.evaluate(() => { window.scrollTo({ top: 1e6, behavior: 'instant' }); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { const a = document.querySelector('.toc-item.active'); r(a ? a.dataset.target : null); }))); });
      act === last.id ? ok('Am Seitenende ist der letzte TOC-Eintrag aktiv') : fail('Am Seitenende aktiv: ' + act + ' (erwartet ' + last.id + ')');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    }
  });

  // Lernmodus durchspielen
  if (s && s.cards && s.cards.length) await step('Lernmodus', async () => {
    await page.click('#learn-btn');
    await page.waitForSelector('#learn-overlay.open');
    await shot(page, '10-desktop-lernmodus-vorne');
    await page.click('#flip-card');
    await page.waitForTimeout(700);
    await shot(page, '11-desktop-lernmodus-hinten');
    const rateVisible = await page.$eval('#learn-rate', el => el.classList.contains('show'));
    rateVisible ? ok('Lernmodus: Karte dreht um, Bewertung erscheint') : fail('Lernmodus: Bewertung erscheint nicht nach dem Umdrehen');
    // alle Karten per Tastatur durchspielen (Leertaste = umdrehen, 1/2/3 = bewerten)
    let guard = s.cards.length + 5, clipped = 0;
    await page.click('#learn-restart');
    while (guard-- > 0 && !(await page.$('.learn-result'))) {
      await page.keyboard.press('Space');
      clipped += await page.evaluate(() => [document.querySelector('.learn-card-back'), document.querySelector('.learn-card-front')].filter(x => x && x.scrollWidth > x.clientWidth + 1).length);
      await page.keyboard.press(['1', '2', '3'][guard % 3]);
    }
    (await page.$('.learn-result')) ? ok('Lernmodus: alle ' + s.cards.length + ' Karten durchgespielt, Ergebnisseite erscheint') : fail('Lernmodus: Ergebnisseite wurde nicht erreicht');
    clipped ? fail('Lernmodus: Text läuft bei ' + clipped + ' Karte(n) seitlich über') : ok('Lernmodus: kein seitlicher Textüberlauf');
    await shot(page, '12-desktop-lernmodus-ergebnis');
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => !document.getElementById('learn-overlay').classList.contains('open') && !document.documentElement.classList.contains('learn-open'));
    closed ? ok('Lernmodus: Esc schließt') : fail('Lernmodus: Esc schließt nicht');
  });

  // Screenshots + Dark-Mode
  await step('Dark-Mode', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await shot(page, '01-desktop-hell');
    if (flag('--full')) await shot(page, '02-desktop-hell-komplett', { fullPage: true });
    await page.click('#dm-toggle');
    await page.waitForTimeout(350);
    (await page.evaluate(() => document.documentElement.classList.contains('dark'))) ? ok('Dark-Mode schaltet um') : fail('Dark-Mode schaltet nicht um');
    await shot(page, '03-desktop-dunkel');
    if (flag('--full')) await shot(page, '04-desktop-dunkel-komplett', { fullPage: true });
    await page.reload({ waitUntil: 'load' });
    (await page.evaluate(() => document.documentElement.classList.contains('dark'))) ? ok('Dark-Mode bleibt nach Neuladen erhalten') : warn('Dark-Mode wird nicht gespeichert (localStorage evtl. gesperrt)');
  });
  await d.ctx.close();

  /* ═════ Mobil ═════ */
  const m = await open({ width: MOBILE_W, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = m.page;
  await step('Mobil: Overflow', async () => {
    const ov = await mp.evaluate((MW) => {
      // Bei Overflow dehnt die Mobil-Emulation den Layout-Viewport → immer gegen die Gerätebreite MW prüfen
      const sw = document.documentElement.scrollWidth;
      const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= MW + 1) return true; } return false; };
      const bad = sw <= MW + 1 ? [] : [...document.querySelectorAll('body *')].filter(el => {
        if (el.closest('.toc-sidebar, .learn-overlay, .lightbox') || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) return false;
        const r = el.getBoundingClientRect(); return r.width > 0 && r.right > MW + 1 && !clipped(el);
      }).slice(0, 5).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
      return { sw, bad };
    }, MOBILE_W);
    ov.sw <= MOBILE_W + 1 ? ok(`Mobil (${MOBILE_W} px): kein horizontales Scrollen`)
                          : fail(`Mobil (${MOBILE_W} px): Seite ${ov.sw}px breit; Verursacher: ${ov.bad.join(', ') || 'unbekannt'}`);
    await shot(mp, '20-mobil-hell');
  });

  if (s && s.secs.length) await step('Mobil: Inhaltsverzeichnis', async () => {
    await mp.click('#toc-toggle');
    const open1 = await mp.evaluate(() => { const t = document.getElementById('toc'); return t.classList.contains('open') && getComputedStyle(t).display !== 'none'; });
    await shot(mp, '21-mobil-inhalt');
    if (!open1) return fail('Mobil: Inhaltsverzeichnis lässt sich nicht öffnen');
    await mp.click('.toc-item:nth-of-type(' + Math.min(2, s.secs.length) + ')');
    await mp.waitForTimeout(500);
    (await mp.evaluate(() => !document.getElementById('toc').classList.contains('open'))) ? ok('Mobil: Inhaltsverzeichnis öffnet und schließt nach Auswahl') : fail('Mobil: Inhaltsverzeichnis bleibt nach Auswahl offen');
  });

  if (s && s.cards && s.cards.length) await step('Mobil: Lernmodus', async () => {
    await mp.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await mp.click('#learn-btn');
    const fits = await mp.evaluate((MW) => { const o = document.querySelector('.learn-modal').getBoundingClientRect(); return o.right <= MW + 1 && o.left >= -1; }, MOBILE_W);
    await mp.click('#flip-card', { timeout: 3000 });
    await mp.waitForTimeout(700);
    await shot(mp, '22-mobil-lernmodus');
    fits ? ok('Mobil: Lernmodus passt in den Bildschirm') : fail('Mobil: Lernmodus ragt über den Bildschirm');
    await mp.keyboard.press('Escape');
  });
  m.jsErrors.length ? fail('Mobil: JavaScript-Fehler: ' + m.jsErrors.slice(0, 2).join(' | ')) : null;
  await m.ctx.close();
  await browser.close();

  /* ═════ Bericht ═════ */
  const sym = { ok: '✔', warn: '⚠', fail: '✖', info: '·' };
  console.log('\nQA: ' + file + (FINAL ? '  [--final]' : '') + '\n');
  results.forEach(r => console.log(`  ${sym[r.level]} ${r.msg}`));
  const nf = results.filter(r => r.level === 'fail').length, nw = results.filter(r => r.level === 'warn').length;
  console.log(`\n${nf ? '✖ ' + nf + ' Fehler' : '✔ keine Fehler'}, ${nw} Warnung(en). Screenshots: ${outDir}/\n`);
  process.exit(nf ? 1 : 0);
})().catch(e => { console.error('QA-Setup fehlgeschlagen:', e); process.exit(2); });
