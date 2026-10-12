/* Local-only advertising attribution regression check. Requires Playwright and Chrome.
   Start a static server for public/ and set LNH_PREVIEW_URL when it is not on port 4173.
   All API requests are intercepted; this test never reads or writes production data. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.LNH_PREVIEW_URL || 'http://127.0.0.1:4173';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a local preview server only');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const analytics = [];
  let application = null;

  await page.route('**/api/analytics', async route => {
    analytics.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/applications', async route => {
    application = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true,"reference":"LNH-TEST"}' });
  });

  try {
    const landing = `${origin}/brief.html?utm_source=naver&utm_medium=cpc&utm_campaign=brief_launch&utm_content=decision_copy&utm_term=인테리어_견적&fbclid=meta-test&n_keyword=견적서확인`;
    await page.goto(landing, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.LNHAnalytics?.getAttribution));
    await page.goto(`${origin}/apply.html?service=brief`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.LNHAnalytics?.getAttribution));
    await page.evaluate(() => {
      window.addEventListener('lnh:application-complete', event => { window.__applicationConversion = event.detail; });
    });

    await page.locator('.form-step:not([hidden]) [data-next]').click();
    await page.locator('#space-type').selectOption({ label: '아파트' });
    await page.locator('#concern').fill('공사 전 견적 기준을 정리하고 싶습니다.');
    await page.locator('.form-step:not([hidden]) [data-next]').click();
    await page.locator('#name').fill('테스트 신청자');
    await page.locator('#phone').fill('010-0000-0000');
    await page.locator('#email').fill('test@example.com');
    await page.locator('input[name="consent"]').check();
    await page.locator('button[type="submit"]').click();
    await page.locator('#application-success').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Boolean(window.__applicationConversion));

    assert(application, 'application request was captured');
    assert.equal(application.sourcePath, '/brief.html');
    assert.equal(application.utmSource, 'naver');
    assert.equal(application.utmMedium, 'cpc');
    assert.equal(application.utmCampaign, 'brief_launch');
    assert.equal(application.utmContent, 'decision_copy');
    assert.equal(application.utmTerm, '인테리어_견적');
    assert.equal(application.fbclid, 'meta-test');
    assert.equal(application.nKeyword, '견적서확인');
    assert.equal(application.attribution.first.path, '/brief.html');
    assert.equal(application.attribution.last, undefined);

    const completed = analytics.find(event => event.eventName === 'application_complete');
    assert(completed, 'application_complete analytics event was sent');
    assert.equal(completed.metadata.attribution.first.utmSource, 'naver');
    const conversion = await page.evaluate(() => window.__applicationConversion);
    assert.equal(conversion.service, 'brief');
    assert.equal(conversion.attribution.first.utmCampaign, 'brief_launch');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('Advertising attribution flow passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
