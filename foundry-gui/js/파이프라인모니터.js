// 파이프라인 모니터 — 실시간 상태 표시
import { 사상 } from './4상상태.js';

class 파이프라인모니터 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
    this.파이프들 = new Map();
    this.SSE = null;
  }

  SSE연결() {
    // SSE는 파이프라인 화면 진입 시에만 연결 (자동 재연결 방지)
    if (this.SSE) return;
    try {
      this.SSE = new EventSource('/foundry/pipeline/stream');
      this.SSE.addEventListener('상태갱신', e => {
        try {
          const d = JSON.parse(e.data);
          this.파이프들.set(d.id, d);
          this.렌더();
        } catch {}
      });
      this.SSE.onerror = () => {
        this.SSE?.close();
        this.SSE = null;
        // 재연결 안 함 — 화면 재진입 시 수동 연결
      };
    } catch {}
  }

  async 초기로드() {
    // SSE 연결하지 않음 — 파이프라인 화면에서만 수동 연결
    // 정적 파이프라인 예시 (실제 구현시 API에서 로드)
    this.파이프들.set('kps-ema', {
      id: 'kps-ema',
      이름: 'KPS EMA9/21/50',
      노드수: 4,
      상태: 0,
    });
    this.파이프들.set('trust-prop', {
      id: 'trust-prop',
      이름: '신뢰전파 분석',
      노드수: 3,
      상태: -2,
    });
    this.파이프들.set('data-ingest', {
      id: 'data-ingest',
      이름: '데이터 수집',
      노드수: 5,
      상태: -2,
    });
    this.렌더();
  }

  렌더() {
    if (!this.el) return;
    this.el.innerHTML = '';

    for (const [id, pl] of this.파이프들) {
      const div = document.createElement('div');
      div.className = '파이프행';
      div.innerHTML = `
        <div class="파이프-점 ${사상.이름(pl.상태)}"></div>
        <span style="flex:1;font-weight:500">${pl.이름}</span>
        <span style="color:var(--text-3);font-size:12px">${pl.노드수 ?? 0}노드</span>
        ${사상.뱃지(pl.상태)}
        <button class="btn" data-pipe="${id}">▶</button>
      `;
      div.querySelector('.btn')?.addEventListener('click', () => this.실행(id));
      this.el.appendChild(div);
    }
  }

  async 실행(id) {
    try {
      const pl = this.파이프들.get(id);
      if (pl) { pl.상태 = 0; this.렌더(); }
      // 실제 API 호출
      // await fetch('/api/foundry/pipeline/run', { method: 'POST', ... });
      setTimeout(() => {
        if (pl) { pl.상태 = 1; this.렌더(); }
      }, 1500);
    } catch {}
  }

  해제() { this.SSE?.close(); }
}

export { 파이프라인모니터 };
