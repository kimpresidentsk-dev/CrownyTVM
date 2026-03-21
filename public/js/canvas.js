// ═══════════════════════════════════════════════════════════════
// canvas.js — CrownyBus Canvas 워크스페이스 엔진
//
// crownybus.com 전용 엔터프라이즈 UI
// 16 워크스페이스 + 3패널 레이아웃 + CellCore 기반
//
// crowny.org에서는 로드되지 않음 (도메인 감지)
// ═══════════════════════════════════════════════════════════════
'use strict';

const CANVAS = (function() {

    // ── 16 워크스페이스 정의 ──
    const WORKSPACES = [
        { id: 'canvas',   label: 'Canvas',    icon: 'cpu' },
        { id: 'msg',      label: 'Chat',      icon: 'message-circle' },
        { id: 'dex',      label: 'DEX',       icon: 'repeat' },
        { id: 'trading',  label: 'Trading',   icon: 'trending-up' },
        { id: 'docs',     label: 'Note',      icon: 'file-text' },
        { id: 'project',  label: 'Project',   icon: 'target' },
        { id: 'content',  label: 'Content',   icon: 'palette' },
        { id: 'game',     label: 'Game',      icon: 'gamepad-2' },
        { id: 'work',     label: 'Workbench', icon: 'wrench' },
        { id: 'shop',     label: 'Shop',      icon: 'shopping-bag' },
        { id: 'life',     label: 'Life',      icon: 'heart' },
        { id: 'synergy',  label: 'Synergy',   icon: 'link' },
        { id: 'mind',     label: 'Mind',      icon: 'brain' },
        { id: 'bible',    label: 'Bible',     icon: 'book-open' },
        { id: 'admin',    label: 'Admin',     icon: 'shield', hidden: true },
        { id: 'om',       label: 'Om',        icon: 'circle' },
    ];

    let currentWs = 'canvas';
    let initialized = false;

    // ── 도메인 감지 ──
    function isCrownyBus() {
        // crownybus.com 또는 URL 파라미터 ?canvas=1 으로 강제 활성화
        return location.hostname === 'crownybus.com' ||
               new URLSearchParams(location.search).has('canvas');
    }

    // ── 초기화: crowny.org 레이아웃을 Canvas로 전환 ──
    function init() {
        if (!isCrownyBus() || initialized) return;
        initialized = true;

        // 기존 crowny.org 요소 숨기기
        const topBar = document.getElementById('crowny-top-bar');
        if (topBar) topBar.style.display = 'none';
        const bottomTab = document.getElementById('bottom-tab-bar');
        if (bottomTab) bottomTab.style.display = 'none';
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.style.display = 'none';
        const content = document.querySelector('.content');
        if (content) content.style.display = 'none';

        // Canvas 프레임 생성
        const frame = document.createElement('div');
        frame.id = 'canvas-frame';
        frame.innerHTML = buildFrameHTML();
        document.body.appendChild(frame);

        // 스타일 주입
        injectStyles();

        // 아이콘 렌더링
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // 시계
        updateClock();
        setInterval(updateClock, 10000);

        // 기본 워크스페이스 열기
        openWs('canvas');

        console.log('[CANVAS] Enterprise mode activated');
    }

    // ── 프레임 HTML ──
    function buildFrameHTML() {
        const tabsHTML = WORKSPACES
            .filter(w => !w.hidden)
            .map(w => `<button class="cv-ws-tab${w.id === 'canvas' ? ' on' : ''}" data-ws="${w.id}" onclick="CANVAS.openWs('${w.id}')"><i data-lucide="${w.icon}" style="width:14px;height:14px"></i><span>${w.label}</span></button>`)
            .join('');

        return `
        <div class="cv-topbar">
            <div class="cv-brand" onclick="CANVAS.openWs('canvas')">CrownyOS</div>
            <div class="cv-brand-sub">Canvas</div>
            <div class="cv-topbar-msg" id="cv-msg">27-slot radial cell architecture</div>
            <div style="flex:1"></div>
            <a href="https://crowny.org" target="_blank" class="cv-link">crowny.org</a>
            <span class="cv-time" id="cv-time">--:--</span>
            <span class="cv-time" id="cv-om" style="color:var(--gold)"></span>
        </div>
        <div class="cv-ws-bar">${tabsHTML}</div>
        <div class="cv-body" id="cv-body">
            <div class="cv-panel cv-panel-left" id="cv-left">
                <div class="cv-panel-header"><span id="cv-left-title">Input</span></div>
                <div class="cv-panel-content" id="cv-left-content"></div>
            </div>
            <div class="cv-panel cv-panel-center" id="cv-center">
                <div class="cv-panel-header"><span id="cv-center-title">Workspace</span></div>
                <div class="cv-panel-content" id="cv-center-content"></div>
            </div>
            <div class="cv-panel cv-panel-right" id="cv-right">
                <div class="cv-panel-header"><span id="cv-right-title">Output</span></div>
                <div class="cv-panel-content" id="cv-right-content"></div>
            </div>
        </div>
        <div class="cv-dock" id="cv-dock">
            <div class="cv-dock-tabs">
                <button class="cv-dock-tab on" onclick="CANVAS.setDock('run')">RUN</button>
                <button class="cv-dock-tab" onclick="CANVAS.setDock('log')">LOG</button>
                <button class="cv-dock-tab" onclick="CANVAS.setDock('cells')">CELLS</button>
            </div>
            <div class="cv-dock-content" id="cv-dock-content"></div>
        </div>`;
    }

    // ── 워크스페이스 열기 ──
    function openWs(id) {
        currentWs = id;
        // 탭 활성화
        document.querySelectorAll('.cv-ws-tab').forEach(b => b.classList.toggle('on', b.dataset.ws === id));

        const ws = WORKSPACES.find(w => w.id === id);
        const left = document.getElementById('cv-left-content');
        const center = document.getElementById('cv-center-content');
        const right = document.getElementById('cv-right-content');
        const leftTitle = document.getElementById('cv-left-title');
        const centerTitle = document.getElementById('cv-center-title');
        const rightTitle = document.getElementById('cv-right-title');

        if (!left || !center || !right) return;

        // 워크스페이스별 패널 내용
        switch (id) {
            case 'canvas':
                leftTitle.textContent = 'Natural Language';
                centerTitle.textContent = 'KPS Restatement';
                rightTitle.textContent = 'ISA729 Assembly';
                loadCanvasWorkspace(left, center, right);
                break;
            case 'msg':
                leftTitle.textContent = 'Contacts';
                centerTitle.textContent = 'Messages';
                rightTitle.textContent = 'Info';
                loadMsgWorkspace(left, center, right);
                break;
            case 'dex':
                leftTitle.textContent = 'Assets';
                centerTitle.textContent = 'Swap';
                rightTitle.textContent = 'History';
                loadDexWorkspace(left, center, right);
                break;
            case 'trading':
                leftTitle.textContent = 'Positions';
                centerTitle.textContent = 'Chart';
                rightTitle.textContent = 'Trade';
                loadTradingWorkspace(left, center, right);
                break;
            case 'mind':
                leftTitle.textContent = 'Agents';
                centerTitle.textContent = 'Chat';
                rightTitle.textContent = 'Memory';
                loadMindWorkspace(left, center, right);
                break;
            case 'game':
                leftTitle.textContent = 'Library';
                centerTitle.textContent = 'Play';
                rightTitle.textContent = 'Leaderboard';
                loadGameWorkspace(left, center, right);
                break;
            case 'shop':
                leftTitle.textContent = 'Categories';
                centerTitle.textContent = 'Products';
                rightTitle.textContent = 'Cart';
                loadShopWorkspace(left, center, right);
                break;
            case 'synergy':
                leftTitle.textContent = 'Services';
                centerTitle.textContent = 'Connections';
                rightTitle.textContent = 'Activity';
                loadSynergyWorkspace(left, center, right);
                break;
            case 'admin':
                leftTitle.textContent = 'Menu';
                centerTitle.textContent = 'Dashboard';
                rightTitle.textContent = 'Logs';
                loadAdminWorkspace(left, center, right);
                break;
            case 'om':
                leftTitle.textContent = 'Observe';
                centerTitle.textContent = 'Essence';
                rightTitle.textContent = 'Reflection';
                loadOmWorkspace(left, center, right);
                break;
            case 'docs':
                leftTitle.textContent = 'Notes';
                centerTitle.textContent = 'Editor';
                rightTitle.textContent = 'Info';
                loadDocsWorkspace(left, center, right);
                break;
            case 'project':
                leftTitle.textContent = 'Projects';
                centerTitle.textContent = 'Tasks';
                rightTitle.textContent = 'Timeline';
                loadProjectWorkspace(left, center, right);
                break;
            case 'bible':
                leftTitle.textContent = 'Progress';
                centerTitle.textContent = 'Quiz';
                rightTitle.textContent = 'Reference';
                loadBibleWorkspace(left, center, right);
                break;
            case 'content':
                leftTitle.textContent = 'Gallery';
                centerTitle.textContent = 'Create';
                rightTitle.textContent = 'Analytics';
                loadContentWorkspace(left, center, right);
                break;
            case 'life':
                leftTitle.textContent = 'Metrics';
                centerTitle.textContent = 'Today';
                rightTitle.textContent = 'History';
                loadLifeWorkspace(left, center, right);
                break;
            case 'work':
                leftTitle.textContent = 'Files';
                centerTitle.textContent = 'HanSeon-C IDE';
                rightTitle.textContent = 'Output';
                loadWorkbenchWorkspace(left, center, right);
                break;
            default:
                leftTitle.textContent = ws ? ws.label : id;
                centerTitle.textContent = 'Content';
                rightTitle.textContent = 'Details';
                center.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)"><i data-lucide="${ws?.icon || 'box'}" style="width:48px;height:48px;display:block;margin:0 auto 1rem;opacity:0.3"></i><h3>${ws?.label || id}</h3><p style="font-size:0.8rem;margin-top:0.5rem">Cell-based workspace</p><button class="cv-btn" onclick="CANVAS.loadCells('${id}')" style="margin-top:1rem">Load Cells</button></div>`;
                left.innerHTML = '';
                right.innerHTML = '';
                if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // ── 워크스페이스: Messenger ──
    let _chatPollTimer = null;
    let _currentChatId = null;

    async function loadMsgWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        if (!token) { center.innerHTML = '<div class="cv-mono">Login required</div>'; return; }

        // 연락처 + 채팅방 목록
        try {
            const [chatR, contactR] = await Promise.all([
                fetch('/v2/chat/list', { headers: { 'Authorization': 'Bearer ' + token } }),
                fetch('/v2/contacts', { headers: { 'Authorization': 'Bearer ' + token } }),
            ]);
            const chatData = await chatR.json();
            const contactData = await contactR.json();
            const chats = chatData.chats || chatData || [];
            const contacts = contactData.contacts || contactData || [];

            let html = `<button class="cv-btn" onclick="CANVAS.newChat()" style="width:100%;margin-bottom:6px">+ New Chat</button>`;
            // 채팅방 목록
            html += chats.map(c => {
                const name = c.name || c.displayName || c.id;
                const unread = c.unread > 0 ? `<span style="background:var(--error);color:var(--bg);font-size:0.55rem;padding:1px 4px;border-radius:6px;margin-left:4px">${c.unread}</span>` : '';
                const preview = c.lastMessageText ? `<div style="font-size:0.6rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.lastMessageText.slice(0, 30))}</div>` : '';
                return `<div class="cv-list-item" onclick="CANVAS.openChat('${c.id}','${name.replace(/'/g, '')}')"><strong>${escHtml(name)}</strong>${unread}${preview}</div>`;
            }).join('');

            // 연락처 (채팅방 없는 사람들)
            if (contacts.length > 0) {
                html += `<div style="font-size:0.6rem;font-weight:700;color:var(--text-secondary);padding:8px 0 4px;margin-top:4px;border-top:1px solid var(--border)">CONTACTS</div>`;
                html += contacts.map(c => `<div class="cv-list-item" style="font-size:0.75rem" onclick="CANVAS.startDM('${escHtml(c.username || c.crownyUsername || '')}')">${escHtml(c.display_name || c.name || c.username || '?')}</div>`).join('');
            }
            left.innerHTML = html;
        } catch { left.innerHTML = '<div class="cv-mono">Load failed</div>'; }

        center.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)"><div style="font-size:2rem;opacity:0.2;margin-bottom:0.5rem">&#9993;</div>Select a conversation</div>';
        right.innerHTML = '';
    }

    async function newChat() {
        const username = prompt('Username to chat with:');
        if (!username) return;
        await startDM(username);
    }

    async function startDM(username) {
        if (!username) return;
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/chat/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: username, type: 'dm' }) });
        const data = await r.json();
        if (data.id) openChat(data.id, username);
        else if (typeof showToast === 'function') showToast(data.error || 'Failed', 'error');
    }

    async function openChat(chatId, name) {
        _currentChatId = chatId;
        if (_chatPollTimer) clearInterval(_chatPollTimer);

        const center = document.getElementById('cv-center-content');
        const centerTitle = document.getElementById('cv-center-title');
        const right = document.getElementById('cv-right-content');
        if (centerTitle) centerTitle.textContent = name || chatId;

        await _renderChat(chatId);

        // 5초 폴링
        _chatPollTimer = setInterval(() => {
            if (currentWs === 'msg' && _currentChatId === chatId) _renderChat(chatId);
        }, 5000);

        // 우측: 채팅 정보
        if (right) {
            const token = localStorage.getItem('crowny_token');
            try {
                const r = await fetch(`/api/chat/${chatId}/info`, { headers: { 'Authorization': 'Bearer ' + token } });
                const info = await r.json();
                right.innerHTML = `<div style="padding:8px">
                    <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">INFO</div>
                    <div style="font-size:0.8rem;margin-bottom:4px"><strong>${escHtml(info.groupName || name || chatId)}</strong></div>
                    <div style="font-size:0.7rem;color:var(--text-secondary)">Type: ${info.type || 'dm'}</div>
                    <div style="font-size:0.7rem;color:var(--text-secondary)">Members: ${(info.participants || []).length}</div>
                    <div style="margin-top:8px;font-size:0.65rem;font-weight:700;color:var(--text-secondary)">PARTICIPANTS</div>
                    ${(info.participantStatus || info.participants || []).map(p => {
                        const username = p.username || p;
                        const online = p.isOnline;
                        return `<div style="padding:4px 0;font-size:0.75rem;border-bottom:1px solid var(--border)"><span style="color:${online ? 'var(--info)' : 'var(--text-secondary)'}">${online ? '●' : '○'}</span> ${escHtml(username)}</div>`;
                    }).join('')}
                </div>`;
            } catch {}
        }
    }

    async function _renderChat(chatId) {
        const center = document.getElementById('cv-center-content');
        if (!center) return;
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch(`/v2/chat/${chatId}/messages?limit=40`, { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await r.json();
            const msgs = data.messages || data || [];
            const username = localStorage.getItem('crowny_username') || '';

            // 기존 스크롤 위치 보존
            const existing = document.getElementById('cv-chat-msgs');
            const wasAtBottom = existing ? (existing.scrollHeight - existing.scrollTop - existing.clientHeight < 50) : true;

            center.innerHTML = `<div class="cv-scroll" id="cv-chat-msgs">${msgs.map(m => {
                const mine = m.senderId === username || m.from === username;
                const time = m.created_at ? new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
                return `<div class="cv-chat-msg ${mine ? 'mine' : 'theirs'}">
                    ${!mine ? `<div style="font-size:0.6rem;color:var(--text-secondary);margin-bottom:1px">${escHtml(m.senderId || m.from || '')}</div>` : ''}
                    <div class="cv-chat-bubble">${escHtml(m.content || m.text || '')}</div>
                    <div style="font-size:0.55rem;color:var(--text-muted-light);margin-top:1px">${time}</div>
                </div>`;
            }).join('')}</div>
            <div class="cv-input-row"><input id="cv-chat-input" class="cv-input" placeholder="Message..." onkeydown="if(event.key==='Enter'&&!event.isComposing)CANVAS.sendChat('${chatId}')"><button class="cv-btn" onclick="CANVAS.sendChat('${chatId}')">Send</button></div>`;

            const scroll = document.getElementById('cv-chat-msgs');
            if (scroll && wasAtBottom) scroll.scrollTop = scroll.scrollHeight;
        } catch {}
    }

    async function sendChat(chatId) {
        const input = document.getElementById('cv-chat-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        const token = localStorage.getItem('crowny_token');
        try {
            await fetch('/v2/chat/send', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, content: text })
            });
            await _renderChat(chatId);
        } catch {}
        input.focus();
    }

    // ── 워크스페이스: DEX ──
    async function loadDexWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/wallet', { headers: { 'Authorization': 'Bearer ' + token } });
            const w = await r.json();
            const b = w.balances || {};
            left.innerHTML = ['CRN', 'FNC', 'CRM'].map(c =>
                `<div class="cv-list-item"><strong>${c}</strong><span style="float:right">${(b[c]||0).toLocaleString()}</span></div>`
            ).join('');
        } catch { left.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        center.innerHTML = `<div style="padding:1rem">
            <h4 style="margin-bottom:0.5rem">Swap</h4>
            <select id="cv-swap-from" class="cv-select"><option value="CRM">CRM</option><option value="FNC">FNC</option></select>
            <span style="margin:0 0.5rem">→</span>
            <select id="cv-swap-to" class="cv-select"><option value="FNC">FNC</option><option value="CRN">CRN</option></select>
            <input type="number" id="cv-swap-amt" class="cv-input" placeholder="Amount" style="margin-top:0.5rem">
            <button class="cv-btn" onclick="CANVAS.execSwap()" style="margin-top:0.5rem;width:100%">Execute Swap</button>
        </div>`;
        right.innerHTML = '<div class="cv-mono">Swap history</div>';
    }

    // ── 워크스페이스: Trading ──
    let _tradingChart = null;
    let _tradingSeries = null;
    let _tradingData = [];
    let _tradingPrice = 21000;
    let _tradingTimer = null;

    function loadTradingWorkspace(left, center, right) {
        // 좌측: 포지션 + 잔액
        const token = localStorage.getItem('crowny_token');
        fetch('/api/wallet', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(r => r.json()).then(w => {
                const b = w.balances || {};
                left.innerHTML = `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
                        <div style="font-size:0.65rem;color:var(--text-secondary)">BALANCE</div>
                        <div style="font-size:0.8rem;font-weight:700">${(b.CRN||0)} CRN</div>
                        <div style="font-size:0.7rem;color:var(--text-secondary)">${(b.FNC||0)} FNC · ${(b.CRM||0)} CRM</div>
                    </div>
                    <div style="font-size:0.65rem;font-weight:700;color:var(--text-secondary);padding:8px 0 4px">POSITIONS</div>
                    <div id="cv-trading-positions" class="cv-mono">No open positions</div>
                    <button class="cv-btn" onclick="CANVAS.openPosition('long')" style="width:100%;margin-top:8px">Long</button>
                    <button class="cv-btn" onclick="CANVAS.openPosition('short')" style="width:100%;margin-top:4px;background:var(--error)">Short</button>`;
            }).catch(() => { left.innerHTML = '<div class="cv-mono">Load failed</div>'; });

        // 중앙: 차트
        center.innerHTML = `<div style="display:flex;gap:4px;padding:4px;border-bottom:1px solid var(--border)">
                <button class="cv-btn" style="font-size:0.6rem;padding:3px 8px" onclick="CANVAS.setTimeframe('1m')">1m</button>
                <button class="cv-btn" style="font-size:0.6rem;padding:3px 8px;background:var(--text-secondary)" onclick="CANVAS.setTimeframe('5m')">5m</button>
                <button class="cv-btn" style="font-size:0.6rem;padding:3px 8px;background:var(--text-secondary)" onclick="CANVAS.setTimeframe('1h')">1h</button>
                <div style="flex:1"></div>
                <span id="cv-trading-price" style="font-family:monospace;font-size:0.85rem;font-weight:700;color:var(--gold)">--</span>
            </div>
            <div id="cv-chart" style="width:100%;flex:1;min-height:250px"></div>`;
        _initTradingChart();

        // 우측: 주문 + 거래내역
        right.innerHTML = `<div style="padding:6px 0">
                <div style="font-size:0.65rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">QUICK ORDER</div>
                <select id="cv-trade-side" class="cv-select" style="width:100%;margin-bottom:4px"><option value="long">Long (Buy)</option><option value="short">Short (Sell)</option></select>
                <input id="cv-trade-size" class="cv-input" type="number" placeholder="Size (CRM)" style="width:100%;margin-bottom:4px">
                <input id="cv-trade-sl" class="cv-input" type="number" placeholder="Stop Loss" style="width:100%;margin-bottom:4px">
                <input id="cv-trade-tp" class="cv-input" type="number" placeholder="Take Profit" style="width:100%;margin-bottom:4px">
                <button class="cv-btn" onclick="CANVAS.placeOrder()" style="width:100%">Place Order</button>
            </div>
            <div style="font-size:0.65rem;font-weight:700;color:var(--text-secondary);padding:8px 0 4px;border-top:1px solid var(--border);margin-top:8px">TRADE LOG</div>
            <div id="cv-trade-log" class="cv-mono" style="max-height:150px;overflow-y:auto">No trades</div>`;
    }

    function _initTradingChart() {
        if (typeof LightweightCharts === 'undefined') return;
        setTimeout(() => {
            const container = document.getElementById('cv-chart');
            if (!container) return;
            _tradingChart = LightweightCharts.createChart(container, {
                width: container.clientWidth, height: container.clientHeight || 300,
                layout: { background: { color: '#1A1410' }, textColor: '#E8D5C4' },
                grid: { vertLines: { color: '#2A201A' }, horzLines: { color: '#2A201A' } },
                timeScale: { timeVisible: true, secondsVisible: false },
                crosshair: { mode: 0 },
            });
            _tradingSeries = _tradingChart.addCandlestickSeries({
                upColor: '#5B7B8C', downColor: '#B54534',
                borderUpColor: '#5B7B8C', borderDownColor: '#B54534',
                wickUpColor: '#5B7B8C', wickDownColor: '#B54534',
            });
            // 초기 데이터 로드
            _tradingData = [];
            _tradingPrice = 21000 + Math.random() * 500;
            const now = Math.floor(Date.now() / 1000);
            for (let i = 200; i >= 0; i--) {
                const candle = _generateCandle(now - i * 60);
                _tradingData.push(candle);
            }
            _tradingSeries.setData(_tradingData);
            _updatePriceDisplay();

            // 실시간 업데이트 (1초마다 새 틱)
            if (_tradingTimer) clearInterval(_tradingTimer);
            _tradingTimer = setInterval(() => {
                if (currentWs !== 'trading') { clearInterval(_tradingTimer); return; }
                const lastCandle = _tradingData[_tradingData.length - 1];
                const now = Math.floor(Date.now() / 1000);
                const candleTime = Math.floor(now / 60) * 60;

                if (lastCandle && lastCandle.time === candleTime) {
                    // 기존 캔들 업데이트
                    const tick = _tradingPrice + (Math.random() - 0.5) * 10;
                    _tradingPrice = tick;
                    lastCandle.close = tick;
                    lastCandle.high = Math.max(lastCandle.high, tick);
                    lastCandle.low = Math.min(lastCandle.low, tick);
                    _tradingSeries.update(lastCandle);
                } else {
                    // 새 캔들
                    const candle = _generateCandle(candleTime);
                    _tradingData.push(candle);
                    _tradingSeries.update(candle);
                }
                _updatePriceDisplay();
            }, 1000);

            // 리사이즈
            new ResizeObserver(() => {
                if (_tradingChart && container.clientWidth > 0) {
                    _tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 300 });
                }
            }).observe(container);
        }, 100);
    }

    function _generateCandle(time) {
        const move = (Math.random() - 0.48) * 30; // slight upward bias
        const open = _tradingPrice;
        _tradingPrice += move;
        const close = _tradingPrice;
        const high = Math.max(open, close) + Math.random() * 15;
        const low = Math.min(open, close) - Math.random() * 15;
        return { time, open: Math.round(open * 100) / 100, high: Math.round(high * 100) / 100, low: Math.round(low * 100) / 100, close: Math.round(close * 100) / 100 };
    }

    function _updatePriceDisplay() {
        const el = document.getElementById('cv-trading-price');
        if (el) {
            el.textContent = _tradingPrice.toFixed(2);
            el.style.color = _tradingData.length > 1 && _tradingData[_tradingData.length-1].close >= _tradingData[_tradingData.length-1].open ? 'var(--info)' : 'var(--error)';
        }
    }

    function setTimeframe(tf) { if (typeof showToast === 'function') showToast('Timeframe: ' + tf, 'info'); }

    async function openPosition(side) {
        const token = localStorage.getItem('crowny_token');
        const price = _tradingPrice.toFixed(2);
        await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 4, name: side.toUpperCase() + ' @ ' + price, value: parseFloat(price), category: side }) });
        if (typeof showToast === 'function') showToast(side.toUpperCase() + ' @ ' + price, 'success');
        // 포지션 목록 갱신
        const posEl = document.getElementById('cv-trading-positions');
        if (posEl) {
            const r = await fetch('/api/cell/query?type=4&limit=5', { headers: { 'Authorization': 'Bearer ' + token } });
            const positions = await r.json();
            posEl.innerHTML = positions.map(p => `<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:0.7rem"><span style="color:${p.category === 'long' ? 'var(--info)' : 'var(--error)'}">${p.category?.toUpperCase()}</span> ${p.value}</div>`).join('') || 'No positions';
        }
    }

    async function placeOrder() {
        const side = document.getElementById('cv-trade-side')?.value || 'long';
        const size = parseFloat(document.getElementById('cv-trade-size')?.value) || 100;
        const sl = document.getElementById('cv-trade-sl')?.value || '';
        const tp = document.getElementById('cv-trade-tp')?.value || '';
        await openPosition(side);
        const log = document.getElementById('cv-trade-log');
        if (log) {
            const entry = `${new Date().toLocaleTimeString()} ${side.toUpperCase()} ${size} CRM @ ${_tradingPrice.toFixed(2)}${sl ? ' SL:'+sl : ''}${tp ? ' TP:'+tp : ''}`;
            log.innerHTML = `<div style="padding:2px 0;border-bottom:1px solid var(--border)">${entry}</div>` + log.innerHTML;
        }
    }

    // ── 워크스페이스: Notes ──
    async function loadDocsWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        // 셀에서 DOCUMENT(5) 타입 로드
        try {
            const r = await fetch('/api/cell/query?type=5&limit=20', { headers: { 'Authorization': 'Bearer ' + token } });
            const docs = await r.json();
            left.innerHTML = `<button class="cv-btn" onclick="CANVAS.createNote()" style="width:100%;margin-bottom:8px">+ New Note</button>` +
                (docs.length > 0 ? docs.map(d => `<div class="cv-list-item" onclick="CANVAS.openNote(${d.id})">${escHtml(d.data?.[0] || 'Untitled')}<div style="font-size:0.6rem;color:var(--text-secondary)">${new Date(d.timestamp*1000).toLocaleDateString()}</div></div>`).join('') : '<div class="cv-mono">No notes</div>');
        } catch { left.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        center.innerHTML = '<div class="cv-mono" style="padding:2rem;text-align:center">Select or create a note</div>';
        right.innerHTML = '';
    }

    async function createNote() {
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 5, name: 'New Note', content: '' }) });
        const cell = await r.json();
        openNote(cell.id);
        openWs('docs'); // 목록 새로고침
    }

    async function openNote(id) {
        const token = localStorage.getItem('crowny_token');
        const r = await fetch(`/api/cell/get?id=${id}`, { headers: { 'Authorization': 'Bearer ' + token } });
        const cell = await r.json();
        const center = document.getElementById('cv-center-content');
        const centerTitle = document.getElementById('cv-center-title');
        if (centerTitle) centerTitle.textContent = cell.data?.[0] || 'Note';
        if (center) {
            center.innerHTML = `<input class="cv-input" id="cv-note-title" value="${escHtml(cell.data?.[0] || '')}" placeholder="Title" style="margin-bottom:6px;font-weight:700">
                <textarea class="cv-textarea" id="cv-note-body" style="flex:1" placeholder="Write here...">${escHtml(cell.data?.[1] || '')}</textarea>
                <button class="cv-btn" onclick="CANVAS.saveNote(${id})" style="margin-top:6px">Save</button>`;
        }
    }

    async function saveNote(id) {
        const title = document.getElementById('cv-note-title')?.value || '';
        const body = document.getElementById('cv-note-body')?.value || '';
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/update', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, updates: { '16': title, '17': body } }) });
        if (typeof showToast === 'function') showToast('Saved', 'success');
    }

    // ── 워크스페이스: Project ──
    async function loadProjectWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/cell/query?type=6&limit=20', { headers: { 'Authorization': 'Bearer ' + token } });
            const projects = await r.json();
            left.innerHTML = `<button class="cv-btn" onclick="CANVAS.createProject()" style="width:100%;margin-bottom:8px">+ New Project</button>` +
                (projects.length > 0 ? projects.map(p => `<div class="cv-list-item" onclick="CANVAS.openProject(${p.id})"><strong>${escHtml(p.data?.[0] || 'Project')}</strong><div style="font-size:0.6rem;color:var(--text-secondary)">Layer ${p.layer || 0}</div></div>`).join('') : '<div class="cv-mono">No projects</div>');
        } catch { left.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        center.innerHTML = '<div class="cv-mono" style="padding:2rem;text-align:center">Select a project</div>';
        right.innerHTML = '<div class="cv-mono">Timeline view</div>';
    }

    async function createProject() {
        const name = prompt('Project name:');
        if (!name) return;
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 6, name }) });
        openWs('project');
    }

    async function openProject(id) {
        const token = localStorage.getItem('crowny_token');
        const r = await fetch(`/api/cell/get?id=${id}`, { headers: { 'Authorization': 'Bearer ' + token } });
        const p = await r.json();
        const center = document.getElementById('cv-center-content');
        if (center) {
            center.innerHTML = `<h3 style="margin-bottom:0.5rem">${escHtml(p.data?.[0] || 'Project')}</h3>
                <div class="cv-mono" style="margin-bottom:8px">Status: ${p.epistemic === 3 ? 'Complete' : 'Active'} | Trust: ${p.trust}</div>
                <button class="cv-btn" onclick="CANVAS.addTask(${id})">+ Add Task</button>
                <div id="cv-project-tasks" style="margin-top:8px"></div>`;
        }
    }

    async function addTask(projectId) {
        const name = prompt('Task:');
        if (!name) return;
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 6, name, category: 'task', layer: 1 }) });
        const task = await r.json();
        await fetch('/api/cell/link', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: projectId, to: task.id, direction: 'ta' }) });
        openProject(projectId);
    }

    // ── 워크스페이스: Bible ──
    async function loadBibleWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        left.innerHTML = '<div class="cv-mono">Quiz progress</div>';
        try {
            const r = await fetch('/api/bible/quiz', { headers: { 'Authorization': 'Bearer ' + token } });
            const q = await r.json();
            if (q.complete) {
                center.innerHTML = `<div style="padding:2rem;text-align:center"><h3>All Complete!</h3><p>${q.correct}/${q.total} correct</p></div>`;
            } else if (q.question) {
                const opts = (q.options || []).map((o, i) => `<button class="cv-list-item" style="text-align:left;width:100%;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer" onclick="CANVAS.answerQuiz('${q.quizId}',${i})">${String.fromCharCode(65+i)}. ${escHtml(o)}</button>`).join('');
                center.innerHTML = `<div style="padding:1rem"><div style="font-size:0.7rem;color:var(--gold);margin-bottom:4px">${escHtml(q.reference || '')}</div><div style="font-size:0.9rem;font-weight:600;margin-bottom:1rem;line-height:1.5">${escHtml(q.question)}</div>${opts}<div id="cv-quiz-result"></div></div>`;
            }
        } catch { center.innerHTML = '<div class="cv-mono">Quiz load failed</div>'; }
        right.innerHTML = '<div class="cv-mono">Reference</div>';
    }

    async function answerQuiz(quizId, idx) {
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/bible/answer', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId, selectedIndex: idx }) });
        const result = await r.json();
        const el = document.getElementById('cv-quiz-result');
        if (el) el.innerHTML = `<div style="padding:8px;margin-top:8px;border-radius:6px;background:${result.correct ? 'rgba(91,123,140,0.1)' : 'rgba(181,69,52,0.1)'};color:${result.correct ? 'var(--info)' : 'var(--error)'}">${result.correct ? 'Correct!' : result.message || 'Wrong'}</div>`;
        setTimeout(() => loadBibleWorkspace(document.getElementById('cv-left-content'), document.getElementById('cv-center-content'), document.getElementById('cv-right-content')), 2000);
    }

    // ── 워크스페이스: Content ──
    async function loadContentWorkspace(left, center, right) {
        left.innerHTML = '<div class="cv-mono">Gallery categories</div>';
        center.innerHTML = `<div style="padding:2rem;text-align:center"><h3>Content Studio</h3><p style="font-size:0.8rem;color:var(--text-secondary)">Create art, music, and media</p>
            <button class="cv-btn" onclick="CANVAS.createCell(7)" style="margin-top:1rem">+ New Creation</button></div>`;
        right.innerHTML = '<div class="cv-mono">Analytics</div>';
    }

    // ── 워크스페이스: Life ──
    async function loadLifeWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        left.innerHTML = '<div class="cv-list-item">Weight</div><div class="cv-list-item">Sleep</div><div class="cv-list-item">Exercise</div><div class="cv-list-item">Mood</div>';
        center.innerHTML = `<div style="padding:1rem"><h4>Record Today</h4>
            <div style="margin-top:0.5rem"><label style="font-size:0.75rem;color:var(--text-secondary)">Category</label>
            <select class="cv-select" id="cv-life-cat" style="width:100%"><option>Weight</option><option>Sleep</option><option>Exercise</option><option>Mood</option></select></div>
            <div style="margin-top:0.5rem"><label style="font-size:0.75rem;color:var(--text-secondary)">Value</label>
            <input class="cv-input" id="cv-life-val" placeholder="e.g., 72.5" style="width:100%"></div>
            <div style="margin-top:0.5rem"><label style="font-size:0.75rem;color:var(--text-secondary)">Note</label>
            <input class="cv-input" id="cv-life-note" placeholder="Optional note" style="width:100%"></div>
            <button class="cv-btn" onclick="CANVAS.recordLife()" style="width:100%;margin-top:0.5rem">Record</button></div>`;
        right.innerHTML = '<div class="cv-mono">History</div>';
    }

    async function recordLife() {
        const cat = document.getElementById('cv-life-cat')?.value || 'Weight';
        const val = parseFloat(document.getElementById('cv-life-val')?.value) || 0;
        const note = document.getElementById('cv-life-note')?.value || '';
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 11, name: cat, value: val, memo: note, category: cat.toLowerCase() }) });
        if (typeof showToast === 'function') showToast('Recorded', 'success');
        document.getElementById('cv-life-val').value = '';
        document.getElementById('cv-life-note').value = '';
    }

    // ── 워크스페이스: Workbench (HanSeon-C IDE) ──
    function loadWorkbenchWorkspace(left, center, right) {
        left.innerHTML = '<div class="cv-list-item" onclick="CANVAS.loadExample(\'hello\')">Hello World</div><div class="cv-list-item" onclick="CANVAS.loadExample(\'calc\')">Calculator</div><div class="cv-list-item" onclick="CANVAS.loadExample(\'fib\')">Fibonacci</div>';
        center.innerHTML = `<textarea class="cv-textarea" id="cv-code" style="flex:1;font-family:monospace" placeholder="// HanSeon-C code here&#10;출력(&quot;안녕 크라우니&quot;)"></textarea>
            <div class="cv-input-row" style="gap:4px"><button class="cv-btn" onclick="CANVAS.runCode()">▶ Run</button><button class="cv-btn" style="background:var(--text-secondary)" onclick="CANVAS.deployCode()">Deploy</button></div>`;
        right.innerHTML = '<div class="cv-mono" id="cv-code-output">Output will appear here...</div>';
    }

    async function runCode() {
        const code = document.getElementById('cv-code')?.value || '';
        if (!code.trim()) return;
        const out = document.getElementById('cv-code-output');
        if (out) out.textContent = 'Running...';
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/chain/contract/execute', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
            const data = await r.json();
            if (out) out.textContent = data.success ? (data.output?.join('\n') || '(no output)') : 'Error: ' + (data.error || '');
        } catch (e) { if (out) out.textContent = 'Error: ' + e.message; }
    }

    async function deployCode() {
        const code = document.getElementById('cv-code')?.value || '';
        if (!code.trim()) return;
        const name = prompt('Contract name:');
        if (!name) return;
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/chain/contract/deploy', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }) });
        const data = await r.json();
        if (typeof showToast === 'function') showToast(data.contractId ? 'Deployed: ' + data.contractId : data.error || 'Failed', data.contractId ? 'success' : 'error');
    }

    function loadExample(name) {
        const examples = {
            hello: '출력("안녕 크라우니셀 체인!")',
            calc: '변수 가 = 42\n변수 나 = 27\n변수 합 = 가 + 나\n출력(합)',
            fib: '변수 가 = 0\n변수 나 = 1\n반복 10:\n  변수 다 = 가 + 나\n  출력(다)\n  가 = 나\n  나 = 다',
        };
        const el = document.getElementById('cv-code');
        if (el) el.value = examples[name] || '';
    }

    // ── DEX 스왑 실행 ──
    async function execSwap() {
        const from = document.getElementById('cv-swap-from')?.value || 'CRM';
        const to = document.getElementById('cv-swap-to')?.value || 'FNC';
        const amt = parseFloat(document.getElementById('cv-swap-amt')?.value) || 0;
        if (amt <= 0) return;
        const token = localStorage.getItem('crowny_token');
        const r = await fetch('/api/wallet/swap', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, amount: amt }) });
        const data = await r.json();
        if (typeof showToast === 'function') showToast(data.success ? `Swapped ${data.sent} ${data.sentCurrency} → ${data.received} ${data.receivedCurrency}` : data.error || 'Failed', data.success ? 'success' : 'error');
        if (data.success) openWs('dex');
    }

    // ── 워크스페이스: Canvas (4단계 재진술 파이프라인) ──
    let canvasState = { nl: '', segments: [], kps: '', jpMode: 'summary' };
    const JP_MODES = ['summary', 'restate', 'premise', 'question'];
    const JP_LABELS = { summary: 'Summary', restate: 'Restatement', premise: 'Core Premise', question: 'Next Question' };

    function loadCanvasWorkspace(left, center, right) {
        left.innerHTML = `<textarea class="cv-textarea" placeholder="Enter natural language here...&#10;&#10;Example: I have 3 apples and bought 2 more today. Calculate the total.&#10;&#10;The clearer the sentence, the better the restatement." id="cv-nl-input" oninput="CANVAS._nlCount()">${escHtml(canvasState.nl)}</textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                <span style="font-size:0.65rem;color:var(--text-secondary)" id="cv-nl-count">0 chars</span>
                <div style="display:flex;gap:4px">
                    <button class="cv-btn" style="background:var(--text-secondary)" onclick="document.getElementById('cv-nl-input').value='';CANVAS._nlCount()">Clear</button>
                    <button class="cv-btn" onclick="CANVAS.runNL()">▶ Convert</button>
                </div>
            </div>
            <div style="margin-top:8px;font-size:0.65rem;font-weight:700;color:var(--text-secondary)">HISTORY</div>
            <div id="cv-nl-history" class="cv-scroll" style="max-height:150px"></div>`;
        _nlCount();
        _loadNLHistory(document.getElementById('cv-nl-history'));

        center.innerHTML = `<div style="display:flex;border-bottom:1px solid var(--border)">
                ${JP_MODES.map(m => `<button class="cv-jp-tab${canvasState.jpMode === m ? ' on' : ''}" data-jp="${m}" onclick="CANVAS.setJP('${m}')">${JP_LABELS[m]}</button>`).join('')}
                <button style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:0.7rem;color:var(--text-secondary);padding:4px 8px" onclick="CANVAS.cycleJP()">Next ▸</button>
            </div>
            <div id="cv-kps-body" class="cv-mono" style="padding:8px;flex:1;overflow-y:auto;line-height:1.6">${canvasState.kps || 'Enter text on the left and press Convert...'}</div>
            <div id="cv-segments" style="padding:4px 8px;border-top:1px solid var(--border);max-height:120px;overflow-y:auto"></div>`;

        right.innerHTML = `<div style="display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--border)">
                <button class="cv-btn" onclick="CANVAS.runVM()" style="font-size:0.65rem">▶ RUN</button>
                <button class="cv-btn" style="background:var(--text-secondary);font-size:0.65rem" onclick="CANVAS.resetVM()">RESET</button>
            </div>
            <textarea class="cv-textarea" id="cv-asm-code" style="flex:1;font-family:monospace;font-size:0.75rem" placeholder="ISA729 assembly...&#10;LOADI r0 3&#10;LOADI r1 2&#10;ADD r2 r0 r1&#10;PRINTI r2&#10;HALT"></textarea>
            <div id="cv-vm-output" class="cv-mono" style="padding:4px 8px;border-top:1px solid var(--border);min-height:40px;max-height:80px;overflow-y:auto;color:var(--gold)"></div>`;
    }

    function _nlCount() {
        const el = document.getElementById('cv-nl-input');
        const cnt = document.getElementById('cv-nl-count');
        if (el && cnt) cnt.textContent = (el.value || '').length + ' chars';
    }

    function setJP(mode) {
        canvasState.jpMode = mode;
        document.querySelectorAll('.cv-jp-tab').forEach(b => b.classList.toggle('on', b.dataset.jp === mode));
        _renderKPS();
    }

    function cycleJP() {
        const idx = JP_MODES.indexOf(canvasState.jpMode);
        setJP(JP_MODES[(idx + 1) % JP_MODES.length]);
    }

    async function runNL() {
        const input = document.getElementById('cv-nl-input');
        if (!input || !input.value.trim()) return;
        canvasState.nl = input.value.trim();

        const kpsBody = document.getElementById('cv-kps-body');
        if (kpsBody) kpsBody.textContent = 'Converting...';

        // NL → 세그먼트 분석 (로컬 파싱)
        const text = canvasState.nl;
        const segments = _analyzeNL(text);
        canvasState.segments = segments;

        // 4단계 재진술 생성
        const summary = segments.map(s => s.kps).join('\n');
        const restate = segments.map(s => `[${s.category}] ${s.kps}`).join('\n');
        const premise = segments.filter(s => s.category === 'definition' || s.category === 'condition').map(s => s.kps).join('\n') || '(no premises found)';
        const question = _generateQuestion(segments);

        canvasState.jpData = { summary, restate, premise, question };
        canvasState.kps = summary;

        _renderKPS();
        _renderSegments();

        // ISA729 코드 자동 생성 (계산 세그먼트)
        const calcSegs = segments.filter(s => s.category === 'calculation');
        if (calcSegs.length > 0) {
            const asmCode = _generateASM(calcSegs);
            const asmEl = document.getElementById('cv-asm-code');
            if (asmEl) asmEl.value = asmCode;
        }

        // 셀에 저장 (COMPUTE 타입)
        const token = localStorage.getItem('crowny_token');
        if (token) {
            const cellData = { type: 1, name: text.slice(0, 50), content: summary, memo: JSON.stringify({ segments, restate, premise, question }) };
            fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cellData) }).catch(() => {});
        }

        // 히스토리 갱신
        _loadNLHistory(document.getElementById('cv-nl-history'));
    }

    function _renderKPS() {
        const body = document.getElementById('cv-kps-body');
        if (!body || !canvasState.jpData) return;
        body.textContent = canvasState.jpData[canvasState.jpMode] || '';
    }

    function _renderSegments() {
        const el = document.getElementById('cv-segments');
        if (!el) return;
        el.innerHTML = canvasState.segments.map((s, i) =>
            `<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid var(--border);font-size:0.7rem">
                <span style="color:var(--gold);min-width:20px">${i + 1}</span>
                <span style="padding:0 4px;border-radius:3px;background:var(--bg-card);font-size:0.6rem;font-weight:600">${s.category}</span>
                <span style="flex:1;color:var(--text)">${escHtml(s.text)}</span>
                <span style="color:var(--text-secondary);font-family:monospace;font-size:0.6rem">${s.tritLen}t</span>
            </div>`
        ).join('');
    }

    // NL 분석 (로컬 — 추후 서버 시맨틱 엔진으로 교체)
    function _analyzeNL(text) {
        const sentences = text.split(/[.。！!？?\n]+/).filter(s => s.trim());
        return sentences.map(s => {
            const t = s.trim();
            const hasNumber = /\d+/.test(t);
            const hasCalc = /[+\-*/×÷더하|빼|곱하|나누|합계|총|계산]/.test(t);
            const hasDef = /^[^은는이가]+[은는이가]\s/.test(t) || /있다|이다|것이다/.test(t);
            const hasCond = /만약|경우|때|면$/.test(t);

            let category = 'statement';
            if (hasCalc || (hasNumber && /총|합|계산|몇/.test(t))) category = 'calculation';
            else if (hasDef) category = 'definition';
            else if (hasCond) category = 'condition';
            else if (/\?|질문|무엇|어떻게|왜/.test(t)) category = 'question';

            // 숫자 추출
            const nums = t.match(/\d+/g)?.map(Number) || [];
            const tritLen = nums.reduce((a, n) => a + _tritLength(n), 0) + t.length;

            // KPS 재진술
            let kps = t;
            if (category === 'calculation' && nums.length >= 2) {
                kps = nums.join(' + ') + ' = ' + nums.reduce((a, b) => a + b, 0);
            }

            return { text: t, category, kps, nums, tritLen, executable: category === 'calculation' };
        });
    }

    function _tritLength(n) {
        if (n === 0) return 1;
        let a = Math.abs(n), l = 0;
        while (a > 0) { l++; a = Math.floor((a + 1) / 3); }
        return Math.max(1, l);
    }

    function _generateQuestion(segments) {
        const calcs = segments.filter(s => s.category === 'calculation');
        const defs = segments.filter(s => s.category === 'definition');
        if (calcs.length > 0) return 'Is this calculation the only operation needed, or are there additional conditions?';
        if (defs.length > 0) return 'What actions should follow from these definitions?';
        return 'What specific outcome or calculation do you need?';
    }

    function _generateASM(calcSegs) {
        const lines = [];
        let regIdx = 0;
        for (const seg of calcSegs) {
            const nums = seg.nums || [];
            if (nums.length >= 2) {
                lines.push(`; ${seg.text}`);
                const r0 = regIdx, r1 = regIdx + 1, rResult = regIdx + 2;
                lines.push(`LOADI r${r0} ${nums[0]}`);
                lines.push(`LOADI r${r1} ${nums[1]}`);
                // 추가 숫자들 더하기
                lines.push(`ADD r${rResult} r${r0} r${r1}`);
                for (let i = 2; i < nums.length; i++) {
                    lines.push(`LOADI r${r1} ${nums[i]}`);
                    lines.push(`ADD r${rResult} r${rResult} r${r1}`);
                }
                lines.push(`PRINTI r${rResult}`);
                regIdx = rResult + 1;
            }
        }
        lines.push('HALT');
        return lines.join('\n');
    }

    async function runVM() {
        const code = document.getElementById('cv-asm-code')?.value || '';
        if (!code.trim()) return;
        const out = document.getElementById('cv-vm-output');
        if (out) out.textContent = 'Running...';
        const token = localStorage.getItem('crowny_token');
        try {
            // HanSeon-C 코드로 변환하여 실행
            const hanseonCode = _asmToHanseon(code);
            const r = await fetch('/api/chain/contract/execute', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: hanseonCode }) });
            const data = await r.json();
            if (out) out.textContent = data.success ? '▶ ' + (data.output?.join('\n') || '(no output)') : 'Error: ' + (data.error || '');
        } catch (e) { if (out) out.textContent = 'Error: ' + e.message; }
    }

    function _asmToHanseon(asm) {
        // 간단한 ASM → 한선씨 변환 (LOADI+ADD+PRINTI 패턴)
        const lines = asm.split('\n').filter(l => l.trim() && !l.trim().startsWith(';'));
        const vars = {};
        let output = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const op = parts[0]?.toUpperCase();
            if (op === 'LOADI' && parts[2]) {
                vars[parts[1]] = parts[2];
                output.push(`변수 ${parts[1]} = ${parts[2]}`);
            } else if (op === 'ADD' && parts[3]) {
                output.push(`변수 ${parts[1]} = ${parts[2]} + ${parts[3]}`);
            } else if (op === 'PRINTI') {
                output.push(`출력(${parts[1]})`);
            } else if (op === 'HALT' || op === 'END') {
                break;
            }
        }
        return output.join('\n');
    }

    function resetVM() {
        const code = document.getElementById('cv-asm-code');
        const out = document.getElementById('cv-vm-output');
        if (code) code.value = '';
        if (out) out.textContent = '';
    }

    async function _loadNLHistory(el) {
        if (!el) return;
        const token = localStorage.getItem('crowny_token');
        if (!token) return;
        try {
            const r = await fetch('/api/cell/query?type=1&limit=5', { headers: { 'Authorization': 'Bearer ' + token } });
            const cells = await r.json();
            el.innerHTML = cells.map(c => `<div class="cv-list-item" style="font-size:0.7rem" onclick="CANVAS.reloadNL(${c.id})">${escHtml((c.data?.[0] || '').slice(0, 40))}<span style="float:right;font-size:0.6rem;color:var(--text-secondary)">${new Date(c.timestamp * 1000).toLocaleDateString()}</span></div>`).join('') || '<div class="cv-mono">No history</div>';
        } catch {}
    }

    async function reloadNL(cellId) {
        const token = localStorage.getItem('crowny_token');
        const r = await fetch(`/api/cell/get?id=${cellId}`, { headers: { 'Authorization': 'Bearer ' + token } });
        const cell = await r.json();
        if (cell.data?.[1]) {
            // KPS 복원
            const el = document.getElementById('cv-nl-input');
            if (el) { el.value = cell.data[0] || ''; _nlCount(); }
            try {
                const meta = JSON.parse(cell.data[2] || '{}');
                canvasState.segments = meta.segments || [];
                canvasState.jpData = meta;
                canvasState.kps = cell.data[1];
                _renderKPS();
                _renderSegments();
            } catch {}
        }
    }

    // ── 워크스페이스 간 연동 (Cross-link) ──

    async function crossLink(fromWs, toWs, data) {
        const token = localStorage.getItem('crowny_token');
        if (!token) return;
        // 소스 워크스페이스에서 셀 생성
        const typeMap = { canvas:1, msg:2, dex:3, trading:4, docs:5, project:6, content:7, game:8, work:9, shop:10, life:11, synergy:12, mind:13, bible:14, admin:15, om:16 };
        const from = await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeMap[fromWs], name: data.name || 'Link', content: data.content || '' }) }).then(r => r.json());
        const to = await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeMap[toWs], name: data.name || 'Link', content: data.content || '' }) }).then(r => r.json());
        // 시냅스 연결
        await fetch('/api/cell/link', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: from.id, to: to.id, direction: 'synapse' }) });
        return { from: from.id, to: to.id };
    }

    // Canvas → Workbench 연동 (계산 결과를 코드로)
    function canvasToWorkbench() {
        const code = document.getElementById('cv-asm-code')?.value || '';
        if (!code) return;
        openWs('work');
        setTimeout(() => {
            const el = document.getElementById('cv-code');
            if (el) el.value = _asmToHanseon(code);
        }, 100);
    }

    // Canvas → Note 연동 (재진술을 노트로)
    async function canvasToNote() {
        if (!canvasState.kps) return;
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 5, name: 'From Canvas: ' + (canvasState.nl || '').slice(0, 30), content: canvasState.kps }) });
        if (typeof showToast === 'function') showToast('Saved to Notes', 'success');
    }

    // ── 워크스페이스: Mind (AI 대화) ──
    let mindHistory = [];

    function loadMindWorkspace(left, center, right) {
        const agents = [
            { id: 'general', name: 'Crowny', desc: 'General assistant' },
            { id: 'code', name: 'CodeBot', desc: 'Programming help' },
            { id: 'bible', name: 'Scholar', desc: 'Bible study' },
            { id: 'trade', name: 'Analyst', desc: 'Market analysis' },
        ];
        left.innerHTML = agents.map(a => `<div class="cv-list-item" onclick="CANVAS.selectAgent('${a.id}')"><strong>${a.name}</strong><div style="font-size:0.6rem;color:var(--text-secondary)">${a.desc}</div></div>`).join('');
        center.innerHTML = `<div id="cv-mind-chat" class="cv-scroll">${mindHistory.map(m => `<div class="cv-chat-msg ${m.role === 'user' ? 'mine' : 'theirs'}"><div class="cv-chat-bubble">${escHtml(m.text)}</div></div>`).join('')}</div>
            <div class="cv-input-row"><input id="cv-mind-input" class="cv-input" placeholder="Ask anything..." onkeydown="if(event.key==='Enter')CANVAS.sendMind()"><button class="cv-btn" onclick="CANVAS.sendMind()">Send</button></div>`;
        right.innerHTML = `<div style="padding:8px"><div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">MEMORY</div><div class="cv-mono">${mindHistory.length} messages</div>
            <button class="cv-btn" onclick="CANVAS.clearMind()" style="margin-top:8px;width:100%;background:var(--text-secondary)">Clear</button></div>`;
        const scroll = document.getElementById('cv-mind-chat');
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }

    async function sendMind() {
        const input = document.getElementById('cv-mind-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        mindHistory.push({ role: 'user', text });
        // 간단한 로컬 응답 (AI API 연동 전 placeholder)
        const responses = {
            'hello': 'Hello! I\'m Crowny Mind. How can I help?',
            'hi': 'Hi there! What would you like to explore?',
        };
        const lower = text.toLowerCase();
        let reply = responses[lower] || `I received: "${text}". (AI integration coming soon — for now I echo your input as a cell.)`;
        // 셀로 저장
        const token = localStorage.getItem('crowny_token');
        if (token) {
            fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 13, content: text, memo: reply }) }).catch(() => {});
        }
        mindHistory.push({ role: 'ai', text: reply });
        loadMindWorkspace(document.getElementById('cv-left-content'), document.getElementById('cv-center-content'), document.getElementById('cv-right-content'));
    }

    function selectAgent(id) { if (typeof showToast === 'function') showToast('Agent: ' + id, 'info'); }
    function clearMind() { mindHistory = []; loadMindWorkspace(document.getElementById('cv-left-content'), document.getElementById('cv-center-content'), document.getElementById('cv-right-content')); }

    // ── 워크스페이스: Game ──
    function loadGameWorkspace(left, center, right) {
        const games = [
            { id: 'crowny-world', name: 'Crowny World', desc: 'Life simulation RPG', status: 'In Development' },
            { id: 'quiz-battle', name: 'Quiz Battle', desc: 'Bible quiz competition', status: 'Available' },
            { id: 'trit-chess', name: 'Trit Chess', desc: 'Ternary chess variant', status: 'Coming Soon' },
        ];
        left.innerHTML = games.map(g => `<div class="cv-list-item" onclick="CANVAS.openGame('${g.id}')"><strong>${g.name}</strong><div style="font-size:0.6rem;color:var(--text-secondary)">${g.desc}</div></div>`).join('');
        center.innerHTML = `<div style="padding:2rem;text-align:center"><h3>Game Library</h3><p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem">${games.length} games available</p>
            <div style="margin-top:1rem">${games.map(g => `<div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="CANVAS.openGame('${g.id}')"><div style="flex:1;text-align:left"><strong style="font-size:0.85rem">${g.name}</strong><div style="font-size:0.7rem;color:var(--text-secondary)">${g.desc}</div></div><span style="font-size:0.6rem;padding:2px 6px;border-radius:4px;background:var(--bg-card)">${g.status}</span></div>`).join('')}</div></div>`;
        right.innerHTML = '<div class="cv-mono" style="padding:8px">Leaderboard</div>';
    }

    function openGame(id) {
        const center = document.getElementById('cv-center-content');
        if (id === 'quiz-battle') {
            openWs('bible');
        } else if (id === 'trit-chess' && center) {
            // 간단한 삼진 게임
            let board = Array(9).fill(0); // 0=empty, 1=T, -1=N
            let turn = 1;
            function renderBoard() {
                const symbols = { '1': '▲', '-1': '▼', '0': '·' };
                const colors = { '1': 'var(--gold)', '-1': 'var(--error)', '0': 'var(--text-secondary)' };
                center.innerHTML = `<div style="padding:1rem;text-align:center"><h4>Trit Tic-Tac-Toe</h4><p style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:1rem">Turn: ${turn > 0 ? '▲ Ti' : '▼ Ta'}</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;max-width:180px;margin:0 auto">${board.map((v, i) => `<button onclick="CANVAS._tritMove(${i})" style="width:56px;height:56px;font-size:1.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:${colors[v]};cursor:pointer">${symbols[v]}</button>`).join('')}</div>
                    <button class="cv-btn" onclick="CANVAS.openGame('trit-chess')" style="margin-top:1rem;background:var(--text-secondary)">Reset</button></div>`;
            }
            window._tritBoard = board; window._tritTurn = turn;
            renderBoard();
            // _tritMove는 아래에서 정의
        } else if (center) {
            center.innerHTML = `<div style="padding:2rem;text-align:center"><h3>${id}</h3><p style="color:var(--text-secondary)">Powered by ISA729 VM + CrownyFrame</p></div>`;
        }
    }

    function _tritMove(i) {
        const board = window._tritBoard;
        let turn = window._tritTurn;
        if (!board || board[i] !== 0) return;
        board[i] = turn;
        // 승리 체크
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        const winner = wins.find(([a,b,c]) => board[a] !== 0 && board[a] === board[b] && board[b] === board[c]);
        window._tritTurn = -turn;
        openGame('trit-chess'); // re-render
        if (winner) {
            setTimeout(() => { if (typeof showToast === 'function') showToast((turn > 0 ? '▲ Ti' : '▼ Ta') + ' wins!', 'success'); }, 100);
        }
    }

    // ── 워크스페이스: Shop ──
    async function loadShopWorkspace(left, center, right) {
        const categories = ['All', 'Digital', 'Physical', 'Service', 'NFT'];
        left.innerHTML = categories.map(c => `<div class="cv-list-item" onclick="CANVAS.shopFilter('${c}')">${c}</div>`).join('');
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/cell/query?type=10&limit=20', { headers: { 'Authorization': 'Bearer ' + token } });
            const items = await r.json();
            center.innerHTML = items.length > 0 ? items.map(i => `<div class="cv-list-item"><strong>${escHtml(i.data?.[0] || 'Product')}</strong><span style="float:right;color:var(--gold)">${i.value || 0} CRM</span></div>`).join('') : `<div style="padding:2rem;text-align:center"><p>No products</p><button class="cv-btn" onclick="CANVAS.createShopItem()" style="margin-top:0.5rem">+ List Product</button></div>`;
        } catch { center.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        right.innerHTML = '<div style="padding:8px"><div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">CART</div><div class="cv-mono">Empty</div></div>';
    }

    async function createShopItem() {
        const name = prompt('Product name:');
        if (!name) return;
        const price = parseInt(prompt('Price (CRM):') || '0');
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/create', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 10, name, value: price, category: 'digital' }) });
        openWs('shop');
    }

    function shopFilter(cat) { if (typeof showToast === 'function') showToast('Filter: ' + cat, 'info'); }

    // ── 워크스페이스: Synergy ──
    async function loadSynergyWorkspace(left, center, right) {
        const services = WORKSPACES.filter(w => !w.hidden && w.id !== 'synergy');
        left.innerHTML = services.map(s => `<div class="cv-list-item"><i data-lucide="${s.icon}" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${s.label}</div>`).join('');
        if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons(), 50);

        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/cell/stats', { headers: { 'Authorization': 'Bearer ' + token } });
            const stats = await r.json();
            const types = stats.byType || {};
            center.innerHTML = `<div style="padding:1rem"><h4>Service Overview</h4>
                <div style="margin-top:0.5rem">${Object.entries(types).map(([name, count]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.8rem"><span>${name}</span><strong>${count}</strong></div>`).join('')}</div>
                <div style="margin-top:1rem;font-size:0.8rem;color:var(--text-secondary)">Total: ${stats.totalCells} cells</div></div>`;
        } catch { center.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        right.innerHTML = '<div style="padding:8px"><div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">ACTIVITY</div><div class="cv-mono">Recent cross-service events</div></div>';
    }

    // ── 워크스페이스: Admin ──
    async function loadAdminWorkspace(left, center, right) {
        left.innerHTML = ['Users', 'System', 'Chain', 'Cells', 'Backup'].map(m => `<div class="cv-list-item" onclick="CANVAS.adminSection('${m.toLowerCase()}')">${m}</div>`).join('');
        const token = localStorage.getItem('crowny_token');
        try {
            const [chainR, cellR] = await Promise.all([
                fetch('/api/chain/status', { headers: { 'Authorization': 'Bearer ' + token } }),
                fetch('/api/cell/stats', { headers: { 'Authorization': 'Bearer ' + token } }),
            ]);
            const chain = await chainR.json();
            const cells = await cellR.json();
            center.innerHTML = `<div style="padding:1rem">
                <h4>System Dashboard</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:0.5rem">
                    <div style="padding:10px;background:var(--bg-card);border-radius:6px;text-align:center"><div style="font-size:0.6rem;color:var(--text-secondary)">CHAIN</div><div style="font-size:1.2rem;font-weight:800">${chain.chain?.height ?? '?'}</div><div style="font-size:0.6rem">blocks</div></div>
                    <div style="padding:10px;background:var(--bg-card);border-radius:6px;text-align:center"><div style="font-size:0.6rem;color:var(--text-secondary)">CELLS</div><div style="font-size:1.2rem;font-weight:800">${cells.totalCells ?? '?'}</div><div style="font-size:0.6rem">total</div></div>
                    <div style="padding:10px;background:var(--bg-card);border-radius:6px;text-align:center"><div style="font-size:0.6rem;color:var(--text-secondary)">STATUS</div><div style="font-size:1.2rem;font-weight:800;color:${chain.chain?.running ? 'var(--info)' : 'var(--error)'}">${chain.chain?.running ? 'ON' : 'OFF'}</div></div>
                    <div style="padding:10px;background:var(--bg-card);border-radius:6px;text-align:center"><div style="font-size:0.6rem;color:var(--text-secondary)">MEMPOOL</div><div style="font-size:1.2rem;font-weight:800">${chain.chain?.mempoolSize ?? 0}</div></div>
                </div></div>`;
        } catch { center.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        right.innerHTML = '<div class="cv-mono" style="padding:8px">System logs</div>';
    }

    function adminSection(section) {
        const center = document.getElementById('cv-center-content');
        if (!center) return;
        if (section === 'backup') {
            center.innerHTML = `<div style="padding:1rem"><h4>Backup</h4><button class="cv-btn" onclick="window.open('/api/backup','_blank')" style="margin-top:0.5rem">Download Backup</button></div>`;
        }
    }

    // ── 워크스페이스: Om ──
    function loadOmWorkspace(left, center, right) {
        const now = new Date();
        const omYear = now.getFullYear() + 3760;
        left.innerHTML = `<div style="padding:8px"><div class="cv-mono" style="font-size:0.7rem">Balanced Ternary</div>
            <div style="font-size:2rem;text-align:center;margin:1rem 0;letter-spacing:4px;color:var(--gold)">▲ ■ ▼</div>
            <div class="cv-mono" style="text-align:center">Ti · Om · Ta</div></div>`;
        center.innerHTML = `<div style="padding:2rem;text-align:center">
            <div style="font-size:0.7rem;color:var(--text-secondary)">Om Calendar</div>
            <div style="font-size:2.5rem;font-weight:800;color:var(--primary);margin:0.5rem 0">${omYear}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary)">${now.toLocaleDateString('en', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</div>
            <div style="margin-top:2rem;padding:1rem;background:var(--bg-card);border-radius:8px;text-align:left">
                <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">FOUR PHASES</div>
                <div style="font-size:0.8rem;line-height:1.8">
                    <span style="color:var(--gold)">Confirmed (+2)</span> — Known with certainty<br>
                    <span style="color:var(--text-secondary)">Unconfirmed (0)</span> — Information present, unverified<br>
                    <span style="color:var(--error)">Misunderstood (-2)</span> — Incorrectly known<br>
                    <span style="color:var(--text-muted-light)">Unaware (-1)</span> — Existence unknown
                </div>
            </div>
            <div style="margin-top:1rem;font-size:0.7rem;color:var(--text-secondary)">CrownyOS · ISA729 · 27-Slot Cell</div>
        </div>`;
        right.innerHTML = `<div style="padding:8px"><div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:8px">CELL ARCHITECTURE</div>
            <div class="cv-mono" style="line-height:1.6">27 slots = 3<sup>3</sup><br>729 opcodes = 3<sup>6</sup><br>189 bytes = 27 × 7B<br><br>▲ Ti-link (up)<br>● Om-link (sibling)<br>▼ Ta-link (down)<br>◆ Synapse (connect)</div></div>`;
    }

    // ── CellCore 로드 ──
    async function loadCells(wsType) {
        const typeMap = { canvas:1, msg:2, dex:3, trading:4, docs:5, project:6, content:7, game:8, work:9, shop:10, life:11, synergy:12, mind:13, bible:14, admin:15, om:16 };
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch(`/api/cell/query?type=${typeMap[wsType] || 0}&limit=20`, { headers: { 'Authorization': 'Bearer ' + token } });
            const cells = await r.json();
            const center = document.getElementById('cv-center-content');
            if (center) {
                if (cells.length === 0) {
                    center.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-secondary)">No cells yet<br><button class="cv-btn" onclick="CANVAS.createCell(${typeMap[wsType]})" style="margin-top:0.5rem">Create First Cell</button></div>`;
                } else {
                    center.innerHTML = cells.map(c => `<div class="cv-list-item"><strong>#${c.id}</strong> ${c.data?.[0] || c.subject || ''}<span style="float:right;font-size:0.7rem;color:var(--text-secondary)">${c.typeName}</span></div>`).join('');
                }
            }
        } catch {}
    }

    async function createCell(type) {
        const token = localStorage.getItem('crowny_token');
        await fetch('/api/cell/create', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name: 'New Cell' })
        });
        const ws = WORKSPACES.find(w => w.id === currentWs);
        if (ws) loadCells(currentWs);
    }

    // ── Dock ──
    function setDock(tab) {
        document.querySelectorAll('.cv-dock-tab').forEach(b => b.classList.toggle('on', b.textContent === tab.toUpperCase()));
        const content = document.getElementById('cv-dock-content');
        if (!content) return;
        if (tab === 'cells') {
            loadDockCells(content);
        } else if (tab === 'log') {
            content.innerHTML = '<div class="cv-mono">System log...</div>';
        } else {
            content.innerHTML = '<div class="cv-mono">Ready</div>';
        }
    }

    async function loadDockCells(el) {
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/cell/stats', { headers: { 'Authorization': 'Bearer ' + token } });
            const stats = await r.json();
            el.innerHTML = `<span class="cv-mono">Total: ${stats.totalCells} cells | Types: ${JSON.stringify(stats.byType)}</span>`;
        } catch { el.innerHTML = '<div class="cv-mono">No data</div>'; }
    }

    // ── 시계 + 옴력 ──
    function updateClock() {
        const now = new Date();
        const el = document.getElementById('cv-time');
        const om = document.getElementById('cv-om');
        if (el) el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (om) om.textContent = 'Om ' + (now.getFullYear() + 3760);
    }

    // ── NL → KPS 변환 (Canvas 메인 기능) ──
    async function runNL() {
        const input = document.getElementById('cv-nl-input');
        if (!input || !input.value.trim()) return;
        const kpsEl = document.getElementById('cv-kps-output');
        const asmEl = document.getElementById('cv-asm-output');
        if (kpsEl) kpsEl.textContent = 'Processing...';

        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch('/api/chain/contract/execute', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: '출력("' + input.value.trim().slice(0, 100) + '")' })
            });
            const data = await r.json();
            if (kpsEl) kpsEl.textContent = data.output?.join('\n') || '(no output)';
            if (asmEl) asmEl.textContent = 'ISA729 execution complete\nCycles: ' + (data.cycles || 0);
        } catch (e) {
            if (kpsEl) kpsEl.textContent = 'Error: ' + e.message;
        }
    }

    // ── Mind 대화 ──
    async function sendMind() {
        const input = document.getElementById('cv-mind-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        const chat = document.getElementById('cv-mind-chat');
        if (chat) {
            chat.innerHTML += `<div class="cv-chat-msg mine"><div class="cv-chat-bubble">${escHtml(text)}</div></div>`;
            chat.innerHTML += `<div class="cv-chat-msg theirs"><div class="cv-chat-bubble">Mind is thinking...</div></div>`;
            chat.scrollTop = chat.scrollHeight;
        }
    }

    // ── 스타일 주입 ──
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
        #canvas-frame { position:fixed; top:0; left:0; right:0; bottom:0; z-index:9000; display:flex; flex-direction:column; background:var(--bg, #FFF8F0); color:var(--text, #3D2B1F); font-family:-apple-system,system-ui,sans-serif; }
        .cv-topbar { display:flex; align-items:center; gap:8px; padding:0 12px; height:40px; background:var(--primary, #3D2B1F); color:var(--bg, #FFF8F0); flex-shrink:0; }
        .cv-brand { font-weight:800; font-size:0.9rem; cursor:pointer; }
        .cv-brand-sub { font-size:0.65rem; opacity:0.5; }
        .cv-topbar-msg { font-size:0.7rem; opacity:0.4; margin-left:12px; }
        .cv-link { font-size:0.65rem; color:var(--gold, #8B6914); text-decoration:none; padding:2px 6px; border-radius:3px; background:rgba(139,105,20,0.15); }
        .cv-time { font-size:0.7rem; opacity:0.6; margin-left:8px; font-family:monospace; }
        .cv-ws-bar { display:flex; overflow-x:auto; background:var(--bg-card, #F7F3ED); border-bottom:1px solid var(--border, #E8E0D8); flex-shrink:0; }
        .cv-ws-tab { display:flex; align-items:center; gap:4px; padding:6px 10px; border:none; background:none; cursor:pointer; font-size:0.7rem; font-weight:600; color:var(--text-secondary, #6B5744); border-bottom:2px solid transparent; white-space:nowrap; }
        .cv-ws-tab:hover { color:var(--text, #3D2B1F); }
        .cv-ws-tab.on { color:var(--gold, #8B6914); border-bottom-color:var(--gold, #8B6914); }
        .cv-body { display:flex; flex:1; min-height:0; overflow:hidden; }
        .cv-panel { display:flex; flex-direction:column; overflow:hidden; }
        .cv-panel-left { width:240px; border-right:1px solid var(--border, #E8E0D8); flex-shrink:0; }
        .cv-panel-center { flex:1; min-width:0; }
        .cv-panel-right { width:280px; border-left:1px solid var(--border, #E8E0D8); flex-shrink:0; }
        .cv-panel-header { padding:6px 10px; font-size:0.7rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .cv-panel-content { flex:1; overflow-y:auto; padding:8px; }
        .cv-dock { border-top:1px solid var(--border); flex-shrink:0; max-height:150px; }
        .cv-dock-tabs { display:flex; border-bottom:1px solid var(--border); }
        .cv-dock-tab { padding:4px 12px; border:none; background:none; cursor:pointer; font-size:0.65rem; font-weight:600; font-family:monospace; color:var(--text-secondary); border-bottom:2px solid transparent; }
        .cv-dock-tab.on { color:var(--gold); border-bottom-color:var(--gold); }
        .cv-dock-content { padding:6px 10px; overflow-y:auto; max-height:100px; }
        .cv-mono { font-family:monospace; font-size:0.75rem; color:var(--text-secondary); white-space:pre-wrap; }
        .cv-textarea { width:100%; flex:1; resize:none; border:1px solid var(--border); border-radius:6px; padding:8px; font-size:0.82rem; background:var(--bg-card); color:var(--text); font-family:inherit; min-height:100px; }
        .cv-btn { padding:6px 14px; background:var(--primary); color:var(--bg); border:none; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600; }
        .cv-btn:hover { opacity:0.85; }
        .cv-input { flex:1; padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:0.82rem; background:var(--bg-card); color:var(--text); }
        .cv-select { padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:0.82rem; background:var(--bg-card); }
        .cv-input-row { display:flex; gap:6px; padding:8px; border-top:1px solid var(--border); flex-shrink:0; }
        .cv-list-item { padding:8px 10px; border-bottom:1px solid var(--border); cursor:pointer; font-size:0.8rem; }
        .cv-list-item:hover { background:var(--bg-card); }
        .cv-scroll { flex:1; overflow-y:auto; padding:8px; }
        .cv-chat-msg { display:flex; margin-bottom:4px; }
        .cv-chat-msg.mine { justify-content:flex-end; }
        .cv-chat-msg.theirs { justify-content:flex-start; }
        .cv-chat-bubble { max-width:70%; padding:6px 10px; border-radius:12px; font-size:0.82rem; line-height:1.4; }
        .cv-chat-msg.mine .cv-chat-bubble { background:var(--primary); color:var(--bg); border-bottom-right-radius:4px; }
        .cv-chat-msg.theirs .cv-chat-bubble { background:var(--bg-card); border:1px solid var(--border); border-bottom-left-radius:4px; }
        .cv-jp-tab { padding:5px 10px; border:none; background:none; cursor:pointer; font-size:0.7rem; font-weight:600; color:var(--text-secondary); border-bottom:2px solid transparent; }
        .cv-jp-tab.on { color:var(--gold); border-bottom-color:var(--gold); }
        .cv-jp-tab:hover { color:var(--text); }
        @media(max-width:768px){
            .cv-panel-left,.cv-panel-right{display:none}
            .cv-ws-tab span{display:none}
            .cv-ws-tab{padding:6px 8px}
        }`;
        document.head.appendChild(style);
    }

    // ── Public API ──
    return {
        init, openWs, isCrownyBus, WORKSPACES,
        // Chat
        openChat, sendChat, newChat, startDM,
        // Note
        createNote, openNote, saveNote,
        // Project
        createProject, openProject, addTask,
        // Bible
        answerQuiz,
        // Life
        recordLife,
        // Workbench
        runCode, deployCode, loadExample,
        // Trading
        openPosition, placeOrder, setTimeframe,
        // DEX
        execSwap,
        // Mind
        sendMind, selectAgent, clearMind,
        // Game
        openGame, _tritMove,
        // Shop
        createShopItem, shopFilter,
        // Admin
        adminSection,
        // Canvas (4-step pipeline)
        runNL, setJP, cycleJP, runVM, resetVM, reloadNL,
        canvasToWorkbench, canvasToNote,
        crossLink,
        _nlCount: _nlCount,
        // Core
        setDock, loadCells, createCell,
    };
})();

// 자동 초기화 — 로그인 완료 대기
(function _tryInit(attempt) {
    if (attempt > 20) return; // 10초 후 포기
    setTimeout(() => {
        if (CANVAS.isCrownyBus() && localStorage.getItem('crowny_token')) {
            CANVAS.init();
        } else if (CANVAS.isCrownyBus()) {
            _tryInit(attempt + 1);
        }
    }, 500);
})(0);

// 로그인 성공 시 Canvas 활성화 (auth.js의 onLoginSuccess hook)
const _origOnLoginSuccess = window.onLoginSuccess;
window.onLoginSuccess = function(data) {
    if (_origOnLoginSuccess) _origOnLoginSuccess(data);
    if (CANVAS.isCrownyBus()) {
        setTimeout(() => CANVAS.init(), 300);
    }
};
