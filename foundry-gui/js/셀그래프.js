// 27방사형 셀 그래프 — D3 force layout + 슬롯 패널
import { 사상, EP, 슬롯메타, 층색상 } from './4상상태.js';

const API = '/api/foundry';

class 셀그래프 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
    this.svg = null;
    this.sim = null;
    this.nodes = [];
    this.links = [];
    this._init();
  }

  _init() {
    if (!this.el) return;
    const W = this.el.clientWidth || 800;
    const H = this.el.clientHeight || 500;

    this.svg = d3.select(this.el).append('svg')
      .attr('width', '100%').attr('height', '100%')
      .attr('viewBox', `0 0 ${W} ${H}`);

    const g = this.svg.append('g');
    this.svg.call(d3.zoom().scaleExtent([.2, 4])
      .on('zoom', e => g.attr('transform', e.transform)));

    this.gLink = g.append('g');
    this.gNode = g.append('g');
    this.W = W; this.H = H;

    this.sim = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(35));
  }

  async 로드() {
    try {
      const res = await fetch(`${API}/cells?offset=0&limit=200`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.cells || !data.cells.length) {
        this._empty();
        return;
      }

      const idSet = new Set(data.cells.map(c => c.id));
      this.nodes = data.cells.map(c => ({
        ...c, 상태값: 사상.EP변환(c.status),
      }));

      this.links = [];
      for (const c of data.cells) {
        if (c.forward > 0 && idSet.has(c.forward)) {
          this.links.push({ source: c.id, target: c.forward, type: 'synapse' });
        }
        if (c.connections) {
          for (const dir of ['ti', 'om', 'ta', 'eum']) {
            const tid = c.connections[dir];
            if (tid > 0 && idSet.has(tid)) {
              this.links.push({ source: c.id, target: tid, type: dir });
            }
          }
        }
      }
      this._render();
    } catch (e) {
      console.warn('[그래프]', e);
    }
  }

  _empty() {
    if (!this.svg) return;
    this.gNode.selectAll('*').remove();
    this.gLink.selectAll('*').remove();
    this.svg.select('.empty-msg')?.remove();
    this.svg.append('text').attr('class', 'empty-msg')
      .attr('x', this.W / 2).attr('y', this.H / 2)
      .attr('text-anchor', 'middle').attr('fill', '#A09E98').attr('font-size', 14)
      .text('"샘플 데이터" 버튼을 클릭하세요');
  }

  _render() {
    this.svg.select('.empty-msg')?.remove();

    const link = this.gLink.selectAll('line')
      .data(this.links, d => `${d.source.id||d.source}-${d.target.id||d.target}-${d.type}`)
      .join('line')
      .attr('class', d => `link ${d.type === 'ta' ? '반박' : '신뢰'}`)
      .attr('stroke-dasharray', d => d.type === 'ta' ? '4 3' : null);

    const node = this.gNode.selectAll('g.node')
      .data(this.nodes, d => d.id)
      .join(
        enter => {
          const g = enter.append('g').attr('class', d => `node ${사상.이름(d.상태값)}`)
            .call(d3.drag()
              .on('start', (e, d) => { if (!e.active) this.sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
              .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
              .on('end', (e, d) => { if (!e.active) this.sim.alphaTarget(0); d.fx = null; d.fy = null; })
            )
            .on('click', (e, d) => {
              e.stopPropagation();
              document.dispatchEvent(new CustomEvent('셀선택', { detail: d }));
            });
          g.append('circle').attr('r', 22);
          g.append('text').attr('text-anchor', 'middle').attr('dy', 4).attr('font-size', 11);
          // 근거 뱃지
          g.append('text').attr('class', '뱃지텍스트').attr('text-anchor', 'middle').attr('dy', -28).attr('font-size', 9).attr('fill', '#A09E98');
          return g;
        },
        update => update.attr('class', d => `node ${사상.이름(d.상태값)}`),
        exit => exit.remove()
      );

    node.select('text:first-of-type').text(d => {
      const label = d.name || (d.claim ? d.claim.subject : String(d.id));
      return label.slice(0, 7);
    });
    node.select('.뱃지텍스트').text(d => d.evidence > 0 ? `근거${d.evidence}` : '');

    this.sim.nodes(this.nodes);
    this.sim.force('link').links(this.links);
    this.sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    this.sim.alpha(.8).restart();
  }
}

// 27방사형 슬롯 패널
class 슬롯패널 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
  }

  async 렌더(셀) {
    if (!this.el) return;
    if (!셀) { this.el.innerHTML = '<p style="color:var(--text-3)">셀 미선택</p>'; return; }

    // 최신 데이터 가져오기
    let cell = 셀;
    try {
      const res = await fetch(`${API}/cells/${셀.id}`);
      if (res.ok) cell = await res.json();
    } catch {}

    const st = 사상.EP변환(cell.status);

    this.el.innerHTML = `
      <div class="카드-헤더">
        <span class="카드-제목">셀 #${cell.id}: ${cell.name || '—'}</span>
        <span class="뱃지 ${사상.이름(st)}">${cell.statusName || 사상.이름(st)}</span>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-2)">27방사형 슬롯</div>
          <div class="슬롯그리드" id="_슬롯G"></div>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-2)">속성</div>
          <table style="font-size:12px;width:100%;border-collapse:collapse">
            ${this._row('ID', cell.id)}
            ${this._row('이름', cell.name)}
            ${this._row('유형', cell.type)}
            ${this._row('내용', cell.content)}
            ${this._row('상태', cell.statusName)}
            ${this._row('신뢰도', `${cell.trust}/13 (${cell.trustNorm})`)}
            ${this._row('근거', cell.evidence)}
            ${this._row('레이어', cell.layer ?? '—')}
            ${this._row('버전', cell.version)}
            ${cell.claim ? `
              ${this._row('주체', cell.claim.subject)}
              ${this._row('술어', cell.claim.predicate)}
              ${this._row('대상', cell.claim.object)}
            ` : ''}
          </table>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn" data-act="evidence" data-id="${cell.id}">근거+1</button>
            <button class="btn" data-act="advance" data-id="${cell.id}">전진 ▲</button>
            <button class="btn" data-act="retreat" data-id="${cell.id}">후퇴 ▼</button>
            <button class="btn" style="color:var(--오류)" data-act="delete" data-id="${cell.id}">삭제</button>
          </div>
        </div>
      </div>
    `;

    // 슬롯 그리드
    const grid = document.getElementById('_슬롯G');
    if (grid) {
      const fields = ['direction','reserved12','reserved11','writePerm','readPerm','owner',
        'depth','size','location','strength','target','source','backward','status','forward',
        'content','type','name','createdAt','modifiedAt','ttl','evidence','trust','consensus',
        'tag','version','reserved13'];
      슬롯메타.forEach((meta, i) => {
        const key = fields[i] || meta.영문;
        const val = cell[key] ?? '—';
        const filled = val !== 0 && val !== '—' && val !== -1 && val !== null;
        const div = document.createElement('div');
        div.className = `슬롯 ${filled ? '확정' : '미인지'}`;
        div.title = `[${meta.링}] ${meta.이름} (${meta.층})`;
        div.innerHTML = `<span class="슬롯-번호">${meta.링}</span><span class="슬롯-값">${this._fmt(val)}</span>`;
        grid.appendChild(div);
      });
    }

    // 버튼 이벤트
    this.el.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        if (act === 'delete') {
          await fetch(`${API}/cells/${id}`, { method: 'DELETE' });
        } else {
          await fetch(`${API}/cells/${id}/${act}`, { method: 'POST' });
        }
        // 새로고침
        try {
          const r = await fetch(`${API}/cells/${id}`);
          if (r.ok) this.렌더(await r.json());
          else this.el.innerHTML = '<p style="color:var(--text-3)">셀 삭제됨</p>';
        } catch {}
        // 그래프도 갱신
        document.dispatchEvent(new CustomEvent('데이터변경'));
      });
    });
  }

  _row(label, val) {
    return `<tr><td style="color:var(--text-3);padding:2px 8px 2px 0;white-space:nowrap">${label}</td><td style="padding:2px 0">${val ?? '—'}</td></tr>`;
  }

  _fmt(v) {
    if (typeof v === 'number' && v > 1e10) return new Date(v).toLocaleTimeString('ko');
    if (typeof v === 'string' && v.length > 6) return v.slice(0, 6) + '…';
    return v;
  }
}

export { 셀그래프, 슬롯패널 };
