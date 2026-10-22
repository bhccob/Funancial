/**
 * The scroll story: a 3D phone that rises in, turns through the four screens of the app, spins to
 * show its back and steps aside for the download. It is the approved spike v2 as typed modules, and
 * it only ever runs after main.ts has checked that motion is allowed and WebGL works. If it cannot
 * start, or loses its WebGL context, the page goes back to the plain one underneath.
 *
 * The page holds the story in `#story > #stage`; the stage sticks to the top while the tall story
 * scrolls past. `html.story-on` (page.css) turns the four stops into captions and hides the still
 * phones. Everything here only reads the scroll position and moves things on each frame.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { drawScreen, loadScreenFont, SCREEN, TOKENS, type ScreenIndex } from './screens';
import {
  caption,
  clamp,
  glideStep,
  INTRO_END,
  OUTRO_START,
  timeline,
  type Frame,
} from './timeline';

/**
 * Skip a frame that comes sooner than this: 120 Hz draws at 60 and 144 Hz at 72, for battery and
 * heat, while 90 Hz keeps every frame (a 15 ms floor would have halved it to 45).
 */
const MIN_FRAME_MS = 10;

/** The phone body in scene units, and the colours of its metal. */
const BODY = { w: 1.6, h: 3.3, d: 0.2 } as const;
const METAL = { body: '#23232b', bump: '#30303a', lens: '#0b0b10' } as const;

/** The three background shapes' drift across the whole story, in vw and vh. */
const DRIFT = [
  [18, 40],
  [-22, -25],
  [-10, -60],
] as const;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number) => 1 - Math.pow(1 - t, 3);

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('This browser has no 2D canvas.');
  return { canvas, g };
}

function textureOf(canvas: HTMLCanvasElement) {
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

/** The back of the phone: its dark metal with the name on it. */
function backTexture() {
  const { canvas, g } = canvas2d(512, 1056);
  g.fillStyle = METAL.body;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalAlpha = 0.85;
  g.fillStyle = TOKENS['--color-bg'];
  g.font = `800 64px ${getComputedStyle(document.body).fontFamily}`;
  g.textAlign = 'center';
  g.fillText('Funcial', 256, 560);
  return textureOf(canvas);
}

/** A soft diagonal band of light, slid across the glass by its offset. */
function sheenTexture() {
  const { canvas, g } = canvas2d(256, 512);
  const band = g.createLinearGradient(0, 0, 256, 512);
  for (const [at, alpha] of [
    [0, 0],
    [0.45, 0],
    [0.5, 0.16],
    [0.55, 0],
    [1, 0],
  ] as const)
    band.addColorStop(at, `rgba(255,255,255,${alpha})`);
  g.fillStyle = band;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const map = textureOf(canvas);
  map.wrapS = RepeatWrapping;
  return map;
}

/** The phone: body, camera bump, back, and the glass over the screen. */
function buildPhone(screen: CanvasTexture, sheen: CanvasTexture) {
  const { w, h, d } = BODY;
  const phone = new Group();
  phone.add(
    new Mesh(
      new RoundedBoxGeometry(w, h, d, 8, 0.23),
      new MeshPhysicalMaterial({
        color: METAL.body,
        metalness: 0.85,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    ),
  );

  const bump = new Mesh(
    new RoundedBoxGeometry(0.6, 0.6, 0.07, 6, 0.14),
    new MeshPhysicalMaterial({ color: METAL.bump, metalness: 0.9, roughness: 0.18, clearcoat: 1 }),
  );
  bump.position.set(-0.4, 1.18, -d / 2 - 0.035);
  phone.add(bump);
  const lens = new MeshPhysicalMaterial({
    color: METAL.lens,
    metalness: 1,
    roughness: 0.05,
    clearcoat: 1,
  });
  for (const [x, y] of [
    [-0.52, 1.3],
    [-0.28, 1.3],
    [-0.52, 1.06],
  ] as const) {
    const eye = new Mesh(new CylinderGeometry(0.085, 0.085, 0.05, 32), lens);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(x, y, -d / 2 - 0.07);
    phone.add(eye);
  }

  const back = new Mesh(
    new PlaneGeometry(w - 0.3, h - 0.3),
    new MeshPhysicalMaterial({
      map: backTexture(),
      transparent: true,
      metalness: 0.4,
      roughness: 0.35,
    }),
  );
  back.rotation.y = Math.PI;
  back.position.z = -d / 2 - 0.002;
  phone.add(back);

  const glass = new PlaneGeometry(w - 0.14, h - 0.16);
  const live = new Mesh(glass, new MeshBasicMaterial({ map: screen, toneMapped: false }));
  live.position.z = d / 2 + 0.003;
  const shine = new Mesh(
    glass,
    new MeshBasicMaterial({ map: sheen, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shine.position.z = d / 2 + 0.005;
  phone.add(live, shine);
  return phone;
}

function run(stage: HTMLElement): () => void {
  const story = stage.parentElement;
  const hero = stage.querySelector<HTMLElement>('.hero');
  const end = stage.querySelector<HTMLElement>('#download');
  const stops = [...stage.querySelectorAll<HTMLElement>('.stop')];
  if (!story || !hero || !end || stops.length !== 4) throw new Error('The page has no story.');
  const wide = matchMedia('(min-width: 760px)');

  // ---- The scene ----
  const canvas = document.createElement('canvas');
  canvas.className = 'story-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  // The map is made; the room and the generator that made it are not needed again.
  room.dispose();
  pmrem.dispose();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const light = new DirectionalLight(0xffffff, 1.4);
  light.position.set(3, 4, 6);
  scene.add(light);

  // One live screen, redrawn only when the story has moved to a different picture.
  const { canvas: screenCanvas, g: screenContext } = canvas2d(SCREEN.w, SCREEN.h);
  const screenMap = textureOf(screenCanvas);
  screenMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const sheen = sheenTexture();
  const phone = buildPhone(screenMap, sheen);
  scene.add(phone);

  const shadow = new Mesh(
    new CircleGeometry(1.3, 48),
    new MeshBasicMaterial({ color: TOKENS['--color-text'], transparent: true, opacity: 0 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.25;
  shadow.scale.set(1, 0.32, 1);
  scene.add(shadow);

  // ---- The page around it ----
  const blobs = DRIFT.map((_, i) => {
    const blob = document.createElement('div');
    blob.className = `blob blob-${i + 1}`;
    return blob;
  });
  const hint = document.createElement('p');
  hint.className = 'story-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Scroll slowly ↓';

  document.body.append(...blobs);
  stage.prepend(canvas);
  stage.append(hint);
  document.documentElement.classList.add('story-on');

  // ---- Size and scroll ----
  const progress = () => {
    const box = story.getBoundingClientRect();
    return clamp(-box.top / (box.height - innerHeight));
  };
  let heroHeight = 0;
  let width = 0;
  let height = 0;
  let target = 0;
  const measure = () => {
    heroHeight = hero.offsetHeight;
    if (stage.clientWidth !== width || stage.clientHeight !== height) {
      const first = width === 0;
      width = stage.clientWidth;
      height = stage.clientHeight;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Resizing empties the canvas, and the next frame can be a while off: draw it again now (the
      // very first size needs none: the first frame is on its way).
      if (!first) renderer.render(scene, camera);
    }
    target = progress();
  };
  measure();
  // Start where the page already is (a reload keeps its scroll position), not gliding from the top.
  let p = target;
  const onScroll = () => {
    target = progress();
  };
  addEventListener('scroll', onScroll, { passive: true });
  const sizes = new ResizeObserver(measure);
  sizes.observe(stage);
  sizes.observe(hero);

  /** Scrolls to the end of the story, where the download is. */
  const showEnd = () =>
    scrollTo(0, story.getBoundingClientRect().top + scrollY + story.offsetHeight - innerHeight);
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('a[href="#download"]')) return;
    event.preventDefault();
    showEnd();
    // Where a link to a place would leave the focus: on the download, not on the page body.
    end.querySelector<HTMLElement>('#download-link')?.focus({ preventScroll: true });
  };
  // The story is a pin: the block is already "in view", so the browser would never scroll to it.
  const onFocus = () => {
    if (!end.classList.contains('shown')) showEnd();
  };
  stage.addEventListener('click', onClick);
  end.addEventListener('focusin', onFocus);

  // ---- Each frame ----
  let drawn = '';
  const paint = (t: Frame) => {
    const picture = `${t.stop}:${t.hold.toFixed(3)}:${t.slide.toFixed(3)}`;
    if (picture === drawn) return;
    drawn = picture;
    if (t.slide > 0) {
      // The old screen slides up and out, the next comes in from below.
      const offset = ease(t.slide) * SCREEN.h;
      screenContext.save();
      screenContext.translate(0, -offset);
      drawScreen(screenContext, t.stop, 1);
      screenContext.restore();
      screenContext.save();
      screenContext.translate(0, SCREEN.h - offset);
      drawScreen(screenContext, (t.stop + 1) as ScreenIndex, 0);
      screenContext.restore();
    } else {
      drawScreen(screenContext, t.stop, t.hold / 0.78);
    }
    screenMap.needsUpdate = true;
  };

  const pose = (t: Frame, now: number) => {
    const side = wide.matches;
    const sway = Math.sin((t.stop + ease(clamp(t.local / 0.3))) * Math.PI) * 0.28;
    const arrive = 1 - out(t.intro);
    phone.rotation.set(
      0.06 - arrive * 0.35 + Math.sin(now / 2400) * 0.015,
      -0.32 + sway + arrive * -0.9 + ease(t.outro) * (Math.PI * 2 + 0.5),
      Math.sin(now / 3100) * 0.012,
    );
    phone.position.set(
      (side ? 1.65 : 0) * out(t.intro) * (1 - ease(t.outro)) + (side ? -1.7 : 0) * ease(t.outro),
      -6.5 * arrive + Math.sin(now / 1300) * 0.045 + (side ? 0 : 0.55),
      0,
    );
    phone.scale.setScalar(0.82 + 0.18 * out(t.intro));
    camera.position.set(
      0,
      0,
      side
        ? 7.4 - 0.4 * Math.sin(clamp((p - INTRO_END) / (OUTRO_START - INTRO_END)) * Math.PI)
        : 10.8,
    );
    shadow.position.x = phone.position.x;
    shadow.material.opacity = 0.08 * t.intro;
    sheen.offset.x = (p * 6) % 1;
  };

  const dress = (t: Frame) => {
    // The title scrolls away with the page, button and all: it is not faded before it is gone.
    hero.style.translate = `0 ${-scrollY}px`;
    hero.style.visibility = scrollY >= heroHeight ? 'hidden' : '';
    hint.style.opacity = String(1 - clamp(p / 0.02));
    stops.forEach((stop, i) => {
      const on = caption(t, i);
      stop.style.opacity = String(on);
      stop.style.translate = `0 ${(1 - on) * 24}px`;
    });
    const arrived = clamp((t.outro - 0.6) / 0.4);
    end.style.opacity = String(arrived);
    end.classList.toggle('shown', arrived > 0.5);
    blobs.forEach((blob, i) => {
      const [x, y] = DRIFT[i]!;
      blob.style.transform = `translate(${p * x}vw, ${p * y}vh)`;
    });
  };

  let frameId = 0;
  let lastFrame = 0;
  const frame = (now: number) => {
    frameId = requestAnimationFrame(frame);
    if (lastFrame && now - lastFrame < MIN_FRAME_MS) return;
    // The first frame after a start or a return from hiding has no time behind it: it stands still.
    p = glideStep(p, target, lastFrame ? now - lastFrame : 0);
    lastFrame = now;
    const t = timeline(p);
    paint(t);
    pose(t, now);
    dress(t);
    renderer.render(scene, camera);
  };

  // No frames while the tab is hidden, or the story is scrolled off.
  let onscreen = true;
  const sync = () => {
    const wanted = onscreen && !document.hidden;
    if (wanted && !frameId) {
      lastFrame = 0;
      frameId = requestAnimationFrame(frame);
    }
    if (!wanted && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
  const view = new IntersectionObserver((entries) => {
    onscreen = entries.at(-1)?.isIntersecting ?? true;
    sync();
  });
  view.observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();

  let done = false;
  const cleanUp = (contextLost = false) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', sync);
    stage.removeEventListener('click', onClick);
    end.removeEventListener('focusin', onFocus);
    sizes.disconnect();
    view.disconnect();
    document.documentElement.classList.remove('story-on');
    for (const el of [hero, end, ...stops]) el.removeAttribute('style');
    end.classList.remove('shown');
    canvas.remove();
    hint.remove();
    blobs.forEach((blob) => blob.remove());
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss();
  };
  // A phone can take the WebGL context back (low memory, a call): then the plain page returns.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cleanUp(true);
  });
  return () => cleanUp();
}

/** Builds the scene on `stage` and starts the story. Returns a cleanup that puts the page back. */
export function startStory(stage: HTMLElement): () => void {
  let cancelled = false;
  let cleanUp = () => {};
  // The canvas does not wait for fonts the way the page's text does, so the screens wait for Inter Tight.
  void loadScreenFont()
    .then(() => {
      if (!cancelled) cleanUp = run(stage);
    })
    // The page is whole without the story, so a story that cannot start is only worth a warning.
    .catch((error: unknown) => console.warn('The 3D story did not start:', error));
  return () => {
    cancelled = true;
    cleanUp();
  };
}
