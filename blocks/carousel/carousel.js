// blocks/carousel/carousel.js
// Accessible, vanilla JS carousel for AEM EDS
// Features: arrows, dots, autoplay, pause on hover/focus, keyboard + swipe, per-view

const toBool = (clsSet, name) => clsSet.has(name);
const getNumberOpt = (clsSet, prefix, fallback) => {
  for (const c of clsSet) {
    if (c.startsWith(`${prefix}=`)) {
      const n = parseInt(c.split('=')[1], 10);
      return Number.isFinite(n) ? n : fallback;
    }
  }
  return fallback;
};

function buildSlides(block) {
  // Each logical slide is represented by two consecutive rows in the authoring table
  // (image row + caption row). By publish time, the DOM is flattening to a list of elements.
  // We treat each top-level element as a potential part of a slide:
  const children = [...block.children];
  const slides = [];

  // Heuristic: group nodes in pairs (image-like + caption-like). Adjust if your content model differs.
  for (let i = 0; i < children.length; i += 2) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    // Image/content node
    if (children[i]) slide.append(children[i]);
    // Caption/content node (optional)
    if (children[i + 1]) {
      const captionWrap = document.createElement('div');
      captionWrap.className = 'carousel-caption';
      captionWrap.append(children[i + 1]);
      slide.append(captionWrap);
    }
    slides.push(slide);
  }
  return slides;
}

function applyA11y(root, label = 'Carousel') {
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-label', label);
}

function buildUI(block, count, showArrows, showDots) {
  const ui = document.createElement('div');
  ui.className = 'carousel-ui';

  let prevBtn; let nextBtn; let dotsWrap;

  if (showArrows) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'carousel-arrow prev';
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.innerHTML = '<span aria-hidden="true">‹</span>';
    nextBtn = document.createElement('button');
    nextBtn.className = 'carousel-arrow next';
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.innerHTML = '<span aria-hidden="true">›</span>';
    ui.append(prevBtn, nextBtn);
  }

  if (showDots) {
    dotsWrap = document.createElement('div');
    dotsWrap.className = 'carousel-dots';
    for (let i = 0; i < count; i += 1) {
      const btn = document.createElement('button');
      btn.className = 'carousel-dot';
      btn.type = 'button';
      btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dotsWrap.append(btn);
    }
    ui.append(dotsWrap);
  }

  return { ui, prevBtn, nextBtn, dotsWrap };
}

function attachKeyboard(root, goPrev, goNext, goIndex, getIndex, getCount) {
  root.addEventListener('keydown', (e) => {
    const key = e.key;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      e.preventDefault();
      if (key === 'ArrowLeft') goPrev();
      if (key === 'ArrowRight') goNext();
      if (key === 'Home') goIndex(0);
      if (key === 'End') goIndex(getCount() - 1);
    }
  });
}

function attachSwipe(track, onSwipe) {
  let startX = 0;
  let isDown = false;

  track.addEventListener('pointerdown', (e) => {
    isDown = true;
    startX = e.clientX;
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointerup', (e) => {
    if (!isDown) return;
    isDown = false;
    const dx = e.clientX - startX;
    const threshold = 40; // px
    if (dx > threshold) onSwipe('prev');
    else if (dx < -threshold) onSwipe('next');
  });
}

export default function decorate(block) {
  const cls = new Set([...block.classList]);
  // Options from block classes (coming from "(...)" in the author table)
  const autoplay = toBool(cls, 'autoplay');
  const arrows = toBool(cls, 'arrows') || !cls.has('no-arrows');
  const dots = toBool(cls, 'dots') || !cls.has('no-dots');
  const interval = getNumberOpt(cls, 'interval', 5000);
  const perView = Math.max(1, getNumberOpt(cls, 'per-view', 1));

  // Prepare DOM
  const slides = buildSlides(block);
  block.innerHTML = '';
  block.classList.add('carousel');

  const viewport = document.createElement('div');
  viewport.className = 'carousel-viewport';
  const track = document.createElement('div');
  track.className = 'carousel-track';
  viewport.append(track);
  block.append(viewport);

  slides.forEach((s) => {
    s.setAttribute('role', 'group');
    s.setAttribute('aria-roledescription', 'slide');
    s.setAttribute('aria-hidden', 'true');
    track.append(s);
  });

  applyA11y(block, block.dataset.label || 'Carousel');

  const { ui, prevBtn, nextBtn, dotsWrap } = buildUI(block, slides.length, arrows, dots);
  block.append(ui);

  let idx = 0;
  const count = slides.length;

  const update = () => {
    // slide width is 100% / perView
    const pct = (100 / perView) * idx;
    track.style.transform = `translateX(-${pct}%)`;
    slides.forEach((s, i) => {
      const visible = i >= idx && i < idx + perView;
      s.setAttribute('aria-hidden', String(!visible));
      s.setAttribute('aria-current', visible ? 'true' : 'false');
    });
    if (dotsWrap) {
      [...dotsWrap.children].forEach((d, i) => d.classList.toggle('active', i === idx));
    }
  };

  const goIndex = (i) => {
    idx = Math.max(0, Math.min(i, Math.max(0, count - perView)));
    update();
  };
  const goPrev = () => goIndex(idx - 1);
  const goNext = () => goIndex(idx + 1);

  // Controls
  if (prevBtn) prevBtn.addEventListener('click', goPrev);
  if (nextBtn) nextBtn.addEventListener('click', goNext);
  if (dotsWrap) {
    [...dotsWrap.children].forEach((dot, i) => {
      dot.addEventListener('click', () => goIndex(i));
    });
  }

  // Keyboard
  attachKeyboard(block, goPrev, goNext, goIndex, () => idx, () => count);

  // Swipe
  attachSwipe(track, (dir) => (dir === 'prev' ? goPrev() : goNext()));

  // Autoplay (pause on hover/focus)
  let timer;
  const start = () => {
    if (!autoplay) return;
    stop();
    timer = setInterval(() => {
      if (idx >= count - perView) goIndex(0);
      else goNext();
    }, interval);
  };
  const stop = () => timer && clearInterval(timer);

  if (autoplay) {
    start();
    block.addEventListener('mouseenter', stop);
    block.addEventListener('mouseleave', start);
    block.addEventListener('focusin', stop);
    block.addEventListener('focusout', start);
  }

  // Resize safety: clamp index and rerender
  const onResize = () => update();
  window.addEventListener('resize', onResize);

  // Initial render
  goIndex(0);
}