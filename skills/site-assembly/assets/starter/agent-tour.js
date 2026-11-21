const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab', 'Escape']);
export const motionEasing = 'cubic-bezier(.32,.02,.24,1)';
export const motionProgress = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function initAgentTour(button, {
  prepare, build, nextJobTop, retire, isBuilding, release, fitEnd,
  labels = { pause: 'Приостановить тур', resume: 'Продолжить тур', replay: 'Повторить тур' },
}) {
  const label = button.querySelector('[data-agent-tour-label]');
  const root = document.documentElement;
  const sections = [...document.querySelectorAll('[data-tour-section]')];
  const lastSection = sections.at(-1);
  const headers = [...document.querySelectorAll('[data-tour-persistent], body > header, .site-header')];
  let available = false;
  let autoplay = !location.hash;
  let running = false;
  let finished = false;
  let phase = '';
  let frame = 0;
  let until = 0;
  let moving;
  let hiddenAt;
  let current;

  const maxScroll = () => Math.max(0, root.scrollHeight - root.clientHeight);
  const jump = top => window.scrollTo({ top, behavior: 'instant' });
  const headerBottom = () => headers.reduce((bottom, header) => {
    const { position, visibility } = getComputedStyle(header);
    const box = header.getBoundingClientRect();
    return (position === 'sticky' || position === 'fixed') && visibility === 'visible' && box.top < 36
      ? Math.max(bottom, box.bottom) : bottom;
  }, 0);

  function fitLastSection() {
    if (lastSection?.hasAttribute('data-agent-tour-last')) {
      lastSection.style.setProperty('--agent-tour-header', `${headerBottom()}px`);
    }
  }

  function updateButton() {
    button.hidden = !available;
    button.toggleAttribute('data-running', running);
    label.textContent = running ? labels.pause : finished ? labels.replay : labels.resume;
  }

  function setPhase(next) {
    phase = next;
    root.dataset.tourPhase = phase;
  }

  function pause() {
    autoplay = false;
    if (running) {
      cancelAnimationFrame(frame);
      frame = 0;
      running = false;
      moving = undefined;
      delete root.dataset.tourPhase;
      root.removeAttribute('data-agent-tour-running');
      release(finished);
    }
    updateButton();
  }

  function assemble() {
    const inset = headerBottom();
    current = sections.findLast(section => section.getBoundingClientRect().top <= inset + 1) ?? sections[0];
    setPhase('build');
    build(inset, !fitEnd && scrollY >= maxScroll() - 1 ? undefined : current);
  }

  function nextPosition(from) {
    fitLastSection();
    const inset = headerBottom();
    const next = sections.find(section => section.getBoundingClientRect().top > inset + 1);
    const limit = maxScroll();
    const boundary = next?.getBoundingClientRect().top ?? Infinity;
    const jobTop = nextJobTop(inset, current);
    const to = Math.min(limit, Math.round(from + Math.min(boundary, jobTop) - inset));
    if (jobTop < boundary && to > from) retire(current);
    return to;
  }

  function tick(now) {
    frame = 0;
    if (document.hidden) return;

    if (moving) {
      const progress = Math.min(1, (now - moving.started) / moving.duration);
      jump(moving.from + (moving.to - moving.from) * motionProgress(progress));
      if (progress === 1) {
        moving = undefined;
        assemble();
      }
    } else if (phase === 'build' && !isBuilding()) {
      setPhase('reading');
      until = now + 245;
    } else if (phase === 'reading' && now >= until) {
      const from = scrollY;
      const to = nextPosition(from);
      if (to <= from) {
        finished = true;
        pause();
        return;
      }
      moving = { from, to, started: now, duration: Math.min(980, 355 + (to - from) * .35) };
      setPhase('scrolling');
    }
    button.style.setProperty('--tour-progress', String(scrollY / Math.max(1, maxScroll())));
    frame = requestAnimationFrame(tick);
  }

  function start(fromBeginning = false) {
    if (!available || running || !sections.length) return;
    const restart = fromBeginning || finished;
    finished = false;
    running = true;
    autoplay = false;
    root.setAttribute('data-agent-tour-running', '');
    if (fitEnd) {
      lastSection.setAttribute('data-agent-tour-last', '');
      fitLastSection();
    }
    if (restart) jump(0);
    prepare(restart);
    assemble();
    updateButton();
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }

  button.addEventListener('click', () => running ? pause() : start());
  const interrupt = () => { if (running || autoplay) pause(); };
  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('touchstart', event => {
    if (!button.contains(event.target)) interrupt();
  }, { passive: true });
  window.addEventListener('keydown', event => {
    if (scrollKeys.has(event.key) && !(event.key === ' ' && button.contains(event.target))) interrupt();
  });
  window.addEventListener('pointerdown', event => {
    if (event.clientX >= root.clientWidth && event.clientX > 0) interrupt();
  }, { passive: true });
  window.addEventListener('hashchange', interrupt);
  window.addEventListener('resize', fitLastSection);
  document.addEventListener('click', event => {
    if (event.target.closest('a[href], button:not([data-agent-tour]), input, select, textarea')) interrupt();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (running && !frame) {
      const elapsed = performance.now() - (hiddenAt ?? performance.now());
      if (moving) moving.started += elapsed;
      else until += elapsed;
      frame = requestAnimationFrame(tick);
    }
  });

  return {
    pause,
    restart: () => start(true),
    setAvailable(next) {
      if (next === available) return;
      available = next;
      if (!next) {
        pause();
        lastSection?.removeAttribute('data-agent-tour-last');
        lastSection?.style.removeProperty('--agent-tour-header');
      }
      else if (autoplay) start(true);
      else updateButton();
    },
  };
}
