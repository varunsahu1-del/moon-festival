/* ============================================================
   MOON FESTIVAL — CINEMATIC JS ENGINE
   ============================================================ */

const IMG = '2025 Goa Moon Retouched by Satya/';

/* ── Loading Screen ─────────────────────────────────────── */
const loader = document.querySelector('.loader');
if (loader) {
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hidden'), 1200);
  });
} else {
  // ensure body is visible even without loader
}

/* ── Custom Cursor ──────────────────────────────────────── */
const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');

if (dot && ring && window.matchMedia('(hover:hover)').matches) {
  let mx = -100, my = -100, rx = -100, ry = -100;
  let raf;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function animateCursor() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    raf = requestAnimationFrame(animateCursor);
  }
  raf = requestAnimationFrame(animateCursor);

  document.querySelectorAll('a, button, .gallery-item, .gallery-masonry-item, .drag-strip-item, .year-tab, .filter-btn, .faq-question').forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hovering'));
  });

  document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; });
}

/* ── Nav ────────────────────────────────────────────────── */
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

const currentPage = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(link => {
  if (link.getAttribute('href') === currentPage) link.classList.add('active');
});

const hamburger = document.querySelector('.nav-hamburger');
const mobileNav = document.querySelector('.nav-mobile');
const mobileClose = document.querySelector('.nav-mobile-close');
if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => mobileNav.classList.add('open'));
  mobileClose?.addEventListener('click', () => mobileNav.classList.remove('open'));
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('open')));
}

/* ── Scroll Observer (fade-up, clip-reveal, img-reveal) ─── */
const observerOpts = { threshold: 0.1, rootMargin: '0px 0px -60px 0px' };
const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      scrollObserver.unobserve(e.target);
    }
  });
}, observerOpts);

document.querySelectorAll('.fade-up, .clip-reveal, .img-reveal, .fade-in').forEach(el => scrollObserver.observe(el));

/* ── Word Split Headline ─────────────────────────────────── */
function splitWords(el) {
  if (!el) return;
  const html = el.innerHTML;
  // handle <em> and <br> tags
  const parts = html.split(/(<em>.*?<\/em>|<br\s*\/?>)/gi);
  el.innerHTML = parts.map(part => {
    if (/^<(em|br)/.test(part)) return part;
    return part.split(' ').filter(w => w).map(word => {
      return `<span class="split-word"><span class="split-word-inner">${word}</span></span><span class="word-gap"> </span>`;
    }).join('');
  }).join('');
}

// Split hero h1
const heroH1 = document.querySelector('.hero-content h1');
if (heroH1) {
  splitWords(heroH1);
  // Animate in after loader
  const triggerWords = () => {
    heroH1.querySelectorAll('.split-word-inner').forEach((w, i) => {
      setTimeout(() => w.classList.add('visible'), 300 + i * 80);
    });
  };
  if (loader) {
    setTimeout(triggerWords, 1400);
  } else {
    setTimeout(triggerWords, 200);
  }
}

/* ── Counter Animation ───────────────────────────────────── */
function animateCounter(el, target, suffix = '') {
  const duration = 1800;
  const start = performance.now();
  const num = parseInt(target);
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * num);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(update);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const el = e.target;
      const target = el.dataset.count;
      const suffix = el.dataset.suffix || '';
      animateCounter(el, target, suffix);
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));

/* ── Floating CTA ────────────────────────────────────────── */
const floatingCta = document.querySelector('.floating-cta');
const heroSection = document.querySelector('.hero, .page-hero');
if (floatingCta && heroSection) {
  const floatObserver = new IntersectionObserver(
    ([entry]) => floatingCta.classList.toggle('visible', !entry.isIntersecting),
    { threshold: 0 }
  );
  floatObserver.observe(heroSection);
}

/* ── Parallax Hero ────────────────────────────────────────── */
const heroBg = document.querySelector('.hero-img');
if (heroBg) {
  window.addEventListener('scroll', () => {
    if (window.scrollY < window.innerHeight * 1.5) {
      heroBg.style.transform = `scale(1.08) translateY(${window.scrollY * 0.15}px)`;
    }
  }, { passive: true });
}

/* ── Draggable Strip ─────────────────────────────────────── */
const strip = document.querySelector('.drag-strip');
if (strip) {
  let isDown = false, startX, scrollLeft;
  strip.addEventListener('mousedown', e => {
    isDown = true; strip.classList.add('dragging');
    startX = e.pageX - strip.offsetLeft;
    scrollLeft = strip.scrollLeft;
  });
  strip.addEventListener('mouseleave', () => { isDown = false; strip.classList.remove('dragging'); });
  strip.addEventListener('mouseup', () => { isDown = false; strip.classList.remove('dragging'); });
  strip.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - strip.offsetLeft;
    strip.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });

  // Touch
  let touchStartX, touchScrollLeft;
  strip.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].pageX;
    touchScrollLeft = strip.scrollLeft;
  }, { passive: true });
  strip.addEventListener('touchmove', e => {
    const dx = touchStartX - e.touches[0].pageX;
    strip.scrollLeft = touchScrollLeft + dx;
  }, { passive: true });
}

/* ── Gallery Year Tabs ───────────────────────────────────── */
const yearTabs = document.querySelectorAll('.year-tab');
const galleryYears = document.querySelectorAll('.gallery-year');
yearTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const year = tab.dataset.year;
    yearTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    galleryYears.forEach(y => y.classList.remove('active'));
    tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
    document.querySelector(`.gallery-year[data-year="${year}"]`)?.classList.add('active');
  });
});

/* ── Lightbox ────────────────────────────────────────────── */
const lightbox = document.querySelector('.lightbox');
const lightboxImg = document.querySelector('.lightbox-img');
let currentLbItems = [], currentLbIdx = 0;

document.querySelectorAll('.gallery-masonry-item, .gallery-item').forEach((item, idx) => {
  item.addEventListener('click', () => {
    const src = item.dataset.src || item.querySelector('img')?.src;
    if (!src || !lightbox) return;
    // collect siblings
    const parent = item.closest('.gallery-masonry, .gallery-year');
    if (parent) {
      const siblings = [...parent.querySelectorAll('.gallery-masonry-item img, .gallery-item img')];
      currentLbItems = siblings.map(img => img.src);
      currentLbIdx = siblings.findIndex(img => img.src === src);
    }
    openLightbox(src);
  });
});

function openLightbox(src) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox?.classList.remove('open');
  document.body.style.overflow = '';
}
function lbNext() {
  if (!currentLbItems.length) return;
  currentLbIdx = (currentLbIdx + 1) % currentLbItems.length;
  lightboxImg.src = currentLbItems[currentLbIdx];
}
function lbPrev() {
  if (!currentLbItems.length) return;
  currentLbIdx = (currentLbIdx - 1 + currentLbItems.length) % currentLbItems.length;
  lightboxImg.src = currentLbItems[currentLbIdx];
}

document.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.querySelector('.lb-prev')?.addEventListener('click', lbPrev);
document.querySelector('.lb-next')?.addEventListener('click', lbNext);
document.addEventListener('keydown', e => {
  if (!lightbox?.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'ArrowLeft') lbPrev();
});

/* ── Artist Filter ───────────────────────────────────────── */
const filterBtns = document.querySelectorAll('.filter-btn');
const artistCards = document.querySelectorAll('.artist-card');
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    artistCards.forEach(card => {
      const visible = filter === 'all' || card.dataset.discipline === filter;
      card.style.display = visible ? '' : 'none';
    });
  });
});

/* ── FAQ Accordion ───────────────────────────────────────── */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const answer = btn.nextElementSibling;
    const isOpen = answer.classList.contains('open');
    document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('open'));
    document.querySelectorAll('.faq-question').forEach(q => q.classList.remove('open'));
    if (!isOpen) { answer.classList.add('open'); btn.classList.add('open'); }
  });
});

/* ── Magnetic Buttons ────────────────────────────────────── */
document.querySelectorAll('.btn-magnetic').forEach(wrap => {
  const btn = wrap.querySelector('.btn');
  wrap.addEventListener('mousemove', e => {
    if (!btn) return;
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
  });
  wrap.addEventListener('mouseleave', () => {
    if (btn) btn.style.transform = '';
  });
});
