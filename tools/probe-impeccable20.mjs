import { createRequire } from 'node:module';

const require = createRequire('/Users/lnh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const { chromium } = require('playwright');

const base = process.env.LNH_BASE_URL || 'http://127.0.0.1:4175';
const probes = [
  ['brief.html', '.image-caption', '.final-cta p', '.solid-link.primary-link', '.price-meta-item span'],
  ['build.html', '.image-caption', '.build-direction-button', '.build-direction-button-note'],
  ['curation.html', '.image-caption', '.final-cta p', '.final-cta li', '.final-cta .primary-cta'],
  ['care.html', '.image-caption', '.final-cta .eyebrow', '.final-cta p', '.final-cta .primary-cta'],
  ['edit.html', '.product-origin', '.edit-commerce-hero .lnh-hero-tag', '.edit-commerce-hero .hero-intro'],
  ['partnership.html', '.image-caption', '.role-slide .slide-label', '.contact .slide-label'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [path, ...selectors] of probes) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${base}/${path}`, { waitUntil: 'domcontentloaded' });
    const values = await page.evaluate(selectors => ({
      stylesheets: [...document.styleSheets].map(sheet => sheet.href).filter(Boolean),
      impeccableRules: (() => {
        const sheet = [...document.styleSheets].find(item => item.href?.includes('lnh-impeccable-20.css'));
        return [...(sheet?.cssRules || [])]
          .filter(rule => rule.selectorText?.includes('image-caption') || rule.selectorText?.includes('product-origin') || rule.selectorText?.includes('final-cta'))
          .map(rule => `${rule.selectorText} { ${rule.style.cssText} }`);
      })(),
      matches: selectors.map(selector => {
        const element = document.querySelector(selector);
        if (!element) return { selector, missing: true };
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          selector,
          color: style.color,
          background: style.backgroundColor,
          fontSize: style.fontSize,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    }), selectors);
    console.log(JSON.stringify({ path, ...values }, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
