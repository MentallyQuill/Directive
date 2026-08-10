import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <style>${css}</style>
      <section class="directive-runtime-panel directive-expanded-shell directive-screen">
        <div class="directive-workspace">
          <main class="directive-route-body">
            <section class="directive-certified-scroll-pane" data-directive-scroll-owner="true">
              ${'<p>Bounded route record</p>'.repeat(100)}
            </section>
          </main>
        </div>
      </section>
    `);
    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.directive-expanded-shell');
      const workspace = document.querySelector('.directive-workspace');
      const routeBody = document.querySelector('.directive-route-body');
      const owner = document.querySelector('[data-directive-scroll-owner="true"]');
      const overflow = (node) => getComputedStyle(node).overflow;
      const illegal = [...shell.querySelectorAll('*')]
        .filter((node) => {
          const style = getComputedStyle(node);
          const scrollable = /(auto|scroll)/.test(`${style.overflowY} ${style.overflowX}`);
          return scrollable && node.dataset.directiveScrollOwner !== 'true';
        })
        .map((node) => node.className);
      return {
        shell: overflow(shell),
        workspace: overflow(workspace),
        routeBody: overflow(routeBody),
        ownerOverflowY: getComputedStyle(owner).overflowY,
        ownerScrolls: owner.scrollHeight > owner.clientHeight,
        illegal
      };
    });
    assert.equal(metrics.shell, 'hidden', `${viewport.width}px shell must not scroll`);
    assert.equal(metrics.workspace, 'hidden', `${viewport.width}px workspace must not scroll`);
    assert.equal(metrics.routeBody, 'hidden', `${viewport.width}px route body must not scroll`);
    assert.ok(/auto|scroll/.test(metrics.ownerOverflowY), `${viewport.width}px bounded owner must scroll`);
    assert.equal(metrics.ownerScrolls, true, `${viewport.width}px bounded owner must own overflow`);
    assert.deepEqual(metrics.illegal, [], `${viewport.width}px found an undeclared scroll owner`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('PASS certified scroll ownership');
