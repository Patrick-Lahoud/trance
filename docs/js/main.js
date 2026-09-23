/* Entry point: nav, official icon injection, download links, reveal on scroll,
   section wiring. */
import { initHero } from './hero.js?v=28';
import { initSections } from './sections.js?v=28';
import { initDashboard } from './dashboard.js?v=28';
import { iconSVG } from './data.js?v=28';

/* ---------- Nav ---------- */
const nav = document.getElementById('nav');
function onScroll() {
  nav.classList.toggle('scrolled', window.scrollY > 24);
}
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* Inject the official icon wherever the brand mark appears. */
document.querySelectorAll('.trance-icon').forEach((host) => {
  const size = host.classList.contains('trance-icon-lg') ? 56 : host.classList.contains('trance-icon-xs') ? 16 : host.classList.contains('trance-icon-sm') ? 22 : 26;
  host.innerHTML = iconSVG(size);
  host.classList.add('has-svg');
});

/* ---------- Download links (NSIS installer shipped beside the site) ---------- */
const INSTALLER = './Trance-Setup-1.0.0.exe';
document.querySelectorAll('a[data-dl]').forEach((a) => {
  a.setAttribute('href', INSTALLER);
  a.setAttribute('download', '');
});


/* ---------- Reveal on scroll ---------- */
const revealIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealIO.unobserve(en.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
);
document.querySelectorAll('.reveal').forEach((el) => revealIO.observe(el));

/* Story sequence lines */
const seqIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        seqIO.unobserve(en.target);
      }
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll('.seq').forEach((el, i) => setTimeout(() => seqIO.observe(el), i * 120));

/* Privacy lines land one at a time */
const pIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        const li = en.target;
        const siblings = [...li.parentElement.children].filter((x) => x.classList.contains('reveal'));
        const delay = siblings.indexOf(li) * 160;
        setTimeout(() => li.classList.add('in'), delay);
        pIO.unobserve(li);
      }
    });
  },
  { threshold: 0.4 }
);
document.querySelectorAll('.privacy-list .reveal').forEach((el) => pIO.observe(el));

/* ---------- Init sections ---------- */
initHero();
initSections();
initDashboard();
