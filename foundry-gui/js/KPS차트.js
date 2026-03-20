// KPS EMA9/21/50 캔들차트 — canvas 기반
// 참조: foundry/분석/EMA분석기.han

class KPS차트 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.data = [];
    this.ema = { e9: [], e21: [], e50: [] };
    this.signals = [];
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const r = this.el.getBoundingClientRect();
    this.canvas.width = r.width || 800;
    this.canvas.height = r.height || 320;
    this._draw();
  }

  _ema(vals, period) {
    if (vals.length < period) return [];
    const k = 2 / (period + 1);
    let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const out = [e];
    for (let i = period; i < vals.length; i++) {
      e = (vals[i] - e) * k + e;
      out.push(e);
    }
    return out;
  }

  데이터설정(ohlcv) {
    this.data = ohlcv;
    const closes = ohlcv.map(c => c.close ?? c.종가 ?? c[4] ?? c);
    this.ema.e9 = this._ema(closes, 9);
    this.ema.e21 = this._ema(closes, 21);
    this.ema.e50 = this._ema(closes, 50);

    // 신호 감지
    this.signals = [];
    const e9 = this.ema.e9, e21 = this.ema.e21;
    for (let i = 1; i < Math.min(e9.length, e21.length); i++) {
      const prev = e9[i - 1] - e21[i - 1];
      const curr = e9[i] - e21[i];
      const idx = i + (closes.length - e9.length);
      if (prev <= 0 && curr > 0) this.signals.push({ i: idx, type: 'buy' });
      if (prev >= 0 && curr < 0) this.signals.push({ i: idx, type: 'sell' });
    }
    this._draw();
  }

  _draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const P = { t: 20, b: 28, l: 56, r: 16 };
    const cW = W - P.l - P.r, cH = H - P.t - P.b;

    ctx.clearRect(0, 0, W, H);
    if (!this.data.length) {
      ctx.fillStyle = '#A09E98'; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('데이터 로드 중...', W / 2, H / 2);
      return;
    }

    const closes = this.data.map(c => c.close ?? c.종가 ?? c[4] ?? c);
    const all = [...closes, ...this.ema.e9, ...this.ema.e21, ...this.ema.e50].filter(Boolean);
    const min = Math.min(...all) * .999, max = Math.max(...all) * 1.001, range = max - min;
    const X = i => P.l + (i / (this.data.length - 1)) * cW;
    const Y = v => P.t + (1 - (v - min) / range) * cH;

    // 격자
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = P.t + (i / 4) * cH;
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
      ctx.fillStyle = '#A09E98'; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
      ctx.fillText((max - (i / 4) * range).toFixed(1), P.l - 4, y + 3);
    }

    // 캔들
    const bw = Math.max(1, cW / this.data.length - 1);
    this.data.forEach((c, i) => {
      const o = c.open ?? c.시가 ?? closes[i];
      const h = c.high ?? c.고가 ?? closes[i];
      const l = c.low ?? c.저가 ?? closes[i];
      const cl = closes[i];
      const x = X(i), up = cl >= o;
      ctx.strokeStyle = ctx.fillStyle = up ? '#1D9E75' : '#A32D2D';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(h)); ctx.lineTo(x, Y(l)); ctx.stroke();
      ctx.fillRect(x - bw / 2, Math.min(Y(o), Y(cl)), bw, Math.abs(Y(o) - Y(cl)) || 1);
    });

    // EMA 선
    const drawEMA = (ema, color, dash = []) => {
      if (!ema.length) return;
      const si = this.data.length - ema.length;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
      ema.forEach((v, i) => { const x = X(si + i), y = Y(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    drawEMA(this.ema.e9, '#1D9E75');
    drawEMA(this.ema.e21, '#BA7517');
    drawEMA(this.ema.e50, '#A09E98', [4, 3]);

    // 신호 마커
    this.signals.forEach(s => {
      if (s.i >= closes.length) return;
      const x = X(s.i), y = Y(closes[s.i]);
      ctx.fillStyle = s.type === 'buy' ? '#1D9E75' : '#A32D2D';
      ctx.beginPath();
      if (s.type === 'buy') { ctx.moveTo(x, y + 14); ctx.lineTo(x - 5, y + 24); ctx.lineTo(x + 5, y + 24); }
      else { ctx.moveTo(x, y - 14); ctx.lineTo(x - 5, y - 24); ctx.lineTo(x + 5, y - 24); }
      ctx.fill();
    });

    // 범례
    ctx.font = '10px system-ui'; ctx.textAlign = 'left';
    [['EMA9', '#1D9E75'], ['EMA21', '#BA7517'], ['EMA50', '#A09E98']].forEach(([label, color], i) => {
      const lx = P.l + 10 + i * 70;
      ctx.fillStyle = color; ctx.fillRect(lx, P.t + 4, 12, 2);
      ctx.fillText(label, lx + 16, P.t + 8);
    });
  }
}

export { KPS차트 };
