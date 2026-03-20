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
