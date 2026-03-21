// 교회 데모 데이터 생성기
// 교인 20명 + 출석 3주 + 헌금 50건 + 설교 4편 + 기도 10건 + 소그룹 4개
'use strict';

const NAMES = ['김철수','이영희','박민수','정소영','최동현','한지은','오승준','양미경','서준호','문채원','장현우','임수진','조태민','신혜진','윤성민','배은지','류도현','홍서아','권재훈','송미래'];
const GROUPS = ['1셀','2셀','3셀','4셀'];
const OFFERING_TYPES = ['주일헌금','감사헌금','선교헌금','십일조','건축헌금'];
const PRAYER_TOPICS = ['가족 건강','취업 감사','자녀 교육','선교사 안전','교회 부흥','질병 치유','직장 평안','결혼 축복','이웃 돌봄','감사 기도'];

function generateChurchDemo(memory) {
  const results = { members: 0, attendance: 0, offerings: 0, sermons: 0, prayers: 0, groups: 0 };

  // 1. 교인 20명
  const memberIds = [];
  for (const name of NAMES) {
    const cat = Math.random() > 0.3 ? '정착' : '새가족';
    const group = GROUPS[Math.floor(Math.random() * GROUPS.length)];
    const cell = memory.createValue(name, 3, `${cat}, ${group}`, {
      confirmed: cat === '정착', layer: 0, tag: 3
    });
    memberIds.push(cell.id);
    results.members++;

    // 소그룹 배정 Claim
    memory.createClaim(name, '소그룹', group, 0, 1);
    results.groups++;
  }

  // 2. 출석 3주 (일요일 기준)
  const now = Date.now();
  const dayMs = 86400000;
  for (let week = 0; week < 3; week++) {
    const sunday = new Date(now - (week * 7 + new Date().getDay()) * dayMs);
    const dateStr = sunday.toLocaleDateString('ko');
    // 60~90% 출석
    const attendees = NAMES.filter(() => Math.random() > 0.2);
    for (const name of attendees) {
      memory.createClaim(name, '출석', dateStr, 0, 0);
      // 해당 셀 evidence 증가
      const idx = NAMES.indexOf(name);
      if (idx >= 0 && memberIds[idx]) memory.addEvidenceToCell(memberIds[idx]);
      results.attendance++;
    }
  }

  // 3. 헌금 50건
  for (let i = 0; i < 50; i++) {
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const type = OFFERING_TYPES[Math.floor(Math.random() * OFFERING_TYPES.length)];
    const amount = (Math.floor(Math.random() * 50) + 1) * 10000; // 1만~50만
    memory.createClaim(name, '헌금', `${type} ${amount.toLocaleString()}원`, 0, 1);
    results.offerings++;
  }

  // 4. 설교 4편
  const sermons = [
    { date:'2026-03-01', title:'믿음의 걸음', bible:'히브리서 11:1', speaker:'김목사', summary:'믿음은 바라는 것들의 실상' },
    { date:'2026-03-08', title:'사랑의 실천', bible:'고린도전서 13:4-7', speaker:'김목사', summary:'사랑은 오래 참고 온유하며' },
    { date:'2026-03-15', title:'소망의 닻', bible:'로마서 15:13', speaker:'이전도사', summary:'소망의 하나님이 기쁨과 평강을' },
    { date:'2026-03-22', title:'섬김의 리더십', bible:'마가복음 10:45', speaker:'김목사', summary:'섬김을 받으려 함이 아니라 섬기려 하고' },
  ];
  for (const s of sermons) {
    const obj = `[${s.date}] ${s.title} | 본문: ${s.bible} | ${s.summary} | 설교자: ${s.speaker}`;
    memory.createClaim(s.date, '설교', obj, 0, 1);
    // 공지로도
    memory.createClaim('공지', `설교: ${s.title}`, `${s.bible} — ${s.summary}`, 0, 0);
    results.sermons++;
  }

  // 5. 기도제목 10건
  for (let i = 0; i < 10; i++) {
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const topic = PRAYER_TOPICS[i];
    memory.createClaim(name, '기도제목', topic, 0, 1);
    // 30% 응답
    if (Math.random() > 0.7) {
      memory.createClaim(name, '기도', `응답: ${topic} 감사합니다`, 0, 3);
    }
    results.prayers++;
  }

  return results;
}

module.exports = { generateChurchDemo };
