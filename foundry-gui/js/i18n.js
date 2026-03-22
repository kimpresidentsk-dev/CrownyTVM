// CrownyCore i18n — 다국어 기초
// 현재: 한국어(기본) + 영어

const LANG = {
  ko: {
    home: '홈', dashboard: '대시보드', workspace: '작업 공간', decide: '의사결정',
    project: '프로젝트', causal: '인과추론', chart: '차트',
    personal: '개인', family: '가정', startup: '스타트업', church: '비영리',
    enterprise: '기업', city: '관제', map: '지도', tactical: '전술', security: '보안',
    create: '만들기', search: '찾기', stats: '통계',
    login: '로그인', register: '등록', logout: '로그아웃',
    save: '저장', delete: '삭제', cancel: '취소', confirm: '확인',
    today: '오늘', thisWeek: '이번 주', thisMonth: '이번 달',
    darkMode: '다크 모드', lightMode: '라이트 모드',
    loading: '로딩 중...', noData: '데이터 없음', offline: '오프라인',
  },
  en: {
    home: 'Home', dashboard: 'Dashboard', workspace: 'Workspace', decide: 'Decisions',
    project: 'Projects', causal: 'Causal', chart: 'Charts',
    personal: 'Personal', family: 'Family', startup: 'Startup', church: 'Nonprofit',
    enterprise: 'Enterprise', city: 'Control', map: 'Map', tactical: 'Tactical', security: 'Security',
    create: 'Create', search: 'Search', stats: 'Stats',
    login: 'Login', register: 'Register', logout: 'Logout',
    save: 'Save', delete: 'Delete', cancel: 'Cancel', confirm: 'OK',
    today: 'Today', thisWeek: 'This Week', thisMonth: 'This Month',
    darkMode: 'Dark Mode', lightMode: 'Light Mode',
    loading: 'Loading...', noData: 'No data', offline: 'Offline',
  },
};

let currentLang = localStorage.getItem('crownyLang') || 'ko';

function t(key) { return LANG[currentLang]?.[key] || LANG.ko[key] || key; }
function setLang(lang) { currentLang = lang; localStorage.setItem('crownyLang', lang); }
function getLang() { return currentLang; }

export { LANG, t, setLang, getLang };
