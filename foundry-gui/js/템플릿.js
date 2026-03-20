// CrownyFoundry 프로젝트 템플릿 브라우저
// 70개 템플릿 14도메인, 원클릭 배포

const API = '/api/foundry';

class 템플릿브라우저 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
    this.domains = [];
    this.templates = [];
    this.selectedDomain = null;
    this.searchQuery = '';
  }

  async 로드() {
    try {
      const [domRes, tmplRes] = await Promise.all([
        fetch(`${API}/domains`),
        fetch(`${API}/templates`),
      ]);
      this.domains = await domRes.json();
      const data = await tmplRes.json();
      this.templates = data.templates || [];
      this.렌더();
    } catch (e) {
      if (this.el) this.el.innerHTML = '<p style="color:var(--오류)">템플릿 로드 실패</p>';
    }
  }

  렌더() {
    if (!this.el) return;
    let filtered = this.templates;
    if (this.selectedDomain) filtered = filtered.filter(t => t.domain === this.selectedDomain);
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.name.includes(q) || t.desc.includes(q) || (t.tags||[]).some(g => g.includes(q)));
    }

    const domainInfo = {};
    for (const d of this.domains) domainInfo[d.id] = d;

    this.el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <input id="_tmplSearch" placeholder="템플릿 검색..." value="${this.searchQuery}"
          style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;width:220px;font-size:13px">
        <button class="btn ${!this.selectedDomain ? 'btn-확정' : ''}" data-domain="">전체 (${this.templates.length})</button>
        ${this.domains.map(d => `
          <button class="btn ${this.selectedDomain===d.id ? 'btn-확정' : ''}" data-domain="${d.id}" title="${d.name}">
            ${d.icon} ${d.name} <span style="opacity:.5">${d.templateCount}</span>
          </button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:10px">${filtered.length}개 템플릿</div>
      <div class="tmpl-그리드">
        ${filtered.map(t => {
          const d = domainInfo[t.domain] || {};
          return `
          <div class="tmpl-카드" data-id="${t.id}">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
              <div>
                <span style="font-size:18px">${d.icon||''}</span>
                <span style="font-weight:600;font-size:14px">${t.name}</span>
              </div>
              <span class="뱃지" style="background:${d.color||'var(--border)'};color:#fff;font-size:10px">${d.name||t.domain}</span>
            </div>
            <p style="font-size:12px;color:var(--text-2);margin-bottom:8px;line-height:1.4">${t.desc}</p>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
              ${(t.tags||[]).map(tag => `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--bg);color:var(--text-3)">${tag}</span>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;color:var(--text-3)">${t.cellCount}셀 · ${t.claimCount}Claim</span>
              <button class="btn btn-확정 tmpl-deploy" data-id="${t.id}" style="font-size:12px;padding:4px 12px">배포</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    // 이벤트
    this.el.querySelectorAll('[data-domain]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedDomain = btn.dataset.domain || null;
        this.렌더();
      });
    });

    const searchInput = document.getElementById('_tmplSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.렌더();
      });
    }

    this.el.querySelectorAll('.tmpl-deploy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.배포(btn.dataset.id);
      });
    });
  }

  async 배포(templateId) {
    try {
      const res = await fetch(`${API}/templates/${templateId}/deploy`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        document.dispatchEvent(new CustomEvent('데이터변경'));
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${data.templateName} 배포 완료: ${data.cellsCreated}셀 + ${data.claimsCreated}Claim`, type: '확정' } }));
      } else {
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '배포 실패: ' + (data.error || ''), type: '오류' } }));
      }
    } catch (e) {
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '배포 오류', type: '오류' } }));
    }
  }
}

export { 템플릿브라우저 };
