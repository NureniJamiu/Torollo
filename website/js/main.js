/* Torollo marketing site — progressive enhancement only.
   Everything on the page works without this file:
   forms POST natively, nav links work, FAQ uses <details>. */

// REPLACE_FORM_ID: must match the form `action` attributes in the HTML.
const FORM_ENDPOINT = 'https://formspree.io/f/REPLACE_FORM_ID';

/* ---- Copy-to-clipboard buttons ---- */
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy || 'npx torollo start';
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'copied ✓';
    } catch {
      btn.textContent = 'select & copy';
    }
    setTimeout(() => { btn.textContent = 'copy'; }, 2000);
  });
});

/* ---- Mobile nav toggle ---- */
const nav = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
if (nav && navToggle) {
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  // close the menu after navigating to an anchor
  nav.querySelectorAll('.nav-links a').forEach((a) => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---- Plan pre-selection: "Join waitlist" buttons carry data-plan ---- */
document.querySelectorAll('[data-plan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.waitlist input[name="plan"]').forEach((input) => {
      input.value = btn.dataset.plan;
    });
  });
});

/* ---- Waitlist form: fetch submit with inline status ---- */
document.querySelectorAll('form.waitlist').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.parentElement.querySelector('.form-status');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('bad status');
      form.reset();
      if (status) {
        status.textContent = "You're on the list ✓";
        status.className = 'form-status ok';
      }
    } catch {
      if (status) {
        status.textContent = 'Something went wrong — please try again.';
        status.className = 'form-status err';
      }
      submit.disabled = false;
    }
  });
});
