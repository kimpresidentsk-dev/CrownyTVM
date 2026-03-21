// CrownyCore — 통합 대시보드
// 라이프 + 교회 + 도시 통합 한눈 요약 + 주간 리포트
const API = '/api/foundry';

class 통합대시보드 {
  constructor(id) { this.el = document.getElementById(id); }

  async 초기화() {
    if (!this.el) return;
    const [cellRes, claimRes, covRes, cityRes] = await Promise.all([
      fetch(`${API}/stats`).then(r=>r.json()).catch(()=>({})),
      fetch(`${API}/claims`).then(r=>r.json()).catch(()=>({claims:[]})),
      fetch(`${API}/covenant/stats`).then(r=>r.json()).catch(()=>({})),
      fetch(`${API}/city/stats`).then(r=>r.json()).catch(()=>({})),
    ]);

    const claims = claimRes.claims || [];
    const now = Date.now();
    const dayMs = 86400000;
    const weekMs = dayMs * 7;

    // 오늘 기록
    const today = claims.filter(c => c.createdAt && (now - c.createdAt) < dayMs);
    const thisWeek = claims.filter(c => c.createdAt && (now - c.createdAt) < weekMs);

    // 카테고리별 분류
    const offerings = claims.filter(c => c.claim?.predicate === '헌금');
    const prayers = claims.filter(c => c.claim?.predicate === '기도제목' || c.claim?.predicate === '기도');
    const attendance = claims.filter(c => c.claim?.predicate === '출석');
    const notices = claims.filter(c => c.claim?.subject === '공지');

    // 헌금 합계
    const totalOffering = offerings.reduce((s, c) => {
      const m = (c.claim?.object||'').match(/(\d[\d,]*)/);
      return s + (m ? parseInt(m[1].replace(/,/g,'')) : 0);
    }, 0);

    // 셀 상태별
    const byStatus = cellRes.byStatus || {};

    this.el.innerHTML = `
      <!-- 상단: 핵심 지표 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:16px">
        <div class="stat"><div class="stat-v">${cellRes.totalCells||0}</div><div class="stat-l">전체 셀</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${byStatus['2']||0}</div><div class="stat-l">확정</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${byStatus['0']||0}</div><div class="stat-l">미확인</div></div>
        <div class="stat"><div class="stat-v">${claims.length}</div><div class="stat-l">전체 기록</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${today.length}</div><div class="stat-l">오늘</div></div>
        <div class="stat"><div class="stat-v">${thisWeek.length}</div><div class="stat-l">이번 주</div></div>
      </div>

      <!-- 3앱 요약 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">

        <!-- 라이프 요약 -->
        <div class="card" style="border-top:3px solid var(--확정)">
          <div class="card-t" style="margin-bottom:8px">☀ 라이프스타일</div>
          <div style="font-size:11px;color:var(--text-2)">
            <div>확정 습관: <b>${byStatus['2']||0}</b>개</div>
            <div>오늘 기록: <b>${today.length}</b>건</div>
            <div style="margin-top:4px">
              <button class="btn _goto" data-v="life" style="font-size:9px;padding:2px 6px;width:100%">열기</button>
            </div>
          </div>
        </div>

        <!-- 교회 요약 -->
        <div class="card" style="border-top:3px solid var(--미확인)">
          <div class="card-t" style="margin-bottom:8px">◌ 교회</div>
          <div style="font-size:11px;color:var(--text-2)">
            <div>헌금: <b>${totalOffering.toLocaleString()}</b>원 (${offerings.length}건)</div>
            <div>기도제목: <b>${prayers.length}</b>건</div>
            <div>공지: <b>${notices.length}</b>건</div>
            <div style="margin-top:4px">
              <button class="btn _goto" data-v="church" style="font-size:9px;padding:2px 6px;width:100%">열기</button>
            </div>
          </div>
        </div>

        <!-- 도시 요약 -->
        <div class="card" style="border-top:3px solid ${(cityRes.activeAlerts||0)>0?'var(--오류)':'#6B5B8A'}">
          <div class="card-t" style="margin-bottom:8px">▣ 도시관리</div>
          <div style="font-size:11px;color:var(--text-2)">
            <div>활성 경보: <b style="color:${(cityRes.activeAlerts||0)>0?'var(--오류)':'var(--확정)'}">${cityRes.activeAlerts||0}</b>건</div>
            <div>누적: ${cityRes.totalAlerts||0}건 (해제 ${cityRes.resolvedAlerts||0})</div>
            <div style="margin-top:4px">
              <button class="btn _goto" data-v="city" style="font-size:9px;padding:2px 6px;width:100%">열기</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 의사결정 요약 -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-h"><span class="card-t">의사결정 엔진</span></div>
        <div style="display:flex;gap:10px;font-size:11px;color:var(--text-2)">
          <span>결정 <b>${covRes.totalDecisions||0}</b>건</span>
          <span style="color:var(--확정)">▲즉시실행 ${covRes.ti||0}</span>
          <span style="color:var(--미확인)">●학습 ${covRes.om||0}</span>
          <span style="color:var(--오류)">▼이관 ${covRes.ta||0}</span>
          <span>원칙 ${covRes.principles||0}개</span>
          <span>성장 ${covRes.growthLevel||3}</span>
        </div>
      </div>

      <!-- 최근 기록 타임라인 -->
      <div class="card">
        <div class="card-h"><span class="card-t">최근 기록</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:250px;overflow-y:auto">
          ${claims.slice(-20).reverse().map(c => {
            const time = c.createdAt ? new Date(c.createdAt).toLocaleString('ko', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            const pred = c.claim?.predicate || '';
            const isAlert = pred.includes('소방') || pred.includes('전력') || pred.includes('가스');
            const cls = isAlert ? '오류' : pred === '헌금' ? '미확인' : '확정';
            return `<div class="pipe">
              <div class="dot ${cls}"></div>
              <span style="font-weight:500;min-width:50px">${c.claim?.subject||c.name||''}</span>
              <span style="color:var(--text-2)">${pred}</span>
              <span style="color:var(--text-3);font-size:10px;flex:1">${(c.claim?.object||'').slice(0,30)}</span>
              <span style="font-size:9px;color:var(--text-3)">${time}</span>
            </div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">기록이 없습니다</div>'}
        </div>
      </div>
    `;

    // 앱 이동 버튼
    this.el.querySelectorAll('._goto').forEach(btn => {
      btn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('화면이동', { detail: btn.dataset.v }));
      });
    });
  }
}

export { 통합대시보드 };
