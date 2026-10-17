import { expect, test, type Page } from '@playwright/test';

const LATEST = {
  versionCode: 8,
  versionName: '0.8',
  notes: 'First release for friends.',
  apkUrl: 'https://funancial.vercel.app/get/funancial-0.8.apk',
  sha256: 'a'.repeat(63) + '0',
  size: 9_437_184,
};

const PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Serves `latest.json` as the release script writes it, or with the status/body given. */
async function serveLatest(
  page: Page,
  answer: { status: number; body?: string } | object = LATEST,
) {
  await page.route('**/get/latest.json', (route) =>
    'status' in answer
      ? route.fulfill({ status: answer.status, contentType: 'application/json', body: answer.body })
      : route.fulfill({ json: answer }),
  );
}

/** The compact button under the title. */
const heroLink = (page: Page) => page.locator('.hero').getByRole('link');
/** The full download block at the end of the page. */
const downloadLink = (page: Page) =>
  page.locator('#download').getByRole('link', { name: 'Download for Android' });
const comingSoon = (page: Page) => page.getByRole('button', { name: 'Coming soon' });

/** True once some canvas on the page holds a WebGL context (a 2D canvas answers null). */
const hasWebglCanvas = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('canvas')].some(
      (canvas) => canvas.getContext('webgl2') || canvas.getContext('webgl'),
    ),
  );

/** Scrolls the story to `fraction` (0 to 1) of its length, where the timeline's `p` is. */
const scrollStoryTo = (page: Page, fraction: number) =>
  page.evaluate((f) => {
    const story = document.getElementById('story')!;
    const top = story.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + f * (story.offsetHeight - window.innerHeight));
  }, fraction);

/** The opacity of each of the four captions, in order. */
const captionOpacities = (page: Page) =>
  page
    .locator('.stop')
    .evaluateAll((stops) => stops.map((stop) => Number(getComputedStyle(stop).opacity)));

/** Makes the page believe its tab is hidden (or back), the way the browser tells it. */
const setTabHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

/** The URLs of everything the page requests from now on. */
function watchRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

/*
 * The story's code is one lazy chunk, `story-<hash>.js`, with Three.js inside it: a request for
 * either name is the 3D story being loaded.
 */
const STORY_CHUNK = /(story|three)[^/]*\.js/;

/** The lowest contrast ratio between the CSS colour `color` (any syntax) and any pixel of the PNG. */
function lowestContrast(page: Page, png: Buffer, color: string) {
  return page.evaluate(
    async ({ base64, color }) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const g = canvas.getContext('2d')!;
      g.drawImage(image, 0, 0);
      const channel = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      // Let the browser read the colour: computed values come back as rgb(), color(srgb …) and more.
      const probe = document.createElement('canvas').getContext('2d')!;
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      const [r, gr, b] = probe.getImageData(0, 0, 1, 1).data;
      const text = luminance(r!, gr!, b!);
      const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
      let lowest = Infinity;
      for (let i = 0; i < data.length; i += 4) {
        const back = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
        lowest = Math.min(lowest, (Math.max(back, text) + 0.05) / (Math.min(back, text) + 0.05));
      }
      return lowest;
    },
    { base64: png.toString('base64'), color },
  );
}

test('keeps itself out of search engines', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  await expect(page).toHaveTitle('Funancial');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('tells the story in plain sections, and what the app asks for', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
  await expect(page.getByText('A budget app that stays on your phone.')).toBeVisible();
  for (const caption of [
    'See what you can still spend.',
    'Limits that tap you on the shoulder.',
    'Ask before you buy.',
    'Level up as you go.',
    'Safe and simple',
  ]) {
    await expect(page.getByRole('heading', { name: caption })).toBeVisible();
  }
  await expect(page.getByText('First release for friends.')).toBeVisible();
  for (const permission of [
    'INTERNET',
    'POST_NOTIFICATIONS',
    'RECEIVE_BOOT_COMPLETED',
    'USE_BIOMETRIC',
  ]) {
    await expect(page.locator(`[data-permission~="${permission}"]`)).toBeVisible();
  }
});

test('shows the install steps', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  const steps = page.getByRole('listitem').filter({ hasText: /^(Tap|If Android)/ });
  await expect(steps).toHaveText([
    'Tap Download, then open the file.',
    'If Android asks, allow your browser to install apps.',
    'Tap Install, open Funancial, and try demo money first.',
  ]);
  await expect(steps.first()).toBeVisible();
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: PIXEL });

  test('offers the download, with the version and size', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(page.getByText('Version 0.8 · 9.4 MB')).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeHidden();
  });

  test('puts a download button in the first screen, at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await serveLatest(page);
    await page.goto('/get');
    await expect(heroLink(page)).toHaveText('Download for Android');
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    const box = await heroLink(page).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  });

  test('shows "Coming soon" at the top while latest.json is on its way', async ({ page }) => {
    let answer!: () => void;
    const arrived = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/get/latest.json', async (route) => {
      await arrived;
      await route.fulfill({ json: LATEST });
    });
    await page.goto('/get');
    await expect(comingSoon(page).first()).toBeDisabled();
    await expect(heroLink(page)).toHaveCount(0);
    answer();
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(comingSoon(page)).toHaveCount(0);
  });

  test('reaches both download buttons by keyboard, with a visible focus ring', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    for (const link of [heroLink(page), downloadLink(page)]) {
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      const ring = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);
    }
  });

  test('has download buttons of at least 44px', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    for (const link of [heroLink(page), downloadLink(page)]) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('says "Coming soon" on disabled buttons while there is no release', async ({ page }) => {
    await serveLatest(page, { status: 404, body: 'Not found' });
    await page.goto('/get');
    await expect(comingSoon(page)).toHaveCount(2);
    for (const button of await comingSoon(page).all()) await expect(button).toBeDisabled();
    await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
  });

  test('offers nothing from a latest.json that is not a release', async ({ page }) => {
    await serveLatest(page, { ...LATEST, apkUrl: 'javascript:alert(1)' });
    await page.goto('/get');
    await expect(comingSoon(page)).toHaveCount(2);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('still offers the download when drawing the phones fails', async ({ page }) => {
    await page.addInitScript(() => {
      const create = document.createElement.bind(document);
      document.createElement = ((tag: string, options?: ElementCreationOptions) => {
        if (tag === 'canvas') throw new Error('no canvas today');
        return create(tag, options);
      }) as typeof document.createElement;
    });
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
  });

  test('fits a 375px screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    const overflow = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow, 'pixels wider than the screen').toBeLessThanOrEqual(0);
  });
});

test.describe('on a phone, the text is readable', () => {
  test.use({ userAgent: PIXEL, viewport: { width: 375, height: 812 }, colorScheme: 'light' });

  const LINES = {
    'the subline': '.subline',
    'a stop label': '.stop .n',
    'a stop sentence': '.stop .caption p:last-child',
    'the meta line': '#download-meta',
    'the notes': '#whats-new-notes',
    'a permissions line': '[data-permission="INTERNET"]',
    'an install step': 'ol li',
  };

  for (const [name, selector] of Object.entries(LINES)) {
    test(`against the background under ${name}`, async ({ page }) => {
      await serveLatest(page);
      await page.goto('/get');
      const line = page.locator(selector).first();
      await expect(line).toBeVisible();
      await line.scrollIntoViewIfNeeded();
      const color = await line.evaluate((el) => getComputedStyle(el).color);
      // The text itself is made see-through, so the picture is the background under it.
      const background = await line.screenshot({
        style: '* { color: transparent !important; }',
        animations: 'disabled',
      });
      expect(await lowestContrast(page, background, color)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('against the darkest spot of the backdrop, wherever the page is scrolled', async ({
    page,
  }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    // The blurred colours stay fixed to the screen, so text meets any part of them as it scrolls.
    const backdrop = await page.screenshot({ style: 'main { visibility: hidden !important; }' });
    for (const selector of Object.values(LINES)) {
      const line = page.locator(selector).first();
      const color = await line.evaluate((el) => getComputedStyle(el).color);
      expect(await lowestContrast(page, backdrop, color), selector).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe('on a computer', () => {
  test('offers a QR code to scan, and a direct download link', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeVisible();
    await expect(page.getByText('Scan with your Android phone')).toBeVisible();
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(page.getByText('Version 0.8 · 9.4 MB')).toBeVisible();
  });

  test('has a button at the top that goes down to the QR code', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(heroLink(page)).toHaveText('Get it on your phone ↓');
    await expect(heroLink(page)).toHaveAttribute('href', '#download');
    await heroLink(page).click();
    await expect(page.getByRole('heading', { name: 'Get it on your phone.' })).toBeInViewport();
  });
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('says it is Android-only, and offers no download', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    const notes = page.getByText('Funancial is Android-only for now.');
    // Once at the top and once in the download block.
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) await expect(note).toBeVisible();
    await expect(page.getByRole('link', { name: /download|get it/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /download|coming soon/i })).toHaveCount(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('says the download needs it, instead of a "Coming soon" that never changes', async ({
    page,
  }) => {
    await page.goto('/get');
    // Playwright's text queries skip <noscript>, so ask for the element.
    const notes = page.locator('noscript .note');
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) {
      await expect(note).toHaveText('Turn on JavaScript to see the download button.');
      await expect(note).toBeVisible();
    }
    await expect(comingSoon(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
    await expect(page.getByText('Tap Download, then open the file.')).toBeVisible();
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows four drawn phones, the title, the button and the steps, and no WebGL', async ({
    page,
  }) => {
    await serveLatest(page);
    await page.goto('/get');
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
    await expect(downloadLink(page)).toBeVisible();
    await expect(page.getByText('Tap Download, then open the file.')).toBeVisible();

    const webgl = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')].some(
        (canvas) => canvas.getContext('webgl2') || canvas.getContext('webgl'),
      ),
    );
    expect(webgl).toBe(false);
  });

  test('never requests Three.js', async ({ page }) => {
    const urls = watchRequests(page);
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.getByRole('img', { name: 'Funancial Home screen' })).toBeVisible();
    // Give a late start every chance: after load, and a couple of frames after that.
    await page.waitForLoadState('load');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(urls.filter((url) => STORY_CHUNK.test(url))).toEqual([]);
    await expect(page.locator('html')).not.toHaveClass(/story-on/);
  });

  test('draws the Home screen once the font is in', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    const home = page.getByRole('img', { name: 'Funancial Home screen' });
    // The heading "Home" and the figure are dark ink on a white screen: some pixel is nearly black.
    await expect
      .poll(() =>
        home.evaluate((canvas: HTMLCanvasElement) => {
          const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < data.length; i += 4)
            if (data[i]! < 40 && data[i + 3]! > 200) return true;
          return false;
        }),
      )
      .toBe(true);
  });
});

// The glide moves the story 6% of the way to the scroll position on every frame; software WebGL in
// headless Chromium draws few frames a second (fewer still with twelve workers at once), so the end
// of a long scroll can take a while. These are only the limits for a failure to be called one.
const GLIDE = { timeout: 60_000 };

test.describe('the 3D story, when motion is allowed', () => {
  test.describe.configure({ timeout: 120_000 });

  test('puts a WebGL phone on the page, with the caption for the stop at 50%', async ({ page }) => {
    const urls = watchRequests(page);
    await serveLatest(page);
    await page.goto('/get');
    await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
    expect(urls.some((url) => STORY_CHUNK.test(url))).toBe(true);

    await scrollStoryTo(page, 0.5);
    // Halfway is early in the third stop: its caption is coming in, the other three are off.
    await expect
      .poll(async () => (await captionOpacities(page)).map((opacity) => opacity > 0), GLIDE)
      .toEqual([false, false, true, false]);
    await expect(page.getByRole('heading', { name: 'Ask before you buy.' })).toBeVisible();
  });

  test('settles a caption in the middle of its stop, and hides the still phones', async ({
    page,
  }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
    await expect(page.locator('html')).toHaveClass(/story-on/);
    await expect(page.locator('.stop .phone')).toHaveCount(4);
    for (const phone of await page.locator('.stop .phone').all()) await expect(phone).toBeHidden();

    await scrollStoryTo(page, 0.58);
    await expect.poll(() => captionOpacities(page), GLIDE).toEqual([0, 0, 1, 0]);
  });

  test('keeps the title and the download button in the first screen', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeInViewport();
    // "Trial": every check a click makes, including that nothing sits on top of the button.
    await heroLink(page).click({ trial: true });
    // The title scrolls away with the page; the button goes with it, not before.
    await page.evaluate(() => window.scrollTo(0, 120));
    await heroLink(page).click({ trial: true });
    await scrollStoryTo(page, 0.5);
    await expect(heroLink(page)).toBeHidden();
  });

  test('ends on the download block, which the hero link brings up', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
    await expect(page.locator('#download')).toHaveCSS('opacity', '0');
    await heroLink(page).click();
    await expect(page.locator('#download')).toHaveCSS('opacity', '1', GLIDE);
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeInViewport();
    await expect(downloadLink(page)).toBeInViewport();
    // Keyboard and screen-reader users land on the link, not on the page body.
    await expect(downloadLink(page)).toBeFocused();
  });

  test('brings the download block up when its link takes the keyboard focus', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
    await expect(downloadLink(page)).toBeVisible();
    await downloadLink(page).focus();
    await expect(page.locator('#download')).toHaveCSS('opacity', '1', GLIDE);
  });

  test('draws no frames while the tab is hidden, and goes on when it is back', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.locator('html')).toHaveClass(/story-on/, GLIDE);
    await setTabHidden(page, true);
    await scrollStoryTo(page, 0.58);
    // Captions are set by the frame loop: if it ran, the third would be showing by now.
    await page.waitForTimeout(1000);
    expect(await captionOpacities(page)).toEqual([0, 0, 0, 0]);
    await setTabHidden(page, false);
    await expect.poll(() => captionOpacities(page), GLIDE).toEqual([0, 0, 1, 0]);
  });

  test('draws the scene again as soon as the screen is resized, so the canvas is never blank', async ({
    page,
  }) => {
    // Resizing a WebGL canvas empties it. Reading the picture back is not reliable (the browser
    // may already have taken it), so count draw calls instead: with the frame loop stopped (the
    // tab "hidden"), the only thing that can draw is the resize itself.
    await page.addInitScript(() => {
      const w = window as unknown as { __draws: number };
      w.__draws = 0;
      const proto = WebGL2RenderingContext.prototype;
      const drawElements = proto.drawElements;
      proto.drawElements = function (...args: Parameters<typeof drawElements>) {
        w.__draws++;
        return drawElements.apply(this, args);
      };
    });
    const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.locator('html')).toHaveClass(/story-on/, GLIDE);
    await setTabHidden(page, true);
    await page.waitForTimeout(300);
    const before = await draws();
    await page.waitForTimeout(300);
    expect(await draws(), 'the loop is really stopped').toBe(before);

    await page.setViewportSize({ width: 1100, height: 700 });
    await expect.poll(draws).toBeGreaterThan(before);
  });

  test('goes back to the plain page if the WebGL context is taken away', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.locator('html')).toHaveClass(/story-on/, GLIDE);
    await page.evaluate(() =>
      document
        .querySelector<HTMLCanvasElement>('.story-canvas')!
        .getContext('webgl2')!
        .getExtension('WEBGL_lose_context')!
        .loseContext(),
    );
    await expect(page.locator('html')).not.toHaveClass(/story-on/);
    await expect(page.locator('.story-canvas')).toHaveCount(0);
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await expect(heroLink(page)).toBeVisible();
    await expect(downloadLink(page)).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ userAgent: PIXEL, viewport: { width: 375, height: 812 }, colorScheme: 'light' });

    test('fits the screen, with the captions under the phone', async ({ page }) => {
      await serveLatest(page);
      await page.goto('/get');
      await expect.poll(() => hasWebglCanvas(page), GLIDE).toBe(true);
      await scrollStoryTo(page, 0.58);
      await expect.poll(() => captionOpacities(page), GLIDE).toEqual([0, 0, 1, 0]);
      const caption = await page.locator('.stop').nth(2).boundingBox();
      expect(caption!.y).toBeGreaterThan(812 / 2);
      expect(caption!.x).toBeGreaterThanOrEqual(0);
      expect(caption!.x + caption!.width).toBeLessThanOrEqual(375);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'pixels wider than the screen').toBeLessThanOrEqual(0);
    });
  });
});

test.describe('in a narrow computer window', () => {
  test.use({ viewport: { width: 700, height: 800 } });

  test('keeps the still page, with the QR code, and never loads Three.js', async ({ page }) => {
    const urls = watchRequests(page);
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeVisible();
    await expect(page.getByText('Scan with your Android phone')).toBeVisible();
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await page.waitForLoadState('load');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(urls.filter((url) => STORY_CHUNK.test(url))).toEqual([]);
    await expect(page.locator('html')).not.toHaveClass(/story-on/);
    expect(await hasWebglCanvas(page)).toBe(false);
  });
});

test.describe('the WebGL check', () => {
  test('waits until the page has loaded, so it cannot delay the first paint', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __probeAt: number | undefined };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
        if (type === 'webgl2') w.__probeAt ??= performance.now();
        return getContext.call(this, type as '2d');
      } as typeof getContext;
    });
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.locator('html')).toHaveClass(/story-on/, GLIDE);
    // The page's scripts run before the load event; the story starts a frame after it.
    const { probeAt, loadedAt } = await page.evaluate(() => ({
      probeAt: (window as unknown as { __probeAt: number }).__probeAt,
      loadedAt: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
        .loadEventStart,
    }));
    expect(probeAt).toBeGreaterThan(loadedAt);
  });
});

test.describe('without WebGL', () => {
  test('keeps the still phones and never loads Three.js', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
        return type.startsWith('webgl') ? null : original.call(this, type as '2d');
      } as typeof original;
    });
    const urls = watchRequests(page);
    await serveLatest(page);
    await page.goto('/get');
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await expect(heroLink(page)).toHaveAttribute('href', '#download');
    await expect(downloadLink(page)).toBeVisible();
    await page.waitForLoadState('load');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(urls.filter((url) => STORY_CHUNK.test(url))).toEqual([]);
    await expect(page.locator('html')).not.toHaveClass(/story-on/);
  });
});

test.describe('before Three.js has loaded', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the page is whole, and the story takes over when the code arrives', async ({ page }) => {
    let arrive!: () => void;
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    await page.route(STORY_CHUNK, async (route) => {
      await arrived;
      await route.continue();
    });
    await serveLatest(page);
    const requested = page.waitForRequest(STORY_CHUNK);
    await page.goto('/get');
    await requested;

    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
    await expect(heroLink(page)).toBeVisible();
    await expect(downloadLink(page)).toBeVisible();
    await expect(page.getByText('Tap Download, then open the file.')).toBeVisible();
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/story-on/);

    arrive();
    await expect(page.locator('html')).toHaveClass(/story-on/, GLIDE);
    await expect.poll(() => hasWebglCanvas(page)).toBe(true);
  });
});
