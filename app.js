// 화면·저장·내보내기. 계산은 logic.js(Golf)에 있다
(function () {
  'use strict';

  const KEY = 'golf-scorecard';
  const app = document.getElementById('app');

  // ---------- 저장 ----------
  // rounds: 라운드 목록, clubs: { 골프장: { lat, lon, courses: { 코스: [파 9개] } } }
  let db = load();

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.rounds)) return { clubs: {}, ...d };
    } catch (e) { /* 깨진 데이터는 새로 시작 */ }
    return { rounds: [], clubs: {} };
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  // ---------- 화면 상태 ----------
  const ui = {
    view: 'home',
    roundId: null,
    hole: 0,
    draft: { c: '', r: '', b: '' },
    edit: null, // 수정 중인 샷 번호
    half: null, // 홀 목록에 보이는 쪽 (0 전반, 1 후반). null이면 현재 홀 쪽
    setup: null,
  };

  const round = () => db.rounds.find((r) => r.id === ui.roundId);

  function go(view, patch) {
    Object.assign(ui, { view }, patch || {});
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowTime() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function pct(v) {
    return v === '' ? '-' : Math.round(v * 100) + '%';
  }

  function diffText(d) {
    return d > 0 ? '+' + d : d === 0 ? 'E' : String(d);
  }

  function diffClass(d) {
    if (d == null) return '';
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    return 'double';
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // 공유 시트가 있으면 파일로 공유, 없으면 다운로드
  async function shareFiles(files, meta) {
    const list = files.map((f) => new File([f.data], f.name, { type: f.type }));
    if (navigator.canShare && navigator.canShare({ files: list })) {
      try {
        await navigator.share({ files: list, title: list[0].name, ...meta });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    toast('공유 창을 열 수 없어 파일로 내려받습니다');
    list.forEach((f) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('위치 기능을 쓸 수 없습니다'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
        () => reject(new Error('위치를 가져오지 못했습니다')),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
      );
    });
  }

  // ---------- 홈 ----------
  function viewHome() {
    const rounds = db.rounds.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const items = rounds.map((r) => {
      const s = Golf.stats(r);
      const done = s.done === 18;
      return `
        <li><button class="round-item" data-act="open" data-arg="${r.id}">
          <span class="ri-date">${esc(r.date)} · ${esc(r.date.slice(0, 4))}년 ${roundNo(r)}R</span>
          <span class="ri-club">${esc(r.club || '(골프장 미입력)')}</span>
          <span class="ri-score">${done ? `${s.total} <small>(${diffText(s.total - s.par)})</small>` : `<small>진행 ${s.done}/18</small>`}</span>
        </button></li>`;
    }).join('');
    return `
      <header class="bar"><h1>골프 스코어카드</h1></header>
      <section class="pad">
        <button class="primary big" data-act="new">+ 새 라운드</button>
      </section>
      <section class="pad">
        <h2>라운드 기록</h2>
        ${items ? `<ul class="rounds">${items}</ul>` : '<p class="muted">아직 기록이 없습니다.</p>'}
      </section>
      <section class="pad">
        <h2>백업</h2>
        <p class="muted">기록은 이 휴대폰 브라우저에만 저장됩니다. 가끔 백업 파일을 저장해 두세요.</p>
        <div class="row">
          <button data-act="backup">백업 파일 저장</button>
          <button data-act="restore">백업 복원</button>
        </div>
      </section>`;
  }

  // 라운드 번호는 저장하지 않고 같은 해 라운드의 날짜·티타임 순서로 매긴다
  function roundNo(r) {
    const same = db.rounds.filter((x) => x.date.slice(0, 4) === r.date.slice(0, 4))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return same.indexOf(r) + 1;
  }

  // 내보내기용: 계산한 라운드 번호를 붙인 복사본
  function numbered(r) {
    return { ...r, roundNo: roundNo(r) };
  }

  // ---------- 라운드 설정 ----------

  function newSetup() {
    const date = today();
    return {
      id: null, date, time: nowTime(),
      club: '', courseOut: '', courseIn: '',
      parsOut: Array(9).fill(4), parsIn: Array(9).fill(4),
      companions: ['', '', ''], lat: null, lon: null,
    };
  }

  function setupFromRound(r) {
    return {
      id: r.id, date: r.date, time: r.time,
      club: r.club, courseOut: r.courseOut, courseIn: r.courseIn,
      parsOut: r.pars.slice(0, 9), parsIn: r.pars.slice(9),
      companions: r.companions.map((c) => c.name), lat: r.lat, lon: r.lon,
    };
  }

  function companionNames() {
    const set = new Set();
    db.rounds.forEach((r) => r.companions.forEach((c) => c.name && set.add(c.name)));
    return [...set];
  }

  function parButtons(side, pars) {
    return pars.map((p, i) => `
      <button class="par p${p}" data-act="par" data-arg="${side}:${i}">
        <small>${i + 1}</small>${p}
      </button>`).join('');
  }

  function viewSetup() {
    const s = ui.setup;
    const club = db.clubs[s.club];
    const courses = club ? Object.keys(club.courses) : [];
    const loc = s.lat != null ? `${s.lat}, ${s.lon}` : (club && club.lat != null ? `${club.lat}, ${club.lon} (저장된 위치)` : '없음');
    return `
      <header class="bar">
        <button class="back" data-act="home">‹</button>
        <h1>${s.id ? '라운드 정보 수정' : '새 라운드'}</h1>
      </header>
      <section class="pad form">
        <div class="row">
          <label>날짜<input type="date" data-field="date" value="${esc(s.date)}"></label>
          <label>티타임<input type="time" data-field="time" value="${esc(s.time)}"></label>
        </div>
        <label>골프장<input data-field="club" list="clubList" value="${esc(s.club)}" placeholder="예: 클럽모우CC"></label>
        <datalist id="clubList">${Object.keys(db.clubs).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="courseList">${courses.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>

        <label>OUT 코스 (1~9번)<input data-field="courseOut" list="courseList" value="${esc(s.courseOut)}" placeholder="예: 마운틴"></label>
        <div class="pars">${parButtons('out', s.parsOut)}</div>
        <label>IN 코스 (10~18번)<input data-field="courseIn" list="courseList" value="${esc(s.courseIn)}" placeholder="예: 오아시스"></label>
        <div class="pars">${parButtons('in', s.parsIn)}</div>
        <p class="muted small">파 버튼을 누르면 3 → 4 → 5로 바뀝니다. 코스는 저장되어 다음에 이름만 고르면 자동으로 채워집니다.</p>

        <h2>동반자</h2>
        <datalist id="nameList">${companionNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        ${[0, 1, 2].map((i) => `<input data-field="comp${i}" list="nameList" value="${esc(s.companions[i])}" placeholder="동반자 ${i + 1}">`).join('')}

        <h2>위치 (날씨 조회용)</h2>
        <div class="row center">
          <span class="muted grow">${esc(loc)}</span>
          <button data-act="locate">현재 위치 사용</button>
        </div>

        <button class="primary big" data-act="start">${s.id ? '저장' : '라운드 시작'}</button>
      </section>`;
  }

  function onSetupField(field, value) {
    const s = ui.setup;
    if (field.startsWith('comp')) {
      s.companions[+field.slice(4)] = value.trim();
      return;
    }
    s[field] = value.trim();
    const club = db.clubs[s.club];
    // 저장된 코스 이름이면 파를 채운다
    if (club && field === 'courseOut' && club.courses[s.courseOut]) s.parsOut = club.courses[s.courseOut].slice();
    if (club && field === 'courseIn' && club.courses[s.courseIn]) s.parsIn = club.courses[s.courseIn].slice();
    if (field === 'club' || field.startsWith('course')) render();
  }

  function startRound() {
    const s = ui.setup;
    if (!s.club) return toast('골프장을 입력하세요');
    if (!s.date) return toast('날짜를 입력하세요');
    const club = db.clubs[s.club] || (db.clubs[s.club] = { lat: null, lon: null, courses: {} });
    if (s.courseOut) club.courses[s.courseOut] = s.parsOut.slice();
    if (s.courseIn) club.courses[s.courseIn] = s.parsIn.slice();
    if (s.lat != null) { club.lat = s.lat; club.lon = s.lon; }

    const fields = {
      date: s.date, time: s.time,
      club: s.club, courseOut: s.courseOut, courseIn: s.courseIn,
      pars: s.parsOut.concat(s.parsIn),
      lat: s.lat != null ? s.lat : club.lat, lon: s.lon != null ? s.lon : club.lon,
    };
    let r;
    if (s.id) {
      r = db.rounds.find((x) => x.id === s.id);
      Object.assign(r, fields);
      s.companions.forEach((name, i) => { r.companions[i].name = name; });
    } else {
      r = {
        id: Date.now().toString(36), ...fields,
        holes: Array.from({ length: 18 }, Golf.newHole),
        companions: s.companions.map((name) => ({ name, score: '' })),
        expense: {}, weather: '', notes: ['', '', ''],
      };
      db.rounds.push(r);
    }
    save();
    if (s.id) go('summary', { roundId: r.id });
    else go('hole', { roundId: r.id, hole: 0, half: null, draft: { c: '', r: '', b: '' }, edit: null });
  }

  // ---------- 홀 기록 ----------
  // 끝난 홀만으로 계산한 파 대비 스코어
  function toParOf(r, idx) {
    const done = idx.filter((i) => Golf.isDone(r.holes[i]));
    if (!done.length) return null;
    return done.reduce((s, i) => s + Golf.score(r.holes[i]) - r.pars[i], 0);
  }

  // 홀 목록: 전반/후반 탭 + 9홀. 스코어는 종이 스코어카드처럼 ○ 버디, ◎ 이글, □ 보기, ▣ 더블 이상
  function holeStrip(r) {
    const half = ui.half != null ? ui.half : (ui.hole < 9 ? 0 : 1);
    const tab = (k) => {
      const idx = Array.from({ length: 9 }, (_, j) => k * 9 + j);
      const d = toParOf(r, idx);
      const total = idx.reduce((s, i) => s + (Golf.score(r.holes[i]) || 0), 0);
      const name = (k ? r.courseIn : r.courseOut) || (k ? 'IN' : 'OUT');
      return `<button class="tab ${k === half ? 'on' : ''}" data-act="half" data-arg="${k}">
        <span>${k ? '후반' : '전반'} · ${esc(name)}</span>
        <b>${d == null ? '' : `${diffText(d)} <small>(${total})</small>`}</b></button>`;
    };
    const cells = Array.from({ length: 9 }, (_, j) => {
      const i = half * 9 + j;
      const sc = Golf.score(r.holes[i]);
      const d = sc == null ? null : sc - r.pars[i];
      return `<button class="hc ${i === ui.hole ? 'cur' : ''}" data-act="hole" data-arg="${i}">
        <small>${j + 1}<i>P${r.pars[i]}</i></small>
        <span class="mk ${diffClass(d)}">${sc == null ? '' : sc}</span></button>`;
    }).join('');
    return `<div class="tabs">${tab(0)}${tab(1)}</div><div class="nine">${cells}</div>`;
  }

  function choiceButtons(group, list, selected) {
    return list.map((item) => {
      const [code, label] = Array.isArray(item) ? item : [item, ''];
      return `<button class="ch ${code === selected ? 'on' : ''}" data-act="pick" data-arg="${group}:${esc(code)}">
        ${esc(code)}${label ? `<small>${esc(label)}</small>` : ''}</button>`;
    }).join('');
  }

  function viewHole() {
    const r = round();
    const i = ui.hole;
    const h = r.holes[i];
    const par = r.pars[i];
    const s = Golf.stats(r);
    const course = i < 9 ? r.courseOut : r.courseIn;
    const sc = Golf.score(h);
    const d = ui.draft;
    const shots = h.shots.map((x, k) => `
      <li><button class="shot ${ui.edit === k ? 'editing' : ''}" data-act="editShot" data-arg="${k}">
        <b>${k + 1}</b><span>${esc(x.c)}</span><span>${esc(x.b || '-')}</span><span>${esc(x.r)}</span>
      </button></li>`).join('');
    const autoPen = Golf.penalty({ ...h, pen: null });
    const pen = Golf.penalty(h);
    const ss = Golf.sandSave(h, par);
    const toPar = toParOf(r, r.pars.map((p, k) => k));

    return `
      <header class="bar">
        <button class="back" data-act="summary">‹</button>
        <h1>${i + 1}번 홀 <small>${esc(course)} ${(i % 9) + 1} · 파${par}</small></h1>
        <span class="tot">${toPar != null ? `${diffText(toPar)} <small>(${s.total})</small>` : ''}</span>
      </header>
      <nav class="strip">${holeStrip(r)}</nav>

      <section class="pad tight">
        <ol class="shots">${shots || '<li class="muted">샷을 기록하세요 (클럽 → 구질 → 결과)</li>'}</ol>
      </section>

      <section class="pad tight entry ${ui.edit != null ? 'is-edit' : ''}">
        <div class="entry-title">${ui.edit != null ? `${ui.edit + 1}번째 샷 수정` : `${h.shots.length + 1}번째 샷`}</div>
        <div class="grid g-club">${choiceButtons('c', Golf.CLUBS, d.c)}</div>
        <div class="grid g-flt">${choiceButtons('b', Golf.FLIGHTS, d.b)}</div>
        <div class="grid g-res">${choiceButtons('r', Golf.RESULTS, d.r)}</div>
        ${ui.edit != null ? `<div class="row">
          <button class="primary" data-act="commit" ${d.c && d.r ? '' : 'disabled'}>저장</button>
          <button data-act="delShot" class="danger">삭제</button><button data-act="cancelEdit">취소</button>
        </div>` : '<p class="muted small hint">결과를 누르면 샷이 저장됩니다. 구질은 생략할 수 있어요.</p>'}
      </section>

      <section class="pad tight entry">
        <div class="label">퍼팅</div>
        <div class="grid g-putt">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<button class="ch ${h.putts === n ? 'on' : ''}" data-act="putts" data-arg="${n}">${n}</button>`).join('')}
        </div>
      </section>

      <section class="pad tight result">
        <div class="label">홀 결과</div>
        <div class="hole-info">
          <div class="hi"><small>스코어${h.fixScore != null ? ' (엑셀)' : ''}</small><b class="${diffClass(sc == null ? null : sc - par)}">${sc == null ? '-' : sc}</b></div>
          <div class="hi"><small>GIR${h.fixGir ? ' (엑셀)' : ''}</small><b>${Golf.gir(h, par) || '-'}</b></div>
          <div class="hi pen"><small>벌타${h.pen != null && h.pen !== autoPen ? ' <button class="link" data-act="pen" data-arg="auto">자동으로</button>' : ''}</small>
            <span><button data-act="pen" data-arg="-1">−</button><b>${pen}</b><button data-act="pen" data-arg="1">+</button></span></div>
          <button class="hi ss" data-act="ss"><small>샌드세이브 ${h.ss ? '(수정)' : '(자동)'}</small><b>${ss}</b></button>
        </div>
      </section>

      <footer class="foot">
        <button data-act="hole" data-arg="${i - 1}" ${i === 0 ? 'disabled' : ''}>‹ 이전 홀</button>
        ${i < 17
          ? `<button class="primary" data-act="hole" data-arg="${i + 1}">다음 홀 ›</button>`
          : '<button class="primary" data-act="summary">라운드 요약 ›</button>'}
      </footer>`;
  }

  function pick(group, code) {
    const d = ui.draft;
    d[group] = d[group] === code && group === 'b' ? '' : code;
    // 새 샷은 클럽과 결과가 모두 정해지는 순간 저장한다 (수정 중일 때는 저장 버튼으로)
    if (ui.edit == null && d.c && d.r && (group === 'r' || group === 'c')) return commitShot();
    if (ui.edit == null && group === 'r' && !d.c) toast('클럽을 고르면 저장됩니다');
    render();
  }

  // 홀을 고치면 엑셀에서 가져온 고정값을 버리고 자동 계산으로 돌아간다
  function touch(h) {
    delete h.fixScore;
    delete h.fixGir;
  }

  function commitShot() {
    const h = round().holes[ui.hole];
    touch(h);
    const shot = { c: ui.draft.c, r: ui.draft.r, b: ui.draft.b };
    if (ui.edit != null) h.shots[ui.edit] = shot;
    else h.shots.push(shot);
    ui.draft = { c: '', r: '', b: '' };
    ui.edit = null;
    save();
    render();
  }

  // ---------- 라운드 요약·내보내기 ----------
  function cardTable(r, from) {
    const idx = Array.from({ length: 9 }, (_, k) => from + k);
    const scores = idx.map((i) => Golf.score(r.holes[i]));
    const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
    return `
      <table class="card">
        <colgroup><col>${idx.map(() => '<col class="c-hole">').join('')}<col class="c-sum"></colgroup>
        <tr><th>${esc(from ? r.courseIn : r.courseOut) || (from ? 'IN' : 'OUT')}</th>${idx.map((i) => `<th>${(i % 9) + 1}</th>`).join('')}<th>계</th></tr>
        <tr><td>파</td>${idx.map((i) => `<td>${r.pars[i]}</td>`).join('')}<td>${sum(idx.map((i) => r.pars[i]))}</td></tr>
        <tr><td>스코어</td>${idx.map((i, k) => `<td><button class="cs ${diffClass(scores[k] == null ? null : scores[k] - r.pars[i])}" data-act="hole" data-arg="${i}">${scores[k] == null ? '·' : scores[k]}</button></td>`).join('')}<td><b>${sum(scores)}</b></td></tr>
        <tr><td>퍼팅</td>${idx.map((i) => `<td>${r.holes[i].putts == null ? '' : r.holes[i].putts}</td>`).join('')}<td>${sum(idx.map((i) => r.holes[i].putts))}</td></tr>
      </table>`;
  }

  function viewSummary() {
    const r = round();
    const s = Golf.stats(r);
    const exp = r.expense || {};
    const stat = (label, value, cls = '') => `<div class="stat ${cls}"><small>${label}</small><b>${value}</b></div>`;
    const diff = s.done ? diffText(s.total - r.pars.filter((p, k) => Golf.isDone(r.holes[k])).reduce((a, b) => a + b, 0)) : '';
    return `
      <header class="bar">
        <button class="back" data-act="home">‹</button>
        <h1>${esc(r.club)} <small>${esc(r.date)} ${esc(r.time)}</small></h1>
      </header>

      <section class="pad pb0">
        <div class="headline">
          <b>${s.total || '-'}</b>
          <span>${diff} · ${s.done}/18홀</span>
          <button data-act="resume">홀 기록 ›</button>
        </div>
        <div class="scroll-x">${cardTable(r, 0)}${cardTable(r, 9)}</div>
        <div class="stats">
          ${stat('TOTAL', `${s.total || '-'} <small>${diff}</small>`, 'main')}
          ${stat('PUTTS', s.putts)}${stat('PENALTY', s.penalty)}
          ${stat('FHR', `${pct(s.fwPct)} <small>${s.fwHits}/${s.fwHoles}</small>`)}
          ${stat('GIR', `${pct(s.girPct)} <small>${s.gir}/18</small>`)}
          ${stat('S.SAVE', `${pct(s.ssPct)} <small>${s.ssO}/${s.ssO + s.ssX}</small>`)}
          ${stat('EAGLE/BIRDIE', `${s.eagle}/${s.birdie}`)}
          ${stat('PAR/BOGEY', `${s.parCount}/${s.bogey}`)}
          ${stat('DOUBLE+', s.overDouble)}
        </div>
        <div class="stats flights">
          ${stat('ST↑', pct(s.straight))}${stat('SL→', pct(s.slice))}${stat('PS↗', pct(s.push))}${stat('HK←', pct(s.hook))}${stat('PU↖', pct(s.pull))}${stat('FA↓', pct(s.fat))}${stat('TO↕', pct(s.top))}
        </div>
      </section>

      <section class="pad form">
        <h2>날씨</h2>
        <div class="row">
          <input class="grow" data-field="weather" value="${esc(r.weather)}" placeholder="예: 흐림, 18~25도, 바람 3m/s">
          <button data-act="weather">불러오기</button>
        </div>

        <h2>동반자 스코어</h2>
        ${r.companions.map((c, i) => `
          <div class="row center">
            <span class="grow">${esc(c.name) || `<span class="muted">동반자 ${i + 1}</span>`}</span>
            <input class="num" type="number" inputmode="numeric" data-field="cscore${i}" value="${esc(c.score)}" placeholder="스코어">
          </div>`).join('')}

        <h2>비용</h2>
        ${Golf.EXPENSES.map(([k, label]) => `
          <div class="row center">
            <span class="grow">${label}</span>
            <input class="num wide" type="number" inputmode="numeric" data-field="exp:${k}" value="${esc(exp[k])}" placeholder="0">
          </div>`).join('')}
        <div class="row center"><span class="grow"><b>합계</b></span><b>${s.expense.toLocaleString()}원</b></div>

        <h2>메모</h2>
        ${[0, 1, 2].map((i) => `<input data-field="note${i}" value="${esc(r.notes[i])}" placeholder="메모 ${i + 1}">`).join('')}
      </section>

      <section class="pad form">
        <h2>엑셀로 보내기 (메일)</h2>
        <button class="primary" data-act="mailFiles">메일로 보내기 (CSV 첨부)</button>
      </section>

      <section class="pad row">
        <button data-act="editSetup">라운드 정보 수정</button>
        <button class="danger" data-act="delRound">라운드 삭제</button>
      </section>`;
  }

  function onSummaryField(field, value, el) {
    const r = round();
    if (field === 'weather') r.weather = value.trim();
    else if (field.startsWith('cscore')) r.companions[+field.slice(6)].score = value;
    else if (field.startsWith('exp:')) r.expense[field.slice(4)] = value === '' ? '' : Number(value);
    else if (field.startsWith('note')) r.notes[+field.slice(4)] = value;
    save();
    if (field.startsWith('exp:')) render();
  }

  function mailSubject(r) {
    const s = Golf.stats(r);
    return `[골프] ${r.date} ${r.club}${s.done ? ' ' + s.total : ''}`;
  }

  function csvFiles(r) {
    const bom = String.fromCharCode(0xfeff); // 엑셀이 한글을 UTF-8로 읽게 한다
    const base = `${r.date}_${r.club}`.replace(/[\\/:*?"<>|\s]+/g, '_');
    return [
      { name: `${base}_summary.csv`, type: 'text/csv', data: bom + Golf.toCsv([Golf.SUMMARY_HEADER, Golf.summaryRow(r)]) },
      { name: `${base}_round.csv`, type: 'text/csv', data: bom + Golf.toCsv([Golf.ROUND_HEADER, Golf.roundRow(r)]) },
      { name: `${base}_shots.csv`, type: 'text/csv', data: bom + Golf.toCsv([Golf.SHOT_HEADER].concat(Golf.shotRows(r))) },
    ];
  }

  // 공유 창(메일 앱)으로 CSV를 첨부해 보낸다. 공유 창이 없으면(PC 브라우저 등) 파일로 내려받는다
  function mailFiles() {
    const r = numbered(round());
    shareFiles(csvFiles(r), {
      title: mailSubject(r),
      text: `${mailSubject(r)}\nCSV 첨부: summary(Summary 시트) · round(동반자·비용·날씨·메모) · shots(샷 기록)`,
    });
  }

  async function fetchWeather() {
    const r = round();
    let lat = r.lat;
    let lon = r.lon;
    const club = db.clubs[r.club];
    if (lat == null && club && club.lat != null) { lat = club.lat; lon = club.lon; }
    if (lat == null) {
      if (!confirm('저장된 위치가 없습니다. 지금 위치를 골프장 위치로 사용할까요?')) return;
      try {
        ({ lat, lon } = await getPosition());
      } catch (e) {
        return toast(e.message);
      }
      r.lat = lat; r.lon = lon;
      if (club) { club.lat = lat; club.lon = lon; }
      save();
    }
    toast('날씨를 불러오는 중…');
    const q = `latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weather_code,wind_speed_10m`
      + `&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${r.date}&end_date=${r.date}`;
    // 최근 날짜는 예보 API, 오래된 날짜는 과거 기록 API
    const urls = [`https://api.open-meteo.com/v1/forecast?${q}`, `https://archive-api.open-meteo.com/v1/archive?${q}`];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const text = data.hourly && Golf.weatherText(data.hourly, r.time);
        if (text) {
          r.weather = text;
          save();
          render();
          return toast('날씨를 채웠습니다');
        }
      } catch (e) { /* 다음 API 시도 */ }
    }
    toast('날씨를 가져오지 못했습니다 (인터넷 연결 확인)');
  }

  // ---------- 백업 ----------
  function backup() {
    const name = `golf-backup-${today()}.json`;
    shareFiles([{ name, type: 'application/json', data: JSON.stringify(db, null, 1) }]);
  }

  function restore(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!Array.isArray(d.rounds)) throw new Error();
        if (!confirm(`백업의 라운드 ${d.rounds.length}개로 현재 기록(${db.rounds.length}개)을 바꿀까요?`)) return;
        db = { clubs: {}, ...d };
        save();
        go('home');
        toast('복원했습니다');
      } catch (e) {
        toast('백업 파일이 아닙니다');
      }
    };
    reader.readAsText(file);
  }

  // ---------- 이벤트 ----------
  const actions = {
    home: () => go('home'),
    new: () => go('setup', { setup: newSetup() }),
    open: (id) => {
      const r = db.rounds.find((x) => x.id === id);
      const done = Golf.stats(r).done;
      if (done === 18) go('summary', { roundId: id });
      else go('hole', { roundId: id, hole: r.holes.findIndex((h) => !Golf.isDone(h)), half: null, draft: { c: '', r: '', b: '' }, edit: null });
    },
    par: (arg) => {
      const [side, i] = arg.split(':');
      const pars = side === 'out' ? ui.setup.parsOut : ui.setup.parsIn;
      pars[i] = pars[i] >= 5 ? 3 : pars[i] + 1;
      render();
    },
    locate: async () => {
      try {
        Object.assign(ui.setup, await getPosition());
        render();
      } catch (e) {
        toast(e.message);
      }
    },
    start: startRound,
    hole: (i) => go('hole', { hole: +i, half: null, draft: { c: '', r: '', b: '' }, edit: null }),
    half: (k) => {
      ui.half = +k;
      render();
    },
    resume: () => {
      const r = round();
      const i = r.holes.findIndex((h) => !Golf.isDone(h));
      go('hole', { hole: i < 0 ? 0 : i, half: null, draft: { c: '', r: '', b: '' }, edit: null });
    },
    summary: () => go('summary'),
    pick: (arg) => {
      const k = arg.indexOf(':');
      pick(arg.slice(0, k), arg.slice(k + 1));
    },
    commit: commitShot,
    editShot: (k) => {
      const x = round().holes[ui.hole].shots[+k];
      ui.edit = +k;
      ui.draft = { ...x };
      render();
    },
    cancelEdit: () => {
      ui.edit = null;
      ui.draft = { c: '', r: '', b: '' };
      render();
    },
    delShot: () => {
      const h = round().holes[ui.hole];
      touch(h);
      h.shots.splice(ui.edit, 1);
      ui.edit = null;
      ui.draft = { c: '', r: '', b: '' };
      save();
      render();
    },
    putts: (n) => {
      const h = round().holes[ui.hole];
      touch(h);
      h.putts = h.putts === +n ? null : +n;
      save();
      render();
    },
    pen: (arg) => {
      const h = round().holes[ui.hole];
      touch(h);
      if (arg === 'auto') h.pen = null;
      else h.pen = Math.max(0, Golf.penalty(h) + Number(arg));
      save();
      render();
    },
    ss: () => {
      // 자동 → O → X → - → 자동
      const h = round().holes[ui.hole];
      const order = [null, 'O', 'X', '-'];
      h.ss = order[(order.indexOf(h.ss) + 1) % order.length];
      save();
      render();
    },
    mailFiles,
    weather: fetchWeather,
    editSetup: () => go('setup', { setup: setupFromRound(round()) }),
    delRound: () => {
      if (!confirm('이 라운드 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
      db.rounds = db.rounds.filter((r) => r.id !== ui.roundId);
      save();
      go('home');
    },
    backup,
    restore: () => document.getElementById('restoreFile').click(),
  };

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    actions[el.dataset.act](el.dataset.arg);
  });

  app.addEventListener('change', (e) => {
    const el = e.target.closest('[data-field]');
    if (!el) return;
    if (ui.view === 'setup') onSetupField(el.dataset.field, el.value);
    else if (ui.view === 'summary') onSummaryField(el.dataset.field, el.value, el);
  });

  document.getElementById('restoreFile').addEventListener('change', (e) => {
    if (e.target.files[0]) restore(e.target.files[0]);
    e.target.value = '';
  });

  function render() {
    const views = { home: viewHome, setup: viewSetup, hole: viewHole, summary: viewSummary };
    if (ui.view !== 'home' && ui.view !== 'setup' && !round()) ui.view = 'home';
    app.innerHTML = views[ui.view]();
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js');
  }

  render();
})();
