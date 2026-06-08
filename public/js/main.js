// ─── Mobile nav toggle ───────────────────────────────
const toggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navActions = document.querySelector('.nav-actions');
if (toggle) {
  toggle.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    navActions?.classList.toggle('open');
  });
}

// ─── Hero Carousel ────────────────────────────────────
(function () {
  const carousel = document.getElementById('heroCarousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.carousel-slide');
  const dots = carousel.querySelectorAll('.carousel-dot');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');

  let current = 0;
  let autoplayTimer = null;
  const INTERVAL = 4000; // ms between slides

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');

    // Restart Ken Burns + blur animation on the incoming slide's image layer
    const bg = slides[current].querySelector('.carousel-bg');
    if (bg) {
      bg.style.animation = 'none';
      bg.offsetHeight; // force reflow
      bg.style.animation = '';
    }
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAutoplay() {
    autoplayTimer = setInterval(next, INTERVAL);
  }

  function stopAutoplay() {
    clearInterval(autoplayTimer);
  }

  // Dot clicks
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      stopAutoplay();
      goTo(parseInt(dot.dataset.index));
      startAutoplay();
    });
  });

  // Arrow clicks
  nextBtn?.addEventListener('click', () => { stopAutoplay(); next(); startAutoplay(); });
  prevBtn?.addEventListener('click', () => { stopAutoplay(); prev(); startAutoplay(); });

  // Pause on hover
  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);

  // Touch/swipe support
  let touchStartX = 0;
  carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      stopAutoplay();
      dx < 0 ? next() : prev();
      startAutoplay();
    }
  });

  startAutoplay();
})();

// ─── Quotes Carousel ─────────────────────────────────
(function () {
  const qc = document.getElementById('quotesCarousel');
  if (!qc) return;
  const cards = qc.querySelectorAll('.quote-card:not(.quotes-nav)');
  const prev = document.getElementById('quotePrev');
  const next = document.getElementById('quoteNext');
  let idx = 0;

  function showQuote(n) {
    cards[idx].classList.remove('active');
    idx = (n + cards.length) % cards.length;
    cards[idx].classList.add('active');
  }

  prev?.addEventListener('click', () => showQuote(idx - 1));
  next?.addEventListener('click', () => showQuote(idx + 1));

  setInterval(() => showQuote(idx + 1), 6000);
})();

// ─── Nav Dropdowns ────────────────────────────────────
document.querySelectorAll('.nav-dropdown').forEach(function(item) {
  item.addEventListener('mouseenter', function() {
    this.classList.add('open');
  });
  item.addEventListener('mouseleave', function() {
    this.classList.remove('open');
  });
  // Touch / click support
  const toggle = item.querySelector('.nav-dropdown-toggle');
  if (toggle) {
    toggle.addEventListener('click', function(e) {
      if (window.innerWidth < 900) {
        e.preventDefault();
        item.classList.toggle('open');
      }
    });
  }
});
