// ─── Scroll Reveal (Intersection Observer) ───────────
(function () {
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  // Auto-tag common elements for reveal
  document.querySelectorAll(
    '.section-header, .plan-card, .feature-card, .value-card, .team-thumb, ' +
    '.pub-calc-inputs, .pub-calc-summary, .two-col, .contact-item, ' +
    '.stat-card, .dash-section, .reveal, .stagger'
  ).forEach(function (el, i) {
    if (!el.classList.contains('reveal') && !el.classList.contains('stagger') && !el.classList.contains('section-header')) {
      el.classList.add('reveal');
      // Stagger cards in grids
      el.style.transitionDelay = (i % 6) * 0.08 + 's';
    }
    observer.observe(el);
  });
})();

// ─── Counter Animation ────────────────────────────────
(function () {
  function animateCounter(el) {
    const text = el.textContent.trim();
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num === 0) return;
    const suffix = text.replace(/[0-9.,]/g, '').trim();
    const duration = 1400;
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(ease * num * 10) / 10;
      el.textContent = (Number.isInteger(num) ? Math.round(current) : current) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.c-stat strong, .stat-value, [data-count]').forEach(animateCounter);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.carousel-stats, .stats-row').forEach(function (el) {
    counterObserver.observe(el);
  });
})();

// ─── Mobile nav drawer ───────────────────────────────
(function () {
  const toggle  = document.getElementById('navToggle');
  const drawer  = document.getElementById('navDrawer');
  const overlay = document.getElementById('navOverlay');
  if (!toggle || !drawer) return;

  function openDrawer() {
    toggle.classList.add('open');
    drawer.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  }

  function closeDrawer() {
    toggle.classList.remove('open');
    drawer.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    // Collapse all open sub-menus
    drawer.querySelectorAll('.nav-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  }

  toggle.addEventListener('click', function () {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  });

  overlay?.addEventListener('click', closeDrawer);

  // Accordion: dropdown toggles
  drawer.querySelectorAll('.nav-dropdown-toggle').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (window.innerWidth > 768) return;
      e.preventDefault();
      var li = btn.closest('.nav-dropdown');
      var wasOpen = li.classList.contains('open');
      drawer.querySelectorAll('.nav-dropdown').forEach(function (d) { d.classList.remove('open'); });
      if (!wasOpen) li.classList.add('open');
    });
  });

  // Close drawer when a non-toggle link is clicked
  drawer.querySelectorAll('a:not(.nav-dropdown-toggle)').forEach(function (a) {
    a.addEventListener('click', closeDrawer);
  });

  // Close on resize to desktop
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) closeDrawer();
  });
})();

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
  const INTERVAL = 9000; // ms between slides

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

// ─── Public Investment Calculator ────────────────────
(function () {
  const amountInput = document.getElementById('pubCalcAmount');
  const slider = document.getElementById('pubCalcSlider');
  const planSelect = document.getElementById('pubCalcPlan');
  const rateVal = document.getElementById('pubCalcRateVal');
  if (!amountInput || !planSelect) return;

  const body = document.getElementById('pubCalcBody');
  const empty = document.getElementById('pubCalcEmpty');

  function fmt(n) {
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function calculate() {
    const amount = parseFloat(amountInput.value) || 0;
    const val = planSelect.value;
    if (!val || amount <= 0) {
      body.style.display = 'none';
      empty.style.display = 'block';
      rateVal.textContent = '—';
      return;
    }
    const [rate, duration, planName] = val.split('|');
    const r = parseFloat(rate);
    const d = parseInt(duration);
    const interest = amount * (r / 100) * (d / 365);
    const payout = amount + interest;
    const maturity = new Date();
    maturity.setDate(maturity.getDate() + d);

    rateVal.textContent = r;
    document.getElementById('pcInvested').textContent = fmt(amount);
    document.getElementById('pcPlan').textContent = planName;
    document.getElementById('pcRate').textContent = r + '%';
    document.getElementById('pcDuration').textContent = d + ' days';
    document.getElementById('pcMaturity').textContent = maturity.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    document.getElementById('pcInterest').textContent = fmt(interest);
    document.getElementById('pcPayout').textContent = fmt(payout);

    empty.style.display = 'none';
    body.style.display = 'flex';
  }

  amountInput.addEventListener('input', function () {
    slider.value = this.value;
    calculate();
  });
  slider.addEventListener('input', function () {
    amountInput.value = this.value;
    calculate();
  });
  planSelect.addEventListener('change', calculate);
})();

// ─── Scroll Progress Bar + Nav Glass ─────────────────
(function () {
  var progress = document.getElementById('scrollProgress');
  var header   = document.querySelector('.site-header');

  function onScroll() {
    var scrolled = window.scrollY;
    var total    = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
    if (header)   header.classList.toggle('scrolled', scrolled > 60);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load
})();

// ─── Animate ribbon stats on enter ───────────────────
(function () {
  var ribbonObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-count]').forEach(function (el) {
          var target = parseInt(el.dataset.count, 10);
          if (isNaN(target)) return;
          var start = performance.now();
          var dur   = 1200;
          (function step(now) {
            var p = Math.min((now - start) / dur, 1);
            var ease = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(ease * target);
            if (p < 1) requestAnimationFrame(step);
          })(start);
        });
        ribbonObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  document.querySelectorAll('.stats-ribbon-inner').forEach(function (el) {
    ribbonObserver.observe(el);
  });
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
