/**
 * hero-banner.js
 * Lightweight auto-rotating slideshow with dot navigation.
 * No dependencies. Works with hero-banner.html partial.
 */
(function () {
  'use strict';

  var INTERVAL = 7000;   // ms between slides — change to taste
  var PAUSE_ON_HOVER = true;

  var banner = document.querySelector('.hero-banner');
  if (!banner) return;

  var slides = banner.querySelectorAll('.hero-slide');
  var dots   = banner.querySelectorAll('.hero-dot');
  if (slides.length < 2) return;  // nothing to rotate

  var current = 0;
  var timer   = null;

  function goTo(index) {
    slides[current].classList.remove('is-active');
    dots[current] && dots[current].classList.remove('is-active');
    dots[current] && dots[current].setAttribute('aria-selected', 'false');

    current = (index + slides.length) % slides.length;

    slides[current].classList.add('is-active');
    dots[current] && dots[current].classList.add('is-active');
    dots[current] && dots[current].setAttribute('aria-selected', 'true');
  }

  function next() {
    goTo(current + 1);
  }

  function start() {
    timer = setInterval(next, INTERVAL);
  }

  function stop() {
    clearInterval(timer);
  }

  /* dot clicks */
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      stop();
      goTo(parseInt(dot.dataset.index, 10));
      start();
    });
  });

  /* pause on hover */
  if (PAUSE_ON_HOVER) {
    banner.addEventListener('mouseenter', stop);
    banner.addEventListener('mouseleave', start);
  }

  /* keyboard: left/right arrows when banner is focused */
  banner.setAttribute('tabindex', '0');
  banner.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { stop(); next();             start(); }
    if (e.key === 'ArrowLeft')  { stop(); goTo(current - 1); start(); }
  });

  start();
})();
