// 골프 기록 계산·내보내기 로직 (DOM 없음 — 브라우저와 Node 양쪽에서 쓴다)
(function (root) {
  'use strict';

  // 엑셀 Dictionary 시트 기준 코드
  const CLUBS = ['D', 'W3', 'W5', 'U4', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'PW', 'AW', 'SW'];
  const RESULTS = [
    ['FW', '페어웨이'], ['RG', '러프'], ['HZ', '해저드'], ['OB', 'OB'],
    ['BK', '벙커'], ['FR', '프린지'], ['GR', '그린'],
  ];
  const FLIGHTS = [
    ['ST↑', '직선'], ['SL→', '슬라이스'], ['PS↗', '푸시'], ['HK←', '훅'],
    ['PU↖', '풀'], ['FA↓', '뒤땅'], ['TO↕', '탑볼'],
  ];
  const PENALTY = { OB: 2, HZ: 1 };
  const EXPENSES = [['green', '그린피'], ['cart', '카트비'], ['caddy', '캐디피'], ['bet', '내기'], ['misc', '기타']];

  function newHole() {
    return { shots: [], putts: null, pen: null, ss: null };
  }

  // 벌타: 직접 입력값이 있으면 그것, 없으면 OB 2 · 해저드 1
  function penalty(h) {
    if (h.pen != null) return h.pen;
    return h.shots.reduce((s, x) => s + (PENALTY[x.r] || 0), 0);
  }

  // 퍼팅 수를 넣어야 홀이 끝난 것으로 본다
  function isDone(h) {
    return h.putts != null;
  }

  // h.fixScore · h.fixGir: 엑셀에서 가져온 홀의 원래 값. 샷 기록만으로 맞지 않을 때만 들어 있고,
  // 앱에서 그 홀을 고치면 지워져 자동 계산으로 돌아간다
  function score(h) {
    if (!isDone(h)) return null;
    if (h.fixScore != null) return h.fixScore;
    return h.shots.length + h.putts + penalty(h);
  }

  // 그린에 올라가기까지 친 타수(벌타 포함). 그린에 못 올렸으면 null
  function strokesToGreen(h) {
    const i = h.shots.findIndex((x) => x.r === 'GR');
    if (i >= 0) {
      const before = h.shots.slice(0, i + 1);
      const pen = h.pen != null ? h.pen : before.reduce((s, x) => s + (PENALTY[x.r] || 0), 0);
      return i + 1 + pen;
    }
    if (h.putts === 0) return score(h); // 그린 밖에서 홀아웃
    return null;
  }

  function gir(h, par) {
    if (!isDone(h)) return '';
    if (h.fixGir) return h.fixGir;
    const n = strokesToGreen(h);
    return n != null && n <= par - 2 ? 'O' : 'X';
  }

  // 샌드세이브: 샷 결과에 BK가 있으면 파 이하 O, 보기 이상 X. BK가 없으면 '-'
  // 직접 고친 값(h.ss)이 있으면 그것을 쓴다
  function sandSave(h, par) {
    if (h.ss) return h.ss;
    if (!isDone(h) || !h.shots.some((x) => x.r === 'BK')) return '-';
    return score(h) <= par ? 'O' : 'X';
  }

  function sum(arr) {
    return arr.reduce((s, x) => s + (x || 0), 0);
  }

  // 라운드 통계 — 엑셀 Raw 블록의 수식과 같은 정의 (FW 안착률만 결과 칸 기준으로 보정)
  function stats(round) {
    const pars = round.pars;
    const holes = round.holes;
    const scores = holes.map(score);
    const diffs = holes.map((h, i) => (isDone(h) ? scores[i] - pars[i] : null));
    const count = (f) => diffs.filter((d) => d != null && f(d)).length;
    const tees = holes.map((h) => h.shots[0]);
    const longHoles = pars.map((p, i) => i).filter((i) => pars[i] > 3);
    const fwHits = longHoles.filter((i) => tees[i] && tees[i].r === 'FW').length;
    const ssList = holes.map((h, i) => sandSave(h, pars[i]));
    const ssO = ssList.filter((x) => x === 'O').length;
    const ssX = ssList.filter((x) => x === 'X').length;
    const flight = (code) => tees.filter((t) => t && t.b && t.b.startsWith(code)).length / 18;
    const exp = round.expense || {};
    return {
      done: holes.filter(isDone).length,
      par: sum(pars),
      out: sum(scores.slice(0, 9)),
      in: sum(scores.slice(9)),
      total: sum(scores),
      putts: sum(holes.map((h) => h.putts)),
      penalty: sum(holes.map(penalty)),
      eagle: count((d) => d <= -2),
      birdie: count((d) => d === -1),
      parCount: count((d) => d === 0),
      bogey: count((d) => d === 1),
      overDouble: count((d) => d >= 2),
      fwPct: longHoles.length ? fwHits / longHoles.length : '',
      fwHits,
      fwHoles: longHoles.length,
      gir: holes.filter((h, i) => gir(h, pars[i]) === 'O').length,
      girPct: holes.filter((h, i) => gir(h, pars[i]) === 'O').length / 18,
      ssO,
      ssX,
      ssPct: ssO + ssX ? ssO / (ssO + ssX) : '',
      straight: flight('ST'),
      slice: flight('SL'),
      push: flight('PS'),
      hook: flight('HK'),
      pull: flight('PU'),
      fat: flight('FA'),
      top: flight('TO'),
      expense: sum(EXPENSES.map(([k]) => Number(exp[k]) || 0)),
    };
  }

  function companionText(c) {
    if (!c || !c.name) return '';
    return `${c.name} / ${c.score != null && c.score !== '' ? c.score : ''}`;
  }

  function noteText(notes) {
    const lines = (notes || []).map((s) => s.trim()).filter(Boolean);
    return lines.length ? 'o ' + lines.join(', ') : '';
  }

  // 엑셀 셀에 탭·줄바꿈이 들어가면 칸이 밀리므로 공백으로 바꾼다
  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
    return String(v).replace(/[\t\r\n]+/g, ' ');
  }

  // Summary 시트 A~AB 28칸
  function summaryRow(round) {
    const s = stats(round);
    const c = round.companions || [];
    return [
      round.date.slice(0, 4), round.roundNo, round.date, round.time, round.club,
      s.total, s.out, s.in, s.putts, s.penalty,
      s.eagle, s.birdie, s.parCount, s.bogey, s.overDouble,
      s.fwPct, s.girPct, s.ssPct,
      s.straight, s.slice, s.push, s.hook, s.pull,
      companionText(c[0]), companionText(c[1]), companionText(c[2]),
      s.expense, noteText(round.notes),
    ];
  }

  const SUMMARY_HEADER = [
    'YEAR', 'ROUND', 'DATE', 'TIME', 'COUNTRY CLUB', 'TOTAL SCORE', 'SCORE (OUT)', 'SCORE (IN)',
    'TOTAL PUTTS', 'PANALTY', 'EAGLE', 'BIRDIE', 'PAR', 'BOGEY', 'OVER D-BOGEY',
    'FAIRWAY HIT (%)', 'GIR (%)', 'S-SAVES (%)', 'STRAIGHT', 'SLICE', 'PUSH', 'HOOK', 'PULL',
    'COMPANION1', 'COMPANION2', 'COMPANION3', 'TOTAL EXPENSE', 'NOTE',
  ];

  // 라운드 상세: Summary 28칸에 없는 정보(비용 항목·날씨·코스·동반자별 스코어·메모)까지 1행에
  const ROUND_HEADER = [
    'YEAR', 'ROUND', 'DATE', 'TIME', 'COUNTRY CLUB', 'COURSE (OUT)', 'COURSE (IN)', 'WEATHER',
    'TOTAL SCORE',
    'COMPANION1', 'SCORE1', 'COMPANION2', 'SCORE2', 'COMPANION3', 'SCORE3',
    'GREEN FEE', 'CART FEE', 'CADDY FEE', 'BET', 'MISCELLANEOUS', 'TOTAL EXPENSE',
    'NOTE1', 'NOTE2', 'NOTE3',
  ];

  function roundRow(round) {
    const s = stats(round);
    const c = [0, 1, 2].map((i) => (round.companions || [])[i] || {});
    const exp = round.expense || {};
    const notes = round.notes || [];
    return [
      round.date.slice(0, 4), round.roundNo, round.date, round.time, round.club,
      round.courseOut, round.courseIn, round.weather, s.total,
      ...c.flatMap((x) => [x.name || '', x.score != null ? x.score : '']),
      ...EXPENSES.map(([k]) => exp[k] != null ? exp[k] : ''), s.expense,
      notes[0] || '', notes[1] || '', notes[2] || '',
    ];
  }

  function courseName(round, i) {
    return i < 9 ? round.courseOut : round.courseIn;
  }

  // 샷 원본: 한 샷당 1행 (홀 정보는 반복)
  const SHOT_HEADER = [
    'YEAR', 'ROUND', 'DATE', 'COUNTRY CLUB', 'COURSE', 'HOLE', 'COURSE HOLE', 'PAR',
    'SCORE', 'PUTTS', 'PANALTY', 'GIR', 'S.SAVES', 'SHOT', 'CB', 'RT', 'BF',
  ];

  function shotRows(round) {
    const rows = [];
    round.holes.forEach((h, i) => {
      const base = [
        round.date.slice(0, 4), round.roundNo, round.date, round.club, courseName(round, i),
        i + 1, (i % 9) + 1, round.pars[i], score(h), h.putts, penalty(h),
        gir(h, round.pars[i]), sandSave(h, round.pars[i]),
      ];
      if (!h.shots.length) rows.push(base.concat(['', '', '', '']));
      h.shots.forEach((x, k) => rows.push(base.concat([k + 1, x.c, x.r, x.b])));
    });
    return rows;
  }

  function toCsv(rows) {
    const q = (v) => {
      const s = cell(v);
      return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map((r) => r.map(q).join(',')).join('\r\n');
  }

  // Open-Meteo WMO 날씨 코드 → 한국어
  function weatherLabel(code) {
    if (code == null) return '';
    if (code === 0) return '맑음';
    if (code <= 2) return '구름 조금';
    if (code === 3) return '흐림';
    if (code <= 48) return '안개';
    if (code <= 57) return '이슬비';
    if (code <= 67) return '비';
    if (code <= 77) return '눈';
    if (code <= 82) return '소나기';
    if (code <= 86) return '눈';
    return '뇌우';
  }

  // 시간별 예보에서 라운드 시간대(티타임부터 5시간)를 요약
  function weatherText(hourly, time) {
    const start = parseInt((time || '07:00').slice(0, 2), 10);
    const idx = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const hh = parseInt(hourly.time[i].slice(11, 13), 10);
      if (hh >= start && hh <= start + 5) idx.push(i);
    }
    if (!idx.length) return '';
    const temps = idx.map((i) => hourly.temperature_2m[i]).filter((v) => v != null);
    const winds = idx.map((i) => hourly.wind_speed_10m[i]).filter((v) => v != null);
    const codes = idx.map((i) => hourly.weather_code[i]).filter((v) => v != null);
    if (!temps.length) return '';
    // 비·눈이 한 번이라도 있으면 그것을, 아니면 가장 흐린 상태를 대표로
    const code = codes.length ? Math.max(...codes) : null;
    const lo = Math.round(Math.min(...temps));
    const hi = Math.round(Math.max(...temps));
    const wind = winds.length ? Math.round(sum(winds) / winds.length) : null;
    const parts = [weatherLabel(code), lo === hi ? `${lo}도` : `${lo}~${hi}도`];
    if (wind != null) parts.push(`바람 ${wind}m/s`);
    return parts.filter(Boolean).join(', ');
  }

  const api = {
    CLUBS, RESULTS, FLIGHTS, EXPENSES, SUMMARY_HEADER, SHOT_HEADER, ROUND_HEADER,
    newHole, penalty, isDone, score, gir, sandSave, stats,
    summaryRow, roundRow, shotRows, toCsv, weatherText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Golf = api;
})(this);
