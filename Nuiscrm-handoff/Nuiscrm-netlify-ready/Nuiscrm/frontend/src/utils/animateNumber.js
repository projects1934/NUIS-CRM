export function animateNumber(el, target, duration = 600) {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  const to = Number(target) || 0;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = from + (to - from) * eased;
    el.textContent = Math.round(value).toLocaleString();
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = to.toLocaleString();
  }
  requestAnimationFrame(frame);
}
