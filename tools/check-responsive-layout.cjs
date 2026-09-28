/* Local-only visual layout regression check. Requires Playwright and Chrome.
   Start a static server for public/ on port 4175, then run:
   node tools/check-responsive-layout.cjs
   PLAYWRIGHT_MODULE may point to an existing Playwright installation.
   Admin APIs are fixtures: this test never reads or writes production data. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.LNH_PREVIEW_URL || 'http://127.0.0.1:4175';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a local preview server only');
const requestedWidths = process.env.LNH_TEST_WIDTHS?.split(',').map(Number);
const viewports = [[320,568],[360,800],[393,852],[430,932],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080],[2560,1440]]
  .filter(([width]) => !requestedWidths || requestedWidths.includes(width));
const pages = ['index','brief','direction','build','curation','care','edit','partnership','about','stories','privacy','admin/login','admin/index'];
const servicePages = ['brief','direction','build','curation','care','edit','partnership'];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const failures = [];
  let checked = 0;
  try {
    for (const [width, height] of viewports) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route('**/api/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: !page.url().includes('/admin/login'), applications: [], overview: {}, paths: [], transitions: [], referrers: [] })
      }));
      for (const name of pages) {
        await page.goto(`${origin}/${name}.html`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(750);
        const layout = await page.evaluate(() => {
          const h1 = document.querySelector('main h1');
          const h2 = document.querySelector('main h2');
          const hero = h1?.closest('section');
          const visual = hero?.querySelector('.hero-visual,.direction-hero-visual,.build-direction-hero-visual');
          const action = hero?.querySelector('.hero-bottom,.direction-hero-action,.build-direction-hero-action');
          const tag = hero?.querySelector('.lnh-hero-tag,.eyebrow');
          const intro = hero?.querySelector('.hero-intro,.direction-hero-intro,.build-direction-hero-intro,.hero-lead');
          const storiesFeed = document.querySelector('.stories-feed');
          const box = e => e?.getBoundingClientRect().toJSON();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            nav: box(document.querySelector('.site-header')),
            logo: box(document.querySelector('.site-header .brand img')),
            h1: h1 && parseFloat(getComputedStyle(h1).fontSize),
            h2: h2 && parseFloat(getComputedStyle(h2).fontSize),
            hero: box(hero), visual: box(visual), action: box(action), tag: box(tag), intro: box(intro), title: box(h1),
            indexTag: document.querySelector('.landing-hero .lnh-hero-tag')?.getBoundingClientRect().height || 0,
            storiesPreviewLabel: document.querySelector('#stories-preview-title') && parseFloat(getComputedStyle(document.querySelector('#stories-preview-title')).fontSize),
            storiesColumns: storiesFeed ? getComputedStyle(storiesFeed).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
            policySections: document.querySelectorAll('.privacy-document .document-body > section').length,
            hasPrivateDraftNote: document.body.textContent.includes('실제 운영 시작 전') || document.body.textContent.includes('운영 환경이 확정된 후')
          };
        });
        try {
          assert(!layout.overflow, 'horizontal overflow');
          assert.equal(layout.logo?.height, 24, 'original logo height');
          if (layout.h1 && layout.h2 && name !== 'privacy') assert(layout.h1 > layout.h2, 'hero/section hierarchy');
          if (name === 'index') {
            assert.equal(layout.indexTag, 0, 'index has no tag');
            assert(layout.storiesPreviewLabel <= 13, 'index Stories heading uses label scale');
          }
          if (servicePages.includes(name)) {
            assert(layout.visual?.height > 0, 'visible hero image');
            if (width > 680 && name !== 'edit') {
              assert(layout.tag.y - layout.nav.bottom >= 55, 'desktop hero copy clears navigation');
              assert(layout.title.y - layout.tag.bottom >= 34, 'tag/title spacing');
              assert(layout.intro.y - layout.title.bottom >= 30, 'title/description spacing');
              assert(
                Math.abs(layout.tag.x - layout.intro.x) <= 1 &&
                layout.title.x <= layout.tag.x &&
                layout.tag.x - layout.title.x <= 4,
                'hero text optical start lines align'
              );
            }
            if (width <= 680) {
              assert(Math.abs(layout.visual.width - layout.visual.height) <= 1, 'square mobile image');
              assert(Math.abs(layout.visual.bottom - layout.hero.bottom) <= 2, 'image meets hero rule');
              if (layout.action) assert(layout.action.y - layout.intro.bottom >= 46, 'mobile CTA breathing room');
            }
            if (layout.action) assert(layout.action.bottom <= layout.hero.bottom + 1, 'CTA is not clipped');
          }
          if (name === 'stories' && width <= 680) assert.equal(layout.storiesColumns, 1, 'one Stories project per mobile row');
          if (name === 'privacy') {
            assert(layout.policySections >= 12, 'complete privacy policy sections');
            assert(!layout.hasPrivateDraftNote, 'no internal draft note');
          }
          if (width === 393) {
            await page.locator('.menu-button').click();
            assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'true');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'false');
          }
        } catch (error) { failures.push(`${name} ${width}×${height}: ${error.message}`); }
        checked++;
      }
      await page.close();
      console.log(`Checked ${width}×${height}`);
    }
  } finally { await browser.close(); }
  console.log(`${checked} page/viewport combinations; ${failures.length} failures`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
