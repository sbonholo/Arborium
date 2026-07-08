// Arborium Cabins — shared site behavior (all pages)

// ── Review counts: single source of truth ──
// Update these numbers when the Airbnb review counts change; every
// mention across the site updates automatically. (Also update the
// "reviewCount" values in each page's JSON-LD block for Google.)
const SUNSET_REVIEW_COUNT = 18;  // Sunset Cabin listing (.rev-count)
const TOTAL_REVIEW_COUNT = 21;   // all listings combined (.rev-count-total)
document.querySelectorAll('.rev-count').forEach(el => el.textContent = SUNSET_REVIEW_COUNT);
document.querySelectorAll('.rev-count-total').forEach(el => el.textContent = TOTAL_REVIEW_COUNT);

// ── Nav background on scroll ──
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

// ── Hero parallax ──
const heroBg = document.getElementById('heroBg');
if (heroBg) {
  window.addEventListener('scroll', () => {
    if (window.scrollY < window.innerHeight) {
      heroBg.style.transform = `translateY(${window.scrollY * 0.35}px)`;
    }
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
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.activity-card, .room-card, .amenity, .review-card, .cabin-card, .why-item, .faq-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  observer.observe(el);
});

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
    ['.nf-grid', 'Nightfall Guest Cabin']
  ].forEach(([sel, label]) => {
    const imgs = Array.from(document.querySelectorAll(sel + ' img'));
    imgs.forEach((img, i) => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => openLightbox(imgs, i, label));
    });
  });

  function openLightbox(imgs, i, label) {
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
  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
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

// ── Conversion tracking: count booking clicks as GoatCounter events ──
// Shows in the GoatCounter dashboard as paths like "click-book-sunset".
document.querySelectorAll('a[href*="airbnb.com/rooms"], a[href^="mailto:"]').forEach(a => {
  a.addEventListener('click', () => {
    if (!window.goatcounter || !window.goatcounter.count) return;
    let name = 'click-email-inquiry';
    if (a.href.includes('1369606948743760150')) name = 'click-book-sunset';
    else if (a.href.includes('1668015378530902092')) name = 'click-book-stargazing';
    else if (a.href.includes('1668096280336036084')) name = 'click-book-nightfall';
    window.goatcounter.count({ path: name, title: name, event: true });
  });
});
