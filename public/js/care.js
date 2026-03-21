// ===== care.js v3.0 - 크라우니케어: Firestore -> REST API 마이그레이션 =====
// SOS: 카운트다운, 사이렌, 실시간위치, 녹음, 119·112, 병원정보, 이웃네트워크

window.CARE = (function() {
    'use strict';

    // ========== AUTH HELPER ==========
    function authHeaders() {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    }

    async function apiFetch(url, opts = {}) {
        opts.headers = authHeaders();
        const res = await fetch(url, opts);
        return res.json();
    }

    // ========== STATE ==========
    let careGroup = null;
    let careGroupId = null;
    let careRole = null; // 'guardian' | 'member'
    let clockInterval = null;
    let slideshowInterval = null;
    let slideshowPhotos = [];
    let slideshowIndex = 0;
    let medicationListeners = [];

    // SOS state
    let sosActive = false;
    let sosCountdownTimer = null;
    let sosAudioCtx = null;
    let sosSirenInterval = null;
    let sosWatchId = null;
    let sosWatchTimeout = null;
    let sosMediaRecorder = null;
    let sosRecordingChunks = [];
    let sosRecordingTimer = null;
    let sosAlertId = null;
    let sosStartTime = null;
    let sosLocationMinutesLeft = 30;
    let sosLocationInterval = null;

    const QUICK_REPLIES = [
        { emoji: 'smile', text: t('care.quick_good', 'Good') },
        { emoji: 'hands-pressed', text: t('care.quick_thanks', 'Thanks') },
        { emoji: 'heart', text: t('care.quick_love', 'Love you') },
        { emoji: 'thumbs-up', text: t('care.quick_ok', 'Got it') },
        { emoji: 'utensils', text: t('care.quick_ate', 'I ate') },
        { emoji: 'pill', text: t('care.quick_meds', 'Took meds') }
    ];

    // ========== INIT ==========
    function init() {
        if (!currentUser) return;
        startClock();
        loadCareGroup();
    }

    // ========== CLOCK ==========
    function startClock() {
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    function updateClock() {
        const el = document.getElementById('care-clock');
        if (!el) return;
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;

        const dateEl = document.getElementById('care-date');
        if (dateEl) {
            const days = [t('care.sun','Sun'), t('care.mon','Mon'), t('care.tue','Tue'), t('care.wed','Wed'), t('care.thu','Thu'), t('care.fri','Fri'), t('care.sat','Sat')];
            dateEl.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} (${days[now.getDay()]})`;
        }
    }

    // ========== CARE GROUP ==========
    async function loadCareGroup() {
        if (!currentUser) return;
        try {
            const data = await apiFetch('/api/care/group');

            if (data.group) {
                careGroup = data.group;
                careGroupId = data.group.id;
                const me = (careGroup.members || []).find(m => m.uid === currentUser.uid);
                careRole = me ? me.role : 'member';
                renderCareHome();
                loadMessages();
                loadSchedules();
                loadMedications();
                loadPhotos();
            } else {
                renderNoGroup();
            }
        } catch(e) {
            console.error('Care group load error:', e);
            renderNoGroup();
        }
    }

    // ========== RENDER: NO GROUP ==========
    function renderNoGroup() {
        const c = document.getElementById('care-content');
        if (!c) return;
        c.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem;">
                <div style="font-size:4rem; margin-bottom:1rem;"><i data-lucide="heart" style="width:48px;height:48px;display:inline-block;vertical-align:middle"></i></div>
                <h2 style="font-size:1.8rem; margin-bottom:1rem;">${t('care.welcome','Welcome to CrownyCare')}</h2>
                <p style="font-size:1.2rem; color:#6B5744; margin-bottom:2rem;">${t('care.no_group','Create a family group or get invited to start')}</p>
                <button onclick="CARE.showCreateGroup()" class="care-btn care-btn-primary" style="font-size:1.2rem; padding:1rem 2rem;">
                    ${t('care.create_group','Create Family Group')}
                </button>
            </div>`;
    }

    // ========== CREATE GROUP ==========
    async function showCreateGroup() {
        const name = await showPromptModal(
            t('care.create_group','Create Family Group'),
            t('care.group_name_prompt','Enter group name (e.g. My Family)'),
            ''
        );
        if (!name) return;

        try {
            const data = await apiFetch('/api/care/group', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (data.ok) {
                careGroupId = data.group.id;
                showToast(t('care.group_created','Family group has been created!'));
                loadCareGroup();
            } else {
                showToast(t('common.error','An error occurred'), 'error');
            }
        } catch(e) {
            console.error(e);
            showToast(t('common.error','An error occurred'), 'error');
        }
    }

    // ========== INVITE MEMBER ==========
    async function inviteMember() {
        const email = await showPromptModal(
            t('care.invite','Invite Family'),
            t('care.invite_prompt','Enter the email of the family member to invite'),
            ''
        );
        if (!email) return;

        const roleChoice = await showPromptModal(
            t('care.role_select','Select Role'),
            t('care.role_prompt','Enter guardian or member'),
            'member'
        );
        const role = (roleChoice === 'guardian') ? 'guardian' : 'member';

        try {
            const data = await apiFetch('/api/care/group/invite', {
                method: 'POST',
                body: JSON.stringify({ email, role })
            });

            if (data.error === 'user not found') {
                showToast(t('care.user_not_found','No user found with that email'), 'error');
                return;
            }
            if (data.error === 'already member') {
                showToast(t('care.already_member','Already a member of this group'), 'error');
                return;
            }
            if (data.ok) {
                showToast(t('care.invited','Invitation sent!'));
                loadCareGroup();
            } else {
                showToast(t('common.error','An error occurred'), 'error');
            }
        } catch(e) {
            console.error(e);
            showToast(t('common.error','An error occurred'), 'error');
        }
    }

    // ========== RENDER: CARE HOME ==========
    function renderCareHome() {
        const c = document.getElementById('care-content');
        if (!c) return;

        const membersHtml = (careGroup.members || []).map(m =>
            `<span class="care-member-tag ${m.role === 'guardian' ? 'guardian' : 'member-tag'}">${m.role === 'guardian' ? 'shield' : 'heart'} ${m.nickname}</span>`
        ).join('');

        c.innerHTML = `
            <!-- Clock -->
            <div class="care-clock-wrap">
                <div id="care-clock" class="care-clock">00:00:00</div>
                <div id="care-date" class="care-date"></div>
            </div>

            <!-- Group Info -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <h3 style="margin:0; font-size:1.4rem;">${careGroup.name}</h3>
                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        ${careRole === 'guardian' ? `<button onclick="CARE.inviteMember()" class="care-btn care-btn-small">plus ${t('care.invite_short','Invite')}</button>` : ''}
                        ${careRole === 'guardian' ? `<button onclick="CARE.showEmergencyContacts()" class="care-btn care-btn-small">hospital ${t('care.emergency_contacts','Emergency Contacts')}</button>` : ''}
                        ${careRole === 'guardian' ? `<button onclick="CARE.showNeighborSettings()" class="care-btn care-btn-small">home ${t('care.neighbors','Neighbor Care')}</button>` : ''}
                    </div>
                </div>
                <div style="margin-top:0.8rem; display:flex; flex-wrap:wrap; gap:0.5rem;">${membersHtml}</div>
            </div>

            <!-- SOS Button -->
            <div style="text-align:center; margin:1.5rem 0;">
                <button onclick="CARE.triggerSOS()" class="care-sos-btn" id="care-sos-main-btn">
                    sos SOS
                    <span style="display:block; font-size:1rem; margin-top:0.3rem;">${t('care.sos_label','Emergency Call')}</span>
                </button>
            </div>

            <!-- SOS Active Panel (hidden by default) -->
            <div id="sos-active-panel" style="display:none;"></div>

            <!-- Messages -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">message-circle ${t('care.messages','Family Messages')}</h3>
                    <button onclick="CARE.showSendMessage()" class="care-btn care-btn-small">\u270F ${t('care.write','Write')}</button>
                </div>
                <div id="care-messages" style="margin-top:1rem;"></div>
                <div class="care-quick-replies">
                    ${QUICK_REPLIES.map(q => `<button onclick="CARE.sendQuickReply('${q.emoji} ${q.text}')" class="care-quick-btn">${q.emoji}<br><span>${q.text}</span></button>`).join('')}
                </div>
            </div>

            <!-- Today Schedule -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">calendar ${t('care.schedule','Today\'s Schedule')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddSchedule()" class="care-btn care-btn-small">plus</button>` : ''}
                </div>
                <div id="care-schedules" style="margin-top:1rem;"></div>
            </div>

            <!-- Medications -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">pill ${t('care.medications','Medications')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddMedication()" class="care-btn care-btn-small">plus</button>` : ''}
                </div>
                <div id="care-medications" style="margin-top:1rem;"></div>
            </div>

            <!-- Health Log -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">heart ${t('care.health','Health Records')}</h3>
                    <button onclick="CARE.showAddHealthLog()" class="care-btn care-btn-small">plus ${t('care.record','Record')}</button>
                </div>
                <div id="care-health-logs" style="margin-top:1rem;"></div>
            </div>

            <!-- Photo Slideshow -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">camera ${t('care.photos','Family Photos')}</h3>
                    <button onclick="CARE.uploadPhoto()" class="care-btn care-btn-small">${t('care.upload','Upload')}</button>
                </div>
                <div id="care-slideshow" class="care-slideshow"></div>
            </div>

            <!-- Smart Board Link -->
            <div style="text-align:center; margin:2rem 0 1rem;">
                <a href="#page=care-board" onclick="CARE.openSmartBoard(); return false;" class="care-btn care-btn-primary" style="display:inline-block; text-decoration:none; font-size:1.1rem; padding:1rem 2rem;">
                    ${t('care.smartboard','Smart Board Mode')}
                </a>
            </div>
        `;

        updateClock();
        loadHealthLogs();
    }

    // ========== MESSAGES ==========
    async function loadMessages() {
        if (!careGroupId) return;
        const el = document.getElementById('care-messages');
        if (!el) return;

        try {
            const data = await apiFetch('/api/care/messages?limit=3');

            if (!data.messages || data.messages.length === 0) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_messages','No messages yet')}</p>`;
                return;
            }

            el.innerHTML = data.messages.map(msg => {
                const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) : '';
                return `<div class="care-message-card">
                    <div style="font-weight:700; font-size:1.1rem;">${msg.senderName || t('care.family', 'Family')}</div>
                    <div style="font-size:1.3rem; margin:0.5rem 0;">${msg.text}</div>
                    <div style="color:#6B5744; font-size:0.9rem;">${time}</div>
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showSendMessage() {
        const text = await showPromptModal(
            t('care.send_message','Send Message'),
            t('care.message_prompt','Enter a message for your family'),
            ''
        );
        if (!text) return;

        try {
            await apiFetch('/api/care/messages', {
                method: 'POST',
                body: JSON.stringify({ text })
            });

            showToast(t('care.message_sent','Message sent'));
            loadMessages();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    async function sendQuickReply(text) {
        try {
            await apiFetch('/api/care/messages', {
                method: 'POST',
                body: JSON.stringify({ text, skipNotify: true })
            });
            showToast(`${text} ${t('care.sent', 'sent')}!`);
            loadMessages();
        } catch(e) {
            console.error(e);
        }
    }

    // ========== SCHEDULES ==========
    async function loadSchedules() {
        if (!careGroupId) return;
        const el = document.getElementById('care-schedules');
        if (!el) return;

        try {
            const data = await apiFetch('/api/care/schedules');

            if (!data.schedules || data.schedules.length === 0) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_schedule','No scheduled events')}</p>`;
                return;
            }

            el.innerHTML = data.schedules.map(s => {
                const now = new Date();
                const [hh, mm] = (s.time || '00:00').split(':');
                const schedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hh), parseInt(mm));
                const isPast = now > schedTime;
                return `<div class="care-schedule-item ${isPast ? 'past' : ''}">
                    <span class="care-schedule-time">${s.time}</span>
                    <span class="care-schedule-label">${s.icon || '\u2022'} ${s.title}</span>
                    ${careRole === 'guardian' ? `<button onclick="CARE.deleteSchedule('${s.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">\u2715</button>` : ''}
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddSchedule() {
        const title = await showPromptModal(t('care.add_schedule','Add Schedule'), t('care.schedule_title_prompt','Schedule title (e.g. Walk)'), '');
        if (!title) return;
        const time = await showPromptModal(t('care.schedule_time','Time'), t('care.time_prompt','Enter time (e.g. 09:00)'), '09:00');
        if (!time) return;

        try {
            await apiFetch('/api/care/schedules', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    time,
                    icon: title.match(/\p{Emoji}/u)?.[0] || '\u2022'
                })
            });
            showToast(t('care.schedule_added','Schedule added calendar'));
            loadSchedules();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    async function deleteSchedule(id) {
        if (!confirm(t('care.delete_confirm','Are you sure you want to delete?'))) return;
        try {
            await apiFetch('/api/care/schedules/' + id, { method: 'DELETE' });
            showToast(t('common.delete','Deleted'));
            loadSchedules();
        } catch(e) { console.error(e); }
    }

    // ========== MEDICATIONS ==========
    async function loadMedications() {
        if (!careGroupId) return;
        const el = document.getElementById('care-medications');
        if (!el) return;

        try {
            const data = await apiFetch('/api/care/medications');

            if (!data.medications || data.medications.length === 0) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_meds','No medications registered')}</p>`;
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            el.innerHTML = data.medications.map(med => {
                const taken = med.takenDates && med.takenDates.includes(today);
                return `<div class="care-med-item ${taken ? 'taken' : ''}">
                    <div>
                        <div style="font-weight:700; font-size:1.2rem;">pill ${med.name}</div>
                        <div style="color:#6B5744; font-size:1rem;">\u23F0 ${med.time} \u00B7 ${med.repeat || t('care.daily', 'Daily')}</div>
                    </div>
                    ${taken
                        ? `<span class="care-med-done">${t('care.taken','Taken')}</span>`
                        : `<button onclick="CARE.confirmMedication('${med.id}')" class="care-btn care-btn-med">pill ${t('care.take','Confirm Taken')}</button>`
                    }
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddMedication() {
        const name = await showPromptModal(t('care.add_med','Add Medication'), t('care.med_name_prompt','Enter medication name'), '');
        if (!name) return;
        const time = await showPromptModal(t('care.med_time','Dosage Time'), t('care.time_prompt','Enter time (e.g. 08:00)'), '08:00');
        if (!time) return;

        try {
            await apiFetch('/api/care/medications', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    time,
                    repeat: t('care.daily', 'Daily')
                })
            });
            showToast(t('care.med_added','Medication registered pill'));
            loadMedications();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    async function confirmMedication(medId) {
        try {
            await apiFetch('/api/care/medications/' + medId + '/take', {
                method: 'POST',
                body: JSON.stringify({})
            });

            showToast(t('care.med_confirmed','Medication confirmed!'));
            loadMedications();
        } catch(e) {
            console.error(e);
        }
    }

    // ========== HEALTH LOGS ==========
    async function loadHealthLogs() {
        if (!careGroupId) return;
        const el = document.getElementById('care-health-logs');
        if (!el) return;

        try {
            const data = await apiFetch('/api/care/health?limit=5');

            if (!data.logs || data.logs.length === 0) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_health','No records')}</p>`;
                return;
            }

            el.innerHTML = data.logs.map(h => {
                const date = h.createdAt ? new Date(h.createdAt).toLocaleDateString('ko-KR') : '';
                const items = [];
                if (h.bloodPressure) items.push(`\uD83E\uDE78 ${t('care.blood_pressure', 'BP')}: ${h.bloodPressure}`);
                if (h.temperature) items.push(`${t('care.temperature', 'Temp')}: ${h.temperature}\u00B0C`);
                if (h.bloodSugar) items.push(`${t('care.blood_sugar', 'Sugar')}: ${h.bloodSugar}`);
                if (h.weight) items.push(`${t('care.weight', 'Weight')}: ${h.weight}kg`);
                return `<div class="care-health-card">
                    <div style="font-weight:700;">${h.recorderName || ''} \u00B7 ${date}</div>
                    <div style="margin-top:0.5rem; font-size:1.1rem;">${items.join(' &nbsp;|&nbsp; ')}</div>
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddHealthLog() {
        const bp = await showPromptModal('\uD83E\uDE78 ' + t('care.blood_pressure', 'Blood Pressure'), t('care.bp_prompt', 'Enter blood pressure (e.g. 120/80, leave blank to skip)'), '');
        const temp = await showPromptModal(t('care.temperature', 'Temperature'), t('care.temp_prompt', 'Enter temperature (e.g. 36.5, leave blank to skip)'), '');
        const sugar = await showPromptModal(t('care.blood_sugar', 'Blood Sugar'), t('care.sugar_prompt', 'Enter blood sugar (leave blank to skip)'), '');
        const weight = await showPromptModal(t('care.weight', 'Weight'), t('care.weight_prompt', 'Enter weight in kg (leave blank to skip)'), '');

        if (!bp && !temp && !sugar && !weight) {
            showToast(t('care.no_data','No data entered'), 'error');
            return;
        }

        try {
            await apiFetch('/api/care/health', {
                method: 'POST',
                body: JSON.stringify({
                    bloodPressure: bp || null,
                    temperature: temp || null,
                    bloodSugar: sugar || null,
                    weight: weight || null
                })
            });
            showToast(t('care.health_saved','Health record saved heart'));
            loadHealthLogs();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    // =============================================
    // ========== SOS SYSTEM (Enhanced) ============
    // =============================================

    // --- 5-second Countdown ---
    function triggerSOS() {
        if (sosActive) return;
        showSOSCountdown();
    }

    function showSOSCountdown() {
        let count = 5;
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'sos-countdown-overlay';
        overlay.className = 'sos-countdown-overlay';
        overlay.innerHTML = `
            <div class="sos-countdown-content">
                <div class="sos-countdown-icon">sos</div>
                <div class="sos-countdown-title">${t('care.sos_countdown_title','SOS Emergency Call')}</div>
                <div class="sos-countdown-number" id="sos-countdown-num">${count}</div>
                <div class="sos-countdown-desc">${t('care.sos_countdown_desc','seconds until dispatch')}</div>
                <button onclick="CARE.cancelSOSCountdown()" class="sos-countdown-cancel">
                    \u2715 ${t('care.sos_cancel','Cancel')}
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        // Prevent accidental touches
        overlay.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

        sosCountdownTimer = setInterval(() => {
            count--;
            const numEl = document.getElementById('sos-countdown-num');
            if (numEl) numEl.textContent = count;
            if (count <= 0) {
                clearInterval(sosCountdownTimer);
                sosCountdownTimer = null;
                overlay.remove();
                executeSOSSequence();
            }
        }, 1000);
    }

    function cancelSOSCountdown() {
        if (sosCountdownTimer) {
            clearInterval(sosCountdownTimer);
            sosCountdownTimer = null;
        }
        const overlay = document.getElementById('sos-countdown-overlay');
        if (overlay) overlay.remove();
        showToast(t('care.sos_cancelled','SOS has been cancelled'));
    }

    // --- Main SOS execution ---
    async function executeSOSSequence() {
        sosActive = true;
        sosStartTime = new Date();

        // Get nickname
        let nickname = currentUser.displayName || currentUser.email;
        try {
            const nickData = await apiFetch('/api/care/user-nickname');
            if (nickData.nickname) nickname = nickData.nickname;
        } catch(e) { /* use default */ }

        // 1) Start siren
        startSiren();

        // 2) Get location
        let location = null;
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
            });
            location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch(e) {
            console.warn('Location unavailable:', e);
        }

        // 3) Start recording
        startAudioRecording();

        // 4) Save SOS record to server
        try {
            const sosData = await apiFetch('/api/care/sos', {
                method: 'POST',
                body: JSON.stringify({ location })
            });
            if (sosData.ok && sosData.alert) {
                sosAlertId = sosData.alert.id;
            }
        } catch(e) {
            console.error('SOS save error:', e);
        }

        // 5) Auto-message via messenger
        const locationStr = location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : t('care.location_unavailable','Location unavailable');
        try {
            await apiFetch('/api/care/messages', {
                method: 'POST',
                body: JSON.stringify({
                    text: `sos ${nickname}${t('care.sos_auto_msg',' has sent an emergency call!')} ${t('care.sos_location','Location')}: ${locationStr}`,
                    type: 'sos',
                    skipNotify: true
                })
            });
        } catch(e) { console.error(e); }

        // 6) Notify neighbors
        let neighborCount = 0;
        try {
            const nbData = await apiFetch('/api/care/sos/notify-neighbors', {
                method: 'POST',
                body: JSON.stringify({ location, senderName: nickname })
            });
            neighborCount = nbData.count || 0;
        } catch(e) { console.error('Neighbor notify error:', e); }

        // 7) Start real-time location sharing (30 min)
        startLocationSharing();

        // 8) Load emergency contacts
        let emergencyContacts = [];
        try {
            const ecData = await apiFetch('/api/care/emergency-contacts');
            emergencyContacts = ecData.contacts || [];
        } catch(e) { console.error(e); }

        // Show SOS complete screen
        const guardianCount = careGroup.members.filter(m => m.uid !== currentUser.uid).length;
        renderSOSActivePanel(location, guardianCount, neighborCount, emergencyContacts);
    }

    // --- Siren (Web Audio API) ---
    function startSiren() {
        try {
            sosAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            let high = true;
            function beep() {
                if (!sosAudioCtx || sosAudioCtx.state === 'closed') return;
                const osc = sosAudioCtx.createOscillator();
                const gain = sosAudioCtx.createGain();
                osc.connect(gain);
                gain.connect(sosAudioCtx.destination);
                osc.type = 'square';
                osc.frequency.value = high ? 880 : 660;
                gain.gain.value = 0.3;
                osc.start();
                gain.gain.exponentialRampToValueAtTime(0.01, sosAudioCtx.currentTime + 0.4);
                osc.stop(sosAudioCtx.currentTime + 0.45);
                high = !high;
            }
            beep();
            sosSirenInterval = setInterval(beep, 500);
        } catch(e) {
            console.error('Siren error:', e);
        }
    }

    function stopSiren() {
        if (sosSirenInterval) {
            clearInterval(sosSirenInterval);
            sosSirenInterval = null;
        }
        if (sosAudioCtx) {
            try { sosAudioCtx.close(); } catch(e) { console.warn("[catch]", e); }
            sosAudioCtx = null;
        }
    }

    // --- Audio Recording (MediaRecorder, 30s) ---
    function startAudioRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('MediaRecorder not supported');
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            sosRecordingChunks = [];
            sosMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            sosMediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) sosRecordingChunks.push(e.data);
            };
            sosMediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                uploadRecording();
            };
            sosMediaRecorder.start();

            // Auto-stop after 30 seconds
            sosRecordingTimer = setTimeout(() => {
                if (sosMediaRecorder && sosMediaRecorder.state === 'recording') {
                    sosMediaRecorder.stop();
                }
            }, 30000);
        }).catch(e => {
            console.warn('Recording permission denied:', e);
        });
    }

    function stopAudioRecording() {
        if (sosRecordingTimer) {
            clearTimeout(sosRecordingTimer);
            sosRecordingTimer = null;
        }
        if (sosMediaRecorder && sosMediaRecorder.state === 'recording') {
            sosMediaRecorder.stop();
        }
    }

    async function uploadRecording() {
        if (sosRecordingChunks.length === 0) return;
        try {
            const blob = new Blob(sosRecordingChunks, { type: 'audio/webm' });
            // Convert blob to base64
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1]; // strip data:...;base64, prefix
                    resolve(base64);
                };
                reader.readAsDataURL(blob);
            });
            const base64 = await base64Promise;

            if (sosAlertId) {
                await apiFetch('/api/care/sos/' + sosAlertId + '/recording', {
                    method: 'POST',
                    body: JSON.stringify({ base64, mimeType: 'audio/webm' })
                });
            }
        } catch(e) {
            console.error('Recording upload error:', e);
        }
        sosRecordingChunks = [];
    }

    // --- Real-time Location Sharing (30 min) ---
    function startLocationSharing() {
        if (!navigator.geolocation) return;
        sosLocationMinutesLeft = 30;

        sosWatchId = navigator.geolocation.watchPosition(
            async (pos) => {
                if (!sosAlertId || !careGroupId) return;
                try {
                    await apiFetch('/api/care/sos/' + sosAlertId + '/location', {
                        method: 'POST',
                        body: JSON.stringify({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy
                        })
                    });
                } catch(e) { console.error(e); }
                // Update panel
                updateSOSLocationDisplay(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => console.warn('Watch position error:', err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );

        // Update minutes-left countdown
        sosLocationInterval = setInterval(() => {
            sosLocationMinutesLeft--;
            const el = document.getElementById('sos-location-timer');
            if (el) el.textContent = `${sosLocationMinutesLeft}${t('care.minutes_left','min left')}`;
            if (sosLocationMinutesLeft <= 0) {
                stopLocationSharing();
            }
        }, 60000);

        // Auto-stop after 30 min
        sosWatchTimeout = setTimeout(() => stopLocationSharing(), 30 * 60 * 1000);
    }

    function stopLocationSharing() {
        if (sosWatchId !== null) {
            navigator.geolocation.clearWatch(sosWatchId);
            sosWatchId = null;
        }
        if (sosWatchTimeout) { clearTimeout(sosWatchTimeout); sosWatchTimeout = null; }
        if (sosLocationInterval) { clearInterval(sosLocationInterval); sosLocationInterval = null; }
    }

    function updateSOSLocationDisplay(lat, lng) {
        const latEl = document.getElementById('sos-lat');
        const lngEl = document.getElementById('sos-lng');
        if (latEl) latEl.textContent = lat.toFixed(4);
        if (lngEl) lngEl.textContent = lng.toFixed(4);
        // Update maps link
        const mapLink = document.getElementById('sos-map-link');
        if (mapLink) mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
    }

    // --- SOS Active Panel UI ---
    function renderSOSActivePanel(location, guardianCount, neighborCount, emergencyContacts) {
        const panel = document.getElementById('sos-active-panel');
        if (!panel) return;

        const timeStr = sosStartTime.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const lat = location ? location.lat.toFixed(4) : '--';
        const lng = location ? location.lng.toFixed(4) : '--';
        const mapsUrl = location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : '#';

        let ecHtml = '';
        if (emergencyContacts.length > 0) {
            ecHtml = emergencyContacts.map(ec => `
                <div class="sos-ec-card">
                    <div>
                        <strong>hospital ${ec.hospitalName || ec.name || t('care.hospital','Hospital')}</strong>
                        ${ec.doctorName ? `<div style="font-size:0.9rem; color:#6B5744;">${ec.doctorName}</div>` : ''}
                        ${ec.address ? `<div style="font-size:0.85rem; color:#6B5744;">${ec.address}</div>` : ''}
                    </div>
                    <a href="tel:${ec.phone}" class="sos-call-btn">${ec.phone}</a>
                </div>
            `).join('');
        } else {
            ecHtml = `<p style="color:#6B5744; font-size:0.95rem;">${t('care.no_emergency_contacts','No emergency contacts registered')}</p>`;
        }

        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="sos-active-card">
                <div class="sos-active-header">
                    <div class="sos-active-icon">sos</div>
                    <div>
                        <div class="sos-active-title">${t('care.sos_complete_title','SOS Emergency Call Complete')}</div>
                        <div class="sos-active-time">${timeStr} ${t('care.sos_sent_at','Sent')}</div>
                    </div>
                </div>

                <!-- Location -->
                <div class="sos-section">
                    <div class="sos-location-status">
                        ${t('care.location_sharing','Sharing location...')} (<span id="sos-location-timer">${sosLocationMinutesLeft}${t('care.minutes_left','min left')}</span>)
                    </div>
                    <div style="font-size:1rem; color:#6B5744; margin-top:0.3rem;">
                        ${t('care.latitude','Lat')}: <span id="sos-lat">${lat}</span> &nbsp; ${t('care.longitude','Lng')}: <span id="sos-lng">${lng}</span>
                    </div>
                    <a id="sos-map-link" href="${mapsUrl}" target="_blank" class="sos-map-btn">${t('care.view_map','View Map')}</a>
                </div>

                <!-- 119 / 112 -->
                <div class="sos-emergency-btns">
                    <a href="tel:119" class="sos-emergency-btn sos-119">
                        119<br><span>${t('care.emergency_call','Emergency')}</span>
                    </a>
                    <a href="tel:112" class="sos-emergency-btn sos-112">
                        112<br><span>${t('care.police_call','Police')}</span>
                    </a>
                </div>

                <!-- Emergency Contacts -->
                <div class="sos-section">
                    <h4 style="margin:0 0 0.5rem;">hospital ${t('care.emergency_contacts','Hospital/Doctor')}</h4>
                    ${ecHtml}
                </div>

                <!-- Status -->
                <div class="sos-section sos-status-list">
                    <div>${t('care.guardians_notified','Guardians')} ${guardianCount}${t('care.people_notified',' notified')}</div>
                    <div>${t('care.neighbors_notified','Neighbors')} ${neighborCount}${t('care.people_notified',' notified')}</div>
                    <div id="sos-recording-status">${t('care.recording','Recording...')} (30${t('care.seconds_left','s left')})</div>
                </div>

                <!-- Cancel SOS -->
                <button onclick="CARE.deactivateSOS()" class="sos-deactivate-btn">
                    ${t('care.sos_deactivate','Deactivate SOS')}
                </button>
            </div>
        `;

        // Hide main SOS button
        const mainBtn = document.getElementById('care-sos-main-btn');
        if (mainBtn) mainBtn.style.display = 'none';

        // Recording countdown display
        let recSec = 30;
        const recInterval = setInterval(() => {
            recSec--;
            const recEl = document.getElementById('sos-recording-status');
            if (recEl && recSec > 0) {
                recEl.textContent = `${t('care.recording','Recording...')} (${recSec}${t('care.seconds_left','s left')})`;
            } else if (recEl) {
                recEl.textContent = `${t('care.recording_done','Recording complete')}`;
                clearInterval(recInterval);
            } else {
                clearInterval(recInterval);
            }
        }, 1000);
    }

    // --- Deactivate SOS ---
    async function deactivateSOS() {
        sosActive = false;
        stopSiren();
        stopAudioRecording();
        stopLocationSharing();

        // Update server status
        if (sosAlertId) {
            try {
                await apiFetch('/api/care/sos/' + sosAlertId + '/resolve', {
                    method: 'POST',
                    body: JSON.stringify({})
                });
            } catch(e) { console.error(e); }
        }

        sosAlertId = null;
        sosStartTime = null;

        // Hide panel, show button
        const panel = document.getElementById('sos-active-panel');
        if (panel) panel.style.display = 'none';
        const mainBtn = document.getElementById('care-sos-main-btn');
        if (mainBtn) mainBtn.style.display = '';

        showToast(t('care.sos_deactivated','SOS has been deactivated'));
    }

    // ========== EMERGENCY CONTACTS MANAGEMENT ==========
    async function showEmergencyContacts() {
        if (!careGroupId) return;

        let contacts = [];
        try {
            const data = await apiFetch('/api/care/emergency-contacts');
            contacts = data.contacts || [];
        } catch(e) { console.error(e); }

        // Build modal content
        let listHtml = contacts.length ? contacts.map(c => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem; background:#f9f9f9; border-radius:10px; margin-bottom:0.5rem;">
                <div>
                    <strong>hospital ${c.hospitalName || ''}</strong>
                    ${c.doctorName ? `<span style="color:#6B5744;"> \u00B7 ${c.doctorName}</span>` : ''}
                    <div style="font-size:0.85rem; color:#6B5744;">${c.phone || ''} \u00B7 ${c.address || ''}</div>
                </div>
                <button onclick="CARE.deleteEmergencyContact('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">\u2715</button>
            </div>
        `).join('') : `<p style="color:#6B5744;">${t('care.no_emergency_contacts','No contacts registered')}</p>`;

        // Use prompt-style modal (simple approach)
        const hospitalName = await showPromptModal(
            `hospital ${t('care.emergency_contacts','Emergency Contacts')}`,
            `${t('care.add_hospital','Add new hospital/doctor \u2014 Enter hospital name (leave blank to view list)')}\n\n${t('care.currently_registered', 'Currently registered')}: ${contacts.length}`,
            ''
        );
        if (!hospitalName) return; // just viewing

        const phone = await showPromptModal(t('care.phone','Phone Number'), t('care.phone_prompt','Enter phone number'), '');
        const doctorName = await showPromptModal(t('care.doctor','Doctor'), t('care.doctor_prompt','Doctor name (optional)'), '');
        const address = await showPromptModal(t('care.address','Address'), t('care.address_prompt','Hospital address (optional)'), '');

        if (!phone) { showToast(t('care.phone_required','Phone number is required'), 'error'); return; }

        try {
            await apiFetch('/api/care/emergency-contacts', {
                method: 'POST',
                body: JSON.stringify({ hospitalName, phone, doctorName: doctorName || '', address: address || '' })
            });
            showToast(t('care.ec_added','Emergency contact added hospital'));
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    async function deleteEmergencyContact(id) {
        if (!confirm(t('care.delete_confirm','Are you sure you want to delete?'))) return;
        try {
            await apiFetch('/api/care/emergency-contacts/' + id, { method: 'DELETE' });
            showToast(t('common.delete','Deleted'));
        } catch(e) { console.error(e); }
    }

    // ========== NEIGHBOR SETTINGS ==========
    async function showNeighborSettings() {
        if (!careGroupId) return;

        const email = await showPromptModal(
            `home ${t('care.neighbors','Neighbor Care Network')}`,
            t('care.neighbor_email_prompt','Enter neighbor email (leave blank to cancel)'),
            ''
        );
        if (!email) return;

        try {
            // Get neighbor's location (prompt for manual input)
            const latStr = await showPromptModal(t('care.neighbor_lat','Neighbor Latitude'), t('care.neighbor_lat_prompt','Enter latitude (e.g. 37.5665)'), '');
            const lngStr = await showPromptModal(t('care.neighbor_lng','Neighbor Longitude'), t('care.neighbor_lng_prompt','Enter longitude (e.g. 126.9780)'), '');

            const data = await apiFetch('/api/care/neighbors', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    lat: latStr ? parseFloat(latStr) : null,
                    lng: lngStr ? parseFloat(lngStr) : null
                })
            });

            if (data.error === 'user not found') {
                showToast(t('care.user_not_found','User not found'), 'error');
                return;
            }
            if (data.ok) {
                showToast(t('care.neighbor_added','Neighbor has been registered home'));
            }
        } catch(e) {
            console.error(e);
            showToast(t('common.error','Error'), 'error');
        }
    }

    // ========== GUARDIAN SOS ALERT SOUND ==========
    // Play alert sound when guardian receives SOS notification
    function playGuardianAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            for (let i = 0; i < 5; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = 1000;
                gain.gain.value = 0.4;
                osc.start(ctx.currentTime + i * 0.6);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.6 + 0.4);
                osc.stop(ctx.currentTime + i * 0.6 + 0.5);
            }
            setTimeout(() => ctx.close(), 4000);
        } catch(e) { console.error(e); }
    }

    // ========== PHOTOS ==========
    async function loadPhotos() {
        if (!careGroupId) return;
        try {
            const data = await apiFetch('/api/care/photos');
            slideshowPhotos = data.photos || [];
            renderSlideshow();
        } catch(e) {
            console.error(e);
        }
    }

    function renderSlideshow() {
        const el = document.getElementById('care-slideshow');
        if (!el) return;
        if (slideshowPhotos.length === 0) {
            el.innerHTML = `<p style="color:#6B5744; text-align:center; padding:2rem;">${t('care.no_photos','No photos yet camera')}</p>`;
            return;
        }
        const photo = slideshowPhotos[slideshowIndex % slideshowPhotos.length];
        el.innerHTML = `
            <div class="care-photo-frame">
                <img src="${photo.url}" alt="${photo.caption || ''}" style="width:100%; max-height:400px; object-fit:cover; border-radius:12px;">
                ${photo.caption ? `<p style="text-align:center; margin-top:0.5rem; font-size:1.1rem; color:#6B5744;">${photo.caption}</p>` : ''}
            </div>
            ${slideshowPhotos.length > 1 ? `<div style="text-align:center; margin-top:0.5rem;">
                <button onclick="CARE.prevPhoto()" class="care-btn care-btn-small">\u25C0</button>
                <span style="margin:0 1rem; color:#6B5744;">${(slideshowIndex % slideshowPhotos.length) + 1} / ${slideshowPhotos.length}</span>
                <button onclick="CARE.nextPhoto()" class="care-btn care-btn-small">\u25B6</button>
            </div>` : ''}`;
    }

    function prevPhoto() { slideshowIndex = (slideshowIndex - 1 + slideshowPhotos.length) % slideshowPhotos.length; renderSlideshow(); }
    function nextPhoto() { slideshowIndex = (slideshowIndex + 1) % slideshowPhotos.length; renderSlideshow(); }

    function uploadPhoto() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const resized = await resizeImage(ev.target.result, 1200);
                    const caption = await showPromptModal('camera ' + t('care.photo_caption', 'Photo Caption'), t('care.caption_prompt', 'Enter a description for the photo (optional)'), '');

                    await apiFetch('/api/care/photos', {
                        method: 'POST',
                        body: JSON.stringify({
                            url: resized,
                            caption: caption || ''
                        })
                    });
                    showToast(t('care.photo_uploaded','Photo uploaded camera'));
                    loadPhotos();
                } catch(e) {
                    console.error(e);
                    showToast(t('common.error','Error'), 'error');
                }
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ========== SMART BOARD ==========
    function openSmartBoard() {
        history.pushState(null, '', '#page=care-board');
        renderSmartBoard();
    }

    function renderSmartBoard() {
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('.main-content') && (document.querySelector('.main-content').style.marginLeft = '0');

        const main = document.querySelector('.main-content') || document.querySelector('.content');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        let board = document.getElementById('care-board');
        if (!board) {
            board = document.createElement('section');
            board.id = 'care-board';
            board.className = 'page care-board-fullscreen';
            main.appendChild(board);
        }
        board.classList.add('active');

        const bgPhoto = slideshowPhotos.length > 0 ? slideshowPhotos[0].url : '';

        board.innerHTML = `
            <div class="care-board-bg" ${bgPhoto ? `style="background-image:url(${bgPhoto})"` : ''}>
                <div class="care-board-overlay">
                    <button onclick="CARE.exitSmartBoard()" class="care-board-exit">\u2715</button>
                    <div class="care-board-clock" id="care-board-clock">00:00</div>
                    <div class="care-board-date" id="care-board-date"></div>
                    <div id="care-board-messages" class="care-board-messages"></div>
                    <div id="care-board-schedule" class="care-board-schedule"></div>
                    <button onclick="CARE.triggerSOS()" class="care-sos-btn" style="margin-top:2rem;">
                        sos SOS
                    </button>
                </div>
            </div>`;

        updateBoardClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateBoardClock, 1000);

        loadBoardMessages();
        loadBoardSchedule();

        if (slideshowPhotos.length > 1) {
            if (slideshowInterval) clearInterval(slideshowInterval);
            let idx = 0;
            slideshowInterval = setInterval(() => {
                idx = (idx + 1) % slideshowPhotos.length;
                const bg = document.querySelector('.care-board-bg');
                if (bg) bg.style.backgroundImage = `url(${slideshowPhotos[idx].url})`;
            }, 10000);
        }
    }

    function updateBoardClock() {
        const el = document.getElementById('care-board-clock');
        if (!el) return;
        const now = new Date();
        el.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const dateEl = document.getElementById('care-board-date');
        if (dateEl) {
            const days = [t('care.sun','Sun'), t('care.mon','Mon'), t('care.tue','Tue'), t('care.wed','Wed'), t('care.thu','Thu'), t('care.fri','Fri'), t('care.sat','Sat')];
            dateEl.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} (${days[now.getDay()]})`;
        }
    }

    async function loadBoardMessages() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-messages');
        if (!el) return;
        try {
            const data = await apiFetch('/api/care/messages?limit=3');
            el.innerHTML = (data.messages || []).map(m => {
                return `<div class="care-board-msg">${m.senderName}: ${m.text}</div>`;
            }).join('');
        } catch(e) { console.warn("[catch]", e); }
    }

    async function loadBoardSchedule() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-schedule');
        if (!el) return;
        try {
            const data = await apiFetch('/api/care/schedules');
            el.innerHTML = (data.schedules || []).map(s => {
                return `<div class="care-board-sched">${s.time} ${s.icon || '\u2022'} ${s.title}</div>`;
            }).join('');
        } catch(e) { console.warn("[catch]", e); }
    }

    function exitSmartBoard() {
        if (slideshowInterval) clearInterval(slideshowInterval);
        document.getElementById('sidebar').style.display = '';
        const mc = document.querySelector('.main-content');
        if (mc) mc.style.marginLeft = '';
        const board = document.getElementById('care-board');
        if (board) board.classList.remove('active');
        if (typeof showPage === 'function') showPage('care');
    }

    // ========== HASH ROUTING ==========
    function checkHash() {
        if (location.hash === '#page=care-board') {
            if (currentUser) {
                loadCareGroup().then(() => renderSmartBoard());
            }
        }
    }

    window.addEventListener('hashchange', () => {
        if (location.hash === '#page=care-board') {
            CARE.openSmartBoard();
        }
    });

    // ========== PUBLIC API ==========
    return {
        init,
        showCreateGroup,
        inviteMember,
        triggerSOS,
        cancelSOSCountdown,
        deactivateSOS,
        showSendMessage,
        sendQuickReply,
        showAddSchedule,
        deleteSchedule,
        showAddMedication,
        confirmMedication,
        showAddHealthLog,
        showEmergencyContacts,
        deleteEmergencyContact,
        showNeighborSettings,
        playGuardianAlert,
        uploadPhoto,
        prevPhoto,
        nextPhoto,
        openSmartBoard,
        exitSmartBoard,
        checkHash
    };
})();
