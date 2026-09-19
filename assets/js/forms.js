// Arborium Cabins — lead forms (waitlist / cabin updates)
//
// FORM_ENDPOINT: URL that accepts a JSON POST with every form field (FormSubmit
// AJAX: https://formsubmit.co/ajax/<email>; hidden _cc/_subject/_captcha/_template
// fields ride along). Leave empty to fall back to a pre-filled mailto:.
// NOTE: FormSubmit must be activated once from the inbox after the first submit.
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/36e7d69d9910fa61eacefdf6e63328b6'; // FormSubmit alias (activated)
const FORM_FALLBACK_EMAIL = 'info@arborium.app';

(function () {
  const forms = document.querySelectorAll('form.lead-form');
  if (!forms.length) return;

  function setStatus(form, msg, ok) {
    const el = form.querySelector('.lead-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-error', ok === false);
  }

  function success(form) {
    const msg = form.dataset.success || "You're on the list. We'll email you first.";
    form.innerHTML = '<div class="lead-success" role="status"><strong>Thank you.</strong> ' + msg + '</div>';
  }

  function fallbackMailto(form, data) {
    const subject = form.dataset.subject || 'Arborium Cabins — cabin updates';
    const lines = [
      'Email: ' + data.email,
      data.checkin ? 'Check-in: ' + data.checkin : null,
      data.checkout ? 'Check-out: ' + data.checkout : null,
      data.guests ? 'Guests: ' + data.guests : null,
      data.message ? '' : null,
      data.message ? 'Message: ' + data.message : null,
      '', 'Sent from ' + location.href
    ].filter(l => l !== null);
    const href = 'mailto:' + (form.dataset.to || FORM_FALLBACK_EMAIL) +
      '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
    window.location.href = href;
    form.innerHTML = '<div class="lead-success" role="status"><strong>Almost there.</strong> Your email app should have opened with everything filled in — just hit send. If it didn\'t, write to <a href="mailto:' + (form.dataset.to || FORM_FALLBACK_EMAIL) + '">' + (form.dataset.to || FORM_FALLBACK_EMAIL) + '</a>.</div>';
  }

  forms.forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.form = form.dataset.lead || 'lead';
      data.email = (data.email || '').toString().trim();
      data.message = (data.message || '').toString().trim();
      data.page = location.href;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        setStatus(form, 'Please enter a valid email address.', false);
        form.querySelector('[name=email]').focus();
        return;
      }
      if (data.checkin && data.checkout && data.checkout <= data.checkin) {
        setStatus(form, 'Check-out must be after check-in.', false);
        return;
      }
      if (window.track) window.track('waitlist-submit');
      if (!FORM_ENDPOINT) { fallbackMailto(form, data); return; }
      const btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Sending…'; }
      try {
        const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data) });
        // Any 2xx counts as delivered. FormSubmit answers {success: "true"|"false", message}
        // as strings; a "false" body on a 2xx is logged but never sends the visitor to mailto.
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const out = await r.json().catch(() => ({}));
        if (out && String(out.success) === 'false' && window.console) console.warn('FormSubmit:', out.message || out);
        success(form);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
        setStatus(form, 'Something went wrong. Opening your email app instead…', false);
        setTimeout(() => fallbackMailto(form, data), 900);
      }
    });
  });
})();
