// Arborium Cabins — shared site behavior (all pages)

// ── Anchor handling ──
// Landing on a #hash must JUMP instantly (a load-time smooth-scroll
// animation leaves stale paint strips under the toolbar in Chrome and
// can land mid-section). Smooth scrolling is enabled only after load,
// so it applies to in-page clicks — and once images/fonts have loaded,
// we re-align the anchor target in case late layout shifted it.
window.addEventListener('load', () => {
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView();
  }
  requestAnimationFrame(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  });
});

// ── Reviews: single source of truth is /assets/data/reviews.json ──
// host.count fills every .rev-count-total; host.rating fills .host-rating;
// [data-cabin-rating] / [data-cabin-count] / [data-cabin-badge] take the
// per-cabin numbers; [data-reviews="sunset|stargazing|all"] gets the cards.
// (JSON-LD "reviewCount" values in each page's <head> must be updated by hand.)
const TOTAL_REVIEW_COUNT = 36; // fallback shown until the JSON loads
document.querySelectorAll('.rev-count, .rev-count-total').forEach(el => el.textContent = TOTAL_REVIEW_COUNT);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
fetch('/assets/data/reviews.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(data => {
  if (!data) return;
  const host = data.host || {};
  if (host.count) document.querySelectorAll('.rev-count, .rev-count-total').forEach(el => el.textContent = host.count);
  if (host.rating) document.querySelectorAll('.host-rating').forEach(el => el.textContent = host.rating.toFixed(2));
  const cabins = data.cabins || {};
  document.querySelectorAll('[data-cabin-rating]').forEach(el => { const c = cabins[el.dataset.cabinRating]; if (c) el.textContent = Number.isInteger(c.rating) ? c.rating.toFixed(1) : c.rating; });
  document.querySelectorAll('[data-cabin-count]').forEach(el => { const c = cabins[el.dataset.cabinCount]; if (c) el.textContent = c.count; });
  document.querySelectorAll('[data-cabin-badge]').forEach(el => { const c = cabins[el.dataset.cabinBadge]; if (c && c.badge) { el.textContent = c.badge; el.hidden = false; } else el.hidden = true; });
  const names = { sunset: 'Sunset Cabin', stargazing: 'Stargazing Cabin', nightfall: 'Nightfall Guest Cabin', 'sugar-creek': 'Sugar Creek Cabin' };
  document.querySelectorAll('[data-reviews]').forEach(grid => {
    const which = grid.dataset.reviews, limit = +grid.dataset.limit || 99, showCabin = grid.dataset.showCabin === 'true';
    const list = (data.reviews || []).filter(r => which === 'all' || r.cabin === which).slice(0, limit);
    if (!list.length) return;
    grid.innerHTML = list.map(r => {
      const meta = [r.author + (r.from ? ' · ' + r.from : ''), showCabin ? names[r.cabin] || '' : '', r.label].filter(Boolean).join(' &nbsp;·&nbsp; ');
      return '<div class="review-card"><div class="review-stars">' + '★'.repeat(r.stars || 5) + '</div><p class="review-text">"' + esc(r.text) + '"</p><div class="review-author">' + esc(meta).replace(/&amp;nbsp;/g, '&nbsp;') + (r.pet ? ' <span class="review-pet" title="Stayed with a dog">🐾</span>' : '') + '</div></div>';
    }).join('');
    if (window.revealNew) window.revealNew(grid.querySelectorAll('.review-card'));
  });
});

// ── Nav background on scroll ──
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

// ── Floating book bar — appears once the reader is well past the hero ──
const bookFloat = document.getElementById('bookFloat');
if (bookFloat) {
  window.addEventListener('scroll', () => {
    bookFloat.classList.toggle('visible', window.scrollY > window.innerHeight * 1.4);
  }, { passive: true });
}

// ── Mobile nav ──
const hamburger = document.getElementById('navHamburger');
const mobileNav = document.getElementById('navMobile');
function toggleNav() {
  const open = mobileNav.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeNav() {
  mobileNav.classList.remove('open');
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
if (hamburger && mobileNav) hamburger.addEventListener('click', toggleNav);
window.closeNav = closeNav;

// ── FAQ accordion ──
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
  btn.setAttribute('aria-expanded', !wasOpen);
}
window.toggleFaq = toggleFaq;

// ── Scroll-triggered fade-ins ──
// Reveal well before elements enter the viewport (rootMargin extends the
// trigger zone 40% below the fold) so content is never blank when seen.
const revealEls = document.querySelectorAll('.activity-card, .room-card, .amenity, .review-card, .cabin-card, .why-item, .faq-item');
const reveal = el => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      reveal(e.target);
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0, rootMargin: '0px 0px 40% 0px' });
revealEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(12px)';
  el.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
  observer.observe(el);
});
// Cards injected later (reviews from JSON) get the same treatment.
window.revealNew = els => els.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(12px)'; el.style.transition = 'opacity 0.45s ease, transform 0.45s ease'; observer.observe(el); setTimeout(() => reveal(el), 1500); });
// Safety net: nothing stays hidden even if the observer never fires.
setTimeout(() => revealEls.forEach(reveal), 2500);

// ── Gallery lightbox: click a photo to view it large, arrows to navigate ──
const lb = document.getElementById('lightbox');
if (lb) {
  const lbImg = document.getElementById('lbImg');
  const lbCounter = document.getElementById('lbCounter');
  const lbLabel = document.getElementById('lbLabel');
  let lbGroup = [], lbIndex = 0;

  [
    ['.gallery-grid', 'Sunset Cabin'],
    ['.sg-grid', 'Stargazing Cabin'],
    ['.nf-grid', 'Nightfall Guest Cabin'],
    ['.property-map-figure', 'Arborium property map']
  ].forEach(([sel, label]) => {
    const grid = document.querySelector(sel);
    if (!grid) return;
    label = grid.dataset.lightboxLabel || label;
    const imgs = Array.from(grid.querySelectorAll('img'));
    imgs.forEach((img, i) => {
      img.style.cursor = 'zoom-in';
      img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'View larger: ' + (img.alt || label));
      img.addEventListener('click', () => openLightbox(imgs, i, label));
      img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(imgs, i, label); } });
    });
  });

  function openLightbox(imgs, i, label) {
    lbReturnFocus = imgs[i];
    lbGroup = imgs; lbIndex = i;
    lbLabel.textContent = label;
    showLbPhoto();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function showLbPhoto() {
    const img = lbGroup[lbIndex];
    lbImg.src = img.src.replace('im_w=720', 'im_w=1200');
    lbImg.alt = img.alt;
    lbCounter.textContent = (lbIndex + 1) + ' / ' + lbGroup.length;
  }
  function lbNext(dir) {
    lbIndex = (lbIndex + dir + lbGroup.length) % lbGroup.length;
    showLbPhoto();
  }
  let lbReturnFocus = null;
  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    if (lbReturnFocus && lbReturnFocus.focus) lbReturnFocus.focus();
  }
  window.lbNext = lbNext;
  window.closeLightbox = closeLightbox;

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') lbNext(1);
    if (e.key === 'ArrowLeft') lbNext(-1);
  });
  let lbTouchX = null;
  lb.addEventListener('touchstart', e => { lbTouchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (lbTouchX === null) return;
    const dx = e.changedTouches[0].clientX - lbTouchX;
    if (Math.abs(dx) > 50) lbNext(dx < 0 ? 1 : -1);
    lbTouchX = null;
  }, { passive: true });
}

// ── Conversion tracking: GoatCounter events ──
// Dashboard shows them as paths: book-airbnb-<cabin>, waitlist-submit,
// check-dates-<cabin>, email-click.
window.track = name => { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); };
const CABIN_BY_LISTING = {
  '1369606948743760150': 'sunset', '1668015378530902092': 'stargazing', '1668096280336036084': 'nightfall',
  '1711593580951571625': 'whole-property', '1708103105692478664': 'sunset-nightfall', '1772724604383701053': 'sugar-creek'
};
document.querySelectorAll('a[href*="airbnb.com/rooms"], a[href^="mailto:"]').forEach(a => {
  a.addEventListener('click', () => {
    if (a.href.startsWith('mailto:')) return window.track('email-click');
    const id = (a.href.match(/rooms\/(\d+)/) || [])[1];
    window.track('book-airbnb-' + (CABIN_BY_LISTING[id] || 'unknown'));
  });
});

// ── Scroll depth: one event per page view at 25/50/75/100% ──
(function () {
  const marks = [25, 50, 75, 100], sent = new Set();
  const check = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight; if (h <= 0) return;
    const pct = Math.round((window.scrollY / h) * 100);
    marks.forEach(m => { if (pct >= m && !sent.has(m)) { sent.add(m); if (window.track) window.track('scroll-' + m + '-' + (location.pathname.replace(/\W+/g, '') || 'home')); } });
  };
  window.addEventListener('scroll', check, { passive: true }); window.addEventListener('load', check);
})();
