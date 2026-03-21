// CrownyCore — 군사 지도 (Leaflet + milsymbol)
// MIL-STD-2525D NATO 심볼 + 유닛 위치 + 셀 연동

const API = '/api/foundry';

class 지도앱 {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.markers = [];
    this.initialized = false;
  }

  async 초기화() {
    if (this.initialized) {
      this.map?.invalidateSize();
      return;
    }

    const container = document.getElementById(this.containerId);
    if (!container || !window.L) return;

    // 지도 초기화 (한반도 중심)
    this.map = L.map(this.containerId, {
      center: [37.5665, 126.9780], // 서울
      zoom: 7,
      zoomControl: true,
    });

    // 오프라인 타일 (간단한 그리드 배경 — 에어갭용)
    // 온라인이면 OSM 타일 사용, 오프라인이면 빈 그리드
    try {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 18,
      }).addTo(this.map);
    } catch {
      // 오프라인 폴백: 격자 배경
      container.style.background = 'var(--bg)';
    }

    // 군사 그리드 오버레이
    this._addMilitaryGrid();

    // 데모 유닛 배치
    await this._loadUnits();

    // 컨트롤 패널
    this._addControls();

    this.initialized = true;
  }

  _addMilitaryGrid() {
    // 위도/경도 그리드 라인 (MGRS 간이 표시)
    const gridGroup = L.layerGroup();
    for (let lat = 33; lat <= 43; lat++) {
      L.polyline([[lat, 124], [lat, 132]], { color: '#ccc', weight: 0.5, dashArray: '4' }).addTo(gridGroup);
    }
    for (let lng = 124; lng <= 132; lng++) {
      L.polyline([[33, lng], [43, lng]], { color: '#ccc', weight: 0.5, dashArray: '4' }).addTo(gridGroup);
    }
    gridGroup.addTo(this.map);
  }

  _createMilSymbol(sidc, options = {}) {
    if (!window.ms) return null;
    try {
      const sym = new ms.Symbol(sidc, {
        size: options.size || 35,
        quantity: options.quantity,
        staffComments: options.comment,
        additionalInformation: options.info,
        type: options.type,
        dtg: options.dtg,
        location: options.location,
      });
      return sym;
    } catch { return null; }
  }

  async _loadUnits() {
    // 데모 군사 유닛 (MIL-STD-2525D SIDC 코드)
    const units = [
      // 아군 (Friend)
      { name: '제1사단', sidc: 'SFGPUCI----E---', lat: 37.89, lng: 127.01, info: '보병사단', status: 'Ti' },
      { name: '제3사단', sidc: 'SFGPUCI----E---', lat: 38.10, lng: 127.15, info: '보병사단', status: 'Ti' },
      { name: '제5군단', sidc: 'SFGPUCII---E---', lat: 37.75, lng: 127.05, info: '군단사령부', status: 'Ti' },
      { name: '제7기동사단', sidc: 'SFGPUCA----E---', lat: 37.45, lng: 127.30, info: '기갑사단', status: 'Ti' },
      { name: '방공여단', sidc: 'SFGPUCD----E---', lat: 37.50, lng: 126.95, info: '방공', status: 'Ti' },
      { name: 'K-9자주포대대', sidc: 'SFGPUCF----D---', lat: 37.95, lng: 127.08, info: '포병', status: 'Ti' },
      // 적군 (Hostile)
      { name: '적 기계화사단', sidc: 'SHGPUCM----E---', lat: 38.45, lng: 126.90, info: '기계화', status: 'Ta' },
      { name: '적 포병여단', sidc: 'SHGPUCF----E---', lat: 38.55, lng: 127.00, info: '포병', status: 'Ta' },
      // 미확인 (Unknown)
      { name: '미확인 레이더', sidc: 'SUGPUSR----E---', lat: 38.30, lng: 126.70, info: '레이더 신호', status: 'Om' },
    ];

    for (const unit of units) {
      const sym = this._createMilSymbol(unit.sidc, { info: unit.info, size: 30 });
      let icon;

      if (sym) {
        const canvas = sym.asCanvas();
        const url = canvas.toDataURL();
        icon = L.icon({
          iconUrl: url,
          iconSize: [canvas.width, canvas.height],
          iconAnchor: [canvas.width / 2, canvas.height / 2],
        });
      } else {
        // milsymbol 없을 때 폴백: 4상 색상 원
        const color = unit.status === 'Ti' ? '#2D7D5F' : unit.status === 'Ta' ? '#8C3D3D' : '#8C7440';
        icon = L.divIcon({
          html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
      }

      const marker = L.marker([unit.lat, unit.lng], { icon }).addTo(this.map);
      const stLabel = { Ti: '▲확정', Om: '●미확인', Ta: '▼적성' }[unit.status] || '?';
      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:12px;min-width:150px">
          <div style="font-weight:700;margin-bottom:4px">${unit.name}</div>
          <div style="color:#666;margin-bottom:4px">${unit.info}</div>
          <div style="font-size:10px">상태: <b>${stLabel}</b></div>
          <div style="font-size:10px">위치: ${unit.lat.toFixed(3)}, ${unit.lng.toFixed(3)}</div>
          <div style="margin-top:6px">
            <button onclick="fetch('${API}/cells',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'${unit.name}',type:3,content:'${unit.info} [${unit.lat},${unit.lng}]',layer:0,scope:5})}).then(()=>alert('셀 등록됨'))" style="font-size:10px;padding:2px 6px;cursor:pointer">셀 등록</button>
          </div>
        </div>
      `);
      this.markers.push(marker);
    }

    // DMZ 라인 표시
    const dmz = [
      [38.35, 124.60], [38.30, 125.10], [38.25, 125.60],
      [38.20, 126.10], [38.25, 126.60], [38.30, 127.00],
      [38.35, 127.40], [38.40, 127.80], [38.45, 128.20],
      [38.50, 128.60],
    ];
    L.polyline(dmz, { color: '#8C3D3D', weight: 3, dashArray: '10 5' }).addTo(this.map);
    L.polyline(dmz.map(([lat, lng]) => [lat - 0.04, lng]), { color: '#8C3D3D', weight: 1, dashArray: '4 4', opacity: 0.5 }).addTo(this.map);
    L.polyline(dmz.map(([lat, lng]) => [lat + 0.04, lng]), { color: '#8C3D3D', weight: 1, dashArray: '4 4', opacity: 0.5 }).addTo(this.map);
  }

  _addControls() {
    // 범례
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:#fff;padding:8px;border-radius:4px;font-size:10px;font-family:Inter,sans-serif;border:1px solid #ddd';
      div.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px">CrownyCore 전술지도</div>
        <div><span style="color:#2D7D5F">■</span> 아군 (Ti)</div>
        <div><span style="color:#8C3D3D">■</span> 적군 (Ta)</div>
        <div><span style="color:#8C7440">■</span> 미확인 (Om)</div>
        <div style="margin-top:3px;color:#8C3D3D">--- DMZ</div>
      `;
      return div;
    };
    legend.addTo(this.map);
  }
}

export { 지도앱 };
