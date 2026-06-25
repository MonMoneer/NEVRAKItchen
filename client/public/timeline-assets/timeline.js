(function(){
// Milestones for the countdown — same dates as the timeline anchors.
  // The script picks the next one in the future and counts down to it;
  // once everything is in the past, it shows "since handover".
  const MILESTONES = (window.__MILESTONES || []).map(m => ({ ...m, t: new Date(m.date + 'T00:00:00').getTime() }));

  const fmt = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const DAY = 1000 * 60 * 60 * 24;

  function tick() {
    const now = new Date();
    document.getElementById('todayDate').textContent = fmt(now);

    // Next upcoming milestone
    const t = now.getTime();
    const next = MILESTONES.find(m => m.t > t);
    const numEl = document.getElementById('countdownNum');
    const lblEl = document.getElementById('countdownLabel');
    if (next) {
      const days = Math.ceil((next.t - t) / DAY);
      numEl.textContent = days;
      lblEl.textContent = 'days to ' + next.label;
    } else {
      const last = MILESTONES[MILESTONES.length - 1];
      const days = Math.floor((t - last.t) / DAY);
      numEl.textContent = days;
      lblEl.textContent = 'days since handover';
    }

    positionNowMarker(now);
  }

  // Position the "TODAY" marker on the rail by anchoring to the actual
  // step/payment elements with data-start / data-end ISO dates.
  function positionNowMarker(nowDate) {
    const timeline = document.getElementById('timeline');
    const rail = document.getElementById('rail');
    const marker = document.getElementById('nowMarker');
    if (!timeline || !rail || !marker) return;

    const tlRect = timeline.getBoundingClientRect();
    const yOf = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - tlRect.top, bottom: r.bottom - tlRect.top };
    };

    const anchors = [...timeline.querySelectorAll('[data-start][data-end]')]
      .map((el) => ({
        el,
        start: new Date(el.dataset.start + 'T00:00:00').getTime(),
        end: new Date(el.dataset.end + 'T23:59:59').getTime(),
        ...yOf(el),
      }));
    if (!anchors.length) return;

    const now = (nowDate || new Date()).getTime();
    let yPx = null;

    const inside = anchors.find((a) => now >= a.start && now <= a.end);
    if (inside) {
      const span = Math.max(1, inside.end - inside.start);
      const f = (now - inside.start) / span;
      yPx = inside.top + (inside.bottom - inside.top) * f;
    } else {
      let prev = null, next = null;
      for (const a of anchors) {
        if (a.end < now) prev = a;
        else if (a.start > now && !next) { next = a; break; }
      }
      if (prev && next) {
        const span = Math.max(1, next.start - prev.end);
        const f = (now - prev.end) / span;
        yPx = prev.bottom + (next.top - prev.bottom) * f;
      } else if (next) yPx = next.top;
      else if (prev) yPx = prev.bottom;
    }

    if (yPx == null) return;
    marker.style.top = yPx + 'px';

    const railRect = rail.getBoundingClientRect();
    const railTop = railRect.top - tlRect.top;
    const railH = railRect.height || 1;
    const progress = Math.max(0, Math.min(100, ((yPx - railTop) / railH) * 100));
    rail.style.setProperty('--progress', progress + '%');
  }

  window.addEventListener('load', tick);
  window.addEventListener('resize', tick);
  setTimeout(tick, 100);
  setTimeout(tick, 600);
  // Re-tick every minute so the date and countdown stay live across midnight.
  setInterval(tick, 60 * 1000);
})();
