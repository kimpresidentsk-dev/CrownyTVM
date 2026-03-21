// ═══════════════════════════════════════════════════════════════
// CrownyFoundry 프로젝트 템플릿 레지스트리
//
// 팔란티어 파운드리 70+ 프로젝트 템플릿 대응
// 각 템플릿: 프리셋 셀 + Claim + 연결 + 파이프라인 정의
//
// 차별점: 27방사형 셀 + 4상균형3진 + 신뢰전파 내장
// ═══════════════════════════════════════════════════════════════

'use strict';

// ═══ 도메인 정의 ═══
const DOMAINS = [
  // ── 크라우니 국가 3계층 ──
  { id: 'torah',        name: '토라·경계',        icon: '▮', color: '#2D7D5F', layer: 1 },
  { id: 'gospel',       name: '복음·관계',        icon: '♡', color: '#8C7440', layer: 2 },
  { id: 'spirit',       name: '성령·초월',        icon: '✦', color: '#6B5B8A', layer: 3 },
  // ── 산업 도메인 ──
  { id: 'defense',      name: '국방·안보',        icon: '◈', color: '#4A6741' },
  { id: 'government',   name: '공공·행정',        icon: '◇', color: '#5B6B8A' },
  { id: 'finance',      name: '금융·핀테크',      icon: '△', color: '#2D7D5F' },
  { id: 'healthcare',   name: '헬스케어',         icon: '▽', color: '#8C3D3D' },
  { id: 'manufacturing',name: '제조·산업IoT',     icon: '◻', color: '#6B6B68' },
  { id: 'logistics',    name: '물류·공급망',      icon: '▷', color: '#8C7440' },
  { id: 'energy',       name: '에너지·인프라',    icon: '◎', color: '#8C7440' },
  { id: 'smartcity',    name: '스마트시티',       icon: '▣', color: '#5B6B8A' },
  { id: 'education',    name: '교육·연구',        icon: '◁', color: '#6B5B8A' },
  { id: 'agriculture',  name: '농업·식품',        icon: '▤', color: '#5B6B4A' },
  { id: 'media',        name: '미디어·콘텐츠',    icon: '▥', color: '#6B5B8A' },
  { id: 'hr',           name: 'HR·조직관리',      icon: '▦', color: '#8A6B5B' },
  { id: 'legal',        name: '법률·컴플라이언스', icon: '▧', color: '#6B6B68' },
  { id: 'cyber',        name: '사이버보안',       icon: '▨', color: '#8C3D3D' },
];

// ═══ 템플릿 정의 (70개) ═══
const TEMPLATES = [

  // ────────── 국방/안보 (6개) ──────────
  { id: 'def-c2', domain: 'defense', name: 'C2 통합상황실',
    desc: '다중 센서 데이터 통합, 전술 상황 인식, 4상 위협 판정',
    cells: [
      { name: '레이더센서', type: 1, content: 0, layer: 0 },
      { name: '위성영상', type: 1, content: 0, layer: 0 },
      { name: '통신감청', type: 3, content: '신호', layer: 0 },
      { name: '위협분석엔진', type: 8, content: '4상판단', layer: 2, confirmed: true },
      { name: '지휘결심', type: 8, content: '결정트리', layer: 2 },
    ],
    claims: [
      { subject: '레이더센서', predicate: '탐지', object: '미식별체', layer: 3 },
      { subject: '위협분석엔진', predicate: '판정', object: '4상위협도', layer: 2 },
    ],
    connections: [[0,1],[1,2],[2,3],[3,4]],
    tags: ['에어갭', '주권컴퓨팅', 'ISA729'] },

  { id: 'def-intel', domain: 'defense', name: '정보융합 플랫폼',
    desc: 'HUMINT/SIGINT/OSINT 다중출처 정보 융합, 신뢰도 자동 산정',
    cells: [
      { name: 'HUMINT수집', type: 3, content: '인적정보', layer: 0 },
      { name: 'SIGINT수집', type: 3, content: '신호정보', layer: 0 },
      { name: 'OSINT수집', type: 3, content: '공개정보', layer: 0 },
      { name: '융합엔진', type: 8, content: '교차검증', layer: 2, confirmed: true },
      { name: '정보보고서', type: 3, content: '결과물', layer: 2 },
    ],
    claims: [
      { subject: '융합엔진', predicate: '교차검증', object: '3중출처', layer: 3 },
    ],
    connections: [[0,3],[1,3],[2,3],[3,4]],
    tags: ['정보융합', '신뢰전파', '교차검증'] },

  { id: 'def-logistics', domain: 'defense', name: '군수보급 추적',
    desc: '탄약/유류/식량 보급 체인 추적, 재고 4상 상태 관리',
    cells: [
      { name: '보급창고', type: 1, content: 0, layer: 0 },
      { name: '수송차량', type: 1, content: 0, layer: 0 },
      { name: '전방부대', type: 3, content: '수령지', layer: 0 },
      { name: '재고관리', type: 8, content: '임계치판단', layer: 2 },
    ],
    claims: [{ subject: '재고관리', predicate: '판단', object: '보급필요', layer: 2 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['군수', '보급체인'] },

  { id: 'def-drone', domain: 'defense', name: '드론 군집 관제',
    desc: '무인기 군집 상태 모니터링, 임무 할당, 충돌 회피',
    cells: [
      { name: '드론-1', type: 1, content: 0, layer: 0 },
      { name: '드론-2', type: 1, content: 0, layer: 0 },
      { name: '드론-3', type: 1, content: 0, layer: 0 },
      { name: '관제시스템', type: 8, content: '임무할당', layer: 2, confirmed: true },
    ],
    claims: [{ subject: '관제시스템', predicate: '관리', object: '3기드론', layer: 2 }],
    connections: [[3,0],[3,1],[3,2]],
    tags: ['무인기', '군집', '실시간'] },

  { id: 'def-cyber', domain: 'defense', name: '사이버작전 상황판',
    desc: '네트워크 공격/방어 실시간 모니터링, 위협 인텔리전스',
    cells: [
      { name: '방화벽로그', type: 1, content: 0, layer: 0 },
      { name: 'IDS알림', type: 3, content: '침입탐지', layer: 0 },
      { name: '위협인텔', type: 3, content: 'CTI피드', layer: 1 },
      { name: '대응엔진', type: 8, content: '자동차단', layer: 2 },
    ],
    claims: [{ subject: '대응엔진', predicate: '판단', object: '차단여부', layer: 2 }],
    connections: [[0,3],[1,3],[2,3]],
    tags: ['사이버', '위협인텔', '자동대응'] },

  { id: 'def-simulation', domain: 'defense', name: '전투 시뮬레이션',
    desc: '워게임 시나리오 분석, 병력 배치 최적화, 결과 예측',
    cells: [
      { name: '아군병력', type: 1, content: 0, layer: 0 },
      { name: '적군병력', type: 1, content: 0, layer: 0 },
      { name: '지형데이터', type: 3, content: 'GIS', layer: 0 },
      { name: '시뮬엔진', type: 8, content: '몬테카를로', layer: 2 },
      { name: '결과분석', type: 8, content: '승률계산', layer: 2 },
    ],
    claims: [{ subject: '시뮬엔진', predicate: '예측', object: '전투결과', layer: 2 }],
    connections: [[0,3],[1,3],[2,3],[3,4]],
    tags: ['시뮬레이션', '워게임'] },

  // ────────── 공공/행정 (6개) ──────────
  { id: 'gov-epeople', domain: 'government', name: '국민소통 분석',
    desc: '민원/청원 텍스트 분석, 감성 4상 분류, 부처별 자동 라우팅',
    cells: [
      { name: '민원접수', type: 3, content: '텍스트', layer: 0 },
      { name: '감성분석', type: 8, content: 'NLP', layer: 2 },
      { name: '부처라우터', type: 8, content: '분류기', layer: 2 },
      { name: '처리현황', type: 1, content: 0, layer: 1 },
    ],
    claims: [{ subject: '감성분석', predicate: '분류', object: '4상감성', layer: 3 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['민원', '감성분석', 'NLP'] },

  { id: 'gov-budget', domain: 'government', name: '예산 집행 모니터',
    desc: '부처별 예산 배정/집행/이월 추적, 이상 지출 4상 감지',
    cells: [
      { name: '예산배정', type: 1, content: 0, layer: 0 },
      { name: '집행내역', type: 1, content: 0, layer: 0 },
      { name: '이상감지', type: 8, content: '통계분석', layer: 2 },
      { name: '감사보고', type: 3, content: '자동생성', layer: 2 },
    ],
    claims: [{ subject: '이상감지', predicate: '판단', object: '이상지출', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['예산', '감사', '이상탐지'] },

  { id: 'gov-disaster', domain: 'government', name: '재난안전 통합',
    desc: '지진/홍수/화재 다중재난 통합 상황판, 대피 경로 최적화',
    cells: [
      { name: '기상관측', type: 1, content: 0, layer: 0 },
      { name: '지진센서', type: 1, content: 0, layer: 0 },
      { name: '화재신고', type: 3, content: '119', layer: 0 },
      { name: '통합상황판', type: 8, content: '융합분석', layer: 2, confirmed: true },
      { name: '대피경로', type: 8, content: '최적화', layer: 2 },
    ],
    claims: [{ subject: '통합상황판', predicate: '판단', object: '재난등급', layer: 2 }],
    connections: [[0,3],[1,3],[2,3],[3,4]],
    tags: ['재난', '안전', '대피'] },

  { id: 'gov-welfare', domain: 'government', name: '복지 사각지대 발굴',
    desc: '수급자 데이터 교차 분석, 미수급 대상 4상 판별',
    cells: [
      { name: '수급자DB', type: 1, content: 0, layer: 0 },
      { name: '건보데이터', type: 1, content: 0, layer: 0 },
      { name: '교차분석', type: 8, content: '매칭', layer: 2 },
      { name: '사각지대', type: 3, content: '대상목록', layer: 2 },
    ],
    claims: [{ subject: '교차분석', predicate: '발굴', object: '미수급자', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['복지', '사각지대', '교차분석'] },

  { id: 'gov-traffic', domain: 'government', name: '교통 흐름 최적화',
    desc: '도로 CCTV + 센서 데이터 융합, 신호체계 4상 최적화',
    cells: [
      { name: 'CCTV영상', type: 1, content: 0, layer: 0 },
      { name: '도로센서', type: 1, content: 0, layer: 0 },
      { name: '흐름분석', type: 8, content: '예측', layer: 2 },
      { name: '신호제어', type: 8, content: '최적화', layer: 2 },
    ],
    claims: [{ subject: '흐름분석', predicate: '예측', object: '혼잡도', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['교통', '최적화', 'CCTV'] },

  { id: 'gov-opendata', domain: 'government', name: '공공데이터 허브',
    desc: '공공데이터포털 연동, 자동 27방사형 슬롯 매핑, 품질 4상 관리',
    cells: [
      { name: '데이터포털', type: 3, content: 'API연동', layer: 0 },
      { name: '자동매핑', type: 8, content: '슬롯매핑', layer: 1 },
      { name: '품질검사', type: 8, content: '4상판정', layer: 3 },
      { name: '카탈로그', type: 3, content: '검색가능', layer: 1 },
    ],
    claims: [{ subject: '품질검사', predicate: '판정', object: '데이터품질', layer: 3 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['공공데이터', '품질', '카탈로그'] },

  // ────────── 금융/핀테크 (6개) ──────────
  { id: 'fin-trading', domain: 'finance', name: 'KPS 트레이딩 시스템',
    desc: 'EMA9/21/50 기반 매매 신호, 4상 확신도, 포지션 관리',
    cells: [
      { name: '시장데이터', type: 1, content: 0, layer: 0 },
      { name: 'EMA분석기', type: 8, content: 'EMA9/21/50', layer: 2, confirmed: true },
      { name: '신호생성기', type: 8, content: '크로스판단', layer: 2 },
      { name: '포지션관리', type: 8, content: '리스크', layer: 2 },
      { name: '실행엔진', type: 8, content: '주문', layer: 2 },
    ],
    claims: [
      { subject: 'EMA분석기', predicate: '생성', object: '매매신호', layer: 2 },
      { subject: '신호생성기', predicate: '판단', object: '골든/데드크로스', layer: 2 },
    ],
    connections: [[0,1],[1,2],[2,3],[3,4]],
    tags: ['트레이딩', 'KPS', 'EMA'] },

  { id: 'fin-aml', domain: 'finance', name: '자금세탁 탐지 (AML)',
    desc: '거래 패턴 분석, 이상거래 4상 판정, SAR 자동 보고',
    cells: [
      { name: '거래내역', type: 1, content: 0, layer: 0 },
      { name: '고객프로필', type: 3, content: 'KYC', layer: 0 },
      { name: '패턴분석', type: 8, content: '이상탐지', layer: 2 },
      { name: 'SAR생성', type: 3, content: '의심보고', layer: 2 },
    ],
    claims: [{ subject: '패턴분석', predicate: '탐지', object: '이상거래', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['AML', 'KYC', '이상탐지'] },

  { id: 'fin-credit', domain: 'finance', name: '신용 평가 엔진',
    desc: '대안데이터 기반 신용 평가, 4상 신뢰도 신용 등급',
    cells: [
      { name: '금융데이터', type: 1, content: 0, layer: 0 },
      { name: '대안데이터', type: 3, content: '통신/공과금', layer: 0 },
      { name: '평가모델', type: 8, content: 'ML스코어링', layer: 2 },
      { name: '신용등급', type: 1, content: 0, layer: 2 },
    ],
    claims: [{ subject: '평가모델', predicate: '산출', object: '신용점수', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['신용', '대안데이터', 'ML'] },

  { id: 'fin-defi', domain: 'finance', name: 'DeFi 포트폴리오',
    desc: '멀티체인 DeFi 포지션 추적, 일드파밍 최적화, 리스크 4상 관리',
    cells: [
      { name: '온체인데이터', type: 1, content: 0, layer: 0 },
      { name: '유동성풀', type: 1, content: 0, layer: 0 },
      { name: '일드분석', type: 8, content: 'APY계산', layer: 2 },
      { name: '리스크엔진', type: 8, content: 'IL계산', layer: 2 },
    ],
    claims: [{ subject: '리스크엔진', predicate: '평가', object: '포지션리스크', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['DeFi', '온체인', '일드'] },

  { id: 'fin-regtech', domain: 'finance', name: '규제 준수 모니터',
    desc: '금융 규제 변경 자동 추적, 준수 상태 4상 판정',
    cells: [
      { name: '규제DB', type: 3, content: '법규목록', layer: 0 },
      { name: '내부정책', type: 3, content: '사규', layer: 0 },
      { name: '갭분석', type: 8, content: '매칭', layer: 2 },
      { name: '준수보고', type: 3, content: '자동생성', layer: 2 },
    ],
    claims: [{ subject: '갭분석', predicate: '판정', object: '준수상태', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['RegTech', '규제', '준수'] },

  { id: 'fin-insurance', domain: 'finance', name: '보험 청구 분석',
    desc: '보험 청구 패턴 분석, 부정 청구 4상 탐지, 자동 심사',
    cells: [
      { name: '청구데이터', type: 1, content: 0, layer: 0 },
      { name: '의료기록', type: 3, content: '진료', layer: 0 },
      { name: '부정탐지', type: 8, content: '패턴분석', layer: 2 },
      { name: '심사결과', type: 1, content: 0, layer: 2 },
    ],
    claims: [{ subject: '부정탐지', predicate: '판정', object: '부정여부', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['보험', '부정탐지', '심사'] },

  // ────────── 헬스케어 (5개) ──────────
  { id: 'hc-patient', domain: 'healthcare', name: '환자 360도 뷰',
    desc: 'EMR/약물/검사 통합, 약물 상호작용 4상 경보',
    cells: [
      { name: 'EMR데이터', type: 3, content: '전자의무기록', layer: 0 },
      { name: '약물정보', type: 3, content: '처방', layer: 0 },
      { name: '검사결과', type: 1, content: 0, layer: 0 },
      { name: '상호작용분석', type: 8, content: '약물충돌', layer: 2 },
      { name: '환자대시보드', type: 3, content: '통합뷰', layer: 1 },
    ],
    claims: [{ subject: '상호작용분석', predicate: '경고', object: '약물충돌', layer: 3 }],
    connections: [[0,4],[1,3],[2,4],[3,4]],
    tags: ['EMR', '약물', '환자'] },

  { id: 'hc-epidemic', domain: 'healthcare', name: '감염병 확산 예측',
    desc: '역학 데이터 분석, 확산 모델링, 방역 자원 최적 배치',
    cells: [
      { name: '확진데이터', type: 1, content: 0, layer: 0 },
      { name: '이동경로', type: 3, content: 'GPS', layer: 0 },
      { name: '확산모델', type: 8, content: 'SIR모델', layer: 2 },
      { name: '방역배치', type: 8, content: '최적화', layer: 2 },
    ],
    claims: [{ subject: '확산모델', predicate: '예측', object: '확산경로', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['감염병', '역학', '예측'] },

  { id: 'hc-clinical', domain: 'healthcare', name: '임상시험 관리',
    desc: '임상시험 단계별 추적, 부작용 4상 모니터, FDA 보고',
    cells: [
      { name: '피험자', type: 1, content: 0, layer: 0 },
      { name: '투약기록', type: 3, content: '프로토콜', layer: 0 },
      { name: '부작용모니터', type: 8, content: 'AE분석', layer: 2 },
      { name: 'FDA보고', type: 3, content: '자동생성', layer: 2 },
    ],
    claims: [{ subject: '부작용모니터', predicate: '감시', object: '이상반응', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['임상시험', '부작용', 'FDA'] },

  { id: 'hc-genomics', domain: 'healthcare', name: '유전체 분석',
    desc: '게놈 시퀀싱 데이터 처리, 변이 4상 판정, 맞춤의학',
    cells: [
      { name: '시퀀싱데이터', type: 3, content: 'FASTQ', layer: 0 },
      { name: '변이분석', type: 8, content: 'GATK', layer: 2 },
      { name: '임상해석', type: 8, content: '병원성판단', layer: 2 },
    ],
    claims: [{ subject: '변이분석', predicate: '판정', object: '병원성', layer: 3 }],
    connections: [[0,1],[1,2]],
    tags: ['유전체', '게놈', '맞춤의학'] },

  { id: 'hc-mental', domain: 'healthcare', name: '정신건강 모니터',
    desc: '디지털 바이오마커, 행동 패턴 분석, 위기 4상 감지',
    cells: [
      { name: '활동데이터', type: 1, content: 0, layer: 0 },
      { name: '수면패턴', type: 1, content: 0, layer: 0 },
      { name: '감정분석', type: 8, content: 'NLP', layer: 2 },
      { name: '위기감지', type: 8, content: '임계치', layer: 2 },
    ],
    claims: [{ subject: '위기감지', predicate: '경보', object: '위기수준', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['정신건강', '바이오마커'] },

  // ────────── 제조/산업IoT (5개) ──────────
  { id: 'mfg-predictive', domain: 'manufacturing', name: '예지보전 시스템',
    desc: '설비 센서 데이터 분석, 고장 4상 예측, 정비 스케줄 최적화',
    cells: [
      { name: '진동센서', type: 1, content: 0, layer: 0 },
      { name: '온도센서', type: 1, content: 0, layer: 0 },
      { name: '고장예측', type: 8, content: 'ML모델', layer: 2 },
      { name: '정비스케줄', type: 8, content: '최적화', layer: 2 },
    ],
    claims: [{ subject: '고장예측', predicate: '예측', object: '잔여수명', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['예지보전', 'IoT', 'ML'] },

  { id: 'mfg-quality', domain: 'manufacturing', name: '품질 관리 (SPC)',
    desc: '공정 품질 실시간 모니터, 불량 4상 판정, 원인 추적',
    cells: [
      { name: '공정데이터', type: 1, content: 0, layer: 0 },
      { name: '검사결과', type: 1, content: 0, layer: 0 },
      { name: 'SPC분석', type: 8, content: '관리도', layer: 2 },
      { name: '원인분석', type: 8, content: '피쉬본', layer: 2 },
    ],
    claims: [{ subject: 'SPC분석', predicate: '판정', object: '공정이탈', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['SPC', '품질', '불량'] },

  { id: 'mfg-digital-twin', domain: 'manufacturing', name: '디지털 트윈',
    desc: '물리 설비의 디지털 복제, 시뮬레이션, 최적 파라미터 탐색',
    cells: [
      { name: '실물설비', type: 1, content: 0, layer: 0 },
      { name: '센서스트림', type: 1, content: 0, layer: 0 },
      { name: '트윈모델', type: 8, content: '시뮬레이션', layer: 2, confirmed: true },
      { name: '최적파라미터', type: 1, content: 0, layer: 2 },
    ],
    claims: [{ subject: '트윈모델', predicate: '시뮬', object: '파라미터', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['디지털트윈', '시뮬레이션'] },

  { id: 'mfg-mes', domain: 'manufacturing', name: 'MES 통합',
    desc: '생산 실행 시스템 통합, 작업지시/실적/추적 27방사형 매핑',
    cells: [
      { name: '작업지시', type: 3, content: 'WO', layer: 0 },
      { name: '설비상태', type: 1, content: 0, layer: 0 },
      { name: '생산실적', type: 1, content: 0, layer: 1 },
      { name: '추적이력', type: 3, content: '로트추적', layer: 1 },
    ],
    claims: [{ subject: '생산실적', predicate: '달성', object: '목표수량', layer: 1 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['MES', '생산', '추적'] },

  { id: 'mfg-energy', domain: 'manufacturing', name: '공장 에너지 관리',
    desc: '설비별 전력 모니터, 피크 관리, 탄소 배출 4상 추적',
    cells: [
      { name: '전력미터', type: 1, content: 0, layer: 0 },
      { name: '피크분석', type: 8, content: '패턴', layer: 2 },
      { name: '탄소배출', type: 1, content: 0, layer: 1 },
      { name: '절감제안', type: 8, content: '최적화', layer: 2 },
    ],
    claims: [{ subject: '피크분석', predicate: '감지', object: '피크시간', layer: 2 }],
    connections: [[0,1],[0,2],[1,3]],
    tags: ['에너지', '탄소', '절감'] },

  // ────────── 물류/공급망 (5개) ──────────
  { id: 'log-scm', domain: 'logistics', name: '공급망 가시성',
    desc: '다단계 공급망 실시간 추적, 병목 4상 감지, 리스크 지도',
    cells: [
      { name: '원자재공급', type: 3, content: '1차벤더', layer: 0 },
      { name: '제조공장', type: 3, content: '생산', layer: 0 },
      { name: '물류센터', type: 3, content: '배송', layer: 0 },
      { name: '최종고객', type: 3, content: '수령', layer: 0 },
      { name: '리스크엔진', type: 8, content: '병목감지', layer: 2 },
    ],
    claims: [{ subject: '리스크엔진', predicate: '감지', object: '공급리스크', layer: 2 }],
    connections: [[0,1],[1,2],[2,3],[4,0],[4,1],[4,2]],
    tags: ['SCM', '가시성', '리스크'] },

  { id: 'log-warehouse', domain: 'logistics', name: '스마트 창고',
    desc: 'WMS 통합, 재고 최적화, 피킹 경로 4상 최적화',
    cells: [
      { name: '재고현황', type: 1, content: 0, layer: 0 },
      { name: '입출고', type: 1, content: 0, layer: 0 },
      { name: '피킹최적화', type: 8, content: '경로', layer: 2 },
      { name: '재고예측', type: 8, content: '수요예측', layer: 2 },
    ],
    claims: [{ subject: '재고예측', predicate: '예측', object: '적정재고', layer: 2 }],
    connections: [[0,2],[0,3],[1,2]],
    tags: ['WMS', '재고', '피킹'] },

  { id: 'log-fleet', domain: 'logistics', name: '차량 관제',
    desc: 'GPS 기반 차량 추적, 배차 최적화, 연비 4상 분석',
    cells: [
      { name: 'GPS트래커', type: 1, content: 0, layer: 0 },
      { name: '배차시스템', type: 8, content: '최적화', layer: 2 },
      { name: '연비분석', type: 8, content: 'OBD데이터', layer: 1 },
    ],
    claims: [{ subject: '배차시스템', predicate: '최적화', object: '경로', layer: 2 }],
    connections: [[0,1],[0,2]],
    tags: ['차량', 'GPS', '배차'] },

  { id: 'log-lastmile', domain: 'logistics', name: '라스트마일 배송',
    desc: '택배 실시간 추적, 배송 예측, 고객 만족도 4상 관리',
    cells: [
      { name: '주문데이터', type: 1, content: 0, layer: 0 },
      { name: '배송기사', type: 3, content: '위치', layer: 0 },
      { name: '도착예측', type: 8, content: 'ETA', layer: 2 },
      { name: '만족도', type: 1, content: 0, layer: 3 },
    ],
    claims: [{ subject: '도착예측', predicate: '예측', object: 'ETA', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['라스트마일', 'ETA', '만족도'] },

  { id: 'log-cold', domain: 'logistics', name: '콜드체인 모니터',
    desc: '냉장/냉동 온도 실시간 감시, 이탈 4상 경보, 이력 추적',
    cells: [
      { name: '온도센서', type: 1, content: 0, layer: 0 },
      { name: '습도센서', type: 1, content: 0, layer: 0 },
      { name: '이탈감지', type: 8, content: '임계치', layer: 2 },
      { name: '이력인증', type: 3, content: 'HACCP', layer: 1 },
    ],
    claims: [{ subject: '이탈감지', predicate: '경보', object: '온도이탈', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['콜드체인', 'HACCP', '온도'] },

  // ────────── 에너지 (5개) ──────────
  { id: 'eng-grid', domain: 'energy', name: '전력 그리드 관리',
    desc: '송배전 실시간 모니터, 부하 예측, 정전 4상 예방',
    cells: [
      { name: '발전소', type: 1, content: 0, layer: 0 },
      { name: '변전소', type: 1, content: 0, layer: 0 },
      { name: '부하예측', type: 8, content: 'ML', layer: 2 },
      { name: '정전예방', type: 8, content: '경보', layer: 2 },
    ],
    claims: [{ subject: '부하예측', predicate: '예측', object: '피크부하', layer: 2 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['전력', '그리드', '부하'] },

  { id: 'eng-solar', domain: 'energy', name: '태양광 발전 최적화',
    desc: '일사량 예측, 패널 효율 4상 모니터, ESS 충방전 최적화',
    cells: [
      { name: '일사량센서', type: 1, content: 0, layer: 0 },
      { name: '패널효율', type: 1, content: 0, layer: 0 },
      { name: 'ESS관리', type: 8, content: '충방전', layer: 2 },
      { name: '발전예측', type: 8, content: '기상연동', layer: 2 },
    ],
    claims: [{ subject: '발전예측', predicate: '예측', object: '발전량', layer: 2 }],
    connections: [[0,3],[1,2],[3,2]],
    tags: ['태양광', 'ESS', '신재생'] },

  { id: 'eng-ev', domain: 'energy', name: 'EV 충전 인프라',
    desc: '충전소 실시간 현황, 수요 예측, 최적 입지 4상 분석',
    cells: [
      { name: '충전소현황', type: 1, content: 0, layer: 0 },
      { name: 'EV등록', type: 1, content: 0, layer: 0 },
      { name: '수요예측', type: 8, content: '패턴', layer: 2 },
      { name: '입지분석', type: 8, content: 'GIS', layer: 2 },
    ],
    claims: [{ subject: '수요예측', predicate: '예측', object: '충전수요', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['EV', '충전', '인프라'] },

  { id: 'eng-carbon', domain: 'energy', name: '탄소 배출권 관리',
    desc: '배출량 측정/보고/검증(MRV), 배출권 거래 4상 추적',
    cells: [
      { name: '배출측정', type: 1, content: 0, layer: 0 },
      { name: '배출권거래', type: 1, content: 0, layer: 0 },
      { name: 'MRV검증', type: 8, content: '인증', layer: 3 },
      { name: '탄소보고', type: 3, content: '자동', layer: 2 },
    ],
    claims: [{ subject: 'MRV검증', predicate: '인증', object: '배출량', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['탄소', 'MRV', '배출권'] },

  { id: 'eng-nuclear', domain: 'energy', name: '원전 안전 관리',
    desc: '원자력 발전소 다중 센서 모니터, 안전 4상 등급, 규제 보고',
    cells: [
      { name: '방사선센서', type: 1, content: 0, layer: 0 },
      { name: '냉각시스템', type: 1, content: 0, layer: 0 },
      { name: '안전분석', type: 8, content: '다중방호', layer: 2, confirmed: true },
      { name: '규제보고', type: 3, content: 'NSSC', layer: 2 },
    ],
    claims: [{ subject: '안전분석', predicate: '판정', object: '안전등급', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['원전', '안전', '규제'] },

  // ────────── 스마트시티 (5개) ──────────
  { id: 'sc-dashboard', domain: 'smartcity', name: '도시 OS 대시보드',
    desc: '도시 전체 인프라 통합 모니터, 서비스 4상 건강도',
    cells: [
      { name: '교통', type: 1, content: 0, layer: 0 },
      { name: '환경', type: 1, content: 0, layer: 0 },
      { name: '에너지', type: 1, content: 0, layer: 0 },
      { name: '안전', type: 1, content: 0, layer: 0 },
      { name: '통합엔진', type: 8, content: '크라우니셀', layer: 2, confirmed: true },
    ],
    claims: [{ subject: '통합엔진', predicate: '통합', object: '도시데이터', layer: 2 }],
    connections: [[0,4],[1,4],[2,4],[3,4]],
    tags: ['도시OS', '통합', '대시보드'] },

  { id: 'sc-parking', domain: 'smartcity', name: '스마트 주차',
    desc: '주차면 실시간 감지, 주차 유도, 요금 4상 차등',
    cells: [
      { name: '주차센서', type: 1, content: 0, layer: 0 },
      { name: '유도시스템', type: 8, content: '경로', layer: 2 },
      { name: '요금관리', type: 8, content: '차등', layer: 1 },
    ],
    claims: [{ subject: '유도시스템', predicate: '안내', object: '빈자리', layer: 1 }],
    connections: [[0,1],[1,2]],
    tags: ['주차', '센서', '유도'] },

  { id: 'sc-air', domain: 'smartcity', name: '대기질 모니터',
    desc: 'PM2.5/PM10/오존 실시간 측정, 건강 4상 경보',
    cells: [
      { name: 'PM센서', type: 1, content: 0, layer: 0 },
      { name: '오존센서', type: 1, content: 0, layer: 0 },
      { name: '예측모델', type: 8, content: 'ML', layer: 2 },
      { name: '건강경보', type: 8, content: '4상등급', layer: 2 },
    ],
    claims: [{ subject: '예측모델', predicate: '예측', object: '대기질', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['대기질', 'PM2.5', '환경'] },

  { id: 'sc-water', domain: 'smartcity', name: '스마트 상수도',
    desc: '수질/수압 실시간 모니터, 누수 4상 탐지',
    cells: [
      { name: '수질센서', type: 1, content: 0, layer: 0 },
      { name: '수압센서', type: 1, content: 0, layer: 0 },
      { name: '누수탐지', type: 8, content: '패턴', layer: 2 },
    ],
    claims: [{ subject: '누수탐지', predicate: '감지', object: '누수위치', layer: 2 }],
    connections: [[0,2],[1,2]],
    tags: ['상수도', '누수', '수질'] },

  { id: 'sc-waste', domain: 'smartcity', name: '스마트 폐기물',
    desc: '수거함 충만도 센서, 최적 수거 경로, 재활용 4상 분류',
    cells: [
      { name: '수거함센서', type: 1, content: 0, layer: 0 },
      { name: '경로최적화', type: 8, content: 'TSP', layer: 2 },
      { name: '분류분석', type: 8, content: 'CV', layer: 2 },
    ],
    claims: [{ subject: '분류분석', predicate: '분류', object: '재활용', layer: 1 }],
    connections: [[0,1],[0,2]],
    tags: ['폐기물', '수거', '재활용'] },

  // ────────── 교육/연구 (4개) ──────────
  { id: 'edu-lms', domain: 'education', name: '학습 관리 시스템',
    desc: '학습자 성취도 4상 추적, 맞춤 학습 경로 추천',
    cells: [
      { name: '학습활동', type: 1, content: 0, layer: 0 },
      { name: '평가결과', type: 1, content: 0, layer: 0 },
      { name: '역량분석', type: 8, content: 'KG', layer: 2 },
      { name: '경로추천', type: 8, content: '적응학습', layer: 2 },
    ],
    claims: [{ subject: '역량분석', predicate: '평가', object: '성취수준', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['LMS', '적응학습', '추천'] },

  { id: 'edu-research', domain: 'education', name: '연구 지식 그래프',
    desc: '논문/특허/연구자 온톨로지, 협업 네트워크, 트렌드 4상 분석',
    cells: [
      { name: '논문DB', type: 3, content: '학술', layer: 0 },
      { name: '특허DB', type: 3, content: '지재권', layer: 0 },
      { name: '연구자네트워크', type: 8, content: '그래프', layer: 1 },
      { name: '트렌드분석', type: 8, content: 'NLP', layer: 2 },
    ],
    claims: [{ subject: '트렌드분석', predicate: '분석', object: '연구트렌드', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['연구', '지식그래프', '논문'] },

  { id: 'edu-campus', domain: 'education', name: '스마트 캠퍼스',
    desc: '캠퍼스 시설/에너지/안전 통합 관리, 이용률 4상 분석',
    cells: [
      { name: '시설현황', type: 1, content: 0, layer: 0 },
      { name: '에너지사용', type: 1, content: 0, layer: 0 },
      { name: '이용률분석', type: 8, content: '패턴', layer: 2 },
    ],
    claims: [{ subject: '이용률분석', predicate: '분석', object: '시설효율', layer: 1 }],
    connections: [[0,2],[1,2]],
    tags: ['캠퍼스', '시설', '에너지'] },

  { id: 'edu-hiring', domain: 'education', name: '인재 매칭 플랫폼',
    desc: '구직자 역량-기업 요구 매칭, 적합도 4상 판정',
    cells: [
      { name: '구직자프로필', type: 3, content: '역량', layer: 0 },
      { name: '기업요구', type: 3, content: 'JD', layer: 0 },
      { name: '매칭엔진', type: 8, content: 'ML', layer: 2 },
      { name: '적합도', type: 1, content: 0, layer: 2 },
    ],
    claims: [{ subject: '매칭엔진', predicate: '매칭', object: '적합도', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['인재', '매칭', 'HR'] },

  // ────────── 농업 (4개) ──────────
  { id: 'agr-smart', domain: 'agriculture', name: '스마트팜 관제',
    desc: '온실 센서 통합, 생육 4상 관리, 자동 관수/환기',
    cells: [
      { name: '토양센서', type: 1, content: 0, layer: 0 },
      { name: '기상데이터', type: 1, content: 0, layer: 0 },
      { name: '생육분석', type: 8, content: '모델', layer: 2 },
      { name: '자동제어', type: 8, content: '관수/환기', layer: 2 },
    ],
    claims: [{ subject: '생육분석', predicate: '판단', object: '생육상태', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['스마트팜', '센서', '자동화'] },

  { id: 'agr-trace', domain: 'agriculture', name: '농산물 이력 추적',
    desc: '파종→수확→유통 전과정 추적, 안전성 4상 인증',
    cells: [
      { name: '파종기록', type: 3, content: '종자', layer: 0 },
      { name: '재배관리', type: 3, content: '농약', layer: 0 },
      { name: '유통추적', type: 3, content: '물류', layer: 0 },
      { name: '안전인증', type: 8, content: '검사', layer: 3 },
    ],
    claims: [{ subject: '안전인증', predicate: '인증', object: '안전등급', layer: 3 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['이력추적', 'GAP', '안전'] },

  { id: 'agr-livestock', domain: 'agriculture', name: '축산 건강 관리',
    desc: '개체별 건강 모니터, 질병 4상 조기감지, 사육환경 최적화',
    cells: [
      { name: '개체센서', type: 1, content: 0, layer: 0 },
      { name: '사육환경', type: 1, content: 0, layer: 0 },
      { name: '건강분석', type: 8, content: 'AI', layer: 2 },
      { name: '질병감지', type: 8, content: '조기경보', layer: 2 },
    ],
    claims: [{ subject: '건강분석', predicate: '감시', object: '건강상태', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['축산', '건강', '조기감지'] },

  { id: 'agr-price', domain: 'agriculture', name: '농산물 가격 예측',
    desc: '도매시장/기상/수급 데이터 융합, 가격 4상 예측',
    cells: [
      { name: '도매시세', type: 1, content: 0, layer: 0 },
      { name: '작황데이터', type: 1, content: 0, layer: 0 },
      { name: '가격예측', type: 8, content: 'ML', layer: 2 },
    ],
    claims: [{ subject: '가격예측', predicate: '예측', object: '시세', layer: 2 }],
    connections: [[0,2],[1,2]],
    tags: ['가격', '예측', '도매'] },

  // ────────── 미디어 (4개) ──────────
  { id: 'med-content', domain: 'media', name: '콘텐츠 추천 엔진',
    desc: '사용자 행동 기반 추천, 콘텐츠 4상 분류, A/B 테스트',
    cells: [
      { name: '사용자행동', type: 1, content: 0, layer: 0 },
      { name: '콘텐츠메타', type: 3, content: '태그', layer: 0 },
      { name: '추천엔진', type: 8, content: 'CF/CB', layer: 2 },
      { name: 'AB테스트', type: 8, content: '실험', layer: 2 },
    ],
    claims: [{ subject: '추천엔진', predicate: '추천', object: '개인화', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['추천', '개인화', 'AB테스트'] },

  { id: 'med-fake', domain: 'media', name: '팩트체크 / 허위정보',
    desc: '뉴스/SNS 팩트체크 자동화, 신뢰도 4상 판정, 출처 추적',
    cells: [
      { name: '뉴스수집', type: 3, content: '크롤링', layer: 0 },
      { name: 'SNS수집', type: 3, content: '스트림', layer: 0 },
      { name: '팩트체크', type: 8, content: 'NLP+KB', layer: 2 },
      { name: '신뢰도판정', type: 8, content: '4상', layer: 3, confirmed: true },
    ],
    claims: [{ subject: '팩트체크', predicate: '검증', object: '진위여부', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['팩트체크', '허위정보', 'NLP'] },

  { id: 'med-ad', domain: 'media', name: '광고 효과 분석',
    desc: '멀티채널 광고 성과 추적, ROI 4상 분석, 예산 최적화',
    cells: [
      { name: '광고캠페인', type: 3, content: '멀티채널', layer: 0 },
      { name: '전환데이터', type: 1, content: 0, layer: 0 },
      { name: 'ROI분석', type: 8, content: '어트리뷰션', layer: 2 },
      { name: '예산최적화', type: 8, content: '배분', layer: 2 },
    ],
    claims: [{ subject: 'ROI분석', predicate: '분석', object: 'ROAS', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['광고', 'ROI', '어트리뷰션'] },

  { id: 'med-streaming', domain: 'media', name: '스트리밍 품질 관리',
    desc: 'CDN/트래픽/QoE 실시간 모니터, 화질 4상 자동 조정',
    cells: [
      { name: 'CDN상태', type: 1, content: 0, layer: 0 },
      { name: '트래픽', type: 1, content: 0, layer: 0 },
      { name: 'QoE분석', type: 8, content: '품질', layer: 2 },
      { name: '화질조정', type: 8, content: 'ABR', layer: 2 },
    ],
    claims: [{ subject: 'QoE분석', predicate: '측정', object: '사용자경험', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['스트리밍', 'CDN', 'QoE'] },

  // ────────── HR/조직 (4개) ──────────
  { id: 'hr-talent', domain: 'hr', name: '인재 관리 플랫폼',
    desc: '직원 역량 온톨로지, 성과 4상 분석, 후임자 계획',
    cells: [
      { name: '직원프로필', type: 3, content: '역량', layer: 0 },
      { name: '성과데이터', type: 1, content: 0, layer: 0 },
      { name: '역량분석', type: 8, content: '갭분석', layer: 2 },
      { name: '후임자계획', type: 8, content: '매칭', layer: 2 },
    ],
    claims: [{ subject: '역량분석', predicate: '분석', object: '역량갭', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['인재', '역량', '후임자'] },

  { id: 'hr-engagement', domain: 'hr', name: '직원 참여도 분석',
    desc: '설문/피드백/이직징후 분석, 참여도 4상 지표, 리텐션 전략',
    cells: [
      { name: '설문데이터', type: 1, content: 0, layer: 0 },
      { name: '피드백', type: 3, content: '텍스트', layer: 0 },
      { name: '참여도분석', type: 8, content: 'NLP', layer: 2 },
      { name: '이직예측', type: 8, content: 'ML', layer: 2 },
    ],
    claims: [{ subject: '참여도분석', predicate: '측정', object: '참여지수', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['참여도', '이직', '리텐션'] },

  { id: 'hr-safety', domain: 'hr', name: '산업 안전 관리',
    desc: '작업장 안전 모니터, 사고 4상 위험도 분석, 규제 준수',
    cells: [
      { name: '센서데이터', type: 1, content: 0, layer: 0 },
      { name: '사고이력', type: 3, content: '기록', layer: 0 },
      { name: '위험분석', type: 8, content: '패턴', layer: 2 },
      { name: '규제준수', type: 8, content: 'OSHA', layer: 3 },
    ],
    claims: [{ subject: '위험분석', predicate: '판단', object: '위험등급', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['안전', '사고', '규제'] },

  { id: 'hr-payroll', domain: 'hr', name: '급여/보상 분석',
    desc: '보상 벤치마크, 공정성 4상 분석, 예산 시뮬레이션',
    cells: [
      { name: '급여데이터', type: 1, content: 0, layer: 0 },
      { name: '시장벤치마크', type: 1, content: 0, layer: 0 },
      { name: '공정성분석', type: 8, content: '통계', layer: 2 },
      { name: '예산시뮬', type: 8, content: '시나리오', layer: 2 },
    ],
    claims: [{ subject: '공정성분석', predicate: '분석', object: '보상공정성', layer: 2 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['급여', '공정성', '벤치마크'] },

  // ────────── 법률/컴플라이언스 (4개) ──────────
  { id: 'leg-contract', domain: 'legal', name: '계약서 분석',
    desc: '계약서 NLP 분석, 리스크 조항 4상 판별, 기한 추적',
    cells: [
      { name: '계약서', type: 3, content: '문서', layer: 0 },
      { name: 'NLP분석', type: 8, content: '조항추출', layer: 2 },
      { name: '리스크판별', type: 8, content: '4상', layer: 2 },
      { name: '기한추적', type: 8, content: '알림', layer: 1 },
    ],
    claims: [{ subject: '리스크판별', predicate: '판별', object: '리스크조항', layer: 3 }],
    connections: [[0,1],[1,2],[1,3]],
    tags: ['계약', 'NLP', '리스크'] },

  { id: 'leg-gdpr', domain: 'legal', name: '개인정보 보호 (GDPR)',
    desc: '개인정보 처리 현황 추적, 준수 4상 점검, DPO 보고',
    cells: [
      { name: '처리활동', type: 3, content: 'RoPA', layer: 0 },
      { name: '동의현황', type: 1, content: 0, layer: 0 },
      { name: '준수점검', type: 8, content: '체크리스트', layer: 3 },
      { name: 'DPO보고', type: 3, content: '자동', layer: 2 },
    ],
    claims: [{ subject: '준수점검', predicate: '점검', object: '준수상태', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['GDPR', '개인정보', 'DPO'] },

  { id: 'leg-audit', domain: 'legal', name: '감사 추적 시스템',
    desc: '내부 감사 활동 추적, 발견사항 4상 관리, 시정조치 추적',
    cells: [
      { name: '감사계획', type: 3, content: '일정', layer: 0 },
      { name: '발견사항', type: 3, content: '지적', layer: 0 },
      { name: '시정조치', type: 8, content: '추적', layer: 2 },
      { name: '경영보고', type: 3, content: '자동', layer: 2 },
    ],
    claims: [{ subject: '시정조치', predicate: '추적', object: '이행률', layer: 2 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['감사', '시정', '추적'] },

  { id: 'leg-esg', domain: 'legal', name: 'ESG 평가 대시보드',
    desc: '환경/사회/지배구조 지표 통합, ESG 4상 등급, 공시 자동화',
    cells: [
      { name: '환경지표', type: 1, content: 0, layer: 0 },
      { name: '사회지표', type: 1, content: 0, layer: 0 },
      { name: '지배구조', type: 1, content: 0, layer: 0 },
      { name: 'ESG평가', type: 8, content: '통합점수', layer: 2 },
      { name: '공시보고', type: 3, content: '자동', layer: 2 },
    ],
    claims: [{ subject: 'ESG평가', predicate: '평가', object: 'ESG등급', layer: 2 }],
    connections: [[0,3],[1,3],[2,3],[3,4]],
    tags: ['ESG', '공시', '지속가능'] },

  // ────────── 사이버보안 (4개) ──────────
  { id: 'cyb-siem', domain: 'cyber', name: 'SIEM 통합 분석',
    desc: '보안 로그 통합, 위협 4상 판정, 인시던트 자동 대응',
    cells: [
      { name: '로그수집', type: 1, content: 0, layer: 0 },
      { name: '상관분석', type: 8, content: '룰엔진', layer: 2 },
      { name: '위협판정', type: 8, content: '4상', layer: 2, confirmed: true },
      { name: '자동대응', type: 8, content: 'SOAR', layer: 2 },
    ],
    claims: [{ subject: '위협판정', predicate: '판정', object: '위협등급', layer: 3 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['SIEM', 'SOAR', '위협'] },

  { id: 'cyb-vuln', domain: 'cyber', name: '취약점 관리',
    desc: '자산 취약점 스캔, 4상 위험도 우선순위, 패치 관리',
    cells: [
      { name: '자산목록', type: 3, content: 'CMDB', layer: 0 },
      { name: '취약점스캔', type: 1, content: 0, layer: 0 },
      { name: '우선순위', type: 8, content: 'CVSS+4상', layer: 2 },
      { name: '패치관리', type: 8, content: '배포', layer: 2 },
    ],
    claims: [{ subject: '우선순위', predicate: '판정', object: '위험도', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['취약점', 'CVSS', '패치'] },

  { id: 'cyb-threat', domain: 'cyber', name: '위협 인텔리전스',
    desc: 'CTI 피드 통합, IoC 4상 판정, 킬체인 분석',
    cells: [
      { name: 'CTI피드', type: 3, content: 'STIX', layer: 0 },
      { name: 'IoC분석', type: 8, content: '매칭', layer: 2 },
      { name: '킬체인', type: 8, content: 'ATT&CK', layer: 2 },
      { name: '방어전략', type: 3, content: '대응', layer: 2 },
    ],
    claims: [{ subject: 'IoC분석', predicate: '매칭', object: '위협지표', layer: 3 }],
    connections: [[0,1],[1,2],[2,3]],
    tags: ['CTI', 'IoC', 'ATT&CK'] },

  { id: 'cyb-zt', domain: 'cyber', name: '제로트러스트 관리',
    desc: 'ID/디바이스/네트워크 신뢰 4상 평가, 동적 접근 제어',
    cells: [
      { name: 'ID인증', type: 3, content: 'IAM', layer: 0 },
      { name: '디바이스', type: 3, content: 'EDR', layer: 0 },
      { name: '신뢰평가', type: 8, content: '4상', layer: 2, confirmed: true },
      { name: '접근제어', type: 8, content: '동적', layer: 2 },
    ],
    claims: [{ subject: '신뢰평가', predicate: '평가', object: '신뢰수준', layer: 3 }],
    connections: [[0,2],[1,2],[2,3]],
    tags: ['제로트러스트', 'IAM', 'EDR'] },

  // ══════════════════════════════════════════════════════════════
  // 크라우니 국가 프로젝트 (97개)
  // Layer 1 토라/경계 (33) + Layer 2 복음/관계 (37) + Layer 3 성령/초월 (27)
  // ══════════════════════════════════════════════════════════════

  // ────── 토라 1-A: 헌법·법체계 (9) ──────
  { id:'n-constitution', domain:'torah', name:'크라우니 헌법', desc:'토라+복음+성령 3계층 기반 헌법. 모든 시스템의 경계 조건', cells:[{name:'헌법전문',type:3,content:'3계층 언약',layer:0,confirmed:true},{name:'기본권조항',type:3,content:'생명·자유·존엄',layer:0,confirmed:true},{name:'경계정의',type:8,content:'비례적 제한',layer:0}], claims:[{subject:'헌법전문',predicate:'정의',object:'국가경계',layer:0}], connections:[[0,1],[1,2]], tags:['헌법','경계','기본권'] },
  { id:'n-rights', domain:'torah', name:'기본권 셀', desc:'생명·자유·재산·존엄 — 어떤 시스템도 넘지 못하는 선', cells:[{name:'생명권',type:3,content:'절대보호',layer:0,confirmed:true},{name:'자유권',type:3,content:'비례제한',layer:0,confirmed:true},{name:'재산권',type:3,content:'보호',layer:0},{name:'존엄권',type:3,content:'불가침',layer:0,confirmed:true}], claims:[{subject:'기본권',predicate:'위반감지',object:'즉시차단',layer:0}], connections:[[0,1],[1,2],[2,3]], tags:['기본권','생명','존엄'] },
  { id:'n-justice', domain:'torah', name:'비례적 사법', desc:'이에는 이 원칙 — 행위 크기에 비례하는 응답만 허용', cells:[{name:'사건접수',type:3,content:'입력',layer:0},{name:'비례성검사',type:8,content:'원인/대응 비율',layer:2},{name:'판결생성',type:3,content:'출력',layer:2}], claims:[{subject:'비례성검사',predicate:'판단',object:'비례여부',layer:2}], connections:[[0,1],[1,2]], tags:['사법','비례','판결'] },
  { id:'n-legislation', domain:'torah', name:'입법 파이프라인', desc:'법안 제안→4상 검증→시민 투표→확정', cells:[{name:'법안제안',type:3,content:'입력',layer:0},{name:'4상검증',type:8,content:'Ti/Om/Ta/Eum',layer:2},{name:'시민투표',type:8,content:'합의',layer:2},{name:'법률확정',type:3,content:'Ti확정',layer:0}], claims:[{subject:'4상검증',predicate:'판단',object:'법안적합성',layer:2}], connections:[[0,1],[1,2],[2,3]], tags:['입법','투표','검증'] },
  { id:'n-precedent', domain:'torah', name:'판례 셀DB', desc:'모든 판결이 27방사형 셀로 축적, 유사 사건 자동 검색', cells:[{name:'판례저장소',type:8,content:'셀DB',layer:0,confirmed:true},{name:'유사검색',type:8,content:'패턴매칭',layer:2},{name:'선례적용',type:8,content:'가중치',layer:2}], claims:[{subject:'판례저장소',predicate:'축적',object:'사법지혜',layer:0}], connections:[[0,1],[1,2]], tags:['판례','검색','축적'] },
  { id:'n-separation', domain:'torah', name:'권한 경계 시스템', desc:'행정·입법·사법 삼권의 경계, 침범 시 자동 차단', cells:[{name:'행정부',type:3,content:'집행',layer:0},{name:'입법부',type:3,content:'법제정',layer:0},{name:'사법부',type:3,content:'판단',layer:0},{name:'경계감시',type:8,content:'자동차단',layer:2}], claims:[{subject:'경계감시',predicate:'감시',object:'삼권분립',layer:0}], connections:[[0,3],[1,3],[2,3]], tags:['삼권분립','경계','감시'] },
  { id:'n-intlaw', domain:'torah', name:'국제법 매핑', desc:'국제법·UN헌장을 크라우니 셀 구조로 매핑', cells:[{name:'국제법DB',type:3,content:'UN헌장',layer:0},{name:'셀매핑',type:8,content:'자동변환',layer:1},{name:'준수검사',type:8,content:'4상',layer:2}], claims:[{subject:'셀매핑',predicate:'변환',object:'국제법→셀',layer:1}], connections:[[0,1],[1,2]], tags:['국제법','UN','매핑'] },
  { id:'n-child', domain:'torah', name:'아동 보호 경계', desc:'미성년자 대상 결정은 추가 경계 검사 필수', cells:[{name:'아동등록',type:3,content:'보호대상',layer:0},{name:'추가경계',type:8,content:'강화검사',layer:2,confirmed:true},{name:'보호자연결',type:3,content:'시냅스',layer:1}], claims:[{subject:'추가경계',predicate:'보호',object:'아동안전',layer:0}], connections:[[0,1],[0,2]], tags:['아동','보호','경계'] },
  { id:'n-emergency', domain:'torah', name:'긴급 권한 프로토콜', desc:'비상시 일시적 경계 완화 — 자동 복원 타이머', cells:[{name:'비상선언',type:3,content:'트리거',layer:0},{name:'경계완화',type:8,content:'일시적',layer:2},{name:'자동복원',type:8,content:'타이머',layer:2,confirmed:true}], claims:[{subject:'자동복원',predicate:'보장',object:'경계복원',layer:0}], connections:[[0,1],[1,2]], tags:['비상','긴급','복원'] },

  // ────── 토라 1-B: 신원·신뢰 (6) ──────
  { id:'n-citizen-id', domain:'torah', name:'시민 셀 ID', desc:'1인 1셀 — 27슬롯에 신원·역량·신뢰도 내장', cells:[{name:'시민셀',type:3,content:'27슬롯',layer:0},{name:'신원정보',type:3,content:'기본',layer:0},{name:'신뢰등급',type:8,content:'4상',layer:3}], claims:[{subject:'시민셀',predicate:'식별',object:'1인1셀',layer:0}], connections:[[0,1],[0,2]], tags:['신원','ID','시민'] },
  { id:'n-trust-grade', domain:'torah', name:'4상 신뢰 등급', desc:'Ti(검증)→Om(신규)→Ta(경고)→Eum(미등록) 자동 승격', cells:[{name:'신뢰엔진',type:8,content:'자동승격',layer:3,confirmed:true},{name:'근거수집',type:8,content:'행동이력',layer:1}], claims:[{subject:'신뢰엔진',predicate:'승격',object:'시민등급',layer:3}], connections:[[0,1]], tags:['신뢰','등급','승격'] },
  { id:'n-family-graph', domain:'torah', name:'가족 관계 그래프', desc:'시냅스로 가족 연결, 나→가족 가중치 자동 산출', cells:[{name:'가족노드',type:3,content:'구성원',layer:1},{name:'관계시냅스',type:8,content:'가중치',layer:1}], claims:[{subject:'가족노드',predicate:'연결',object:'가족관계',layer:1}], connections:[[0,1]], tags:['가족','관계','그래프'] },
  { id:'n-border', domain:'torah', name:'출입국 경계', desc:'물리/디지털 경계 통과 시 4상 검증', cells:[{name:'경계게이트',type:8,content:'검증',layer:0},{name:'통과기록',type:3,content:'이력',layer:1}], claims:[{subject:'경계게이트',predicate:'검증',object:'출입',layer:0}], connections:[[0,1]], tags:['출입국','경계','검증'] },
  { id:'n-privacy', domain:'torah', name:'개인정보 경계', desc:'본인 동의 없는 슬롯 접근 즉시 차단', cells:[{name:'동의관리',type:8,content:'접근제어',layer:0,confirmed:true},{name:'접근로그',type:3,content:'감사',layer:1}], claims:[{subject:'동의관리',predicate:'보호',object:'개인정보',layer:0}], connections:[[0,1]], tags:['개인정보','동의','보호'] },
  { id:'n-legacy', domain:'torah', name:'디지털 유산', desc:'사망/무능력 시 셀 전이 프로토콜', cells:[{name:'유산셀',type:3,content:'전이규칙',layer:0},{name:'수혜자',type:3,content:'지정',layer:1},{name:'전이실행',type:8,content:'자동',layer:2}], claims:[{subject:'유산셀',predicate:'전이',object:'디지털자산',layer:0}], connections:[[0,1],[1,2]], tags:['유산','전이','상속'] },

  // ────── 토라 1-C: 안보·방위 (9) ──────
  { id:'n-territory', domain:'torah', name:'국토 방위 셀', desc:'영토·영공·영해 경계 셀, 침범 즉시 대응', cells:[{name:'영토경계',type:3,content:'GIS',layer:0,confirmed:true},{name:'감시시스템',type:8,content:'센서융합',layer:2},{name:'대응엔진',type:8,content:'비례적',layer:2}], claims:[{subject:'감시시스템',predicate:'감시',object:'국토경계',layer:0}], connections:[[0,1],[1,2]], tags:['국토','방위','경계'] },
  { id:'n-cyberwall', domain:'torah', name:'사이버 방벽', desc:'네트워크 경계 4상 감시, 위협 자동 차단', cells:[{name:'방화벽',type:8,content:'4상',layer:0,confirmed:true},{name:'IDS',type:8,content:'탐지',layer:2},{name:'차단엔진',type:8,content:'자동',layer:2}], claims:[{subject:'IDS',predicate:'탐지',object:'사이버위협',layer:2}], connections:[[0,1],[1,2]], tags:['사이버','방벽','탐지'] },
  { id:'n-c2', domain:'torah', name:'통합 상황실', desc:'다중 센서 융합→4상 위협 판정→비례적 대응', cells:[{name:'센서융합',type:8,content:'다중',layer:2,confirmed:true},{name:'위협판정',type:8,content:'4상',layer:2},{name:'지휘결심',type:8,content:'비례적',layer:2}], claims:[{subject:'위협판정',predicate:'판정',object:'위협등급',layer:2}], connections:[[0,1],[1,2]], tags:['C2','상황실','융합'] },
  { id:'n-intel', domain:'torah', name:'정보 융합', desc:'HUMINT/SIGINT/OSINT 교차검증, 신뢰전파', cells:[{name:'HUMINT',type:3,content:'인적정보',layer:0},{name:'SIGINT',type:3,content:'신호',layer:0},{name:'OSINT',type:3,content:'공개',layer:0},{name:'융합엔진',type:8,content:'교차검증',layer:2}], claims:[{subject:'융합엔진',predicate:'교차검증',object:'3중출처',layer:3}], connections:[[0,3],[1,3],[2,3]], tags:['정보','융합','교차검증'] },
  { id:'n-supply', domain:'torah', name:'군수 보급 체인', desc:'보급품 추적, 재고 4상 관리', cells:[{name:'보급창고',type:1,content:0,layer:0},{name:'수송',type:3,content:'경로',layer:0},{name:'재고관리',type:8,content:'4상',layer:2}], claims:[{subject:'재고관리',predicate:'판단',object:'보급필요',layer:2}], connections:[[0,1],[1,2]], tags:['군수','보급','재고'] },
  { id:'n-drone', domain:'torah', name:'드론 군집 관제', desc:'무인기 군집 임무 할당, 충돌 회피', cells:[{name:'드론A',type:1,content:0,layer:0},{name:'드론B',type:1,content:0,layer:0},{name:'관제',type:8,content:'할당',layer:2}], claims:[{subject:'관제',predicate:'관리',object:'드론군집',layer:2}], connections:[[2,0],[2,1]], tags:['드론','군집','관제'] },
  { id:'n-civildef', domain:'torah', name:'민방위 체계', desc:'재난 경보→대피 경로→자원 배분', cells:[{name:'재난감지',type:8,content:'센서',layer:0},{name:'대피경로',type:8,content:'최적화',layer:2},{name:'자원배분',type:8,content:'분배',layer:2}], claims:[{subject:'재난감지',predicate:'트리거',object:'대피',layer:2}], connections:[[0,1],[1,2]], tags:['민방위','대피','재난'] },
  { id:'n-arms', domain:'torah', name:'무기 통제 경계', desc:'무기 사용 결정에 토라 경계+비례성 필수 검사', cells:[{name:'무기등록',type:3,content:'목록',layer:0},{name:'사용허가',type:8,content:'비례성검사',layer:2,confirmed:true}], claims:[{subject:'사용허가',predicate:'검사',object:'비례성',layer:0}], connections:[[0,1]], tags:['무기','통제','비례'] },
  { id:'n-alliance', domain:'torah', name:'동맹 관리', desc:'동맹국 관계 셀, 조약 의무 4상 추적', cells:[{name:'동맹국',type:3,content:'관계',layer:1},{name:'조약의무',type:3,content:'이행',layer:1},{name:'이행감시',type:8,content:'4상',layer:2}], claims:[{subject:'이행감시',predicate:'추적',object:'조약이행',layer:2}], connections:[[0,1],[1,2]], tags:['동맹','조약','외교'] },

  // ────── 토라 1-D: 인프라 경계 (9) ──────
  { id:'n-power', domain:'torah', name:'전력 그리드 보호', desc:'발전·송배전 경계, 과부하 자동 차단', cells:[{name:'발전소',type:1,content:0,layer:0},{name:'송배전',type:1,content:0,layer:0},{name:'과부하감지',type:8,content:'차단',layer:2}], claims:[{subject:'과부하감지',predicate:'보호',object:'전력망',layer:0}], connections:[[0,1],[1,2]], tags:['전력','그리드','보호'] },
  { id:'n-water', domain:'torah', name:'수자원 경계', desc:'수질·수량 임계치, 오염 즉시 감지', cells:[{name:'수질센서',type:1,content:0,layer:0},{name:'수량모니터',type:1,content:0,layer:0},{name:'오염감지',type:8,content:'즉시',layer:2}], claims:[{subject:'오염감지',predicate:'감지',object:'수질오염',layer:0}], connections:[[0,2],[1,2]], tags:['수자원','수질','경계'] },
  { id:'n-telecom', domain:'torah', name:'통신 백본', desc:'통신 인프라 이중화, 단절 시 자동 우회', cells:[{name:'주회선',type:3,content:'광케이블',layer:0},{name:'백업회선',type:3,content:'위성',layer:0},{name:'자동전환',type:8,content:'우회',layer:2}], claims:[{subject:'자동전환',predicate:'보장',object:'통신연속성',layer:0}], connections:[[0,2],[1,2]], tags:['통신','이중화','백본'] },
  { id:'n-food-sec', domain:'torah', name:'식량 안보', desc:'최소 비축량 경계, 부족 시 Eum 에스컬레이션', cells:[{name:'비축현황',type:1,content:0,layer:0},{name:'최소기준',type:8,content:'경계값',layer:0,confirmed:true},{name:'에스컬레이션',type:8,content:'Eum',layer:2}], claims:[{subject:'최소기준',predicate:'보장',object:'식량안보',layer:0}], connections:[[0,1],[1,2]], tags:['식량','안보','비축'] },
  { id:'n-traffic-safe', domain:'torah', name:'교통 안전', desc:'교통 사고 경계, 위험 도로 자동 경보', cells:[{name:'사고데이터',type:1,content:0,layer:0},{name:'위험분석',type:8,content:'패턴',layer:2},{name:'경보발송',type:8,content:'자동',layer:2}], claims:[{subject:'위험분석',predicate:'감지',object:'위험도로',layer:2}], connections:[[0,1],[1,2]], tags:['교통','안전','경보'] },
  { id:'n-building', domain:'torah', name:'건축 안전 코드', desc:'건축물 안전 기준 셀, 위반 즉시 차단', cells:[{name:'안전기준',type:3,content:'코드',layer:0,confirmed:true},{name:'검사시스템',type:8,content:'위반감지',layer:2}], claims:[{subject:'검사시스템',predicate:'검사',object:'건축안전',layer:0}], connections:[[0,1]], tags:['건축','안전','코드'] },
  { id:'n-environment', domain:'torah', name:'환경 경계', desc:'대기·토양·해양 오염 임계치 감시', cells:[{name:'대기센서',type:1,content:0,layer:0},{name:'토양센서',type:1,content:0,layer:0},{name:'해양센서',type:1,content:0,layer:0},{name:'오염경보',type:8,content:'임계치',layer:2}], claims:[{subject:'오염경보',predicate:'감시',object:'환경오염',layer:0}], connections:[[0,3],[1,3],[2,3]], tags:['환경','오염','경계'] },
  { id:'n-finwall', domain:'torah', name:'금융 시스템 보호', desc:'뱅크런/시장 붕괴 서킷브레이커', cells:[{name:'시장감시',type:8,content:'실시간',layer:2},{name:'서킷브레이커',type:8,content:'자동정지',layer:0,confirmed:true}], claims:[{subject:'서킷브레이커',predicate:'보호',object:'금융시스템',layer:0}], connections:[[0,1]], tags:['금융','보호','서킷브레이커'] },
  { id:'n-data-sov', domain:'torah', name:'데이터 주권', desc:'크라우니 국민 데이터는 크라우니 인프라에만 저장', cells:[{name:'데이터경계',type:8,content:'인프라제한',layer:0,confirmed:true},{name:'감사로그',type:3,content:'접근이력',layer:1}], claims:[{subject:'데이터경계',predicate:'보장',object:'데이터주권',layer:0}], connections:[[0,1]], tags:['데이터','주권','인프라'] },

  // ────── 복음 2-A: 나 (9) ──────
  { id:'n-my-dashboard', domain:'gospel', name:'개인 셀 대시보드', desc:'나의 27슬롯 현황, 4상 건강도, 성장 트리', cells:[{name:'내셀',type:3,content:'27슬롯',layer:0},{name:'건강도',type:8,content:'4상종합',layer:2},{name:'성장트리',type:8,content:'3진법',layer:2}], claims:[{subject:'내셀',predicate:'표시',object:'나의현황',layer:1}], connections:[[0,1],[0,2]], tags:['개인','대시보드','성장'] },
  { id:'n-my-edu', domain:'gospel', name:'맞춤 교육 경로', desc:'역량 갭 분석→적응 학습→Ti 역량 축적', cells:[{name:'역량분석',type:8,content:'갭분석',layer:2},{name:'학습경로',type:8,content:'적응',layer:2},{name:'역량축적',type:3,content:'Ti셀',layer:0}], claims:[{subject:'역량분석',predicate:'생성',object:'학습경로',layer:2}], connections:[[0,1],[1,2]], tags:['교육','맞춤','역량'] },
  { id:'n-my-health', domain:'gospel', name:'건강 셀', desc:'EMR·운동·수면·영양 통합, 건강 4상 모니터', cells:[{name:'EMR',type:3,content:'의료기록',layer:0},{name:'운동',type:1,content:0,layer:1},{name:'수면',type:1,content:0,layer:1},{name:'건강판단',type:8,content:'4상',layer:2}], claims:[{subject:'건강판단',predicate:'평가',object:'건강상태',layer:2}], connections:[[0,3],[1,3],[2,3]], tags:['건강','EMR','모니터'] },
  { id:'n-my-finance', domain:'gospel', name:'재정 셀', desc:'수입·지출·자산·부채 27슬롯, 재정 건강도', cells:[{name:'수입',type:1,content:0,layer:0},{name:'지출',type:1,content:0,layer:0},{name:'자산',type:1,content:0,layer:0},{name:'재정건강',type:8,content:'4상',layer:2}], claims:[{subject:'재정건강',predicate:'평가',object:'재정상태',layer:2}], connections:[[0,3],[1,3],[2,3]], tags:['재정','자산','건강'] },
  { id:'n-my-career', domain:'gospel', name:'직업 역량 셀', desc:'기술·경험·자격 온톨로지, 성장 추적', cells:[{name:'기술목록',type:3,content:'스킬',layer:1},{name:'경험이력',type:3,content:'경력',layer:1},{name:'성장추적',type:8,content:'트렌드',layer:2}], claims:[{subject:'성장추적',predicate:'추적',object:'역량성장',layer:2}], connections:[[0,2],[1,2]], tags:['직업','역량','성장'] },
  { id:'n-my-mental', domain:'gospel', name:'정신건강 모니터', desc:'디지털 바이오마커, 위기 4상 조기감지', cells:[{name:'활동패턴',type:1,content:0,layer:1},{name:'감정분석',type:8,content:'NLP',layer:2},{name:'위기감지',type:8,content:'4상',layer:2}], claims:[{subject:'위기감지',predicate:'감지',object:'정신건강위기',layer:3}], connections:[[0,1],[1,2]], tags:['정신건강','바이오마커','위기'] },
  { id:'n-my-learn', domain:'gospel', name:'평생학습 포트폴리오', desc:'모든 학습·인증이 셀로 축적', cells:[{name:'학습이력',type:3,content:'셀축적',layer:1},{name:'인증검증',type:8,content:'진위',layer:3}], claims:[{subject:'학습이력',predicate:'축적',object:'평생학습',layer:1}], connections:[[0,1]], tags:['학습','인증','포트폴리오'] },
  { id:'n-my-time', domain:'gospel', name:'시간 관리 셀', desc:'하루 27슬롯 — 토라(의무)/복음(관계)/성령(성장)', cells:[{name:'의무시간',type:1,content:9,layer:0},{name:'관계시간',type:1,content:9,layer:1},{name:'성장시간',type:1,content:9,layer:2}], claims:[{subject:'시간관리',predicate:'배분',object:'27슬롯하루',layer:1}], connections:[[0,1],[1,2]], tags:['시간','관리','27슬롯'] },
  { id:'n-my-decide', domain:'gospel', name:'개인 의사결정 코치', desc:'일상 결정에 언약 엔진 적용, 원칙 축적', cells:[{name:'결정입력',type:3,content:'사건',layer:0},{name:'언약검사',type:8,content:'3계층',layer:2},{name:'원칙축적',type:3,content:'Ti셀',layer:0}], claims:[{subject:'언약검사',predicate:'판단',object:'일상결정',layer:2}], connections:[[0,1],[1,2]], tags:['의사결정','코치','원칙'] },

  // ────── 복음 2-B: 가족 (9) ──────
  { id:'n-fam-net', domain:'gospel', name:'가족 셀 네트워크', desc:'가족 구성원 시냅스, 관계 신뢰도 추적', cells:[{name:'부모',type:3,content:'구성원',layer:1},{name:'자녀',type:3,content:'구성원',layer:1},{name:'관계엔진',type:8,content:'신뢰추적',layer:2}], claims:[{subject:'관계엔진',predicate:'추적',object:'가족신뢰',layer:2}], connections:[[0,2],[1,2],[0,1]], tags:['가족','네트워크','신뢰'] },
  { id:'n-fam-fin', domain:'gospel', name:'가계 재정 통합', desc:'가족 재정 셀 연결, 공동 예산 4상 관리', cells:[{name:'가계수입',type:1,content:0,layer:0},{name:'가계지출',type:1,content:0,layer:0},{name:'예산관리',type:8,content:'4상',layer:2}], claims:[{subject:'예산관리',predicate:'관리',object:'가계재정',layer:2}], connections:[[0,2],[1,2]], tags:['가계','재정','예산'] },
  { id:'n-fam-edu', domain:'gospel', name:'자녀 교육 설계', desc:'자녀 역량 셀+맞춤 교육 경로', cells:[{name:'자녀역량',type:3,content:'현재수준',layer:1},{name:'교육설계',type:8,content:'맞춤',layer:2}], claims:[{subject:'교육설계',predicate:'설계',object:'자녀교육',layer:2}], connections:[[0,1]], tags:['자녀','교육','맞춤'] },
  { id:'n-fam-health', domain:'gospel', name:'가족 건강 관제', desc:'가족원 건강 셀 연결, 유전 리스크 추적', cells:[{name:'가족건강',type:8,content:'통합',layer:2},{name:'유전분석',type:8,content:'리스크',layer:2}], claims:[{subject:'유전분석',predicate:'추적',object:'유전리스크',layer:3}], connections:[[0,1]], tags:['가족','건강','유전'] },
  { id:'n-fam-decide', domain:'gospel', name:'가족 의사결정', desc:'가족 회의→복음 계층 가중치 자동 적용', cells:[{name:'가족회의',type:3,content:'의제',layer:0},{name:'가중치엔진',type:8,content:'복음계층',layer:2}], claims:[{subject:'가중치엔진',predicate:'적용',object:'가족결정',layer:2}], connections:[[0,1]], tags:['가족','결정','가중치'] },
  { id:'n-fam-wisdom', domain:'gospel', name:'세대 간 지식 전수', desc:'조부모→부모→자녀 지식 셀 체인', cells:[{name:'1세대',type:3,content:'지혜',layer:0},{name:'2세대',type:3,content:'경험',layer:0},{name:'3세대',type:3,content:'학습',layer:0}], claims:[{subject:'세대전수',predicate:'전달',object:'가족지혜',layer:1}], connections:[[0,1],[1,2]], tags:['세대','전수','지혜'] },
  { id:'n-fam-safe', domain:'gospel', name:'가정 안전', desc:'가정 내 IoT 센서 통합, 안전 경계', cells:[{name:'IoT센서',type:1,content:0,layer:0},{name:'안전분석',type:8,content:'경계',layer:2}], claims:[{subject:'안전분석',predicate:'보호',object:'가정안전',layer:0}], connections:[[0,1]], tags:['가정','안전','IoT'] },
  { id:'n-fam-time', domain:'gospel', name:'가족 일정 조율', desc:'가족원 시간 셀 연결, 최적 공유 시간 산출', cells:[{name:'가족일정',type:8,content:'통합',layer:1},{name:'공유시간',type:8,content:'최적화',layer:2}], claims:[{subject:'공유시간',predicate:'산출',object:'가족시간',layer:1}], connections:[[0,1]], tags:['일정','조율','시간'] },
  { id:'n-fam-inherit', domain:'gospel', name:'상속·전승 계획', desc:'자산·지식·가치관 전승 셀 구조', cells:[{name:'물질유산',type:3,content:'자산',layer:0},{name:'지적유산',type:3,content:'지식',layer:0},{name:'영적유산',type:3,content:'가치관',layer:0}], claims:[{subject:'전승계획',predicate:'계획',object:'3중유산',layer:1}], connections:[[0,1],[1,2]], tags:['상속','전승','유산'] },

  // ────── 복음 2-C: 이웃 (10) ──────
  { id:'n-nbr-graph', domain:'gospel', name:'이웃 셀 그래프', desc:'지역사회 구성원 관계, 고립 감지', cells:[{name:'이웃목록',type:3,content:'구성원',layer:1},{name:'고립감지',type:8,content:'연결분석',layer:2}], claims:[{subject:'고립감지',predicate:'감지',object:'사회적고립',layer:3}], connections:[[0,1]], tags:['이웃','관계','고립'] },
  { id:'n-local-econ', domain:'gospel', name:'지역 경제 순환', desc:'로컬 거래 셀, 지역 화폐, 유출 감지', cells:[{name:'로컬거래',type:1,content:0,layer:1},{name:'지역화폐',type:8,content:'순환',layer:1},{name:'유출감지',type:8,content:'경계',layer:2}], claims:[{subject:'유출감지',predicate:'감지',object:'경제유출',layer:2}], connections:[[0,1],[1,2]], tags:['지역경제','화폐','순환'] },
  { id:'n-coparent', domain:'gospel', name:'공동 육아', desc:'이웃 간 육아 자원 공유, 신뢰도 매칭', cells:[{name:'육아자원',type:3,content:'공유',layer:1},{name:'신뢰매칭',type:8,content:'4상',layer:2}], claims:[{subject:'신뢰매칭',predicate:'매칭',object:'육아협력',layer:2}], connections:[[0,1]], tags:['육아','공동','신뢰'] },
  { id:'n-safety-net', domain:'gospel', name:'지역 안전망', desc:'독거노인·취약계층 4상 모니터, 자동 연결', cells:[{name:'취약계층',type:3,content:'대상',layer:1},{name:'모니터링',type:8,content:'4상',layer:2},{name:'자동연결',type:8,content:'매칭',layer:2}], claims:[{subject:'모니터링',predicate:'보호',object:'취약계층',layer:3}], connections:[[0,1],[1,2]], tags:['안전망','취약계층','보호'] },
  { id:'n-community', domain:'gospel', name:'커뮤니티 의사결정', desc:'마을 회의→언약 엔진→합의 도출', cells:[{name:'마을회의',type:3,content:'의제',layer:0},{name:'언약엔진',type:8,content:'합의',layer:2}], claims:[{subject:'언약엔진',predicate:'도출',object:'마을합의',layer:2}], connections:[[0,1]], tags:['커뮤니티','합의','마을'] },
  { id:'n-sharing', domain:'gospel', name:'공유 자원 관리', desc:'공구·차량·공간 공유, 사용 이력 추적', cells:[{name:'공유자원',type:3,content:'목록',layer:1},{name:'사용이력',type:3,content:'추적',layer:1}], claims:[{subject:'공유자원',predicate:'관리',object:'이웃공유',layer:1}], connections:[[0,1]], tags:['공유','자원','추적'] },
  { id:'n-local-env', domain:'gospel', name:'지역 환경 관리', desc:'쓰레기·소음·녹지 모니터, 개선 파이프라인', cells:[{name:'환경센서',type:1,content:0,layer:0},{name:'개선제안',type:8,content:'파이프라인',layer:2}], claims:[{subject:'환경센서',predicate:'모니터',object:'지역환경',layer:1}], connections:[[0,1]], tags:['환경','지역','개선'] },
  { id:'n-mutual-aid', domain:'gospel', name:'재난 상호부조', desc:'재난 시 이웃 간 자원·대피 자동 매칭', cells:[{name:'재난알림',type:8,content:'트리거',layer:0},{name:'자원매칭',type:8,content:'자동',layer:2}], claims:[{subject:'자원매칭',predicate:'매칭',object:'상호부조',layer:2}], connections:[[0,1]], tags:['재난','상호부조','매칭'] },
  { id:'n-local-edu', domain:'gospel', name:'지역 교육', desc:'동네 멘토-멘티 매칭, 역량 셀 기반', cells:[{name:'멘토',type:3,content:'역량자',layer:1},{name:'멘티',type:3,content:'학습자',layer:1},{name:'매칭엔진',type:8,content:'역량기반',layer:2}], claims:[{subject:'매칭엔진',predicate:'매칭',object:'멘토멘티',layer:2}], connections:[[0,2],[1,2]], tags:['교육','멘토','지역'] },
  { id:'n-dispute', domain:'gospel', name:'분쟁 조정', desc:'이웃 간 분쟁→비례적 사법→관계 복원', cells:[{name:'분쟁접수',type:3,content:'사건',layer:0},{name:'비례사법',type:8,content:'조정',layer:2},{name:'관계복원',type:8,content:'시냅스',layer:1}], claims:[{subject:'비례사법',predicate:'조정',object:'이웃분쟁',layer:2}], connections:[[0,1],[1,2]], tags:['분쟁','조정','복원'] },

  // ────── 복음 2-D: 세계 (9) ──────
  { id:'n-diplomacy', domain:'gospel', name:'외교 관계 셀', desc:'국가 간 관계 27슬롯, 인과추론 적용', cells:[{name:'국가관계',type:3,content:'27슬롯',layer:1},{name:'인과분석',type:8,content:'외교',layer:2}], claims:[{subject:'인과분석',predicate:'분석',object:'외교관계',layer:2}], connections:[[0,1]], tags:['외교','관계','인과'] },
  { id:'n-trade', domain:'gospel', name:'국제 무역', desc:'수출입 셀 체인, 관세 자동, 부정 무역 감지', cells:[{name:'수출',type:1,content:0,layer:1},{name:'수입',type:1,content:0,layer:1},{name:'관세엔진',type:8,content:'자동',layer:2},{name:'부정감지',type:8,content:'4상',layer:2}], claims:[{subject:'부정감지',predicate:'감지',object:'부정무역',layer:3}], connections:[[0,2],[1,2],[2,3]], tags:['무역','관세','수출입'] },
  { id:'n-aid', domain:'gospel', name:'해외 원조', desc:'원조 투입→산출→성과 인과관계 검증', cells:[{name:'원조투입',type:1,content:0,layer:1},{name:'성과측정',type:8,content:'인과검증',layer:2}], claims:[{subject:'성과측정',predicate:'검증',object:'원조효과',layer:2}], connections:[[0,1]], tags:['원조','성과','인과'] },
  { id:'n-culture', domain:'gospel', name:'문화 교류', desc:'크라우니 문화 셀↔타국 문화 셀 시냅스', cells:[{name:'크라우니문화',type:3,content:'가치',layer:1},{name:'교류채널',type:8,content:'시냅스',layer:1}], claims:[{subject:'교류채널',predicate:'연결',object:'문화교류',layer:1}], connections:[[0,1]], tags:['문화','교류','시냅스'] },
  { id:'n-climate', domain:'gospel', name:'글로벌 환경 협력', desc:'탄소 배출권, 해양 보호, 기후 데이터 공유', cells:[{name:'기후데이터',type:1,content:0,layer:0},{name:'협력프로토콜',type:8,content:'공유',layer:1}], claims:[{subject:'협력프로토콜',predicate:'공유',object:'기후데이터',layer:1}], connections:[[0,1]], tags:['환경','기후','협력'] },
  { id:'n-immigration', domain:'gospel', name:'난민·이민', desc:'이민자 셀 Om(신규)→근거 축적→Ti(시민)', cells:[{name:'이민자셀',type:3,content:'Om신규',layer:0},{name:'근거축적',type:8,content:'시민화',layer:3}], claims:[{subject:'근거축적',predicate:'승격',object:'시민권',layer:3}], connections:[[0,1]], tags:['이민','난민','시민'] },
  { id:'n-intorg', domain:'gospel', name:'국제 기구 연동', desc:'UN·WHO·WTO 데이터↔크라우니 셀 매핑', cells:[{name:'국제데이터',type:3,content:'API',layer:0},{name:'셀변환',type:8,content:'매핑',layer:1}], claims:[{subject:'셀변환',predicate:'변환',object:'국제→셀',layer:1}], connections:[[0,1]], tags:['국제기구','UN','매핑'] },
  { id:'n-peace', domain:'gospel', name:'평화 유지', desc:'분쟁 지역 4상 모니터, 중재 의사결정', cells:[{name:'분쟁모니터',type:8,content:'4상',layer:2},{name:'중재엔진',type:8,content:'비례적',layer:2}], claims:[{subject:'중재엔진',predicate:'중재',object:'분쟁',layer:2}], connections:[[0,1]], tags:['평화','중재','분쟁'] },
  { id:'n-diaspora', domain:'gospel', name:'디아스포라 연결', desc:'해외 크라우니 시민 셀 네트워크', cells:[{name:'해외시민',type:3,content:'네트워크',layer:1},{name:'본국연결',type:8,content:'시냅스',layer:1}], claims:[{subject:'본국연결',predicate:'연결',object:'디아스포라',layer:1}], connections:[[0,1]], tags:['디아스포라','해외','연결'] },

  // ────── 성령 3-A: 고도화 (9) ──────
  { id:'n-cov-v2', domain:'spirit', name:'언약 엔진 v2', desc:'원칙 축적→지혜 체계→3→729 자율 성장', cells:[{name:'원칙DB',type:8,content:'축적',layer:0,confirmed:true},{name:'지혜추출',type:8,content:'패턴',layer:2},{name:'자율성장',type:8,content:'3진법',layer:2}], claims:[{subject:'자율성장',predicate:'성장',object:'3→729',layer:2}], connections:[[0,1],[1,2]], tags:['언약','성장','지혜'] },
  { id:'n-causal-v2', domain:'spirit', name:'인과추론 v2', desc:'교란변수 자동 탐색, 반사실 시뮬레이션 (Pearl Level 3)', cells:[{name:'교란탐색',type:8,content:'자동',layer:2},{name:'반사실',type:8,content:'what-if',layer:2}], claims:[{subject:'반사실',predicate:'시뮬',object:'대안역사',layer:2}], connections:[[0,1]], tags:['인과','반사실','Pearl'] },
  { id:'n-prophetic', domain:'spirit', name:'예언적 분석', desc:'패턴에서 미래 예측 — Om으로 제시, 근거 축적 시 확정', cells:[{name:'패턴인식',type:8,content:'시계열',layer:2},{name:'예측생성',type:8,content:'Om상태',layer:2},{name:'검증루프',type:8,content:'근거축적',layer:3}], claims:[{subject:'예측생성',predicate:'예측',object:'미래Om',layer:2}], connections:[[0,1],[1,2]], tags:['예측','예언','패턴'] },
  { id:'n-agent-orch', domain:'spirit', name:'AI 에이전트 오케스트레이션', desc:'다중 AI→4상 역할 분담 (Ti=실행, Om=연구, Ta=검증, Eum=창의)', cells:[{name:'Ti에이전트',type:8,content:'실행',layer:2,confirmed:true},{name:'Om에이전트',type:8,content:'연구',layer:2},{name:'Ta에이전트',type:8,content:'검증',layer:2},{name:'Eum에이전트',type:8,content:'창의',layer:2}], claims:[{subject:'오케스트레이션',predicate:'분담',object:'4상역할',layer:2}], connections:[[0,1],[1,2],[2,3]], tags:['AI','에이전트','오케스트레이션'] },
  { id:'n-self-evolve', domain:'spirit', name:'자체 진화 코드', desc:'한선씨 코드가 성과 데이터를 보고 자기 최적화', cells:[{name:'성과측정',type:8,content:'피드백',layer:2},{name:'코드변이',type:8,content:'최적화',layer:2}], claims:[{subject:'코드변이',predicate:'진화',object:'자기최적화',layer:2}], connections:[[0,1]], tags:['진화','자기최적화','한선씨'] },
  { id:'n-auto-kg', domain:'spirit', name:'지식 그래프 자동 구축', desc:'문서·대화·데이터에서 셀+Claim 자동 추출', cells:[{name:'입력소스',type:3,content:'다중',layer:0},{name:'추출엔진',type:8,content:'NLP',layer:2},{name:'셀생성',type:8,content:'자동',layer:2}], claims:[{subject:'추출엔진',predicate:'추출',object:'셀+Claim',layer:2}], connections:[[0,1],[1,2]], tags:['지식그래프','자동','NLP'] },
  { id:'n-eum-learn', domain:'spirit', name:'설계자 이슈 학습', desc:'Eum으로 올라온 이슈를 학습→새 원칙 생성', cells:[{name:'Eum이슈',type:3,content:'미인지',layer:2},{name:'학습엔진',type:8,content:'원칙화',layer:2}], claims:[{subject:'학습엔진',predicate:'변환',object:'Eum→원칙',layer:2}], connections:[[0,1]], tags:['Eum','학습','원칙'] },
  { id:'n-meta-onto', domain:'spirit', name:'메타 셀 구조', desc:'셀 구조 자체를 셀로 기술 — 자기 참조적 성장', cells:[{name:'셀정의셀',type:8,content:'자기참조',layer:4,confirmed:true},{name:'구조진화',type:8,content:'27→729',layer:4}], claims:[{subject:'셀정의셀',predicate:'기술',object:'셀구조자체',layer:4}], connections:[[0,1]], tags:['메타','자기참조','진화'] },
  { id:'n-history', domain:'spirit', name:'역사 셀 아카이브', desc:'모든 결정·사건의 불변 이력, 미래 세대를 위한 지혜 DB', cells:[{name:'이력저장',type:3,content:'불변',layer:0,confirmed:true},{name:'지혜추출',type:8,content:'패턴',layer:2}], claims:[{subject:'이력저장',predicate:'보존',object:'국가역사',layer:0}], connections:[[0,1]], tags:['역사','아카이브','지혜'] },

  // ────── 성령 3-B: 병합 (9) ──────
  { id:'n-cross-domain', domain:'spirit', name:'크로스 도메인 인과', desc:'경제↔건강↔교육↔안보 간 인과관계 자동 발견', cells:[{name:'도메인A',type:3,content:'경제',layer:1},{name:'도메인B',type:3,content:'건강',layer:1},{name:'교차인과',type:8,content:'자동발견',layer:2}], claims:[{subject:'교차인과',predicate:'발견',object:'도메인간인과',layer:2}], connections:[[0,2],[1,2]], tags:['크로스도메인','인과','병합'] },
  { id:'n-unified-dash', domain:'spirit', name:'통합 대시보드', desc:'97개 프로젝트 전체를 하나의 그래프로', cells:[{name:'통합뷰',type:8,content:'전체',layer:2,confirmed:true}], claims:[{subject:'통합뷰',predicate:'통합',object:'97프로젝트',layer:2}], connections:[], tags:['통합','대시보드','전체'] },
  { id:'n-cell-translate', domain:'spirit', name:'셀 간 번역', desc:'의료 셀↔법률 셀↔교육 셀 용어 자동 매핑', cells:[{name:'용어사전',type:3,content:'다도메인',layer:1},{name:'자동번역',type:8,content:'매핑',layer:2}], claims:[{subject:'자동번역',predicate:'번역',object:'도메인용어',layer:1}], connections:[[0,1]], tags:['번역','용어','매핑'] },
  { id:'n-crisis-mgmt', domain:'spirit', name:'통합 위기 관리', desc:'군사+재난+경제+보건 위기를 하나의 상황실에서', cells:[{name:'위기감지',type:8,content:'다중도메인',layer:2},{name:'통합대응',type:8,content:'상황실',layer:2}], claims:[{subject:'통합대응',predicate:'대응',object:'복합위기',layer:2}], connections:[[0,1]], tags:['위기','통합','상황실'] },
  { id:'n-policy-sim', domain:'spirit', name:'정책 시뮬레이터', desc:'정책 A 시행 시 경제·교육·건강·안보 영향 시뮬', cells:[{name:'정책입력',type:3,content:'시나리오',layer:0},{name:'시뮬엔진',type:8,content:'다도메인',layer:2},{name:'영향분석',type:8,content:'결과',layer:2}], claims:[{subject:'시뮬엔진',predicate:'시뮬',object:'정책영향',layer:2}], connections:[[0,1],[1,2]], tags:['정책','시뮬레이션','영향'] },
  { id:'n-feedback', domain:'spirit', name:'시민 피드백 루프', desc:'정책 결과→시민 셀 변화→정책 자동 조정', cells:[{name:'정책실행',type:3,content:'시행',layer:0},{name:'시민변화',type:8,content:'감지',layer:2},{name:'자동조정',type:8,content:'피드백',layer:2}], claims:[{subject:'자동조정',predicate:'조정',object:'정책',layer:2}], connections:[[0,1],[1,2]], tags:['피드백','시민','자동조정'] },
  { id:'n-urban-rural', domain:'spirit', name:'도시-농촌 연결', desc:'도시 셀 그래프↔농촌 셀 그래프 시냅스', cells:[{name:'도시셀',type:3,content:'그래프',layer:1},{name:'농촌셀',type:3,content:'그래프',layer:1},{name:'브릿지',type:8,content:'시냅스',layer:1}], claims:[{subject:'브릿지',predicate:'연결',object:'도시농촌',layer:1}], connections:[[0,2],[1,2]], tags:['도시','농촌','연결'] },
  { id:'n-generation', domain:'spirit', name:'세대 간 병합', desc:'과거 지혜+현재 데이터+미래 계획', cells:[{name:'과거',type:3,content:'지혜',layer:0},{name:'현재',type:3,content:'데이터',layer:0},{name:'미래',type:3,content:'계획',layer:0}], claims:[{subject:'세대병합',predicate:'병합',object:'시간축',layer:1}], connections:[[0,1],[1,2]], tags:['세대','병합','시간'] },
  { id:'n-bridge', domain:'spirit', name:'크라우니-외부 브릿지', desc:'기존 국가 시스템(SAP/Oracle)↔크라우니 셀 커넥터', cells:[{name:'외부시스템',type:3,content:'레거시',layer:0},{name:'브릿지엔진',type:8,content:'변환',layer:1}], claims:[{subject:'브릿지엔진',predicate:'연결',object:'레거시통합',layer:1}], connections:[[0,1]], tags:['브릿지','레거시','통합'] },

  // ────── 성령 3-C: 세분화 (9) ──────
  { id:'n-personal-729', domain:'spirit', name:'개인화 엔진', desc:'시민 1명의 27슬롯→729슬롯 확장 (27x27)', cells:[{name:'기본27셀',type:3,content:'현재',layer:0},{name:'확장엔진',type:8,content:'27x27',layer:2}], claims:[{subject:'확장엔진',predicate:'확장',object:'729슬롯',layer:2}], connections:[[0,1]], tags:['개인화','729','확장'] },
  { id:'n-micro-econ', domain:'spirit', name:'미시 경제 셀', desc:'거래 1건 단위의 인과추론', cells:[{name:'거래셀',type:1,content:0,layer:0},{name:'미시인과',type:8,content:'단건분석',layer:2}], claims:[{subject:'미시인과',predicate:'분석',object:'거래인과',layer:2}], connections:[[0,1]], tags:['미시','경제','거래'] },
  { id:'n-genomics', domain:'spirit', name:'유전체-건강 매핑', desc:'DNA 변이→질병→치료 인과관계 셀', cells:[{name:'유전체',type:3,content:'시퀀싱',layer:0},{name:'변이분석',type:8,content:'인과',layer:2},{name:'치료매칭',type:8,content:'맞춤',layer:2}], claims:[{subject:'변이분석',predicate:'매핑',object:'유전체→건강',layer:2}], connections:[[0,1],[1,2]], tags:['유전체','DNA','맞춤의학'] },
  { id:'n-soil-cell', domain:'spirit', name:'토양-작물 셀', desc:'밭 1m² 단위 토양 셀→작물 생육 인과', cells:[{name:'토양셀',type:1,content:0,layer:0},{name:'작물셀',type:1,content:0,layer:0},{name:'생육인과',type:8,content:'분석',layer:2}], claims:[{subject:'생육인과',predicate:'분석',object:'토양→작물',layer:2}], connections:[[0,2],[1,2]], tags:['토양','작물','정밀농업'] },
  { id:'n-micro-learn', domain:'spirit', name:'학습 마이크로셀', desc:'개념 1개 단위 학습 셀, 이해도 4상 추적', cells:[{name:'개념셀',type:3,content:'단위지식',layer:0},{name:'이해도',type:8,content:'4상',layer:3}], claims:[{subject:'이해도',predicate:'추적',object:'학습이해',layer:3}], connections:[[0,1]], tags:['학습','마이크로','이해도'] },
  { id:'n-emotion', domain:'spirit', name:'감정 미세 분석', desc:'감정 27분류 (9감정x3강도), 4상 변화 추적', cells:[{name:'감정입력',type:3,content:'27분류',layer:1},{name:'변화추적',type:8,content:'4상',layer:2}], claims:[{subject:'변화추적',predicate:'추적',object:'감정변화',layer:3}], connections:[[0,1]], tags:['감정','27분류','추적'] },
  { id:'n-energy-micro', domain:'spirit', name:'에너지 미터 셀', desc:'기기 1대 단위 전력 소비 추적, 절감 인과', cells:[{name:'기기셀',type:1,content:0,layer:0},{name:'절감분석',type:8,content:'인과',layer:2}], claims:[{subject:'절감분석',predicate:'분석',object:'에너지절감',layer:2}], connections:[[0,1]], tags:['에너지','미터','절감'] },
  { id:'n-weather', domain:'spirit', name:'초정밀 기상', desc:'100m 격자 단위 기상 셀, 농업·재난 연동', cells:[{name:'기상격자',type:1,content:0,layer:0},{name:'예측모델',type:8,content:'ML',layer:2}], claims:[{subject:'예측모델',predicate:'예측',object:'초정밀기상',layer:2}], connections:[[0,1]], tags:['기상','정밀','격자'] },
  { id:'n-nano-logistics', domain:'spirit', name:'나노 물류', desc:'택배 1건 단위 경로·비용·만족 인과 체인', cells:[{name:'택배셀',type:3,content:'단건',layer:0},{name:'경로분석',type:8,content:'최적화',layer:2},{name:'만족인과',type:8,content:'추적',layer:2}], claims:[{subject:'만족인과',predicate:'추적',object:'배송→만족',layer:2}], connections:[[0,1],[1,2]], tags:['물류','나노','인과'] },
];

// ═══ 템플릿 배포 함수 ═══

function deployTemplate(memory, templateId) {
  const tmpl = TEMPLATES.find(t => t.id === templateId);
  if (!tmpl) return null;

  const cellIds = [];
  // 셀 생성
  for (const c of tmpl.cells) {
    const cell = memory.createValue(c.name, c.type || 0, c.content || 0, {
      confirmed: c.confirmed || false,
      layer: c.layer || 0,
      tag: tmpl.domain,
    });
    cellIds.push(cell.id);
  }

  // Claim 생성
  const claimIds = [];
  for (const cl of (tmpl.claims || [])) {
    const claim = memory.createClaim(cl.subject, cl.predicate, cl.object, 0, cl.layer || 0);
    claimIds.push(claim.id);
  }

  // 연결
  for (const [a, b] of (tmpl.connections || [])) {
    if (cellIds[a] && cellIds[b]) {
      memory.connectBidirectional(cellIds[a], cellIds[b]);
    }
  }

  return {
    templateId: tmpl.id,
    templateName: tmpl.name,
    domain: tmpl.domain,
    cellsCreated: cellIds.length,
    claimsCreated: claimIds.length,
    connectionsCreated: (tmpl.connections || []).length,
    cellIds,
    claimIds,
  };
}

module.exports = { DOMAINS, TEMPLATES, deployTemplate };
