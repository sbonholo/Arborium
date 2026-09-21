// Arborium Cabins — "Check dates" (Airbnb deep link) + availability strip
//
// The strip reads /assets/data/availability.json, written every 6 hours by
// .github/workflows/availability.yml from the Airbnb iCal feeds. If a cabin
// has no data yet, only the "Check dates" form is shown.
(function () {
  const LISTINGS = {
    'sunset':           { id: '1369606948743760150', name: 'Sunset Cabin', max: 6 },
    'stargazing':       { id: '1668015378530902092', name: 'Stargazing Cabin', max: 8 },
    'sunset-nightfall': { id: '1708103105692478664', name: 'Sunset + Nightfall', max: 10 },
    'whole-property':   { id: '1711593580951571625', name: 'Whole property (3 cabins)', max: 18 },
    // Sugar Creek Cabin: Airbnb listing 1772724604383701053 is unlisted until Fall 2027.
    'sugar-creek':      { id: '', name: 'Sugar Creek Cabin', max: 8 }
  };
  const DAYS = 90;
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Set sensible min dates on every date input
  document.querySelectorAll('input[type=date]').forEach(i => { if (!i.min) i.min = iso(today); });

  // ── Check dates → Airbnb deep link ──
  document.querySelectorAll('form.dates-form').forEach(form => {
    const cabinSel = form.querySelector('select[name=cabin]');
    const guests = form.querySelector('input[name=adults]');
    const cabinKey = () => cabinSel ? cabinSel.value : form.dataset.cabin;
    const applyMax = () => { const l = LISTINGS[cabinKey()]; if (l && guests) { guests.max = l.max; if (+guests.value > l.max) guests.value = l.max; } };
    applyMax();
    if (cabinSel) cabinSel.addEventListener('change', () => { applyMax(); renderStrip(form.parentElement.querySelector('.avail-strip'), cabinKey()); });
    const ci = form.querySelector('input[name=checkin]'), co = form.querySelector('input[name=checkout]');
    if (ci && co) ci.addEventListener('change', () => { co.min = ci.value; if (co.value && co.value <= ci.value) co.value = ''; });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const key = cabinKey(), l = LISTINGS[key];
      if (!l || !l.id) return;
      const fd = new FormData(form);
      const p = new URLSearchParams();
      if (fd.get('checkin')) p.set('check_in', fd.get('checkin'));
      if (fd.get('checkout')) p.set('check_out', fd.get('checkout'));
      if (fd.get('adults')) p.set('adults', fd.get('adults'));
      if (window.track) window.track('check-dates-' + key);
      window.open('https://www.airbnb.com/rooms/' + l.id + (p.toString() ? '?' + p.toString() : ''), '_blank', 'noopener');
    });
  });

  // ── Availability strip ──
  let dataPromise = null;
  function loadData() {
    if (!dataPromise) dataPromise = fetch('/assets/data/availability.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    return dataPromise;
  }
  function renderStrip(el, key) {
    if (!el) return;
    el.innerHTML = ''; el.hidden = true;
    loadData().then(data => {
      const cab = data && data.cabins && data.cabins[key];
      if (!cab || !cab.updated) return;
      const busy = (cab.busy || []).map(([s, e]) => [s, e]);
      const isBusy = d => busy.some(([s, e]) => d >= s && d < e);
      const months = [];
      let html = '<div class="avail-head"><span>Next ' + DAYS + ' days</span><span class="avail-legend"><i class="avail-free"></i> Open <i class="avail-busy"></i> Booked</span></div><div class="avail-days">';
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        const k = iso(d), m = d.toLocaleString('en-US', { month: 'short' });
        if (d.getDate() === 1 || i === 0) months.push(m);
        html += '<span class="avail-day' + (isBusy(k) ? ' is-busy' : '') + (d.getDate() === 1 ? ' is-month' : '') + '" title="' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (isBusy(k) ? ' · booked' : ' · open') + '"' + (d.getDate() === 1 ? ' data-month="' + m + '"' : '') + '></span>';
      }
      html += '</div><div class="avail-foot">Synced from Airbnb ' + new Date(cab.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '. Final availability and pricing on Airbnb.</div>';
      el.innerHTML = html; el.hidden = false;
    });
  }
  document.querySelectorAll('.avail-strip[data-availability]').forEach(el => { if (el.dataset.availability) renderStrip(el, el.dataset.availability); });

  // ── Dates modal (floating bar "Check dates") ──
  const modal = document.getElementById('datesModal');
  if (modal) {
    let lastFocus = null;
    const focusables = () => Array.from(modal.querySelectorAll('button, [href], input, select, textarea')).filter(e => !e.disabled && e.offsetParent !== null);
    const open = key => {
      lastFocus = document.activeElement;
      const sel = modal.querySelector('select[name=cabin]');
      if (sel && key && LISTINGS[key] && LISTINGS[key].id) { sel.value = key; sel.dispatchEvent(new Event('change')); }
      else if (sel) renderStrip(modal.querySelector('.avail-strip'), sel.value);
      modal.hidden = false; document.body.style.overflow = 'hidden';
      const first = modal.querySelector('input[name=checkin]'); if (first) first.focus();
    };
    const close = () => { modal.hidden = true; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); };
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.querySelectorAll('[data-open-dates]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(b.dataset.openDates || document.body.dataset.cabin); }));
    modal.querySelectorAll('[data-close-dates]').forEach(b => b.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
  }
})();
