import { initAgentTour, motionEasing, motionProgress } from './agent-tour.js';

const crew = [
  ['Сетка', '#bd9aff', 'design'], ['Визуал', '#ff90dc', 'design'], ['Детали', '#a59dff', 'design'],
  ['Текст', '#98edba', 'copy'], ['Заголовки', '#d7f997', 'copy'], ['Редактура', '#75eedf', 'copy'],
  ['Интерфейс', '#ffd08b', 'dev'], ['Навигация', '#82c9ff', 'dev'], ['Сборка', '#ffa193', 'dev'],
];
const timing = { design: 1110, copy: 1260, dev: 950 };
const stagger = [0, 74, 38, 128, 85, 172, 116, 203, 157];
const contact = .37;
const revealEnd = .9;

const mix = (from, to, weight) => from + (to - from) * weight;
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
const svgNS = 'http://www.w3.org/2000/svg';

function typeText(element, highlights, segmenter) {
  if (!highlights) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const points = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.trim() || node.parentElement.closest('[hidden], script, style')) continue;
    const style = getComputedStyle(node.parentElement);
    if (style.display === 'none' || style.visibility === 'hidden' || (style.position === 'absolute' && style.clip !== 'auto')) continue;
    if (!points.length) points.push([node, 0]);
    for (const { index, segment } of segmenter.segment(node.data)) points.push([node, index + segment.length]);
  }
  const length = points.length - 1;
  if (length < 1) return;

  const hidden = document.createRange();
  hidden.setStart(...points[0]);
  hidden.setEnd(...points[length]);
  highlights.add(hidden);
  let last = 0;
  return {
    length,
    reveal(progress) {
      const count = Math.floor(length * progress);
      if (count === last) return;
      hidden.setStart(...points[count]);
      last = count;
    },
    clear: () => highlights.delete(hidden),
  };
}

function createPointer(labelText, color) {
  const cursor = document.createElement('div');
  cursor.className = 'agent-cursor';
  cursor.style.setProperty('--agent-color', color);
  const icon = document.createElementNS(svgNS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  const arrow = document.createElementNS(svgNS, 'path');
  arrow.setAttribute('d', 'M3 2.5 20.5 11l-8 2.3L9 21.5 3 2.5Z');
  icon.append(arrow);
  const label = document.createElement('span');
  label.textContent = labelText;
  cursor.append(icon, label);
  return cursor;
}

export function initAgentBuild(reducedMotion, { fitEnd = true, labels, names = [], cursorPrefix = 'ИИ · ' } = {}) {
  const button = document.querySelector('[data-agent-tour]');
  if (!button || !Element.prototype.animate) return () => {};
  const canType = typeof Highlight === 'function' && CSS.highlights && Intl.Segmenter;
  const highlights = canType ? new Highlight() : null;
  const segmenter = canType ? new Intl.Segmenter() : null;
  const overlay = document.createElement('div');
  overlay.className = 'agent-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  const agents = crew.map(([name, color, role], index) => {
    const cursor = createPointer(cursorPrefix + (names[index] ?? name), color);
    overlay.append(cursor);
    return { cursor, color, role, index };
  });
  const active = new Map();
  const pending = new Set();
  const retired = new Set();
  let queue = [];
  let frame = 0;
  let workSection;
  let visibilityAnimation;

  const tour = initAgentTour(button, {
    prepare, build, nextJobTop, retire, isBuilding: () => active.size > 0 || queue.length > 0, release, fitEnd, labels,
  });

  function edgePosition(agent) {
    const inset = innerWidth < 600 ? 17 : 26;
    const lane = Math.floor(agent.index / 2);
    return {
      x: agent.index % 2 ? innerWidth - inset - 6 : inset + lane % 2 * 9,
      y: innerHeight * (.22 + lane * .122 + agent.index % 2 * .042),
    };
  }

  function place(agent, x, y) {
    agent.position = { x, y };
    agent.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
    agent.cursor.toggleAttribute('data-label-left', x > innerWidth - 124);
  }

  function fly(agent, origin, destination, weight, bend) {
    const clearance = bend > 0
      ? Math.max(0, Math.min(origin.y, destination.y) - 8)
      : Math.max(0, innerHeight - 30 - Math.max(origin.y, destination.y));
    const arc = Math.sign(bend) * Math.min(Math.abs(bend), clearance);
    place(agent, mix(origin.x, destination.x, weight), mix(origin.y, destination.y, weight) - Math.sin(weight * Math.PI) * arc);
  }

  function prepare(restart) {
    if (highlights) CSS.highlights.set('site-assembly-untyped', highlights);
    for (const element of document.querySelectorAll('[data-tour-job]')) {
      if (restart) element.removeAttribute('data-agent-done');
      const header = element.closest('header');
      if (element.closest('[data-tour-persistent], [hidden]') ||
          (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)) ||
          !element.getClientRects().length || element.hasAttribute('data-agent-done')) continue;
      pending.add(element);
      element.setAttribute('data-agent-pending', '');
    }
    visibilityAnimation?.cancel();
    for (const agent of agents) {
      agent.park = undefined;
      const { x, y } = edgePosition(agent);
      place(agent, x, y);
    }
    document.body.append(overlay);
    visibilityAnimation = overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: motionEasing });
  }

  function measureJobs(section) {
    return [...pending].flatMap(element => {
      const owner = element.closest('[data-tour-section]');
      if (section && owner && owner !== section) return [];
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.left < innerWidth ? [{ element, bounds }] : [];
    });
  }

  function build(top, section) {
    if (section !== workSection) clearRetired();
    workSection = section;
    queue = measureJobs(section)
      .filter(({ bounds }) => bounds.bottom > top && bounds.top < innerHeight &&
        (bounds.bottom <= innerHeight + 1 || bounds.top <= top + 1))
      .map(({ element }) => element)
      .sort((a, b) => Number(a.dataset.tourOrder ?? 0) - Number(b.dataset.tourOrder ?? 0));
    dispatch(true);
  }

  function nextJobTop(top, section) {
    return measureJobs(section).reduce((next, { bounds }) => bounds.top > top + 1 ? Math.min(next, bounds.top) : next, Infinity);
  }

  function retire(section) {
    for (const element of section.querySelectorAll('[data-agent-done]:not([data-agent-retired])')) {
      if (element.closest('[data-tour-section]') !== section) continue;
      element.setAttribute('data-agent-retired', '');
      retired.add(element);
    }
  }

  function clearRetired() {
    for (const element of retired) element.removeAttribute('data-agent-retired');
    retired.clear();
  }

  function dispatch(initial = false) {
    let index = 0;
    while (queue.length && active.size < agents.length) {
      const element = queue.shift();
      const role = element.dataset.tourJob;
      const idle = agents.filter(agent => !active.has(agent));
      const agent = idle.find(item => item.role === role) ?? idle[0];
      agent.park = undefined;
      agent.cursor.setAttribute('data-agent-working', '');
      pending.delete(element);
      element.removeAttribute('data-agent-pending');
      element.setAttribute('data-agent-active', '');

      const typing = role === 'copy' ? typeText(element, highlights, segmenter) : undefined;
      const shape = role === 'design' ? '0 100% 100% 0' : role === 'copy' ? '0 100% 0 0' : '0 0 100% 0';
      const hold = `inset(${shape})`;
      const duration = (timing[role] ?? timing.design) + (typing ? Math.min(850, typing.length * 8) : 0);
      const delay = initial ? stagger[index++] : 24;
      const animation = element.animate(typing ? [
        { opacity: 0, clipPath: 'inset(0)', offset: 0 },
        { opacity: 0, clipPath: 'inset(0)', offset: contact - .06, easing: motionEasing },
        { opacity: 1, clipPath: 'inset(0)', offset: contact + .06 },
        { opacity: 1, clipPath: 'inset(0)', offset: 1 },
      ] : [
        { opacity: 0, clipPath: hold, offset: 0 },
        { opacity: 0, clipPath: hold, offset: contact, easing: role === 'copy' ? 'steps(24, end)' : motionEasing },
        { opacity: 1, clipPath: 'inset(0)', offset: revealEnd },
        { opacity: 1, clipPath: 'inset(0)', offset: 1 },
      ], { duration, delay, fill: 'both' });

      const outline = document.createElement('div');
      outline.className = 'agent-outline';
      outline.style.setProperty('--agent-color', agent.color);
      overlay.prepend(outline);
      const origin = agent.position;
      active.set(agent, { element, animation, outline, origin, duration, delay, role, typing });
    }
    scheduleFrame();
  }

  function settle(agent, finished, now) {
    const task = active.get(agent);
    task.typing?.clear();
    task.animation.cancel();
    task.outline.remove();
    task.element.removeAttribute('data-agent-active');
    if (finished) task.element.setAttribute('data-agent-done', '');
    agent.cursor.removeAttribute('data-agent-working');
    agent.cursor.style.removeProperty('--tap-opacity');
    if (finished) parkAtEdge(agent, now);
    active.delete(agent);
  }

  function parkAtEdge(agent, now) {
    agent.park = { origin: agent.position, destination: edgePosition(agent), start: now + 95 };
  }

  function scheduleFrame() {
    if (!frame && !document.hidden && (active.size || agents.some(agent => agent.park))) {
      frame = requestAnimationFrame(draw);
    }
  }

  function draw(now) {
    frame = 0;
    if (document.hidden) return;
    const width = innerWidth, height = innerHeight;
    const measured = [...active].map(([agent, task]) => [agent, task, task.element.getBoundingClientRect()]);
    for (const [agent, task, bounds] of measured) {
      const progress = ((task.animation.currentTime ?? 0) - task.delay) / task.duration;
      if (progress >= 1 || task.animation.playState === 'finished') {
        settle(agent, true, now);
        continue;
      }
      if (progress < 0) continue;
      const arrival = motionProgress(progress / contact);
      const work = clamp((progress - contact) / (revealEnd - contact), 0, 1);
      task.typing?.reveal(work);
      const left = Math.max(8, bounds.left);
      const right = Math.min(width - 18, bounds.right);
      const top = clamp(bounds.top, 12, height - 24);
      const bottom = clamp(bounds.bottom, top + 3, height - 16);
      const sweep = motionProgress(work);
      const workX = task.role === 'dev' ? .35 + sweep * .2 : sweep;
      const finishX = mix(left + 4, Math.max(left + 5, right - 4), workX);
      const finishY = task.role === 'copy' ? top + Math.min(15, (bottom - top) * .6) : mix(top + 2, bottom - 2, sweep);
      const arc = Math.min(110, Math.abs(finishX - task.origin.x) * .23 + 22);
      fly(agent, task.origin, { x: finishX, y: finishY }, arrival, arc * (agent.index % 2 ? -.55 : 1));
      const tap = clamp((progress - contact + .025) / .23, 0, 1);
      agent.cursor.style.setProperty('--tap-scale', String(.45 + tap * 1.8));
      agent.cursor.style.setProperty('--tap-opacity', String(Math.sin(tap * Math.PI) * .6));
      task.outline.style.transform = `translate3d(${left}px,${top}px,0)`;
      task.outline.style.width = `${Math.max(1, right - left)}px`;
      task.outline.style.height = `${bottom - top}px`;
      task.outline.style.opacity = String(arrival * (1 - motionProgress((progress - .76) / .24)) * .42);
    }
    dispatch();
    for (const agent of agents) {
      if (!agent.park || now < agent.park.start) continue;
      const { origin, destination, start } = agent.park;
      const elapsed = (now - start) / (565 + agent.index * 18);
      const weight = motionProgress(elapsed);
      const bend = Math.min(72, Math.abs(destination.x - origin.x) * .15);
      fly(agent, origin, destination, weight, bend);
      if (elapsed >= 1) agent.park = undefined;
    }
  }

  function release(finished) {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const agent of active.keys()) settle(agent, false);
    for (const element of pending) element.removeAttribute('data-agent-pending');
    pending.clear();
    clearRetired();
    queue = [];
    if (highlights) CSS.highlights.delete('site-assembly-untyped');
    visibilityAnimation?.cancel();
    if (finished) {
      const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 630, easing: motionEasing, fill: 'forwards' });
      visibilityAnimation = fade;
      fade.onfinish = () => { if (visibilityAnimation === fade) overlay.remove(); };
      scheduleFrame();
    } else {
      for (const agent of agents) agent.park = undefined;
      overlay.remove();
    }
  }

  document.addEventListener('visibilitychange', () => {
    for (const { animation } of active.values()) {
      if (document.hidden) animation.pause();
      else animation.play();
    }
    scheduleFrame();
  });

  window.addEventListener('resize', () => {
    if (!document.documentElement.hasAttribute('data-agent-tour-running')) return;
    const now = performance.now();
    for (const agent of agents) if (!active.has(agent)) parkAtEdge(agent, now);
    scheduleFrame();
  });

  return next => tour.setAvailable(Boolean(next) && !reducedMotion.matches);
}
