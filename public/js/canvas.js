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
        return location.hostname === 'crownybus.com' || location.hostname === 'localhost';
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
                left.innerHTML = `<textarea class="cv-textarea" placeholder="Enter natural language here...&#10;&#10;Example: I have 3 apples and bought 2 more. Calculate the total." id="cv-nl-input"></textarea>
                    <button class="cv-btn" onclick="CANVAS.runNL()">▶ Convert</button>`;
                center.innerHTML = '<div class="cv-mono" id="cv-kps-output">KPS output will appear here...</div>';
                right.innerHTML = '<div class="cv-mono" id="cv-asm-output">ISA729 assembly will appear here...</div>';
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
                rightTitle.textContent = 'Orders';
                center.innerHTML = '<div id="cv-chart" style="width:100%;height:100%;min-height:300px"></div>';
                loadTradingChart();
                left.innerHTML = '<div class="cv-mono">No positions</div>';
                right.innerHTML = '<div class="cv-mono">No orders</div>';
                break;
            case 'mind':
                leftTitle.textContent = 'Agents';
                centerTitle.textContent = 'Chat';
                rightTitle.textContent = 'Memory';
                center.innerHTML = `<div id="cv-mind-chat" class="cv-scroll"></div>
                    <div class="cv-input-row"><input id="cv-mind-input" class="cv-input" placeholder="Ask Mind..." onkeydown="if(event.key==='Enter')CANVAS.sendMind()"><button class="cv-btn" onclick="CANVAS.sendMind()">Send</button></div>`;
                left.innerHTML = '<div class="cv-mono">AI agents list</div>';
                right.innerHTML = '<div class="cv-mono">Memory bank</div>';
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
    async function loadMsgWorkspace(left, center, right) {
        const token = localStorage.getItem('crowny_token');
        if (!token) { center.innerHTML = '<div class="cv-mono">Login required</div>'; return; }
        try {
            const r = await fetch('/v2/chat/list', { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await r.json();
            const chats = data.chats || data || [];
            left.innerHTML = chats.map(c => `<div class="cv-list-item" onclick="CANVAS.openChat('${c.id}','${(c.name||c.displayName||'').replace(/'/g,'')}')">${c.name || c.displayName || c.id}</div>`).join('') || '<div class="cv-mono">No chats</div>';
        } catch { left.innerHTML = '<div class="cv-mono">Load failed</div>'; }
        center.innerHTML = '<div class="cv-mono" style="padding:2rem;text-align:center">Select a chat</div>';
    }

    async function openChat(chatId, name) {
        const center = document.getElementById('cv-center-content');
        const centerTitle = document.getElementById('cv-center-title');
        if (centerTitle) centerTitle.textContent = name || chatId;
        const token = localStorage.getItem('crowny_token');
        try {
            const r = await fetch(`/v2/chat/${chatId}/messages?limit=30`, { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await r.json();
            const msgs = data.messages || data || [];
            const username = localStorage.getItem('crowny_username') || '';
            center.innerHTML = `<div class="cv-scroll" id="cv-chat-msgs">${msgs.map(m => {
                const mine = m.senderId === username || m.from === username;
                return `<div class="cv-chat-msg ${mine ? 'mine' : 'theirs'}"><div class="cv-chat-bubble">${escHtml(m.content || m.text || '')}</div></div>`;
            }).join('')}</div>
            <div class="cv-input-row"><input id="cv-chat-input" class="cv-input" placeholder="Message..." onkeydown="if(event.key==='Enter')CANVAS.sendChat('${chatId}')"><button class="cv-btn" onclick="CANVAS.sendChat('${chatId}')">Send</button></div>`;
            const scroll = document.getElementById('cv-chat-msgs');
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
        } catch { center.innerHTML = '<div class="cv-mono">Load failed</div>'; }
    }

    async function sendChat(chatId) {
        const input = document.getElementById('cv-chat-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        const token = localStorage.getItem('crowny_token');
        await fetch('/v2/chat/send', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, content: text })
        });
        openChat(chatId, document.getElementById('cv-center-title')?.textContent);
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
    function loadTradingChart() {
        if (typeof LightweightCharts === 'undefined') return;
        setTimeout(() => {
            const container = document.getElementById('cv-chart');
            if (!container) return;
            const chart = LightweightCharts.createChart(container, {
                width: container.clientWidth, height: container.clientHeight || 400,
                layout: { background: { color: '#1A1410' }, textColor: '#E8D5C4' },
                grid: { vertLines: { color: '#2A201A' }, horzLines: { color: '#2A201A' } },
                timeScale: { timeVisible: true },
            });
            const series = chart.addCandlestickSeries({ upColor: '#5B7B8C', downColor: '#B54534' });
            // 샘플 데이터
            const now = Math.floor(Date.now() / 1000);
            const data = [];
            let price = 21000;
            for (let i = 100; i >= 0; i--) {
                const o = price + (Math.random() - 0.5) * 50;
                const c = o + (Math.random() - 0.5) * 40;
                data.push({ time: now - i * 60, open: o, high: Math.max(o, c) + Math.random() * 20, low: Math.min(o, c) - Math.random() * 20, close: c });
                price = c;
            }
            series.setData(data);
        }, 100);
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
        #canvas-frame { position:fixed; top:0; left:0; right:0; bottom:0; z-index:10000; display:flex; flex-direction:column; background:var(--bg, #FFF8F0); color:var(--text, #3D2B1F); font-family:-apple-system,system-ui,sans-serif; }
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
        openChat, sendChat,
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
        // DEX
        execSwap,
        // Mind
        sendMind,
        // Canvas
        runNL,
        // Core
        setDock, loadCells, createCell,
    };
})();

// 자동 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 로그인 후 Canvas 모드 활성화
    setTimeout(() => {
        if (CANVAS.isCrownyBus() && localStorage.getItem('crowny_token')) {
            CANVAS.init();
        }
    }, 500);
});
