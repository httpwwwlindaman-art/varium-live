(() => {
  const DAY = 86400;
  const JST = 9 * 3600;
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  const $ = (id) => document.getElementById(id);
  let data = null;
  let tab = "today";
  let month = null;

  try { tab = localStorage.getItem("tab") || "today"; } catch (e) {}

  // 日本時間の日付（その日の0時の UNIX 秒）
  const dayStart = (t) => Math.floor((t + JST) / DAY) * DAY - JST;
  const jst = (t) => new Date((t + JST) * 1000); // getUTC* で日本時間として読む
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (t) => { const d = jst(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`; };
  const fmtTime = (t) => { const d = jst(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const monthKey = (t) => { const d = jst(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
  const fmtDur = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}時間${pad(m % 60)}分` : `${m}分`; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function range(now) {
    const today = dayStart(now);
    if (tab === "today") return [today, today + DAY, `今日 ${fmtDate(today)} に始まった配信`];
    if (tab === "yesterday") return [today - DAY, today, `昨日 ${fmtDate(today - DAY)} に始まった配信`];
    if (tab === "week") return [now - 7 * DAY, now + DAY, `直近7日間（${fmtDate(now - 7 * DAY)} ${fmtTime(now - 7 * DAY)} から）に始まった配信`];
    const [y, m] = month.split("-").map(Number);
    const from = Date.UTC(y, m - 1, 1) / 1000 - JST;
    const to = Date.UTC(y, m, 1) / 1000 - JST;
    return [from, to, `${y}年${m}月に始まった配信`];
  }

  const who = (m) => `<span class="who">${m.avatar ? `<img alt="" src="${esc(m.avatar)}">` : ""}<span>${esc(m.name)}${m.gen ? `・${m.gen}期生` : ""}</span></span>`;

  // 「予定」タブ：今日（配信中＋これから）と明日の待機所
  function renderSchedule(now, members) {
    const today = dayStart(now);
    const live = data.streams.filter((s) => s.live)
      .map((s) => ({ id: s.id, ch: s.ch, title: s.title, at: s.start, live: true, current: s.current, members_only: s.members_only }));
    const up = data.upcoming.filter((u) => u.scheduled > now - 3600)
      .map((u) => ({ id: u.id, ch: u.ch, title: u.title, at: u.scheduled, members_only: u.members_only }));
    const days = [
      ["今日", today, [...live, ...up.filter((u) => u.at < today + DAY)]],
      ["明日", today + DAY, up.filter((u) => u.at >= today + DAY && u.at < today + 2 * DAY)],
    ];
    const slot = (x) => {
      const m = members[x.ch] || { name: "?" };
      const badges = [];
      if (x.live) badges.push(`<span class="badge live">配信中${x.current != null ? `・いま ${x.current.toLocaleString()}人` : ""}</span>`);
      else if (x.at <= now) badges.push(`<span class="badge live">まもなく</span>`);
      if (x.members_only) badges.push(`<span class="badge">メン限</span>`);
      return `<li class="slot${x.live ? " now" : ""}"><a href="https://www.youtube.com/watch?v=${esc(x.id)}" target="_blank" rel="noopener">
        <span class="at">${fmtTime(x.at)}</span>
        <span class="thumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(x.id)}/mqdefault.jpg">${x.live ? '<span class="live-tag">LIVE</span>' : ""}</span>
        <span class="info"><p class="title">${esc(x.title)}</p>${who(m)}
          ${badges.length ? `<span class="badges">${badges.join("")}</span>` : ""}</span></a></li>`;
    };
    $("schedule").innerHTML = days.map(([name, d, list]) => {
      list.sort((a, b) => a.at - b.at);
      return `<h2>${name}<small>${fmtDate(d)}・${list.length}本</small></h2>` +
        (list.length ? `<ol>${list.map(slot).join("")}</ol>` : `<p class="none">いまわかっている予定はありません。</p>`);
    }).join("") + `<p class="note">YouTube に待機所ができている配信だけを出しています。待機所を作らずに始まる配信や、あとで時間が変わった配信は、ずれることがあります。</p>`;
  }

  function render() {
    const now = Math.floor(Date.now() / 1000);
    const members = Object.fromEntries(data.members.map((m) => [m.ch, m]));

    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    const isSchedule = tab === "schedule";
    $("schedule").hidden = !isSchedule;
    ["range", "ranking"].forEach((id) => { $(id).hidden = isSchedule; });
    if (isSchedule) {
      $("months").hidden = true;
      $("empty").hidden = true;
      $("upcoming-wrap").hidden = true;
      renderSchedule(now, members);
      renderStatus(now);
      return;
    }
    const months = [...new Set(data.streams.map((s) => monthKey(s.start)))].sort().reverse();
    if (!months.length) months.push(monthKey(now));
    if (!month || !months.includes(month)) month = months[0];
    const mbox = $("months");
    mbox.hidden = tab !== "month";
    mbox.innerHTML = months.map((k) => {
      const [y, m] = k.split("-");
      return `<button data-month="${k}" aria-pressed="${k === month}">${y}年${Number(m)}月</button>`;
    }).join("");

    const [from, to, label] = range(now);
    const list = data.streams
      .filter((s) => s.start >= from && s.start < to)
      .sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) || b.start - a.start);
    $("range").textContent = `${label}・${list.length}本`;

    let rank = 0;
    $("ranking").innerHTML = list.map((s) => {
      const m = members[s.ch] || { name: "?" };
      rank += 1;
      const dur = s.live ? `${fmtDur(now - s.start)}経過` : (s.end ? fmtDur(s.end - s.start) : "");
      const badges = [];
      if (s.live) badges.push(`<span class="badge live">配信中${s.current != null ? `・いま ${s.current.toLocaleString()}人` : ""}</span>`);
      if (s.members_only) badges.push(`<span class="badge">メン限</span>`);
      if (s.partial) badges.push(`<span class="badge dim">途中から記録</span>`);
      const peak = s.peak != null
        ? `<span class="peak">${s.peak.toLocaleString()}<small>人</small></span>`
        : `<span class="peak none">${s.members_only ? "同接非公開" : "記録なし"}</span>`;
      return `<li class="item"><a href="https://www.youtube.com/watch?v=${esc(s.id)}" target="_blank" rel="noopener">
        <span class="rank">${s.peak != null ? rank : "–"}</span>
        <span class="thumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(s.id)}/mqdefault.jpg">${s.live ? '<span class="live-tag">LIVE</span>' : ""}</span>
        <span class="info">
          <p class="title">${esc(s.title)}</p>
          <span class="who">${m.avatar ? `<img alt="" src="${esc(m.avatar)}">` : ""}<span>${esc(m.name)}${m.gen ? `・${m.gen}期生` : ""}</span></span>
          <span class="meta"><span class="time">${fmtDate(s.start)} ${fmtTime(s.start)}〜${dur ? `・${dur}` : ""}</span>${peak}</span>
          ${badges.length ? `<span class="badges">${badges.join("")}</span>` : ""}
        </span></a></li>`;
    }).join("");

    const empty = $("empty");
    empty.hidden = list.length > 0;
    if (!list.length) empty.textContent = from + DAY <= data.started_at
      ? `この期間はまだ記録していません（記録は ${fmtDate(data.started_at)} から）。`
      : "この期間の配信はまだありません。";

    const up = data.upcoming.filter((u) => u.scheduled > now - 3600 && u.scheduled < now + DAY);
    $("upcoming-wrap").hidden = !up.length;
    $("upcoming").innerHTML = up.map((u) => {
      const m = members[u.ch] || { name: "?" };
      const day = dayStart(u.scheduled) === dayStart(now) ? "" : `${fmtDate(u.scheduled)} `;
      return `<li><a href="https://www.youtube.com/watch?v=${esc(u.id)}" target="_blank" rel="noopener">
        <span class="at">${day}${fmtTime(u.scheduled)}</span><span class="t">${esc(m.name)}｜${esc(u.title)}</span></a></li>`;
    }).join("");

    renderStatus(now);
  }

  function renderStatus(now) {
    const checked = data.checked_at || 0;
    const stale = now - checked > data.stale_warn_min * 60;
    const c = $("checked");
    c.textContent = checked ? `最終確認 ${fmtDate(checked)} ${fmtTime(checked)}` : "まだ記録していません";
    c.classList.toggle("stale", stale);
    const notes = [];
    if (stale && checked) notes.push(`記録が ${fmtDur(now - checked)} 止まっています。記録用のPCが止まっているかもしれません。`);
    if (data.quota_until && data.quota_until > now) notes.push(`YouTube API の1日の上限に達したため、${fmtTime(data.quota_until)} まで記録を休んでいます。`);
    if (data.error && data.error.at >= checked) notes.push(`最後の記録でエラーが出ました：${data.error.message}`);
    $("banner").hidden = !notes.length;
    $("banner").innerHTML = notes.map(esc).join("<br>");

    // いま配信中の合計同接（最後に記録したときの値）
    const live = data.streams.filter((s) => s.live);
    const counted = live.filter((s) => s.current != null);
    const total = counted.reduce((sum, s) => sum + s.current, 0);
    const hiddenN = live.length - counted.length;
    const box = $("now");
    box.hidden = !checked;
    box.innerHTML = live.length
      ? `<span class="dot"></span><span class="label">いま配信中 ${live.length}本</span>` +
        `<span class="total">${total.toLocaleString()}<small>人</small></span>` +
        `<span class="sub">合計同接・${fmtTime(checked)} 時点${hiddenN ? `（同接非公開 ${hiddenN}本をのぞく）` : ""}</span>`
      : `<span class="label idle">いま配信中の人はいません</span><span class="sub">${fmtTime(checked)} 時点</span>`;

    $("about").textContent = `${data.interval_min}分おきに同時接続数を記録し、その最大値を「最大同接」としています（記録開始 ${fmtDate(data.started_at)}）。日付は配信の開始時刻（日本時間）で分けています。`;
  }

  async function load() {
    try {
      const r = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
      data = await r.json();
      render();
    } catch (e) {
      $("checked").textContent = "データを読み込めませんでした";
    }
  }

  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    try { localStorage.setItem("tab", tab); } catch (err) {}
    render();
  });
  $("months").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-month]");
    if (!b) return;
    month = b.dataset.month;
    render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  setInterval(load, 5 * 60 * 1000);
  load();
})();
