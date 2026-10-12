// Copyright 2026- At Day. All rights reserved.
// The only script on the public site: the phone-width menu toggle. Everything else is plain HTML
// (details/summary for the FAQ, anchor links for navigation, links for the language switch).

(() => {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  for (const link of nav.querySelectorAll('a')) {
    link.addEventListener('click', () => setOpen(false));
  }
})();
