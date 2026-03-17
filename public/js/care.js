// ===== care.js v2.0 - 크라우니케어: 가족돌봄/건강관리/SOS 강화/케어모드UI =====
// SOS: 카운트다운, 사이렌, 실시간위치, 녹음, 119·112, 병원정보, 이웃네트워크

window.CARE = (function() {
    'use strict';

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
        { emoji: 'smile', text: '좋아요' },
        { emoji: 'hands-pressed', text: '고마워' },
        { emoji: 'heart', text: '사랑해' },
        { emoji: 'thumbs-up', text: '알겠어' },
        { emoji: 'utensils', text: '밥먹었어' },
        { emoji: 'pill', text: '약먹었어' }
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
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
        }
    }

    // ========== CARE GROUP ==========
    async function loadCareGroup() {
        if (!currentUser) return;
        try {
            const snap = await db.collection('care_groups')
                .where('memberUids', 'array-contains', currentUser.uid)
                .limit(1).get();

            if (!snap.empty) {
                careGroupId = snap.docs[0].id;
                careGroup = snap.docs[0].data();
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
                <div style="font-size:4rem; margin-bottom:1rem;">❤️</div>
                <h2 style="font-size:1.8rem; margin-bottom:1rem;">${t('care.welcome','크라우니케어에 오신 것을 환영합니다')}</h2>
                <p style="font-size:1.2rem; color:#6B5744; margin-bottom:2rem;">${t('care.no_group','가족 그룹을 만들거나 초대를 받아 시작하세요')}</p>
                <button onclick="CARE.showCreateGroup()" class="care-btn care-btn-primary" style="font-size:1.2rem; padding:1rem 2rem;">
                    👪 ${t('care.create_group','가족 그룹 만들기')}
                </button>
            </div>`;
    }

    // ========== CREATE GROUP ==========
    async function showCreateGroup() {
        const name = await showPromptModal(
            t('care.create_group','가족 그룹 만들기'),
            t('care.group_name_prompt','그룹 이름을 입력하세요 (예: 우리 가족)'),
            ''
        );
        if (!name) return;

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : (currentUser.displayName || currentUser.email);

            const ref = await db.collection('care_groups').add({
                name: name,
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                memberUids: [currentUser.uid],
                members: [{
                    uid: currentUser.uid,
                    email: currentUser.email,
                    nickname: nickname,
                    role: 'guardian',
                    joinedAt: new Date().toISOString()
                }]
            });
            careGroupId = ref.id;
            showToast(t('care.group_created','가족 그룹이 생성되었습니다! 🎉'));
            loadCareGroup();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류가 발생했습니다'), 'error');
        }
    }

    // ========== INVITE MEMBER ==========
    async function inviteMember() {
        const email = await showPromptModal(
            t('care.invite','가족 초대'),
            t('care.invite_prompt','초대할 가족의 이메일을 입력하세요'),
            ''
        );
        if (!email) return;

        const roleChoice = await showPromptModal(
            t('care.role_select','역할 선택'),
            t('care.role_prompt','guardian(보호자) 또는 member(피보호자)를 입력하세요'),
            'member'
        );
        const role = (roleChoice === 'guardian') ? 'guardian' : 'member';

        try {
            const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
            if (userSnap.empty) {
                showToast(t('care.user_not_found','해당 이메일의 사용자를 찾을 수 없습니다'), 'error');
                return;
            }
            const invitedUser = userSnap.docs[0];
            const invitedData = invitedUser.data();

            if ((careGroup.memberUids || []).includes(invitedUser.id)) {
                showToast(t('care.already_member','이미 그룹에 속해 있습니다'), 'error');
                return;
            }

            await db.collection('care_groups').doc(careGroupId).update({
                memberUids: firebase.firestore.FieldValue.arrayUnion(invitedUser.id),
                members: firebase.firestore.FieldValue.arrayUnion({
                    uid: invitedUser.id,
                    email: email,
                    nickname: invitedData.nickname || email,
                    role: role,
                    joinedAt: new Date().toISOString()
                })
            });

            await db.collection('notifications').add({
                userId: invitedUser.id,
                type: 'care_invite',
                message: `❤️ ${careGroup.name} 가족 그룹에 초대되었습니다`,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast(t('care.invited','초대가 완료되었습니다! ❤️'));
            loadCareGroup();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류가 발생했습니다'), 'error');
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
                    <h3 style="margin:0; font-size:1.4rem;">👪 ${careGroup.name}</h3>
                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        ${careRole === 'guardian' ? `<button onclick="CARE.inviteMember()" class="care-btn care-btn-small">plus ${t('care.invite_short','초대')}</button>` : ''}
                        ${careRole === 'guardian' ? `<button onclick="CARE.showEmergencyContacts()" class="care-btn care-btn-small">hospital ${t('care.emergency_contacts','응급연락처')}</button>` : ''}
                        ${careRole === 'guardian' ? `<button onclick="CARE.showNeighborSettings()" class="care-btn care-btn-small">home ${t('care.neighbors','이웃 돌봄')}</button>` : ''}
                    </div>
                </div>
                <div style="margin-top:0.8rem; display:flex; flex-wrap:wrap; gap:0.5rem;">${membersHtml}</div>
            </div>

            <!-- SOS Button -->
            <div style="text-align:center; margin:1.5rem 0;">
                <button onclick="CARE.triggerSOS()" class="care-sos-btn" id="care-sos-main-btn">
                    sos SOS
                    <span style="display:block; font-size:1rem; margin-top:0.3rem;">${t('care.sos_label','긴급 호출')}</span>
                </button>
            </div>

            <!-- SOS Active Panel (hidden by default) -->
            <div id="sos-active-panel" style="display:none;"></div>

            <!-- Messages -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">message-circle ${t('care.messages','가족 메시지')}</h3>
                    <button onclick="CARE.showSendMessage()" class="care-btn care-btn-small">✏️ ${t('care.write','쓰기')}</button>
                </div>
                <div id="care-messages" style="margin-top:1rem;"></div>
                <div class="care-quick-replies">
                    ${QUICK_REPLIES.map(q => `<button onclick="CARE.sendQuickReply('${q.emoji} ${q.text}')" class="care-quick-btn">${q.emoji}<br><span>${q.text}</span></button>`).join('')}
                </div>
            </div>

            <!-- Today Schedule -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">calendar ${t('care.schedule','오늘의 일정')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddSchedule()" class="care-btn care-btn-small">plus</button>` : ''}
                </div>
                <div id="care-schedules" style="margin-top:1rem;"></div>
            </div>

            <!-- Medications -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">pill ${t('care.medications','약 복용')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddMedication()" class="care-btn care-btn-small">plus</button>` : ''}
                </div>
                <div id="care-medications" style="margin-top:1rem;"></div>
            </div>

            <!-- Health Log -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">heart ${t('care.health','건강 기록')}</h3>
                    <button onclick="CARE.showAddHealthLog()" class="care-btn care-btn-small">plus ${t('care.record','기록')}</button>
                </div>
                <div id="care-health-logs" style="margin-top:1rem;"></div>
            </div>

            <!-- Photo Slideshow -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">camera ${t('care.photos','가족 사진')}</h3>
                    <button onclick="CARE.uploadPhoto()" class="care-btn care-btn-small">📷 ${t('care.upload','업로드')}</button>
                </div>
                <div id="care-slideshow" class="care-slideshow"></div>
            </div>

            <!-- Smart Board Link -->
            <div style="text-align:center; margin:2rem 0 1rem;">
                <a href="#page=care-board" onclick="CARE.openSmartBoard(); return false;" class="care-btn care-btn-primary" style="display:inline-block; text-decoration:none; font-size:1.1rem; padding:1rem 2rem;">
                    🖥️ ${t('care.smartboard','스마트보드 모드')}
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
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('messages').orderBy('createdAt', 'desc').limit(3).get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_messages','아직 메시지가 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const msg = d.data();
                const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) : '';
                return `<div class="care-message-card">
                    <div style="font-weight:700; font-size:1.1rem;">${msg.senderName || '가족'}</div>
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
            t('care.send_message','메시지 보내기'),
            t('care.message_prompt','가족에게 보낼 메시지를 입력하세요'),
            ''
        );
        if (!text) return;

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('messages').add({
                text: text,
                senderId: currentUser.uid,
                senderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            for (const m of careGroup.members) {
                if (m.uid !== currentUser.uid) {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_message',
                        message: `❤️ ${nickname}: ${text}`,
                        read: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            showToast(t('care.message_sent','메시지를 보냈습니다 ❤️'));
            loadMessages();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function sendQuickReply(text) {
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('messages').add({
                text: text,
                senderId: currentUser.uid,
                senderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(`${text} 전송! ❤️`);
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
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('schedules').orderBy('time', 'asc').get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_schedule','등록된 일정이 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const s = d.data();
                const now = new Date();
                const [hh, mm] = (s.time || '00:00').split(':');
                const schedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hh), parseInt(mm));
                const isPast = now > schedTime;
                return `<div class="care-schedule-item ${isPast ? 'past' : ''}">
                    <span class="care-schedule-time">${s.time}</span>
                    <span class="care-schedule-label">${s.icon || '📌'} ${s.title}</span>
                    ${careRole === 'guardian' ? `<button onclick="CARE.deleteSchedule('${d.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">🗑️</button>` : ''}
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddSchedule() {
        const title = await showPromptModal(t('care.add_schedule','일정 추가'), t('care.schedule_title_prompt','일정 제목 (예: 🚶 산책)'), '');
        if (!title) return;
        const time = await showPromptModal(t('care.schedule_time','시간'), t('care.time_prompt','시간을 입력하세요 (예: 09:00)'), '09:00');
        if (!time) return;

        try {
            await db.collection('care_groups').doc(careGroupId).collection('schedules').add({
                title: title,
                time: time,
                icon: title.match(/\p{Emoji}/u)?.[0] || '📌',
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.schedule_added','일정이 추가되었습니다 calendar'));
            loadSchedules();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function deleteSchedule(id) {
        if (!confirm(t('care.delete_confirm','삭제하시겠습니까?'))) return;
        try {
            await db.collection('care_groups').doc(careGroupId).collection('schedules').doc(id).delete();
            showToast(t('common.delete','삭제됨'));
            loadSchedules();
        } catch(e) { console.error(e); }
    }

    // ========== MEDICATIONS ==========
    async function loadMedications() {
        if (!careGroupId) return;
        const el = document.getElementById('care-medications');
        if (!el) return;

        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('medications').orderBy('time', 'asc').get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_meds','등록된 약이 없습니다')}</p>`;
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            el.innerHTML = snap.docs.map(d => {
                const med = d.data();
                const taken = med.takenDates && med.takenDates.includes(today);
                return `<div class="care-med-item ${taken ? 'taken' : ''}">
                    <div>
                        <div style="font-weight:700; font-size:1.2rem;">pill ${med.name}</div>
                        <div style="color:#6B5744; font-size:1rem;">⏰ ${med.time} · ${med.repeat || '매일'}</div>
                    </div>
                    ${taken
                        ? `<span class="care-med-done">✅ ${t('care.taken','복용완료')}</span>`
                        : `<button onclick="CARE.confirmMedication('${d.id}')" class="care-btn care-btn-med">pill ${t('care.take','복용확인')}</button>`
                    }
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddMedication() {
        const name = await showPromptModal(t('care.add_med','약 추가'), t('care.med_name_prompt','약 이름을 입력하세요'), '');
        if (!name) return;
        const time = await showPromptModal(t('care.med_time','복용 시간'), t('care.time_prompt','시간을 입력하세요 (예: 08:00)'), '08:00');
        if (!time) return;

        try {
            await db.collection('care_groups').doc(careGroupId).collection('medications').add({
                name: name,
                time: time,
                repeat: '매일',
                takenDates: [],
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.med_added','약이 등록되었습니다 pill'));
            loadMedications();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function confirmMedication(medId) {
        const today = new Date().toISOString().split('T')[0];
        try {
            await db.collection('care_groups').doc(careGroupId).collection('medications').doc(medId).update({
                takenDates: firebase.firestore.FieldValue.arrayUnion(today)
            });

            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            for (const m of careGroup.members) {
                if (m.role === 'guardian' && m.uid !== currentUser.uid) {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_medication',
                        message: `pill ${nickname}님이 약을 복용했습니다`,
                        read: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            showToast(t('care.med_confirmed','복용 확인! pill✅'));
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
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('health_logs').orderBy('createdAt', 'desc').limit(5).get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#6B5744; font-size:1.1rem; text-align:center;">${t('care.no_health','기록이 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const h = d.data();
                const date = h.createdAt ? new Date(h.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
                const items = [];
                if (h.bloodPressure) items.push(`🩸 혈압: ${h.bloodPressure}`);
                if (h.temperature) items.push(`🌡️ 체온: ${h.temperature}°C`);
                if (h.bloodSugar) items.push(`💉 혈당: ${h.bloodSugar}`);
                if (h.weight) items.push(`⚖️ 체중: ${h.weight}kg`);
                return `<div class="care-health-card">
                    <div style="font-weight:700;">${h.recorderName || ''} · ${date}</div>
                    <div style="margin-top:0.5rem; font-size:1.1rem;">${items.join(' &nbsp;|&nbsp; ')}</div>
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddHealthLog() {
        const bp = await showPromptModal('🩸 혈압', '혈압을 입력하세요 (예: 120/80, 없으면 빈칸)', '');
        const temp = await showPromptModal('🌡️ 체온', '체온을 입력하세요 (예: 36.5, 없으면 빈칸)', '');
        const sugar = await showPromptModal('💉 혈당', '혈당을 입력하세요 (없으면 빈칸)', '');
        const weight = await showPromptModal('⚖️ 체중', '체중을 입력하세요 (kg, 없으면 빈칸)', '');

        if (!bp && !temp && !sugar && !weight) {
            showToast(t('care.no_data','입력된 데이터가 없습니다'), 'error');
            return;
        }

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('health_logs').add({
                bloodPressure: bp || null,
                temperature: temp ? parseFloat(temp) : null,
                bloodSugar: sugar || null,
                weight: weight ? parseFloat(weight) : null,
                recorderId: currentUser.uid,
                recorderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.health_saved','건강 기록이 저장되었습니다 heart'));
            loadHealthLogs();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
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
                <div class="sos-countdown-title">${t('care.sos_countdown_title','SOS 긴급 호출')}</div>
                <div class="sos-countdown-number" id="sos-countdown-num">${count}</div>
                <div class="sos-countdown-desc">${t('care.sos_countdown_desc','초 후 발송됩니다')}</div>
                <button onclick="CARE.cancelSOSCountdown()" class="sos-countdown-cancel">
                    ✕ ${t('care.sos_cancel','취소')}
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
        showToast(t('care.sos_cancelled','SOS가 취소되었습니다'));
    }

    // --- Main SOS execution ---
    async function executeSOSSequence() {
        sosActive = true;
        sosStartTime = new Date();

        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

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

        // 4) Save SOS record to Firestore
        try {
            const alertRef = await db.collection('care_groups').doc(careGroupId).collection('sos_alerts').add({
                senderId: currentUser.uid,
                senderName: nickname,
                location: location,
                status: 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            sosAlertId = alertRef.id;

            // Also save initial location
            if (location) {
                await alertRef.collection('locations').add({
                    lat: location.lat,
                    lng: location.lng,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch(e) {
            console.error('SOS save error:', e);
        }

        // 5) Notify all guardians + messenger auto-message
        const locationStr = location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : t('care.location_unavailable','위치 확인 불가');
        for (const m of careGroup.members) {
            if (m.uid !== currentUser.uid) {
                try {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_sos',
                        message: `sos 긴급! ${nickname}님이 SOS를 호출했습니다! (위치: ${locationStr})`,
                        read: false,
                        priority: 'urgent',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch(e) { console.error(e); }
            }
        }

        // Auto-message via messenger
        try {
            await db.collection('care_groups').doc(careGroupId).collection('messages').add({
                text: `sos ${nickname}${t('care.sos_auto_msg','님이 긴급 호출을 보냈습니다!')} ${t('care.sos_location','위치')}: ${locationStr}`,
                senderId: currentUser.uid,
                senderName: 'sos SOS',
                type: 'sos',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch(e) { console.error(e); }

        // 6) Notify neighbors
        let neighborCount = 0;
        try {
            neighborCount = await notifyNeighbors(location, nickname);
        } catch(e) { console.error('Neighbor notify error:', e); }

        // 7) Start real-time location sharing (30 min)
        startLocationSharing();

        // 8) Load emergency contacts
        let emergencyContacts = [];
        try {
            const ecSnap = await db.collection('care_groups').doc(careGroupId)
                .collection('emergency_contacts').get();
            emergencyContacts = ecSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
            const storageRef = firebase.storage().ref();
            const ts = Date.now();
            const path = `sos_recordings/${currentUser.uid}/${ts}.webm`;
            const fileRef = storageRef.child(path);
            await fileRef.put(blob);
            const url = await fileRef.getDownloadURL();

            // Update SOS alert with recording URL
            if (sosAlertId && careGroupId) {
                await db.collection('care_groups').doc(careGroupId)
                    .collection('sos_alerts').doc(sosAlertId)
                    .update({ recordingUrl: url, recordingPath: path });
            }
            console.log('Recording uploaded:', path);
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
                    await db.collection('care_groups').doc(careGroupId)
                        .collection('sos_alerts').doc(sosAlertId)
                        .collection('locations').add({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
            if (el) el.textContent = `${sosLocationMinutesLeft}${t('care.minutes_left','분 남음')}`;
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

    // --- Neighbor Network ---
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    async function notifyNeighbors(location, senderName) {
        if (!location || !careGroupId) return 0;
        let count = 0;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('neighbors').get();
            const radiusKm = 1; // default 1km

            for (const doc of snap.docs) {
                const neighbor = doc.data();
                if (neighbor.lat && neighbor.lng) {
                    const dist = haversineDistance(location.lat, location.lng, neighbor.lat, neighbor.lng);
                    if (dist <= radiusKm && neighbor.uid) {
                        await db.collection('notifications').add({
                            userId: neighbor.uid,
                            type: 'care_sos_neighbor',
                            message: `sos 이웃 ${senderName}님이 긴급 호출을 보냈습니다! (${dist.toFixed(1)}km)`,
                            read: false,
                            priority: 'urgent',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        count++;
                    }
                }
            }
        } catch(e) { console.error(e); }
        return count;
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
                        <strong>hospital ${ec.hospitalName || ec.name || t('care.hospital','병원')}</strong>
                        ${ec.doctorName ? `<div style="font-size:0.9rem; color:#6B5744;">👨‍⚕️ ${ec.doctorName}</div>` : ''}
                        ${ec.address ? `<div style="font-size:0.85rem; color:#6B5744;">📍 ${ec.address}</div>` : ''}
                    </div>
                    <a href="tel:${ec.phone}" class="sos-call-btn">📞 ${ec.phone}</a>
                </div>
            `).join('');
        } else {
            ecHtml = `<p style="color:#6B5744; font-size:0.95rem;">${t('care.no_emergency_contacts','등록된 응급연락처가 없습니다')}</p>`;
        }

        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="sos-active-card">
                <div class="sos-active-header">
                    <div class="sos-active-icon">sos</div>
                    <div>
                        <div class="sos-active-title">${t('care.sos_complete_title','SOS 긴급 호출 완료')}</div>
                        <div class="sos-active-time">${timeStr} ${t('care.sos_sent_at','발송됨')}</div>
                    </div>
                </div>

                <!-- Location -->
                <div class="sos-section">
                    <div class="sos-location-status">
                        📍 ${t('care.location_sharing','위치 공유 중...')} (<span id="sos-location-timer">${sosLocationMinutesLeft}${t('care.minutes_left','분 남음')}</span>)
                    </div>
                    <div style="font-size:1rem; color:#6B5744; margin-top:0.3rem;">
                        ${t('care.latitude','위도')}: <span id="sos-lat">${lat}</span> &nbsp; ${t('care.longitude','경도')}: <span id="sos-lng">${lng}</span>
                    </div>
                    <a id="sos-map-link" href="${mapsUrl}" target="_blank" class="sos-map-btn">🗺️ ${t('care.view_map','지도 보기')}</a>
                </div>

                <!-- 119 / 112 -->
                <div class="sos-emergency-btns">
                    <a href="tel:119" class="sos-emergency-btn sos-119">
                        🚑 119<br><span>${t('care.emergency_call','응급신고')}</span>
                    </a>
                    <a href="tel:112" class="sos-emergency-btn sos-112">
                        🚔 112<br><span>${t('care.police_call','경찰신고')}</span>
                    </a>
                </div>

                <!-- Emergency Contacts -->
                <div class="sos-section">
                    <h4 style="margin:0 0 0.5rem;">hospital ${t('care.emergency_contacts','담당 병원/의사')}</h4>
                    ${ecHtml}
                </div>

                <!-- Status -->
                <div class="sos-section sos-status-list">
                    <div>✅ ${t('care.guardians_notified','보호자')} ${guardianCount}${t('care.people_notified','명에게 알림 완료')}</div>
                    <div>✅ ${t('care.neighbors_notified','이웃')} ${neighborCount}${t('care.people_notified','명에게 알림 완료')}</div>
                    <div id="sos-recording-status">🎙️ ${t('care.recording','녹음 중...')} (30${t('care.seconds_left','초 남음')})</div>
                </div>

                <!-- Cancel SOS -->
                <button onclick="CARE.deactivateSOS()" class="sos-deactivate-btn">
                    🟢 ${t('care.sos_deactivate','SOS 해제')}
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
                recEl.textContent = `🎙️ ${t('care.recording','녹음 중...')} (${recSec}${t('care.seconds_left','초 남음')})`;
            } else if (recEl) {
                recEl.textContent = `🎙️ ${t('care.recording_done','녹음 완료 ✅')}`;
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

        // Update Firestore status
        if (sosAlertId && careGroupId) {
            try {
                await db.collection('care_groups').doc(careGroupId)
                    .collection('sos_alerts').doc(sosAlertId)
                    .update({ status: 'resolved', resolvedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } catch(e) { console.error(e); }
        }

        sosAlertId = null;
        sosStartTime = null;

        // Hide panel, show button
        const panel = document.getElementById('sos-active-panel');
        if (panel) panel.style.display = 'none';
        const mainBtn = document.getElementById('care-sos-main-btn');
        if (mainBtn) mainBtn.style.display = '';

        showToast(t('care.sos_deactivated','SOS가 해제되었습니다 🟢'));
    }

    // ========== EMERGENCY CONTACTS MANAGEMENT ==========
    async function showEmergencyContacts() {
        if (!careGroupId) return;

        let contacts = [];
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('emergency_contacts').get();
            contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.error(e); }

        // Build modal content
        let listHtml = contacts.length ? contacts.map(c => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem; background:#f9f9f9; border-radius:10px; margin-bottom:0.5rem;">
                <div>
                    <strong>hospital ${c.hospitalName || ''}</strong>
                    ${c.doctorName ? `<span style="color:#6B5744;"> · 👨‍⚕️ ${c.doctorName}</span>` : ''}
                    <div style="font-size:0.85rem; color:#6B5744;">${c.phone || ''} · ${c.address || ''}</div>
                </div>
                <button onclick="CARE.deleteEmergencyContact('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">🗑️</button>
            </div>
        `).join('') : `<p style="color:#6B5744;">${t('care.no_emergency_contacts','등록된 연락처가 없습니다')}</p>`;

        // Use prompt-style modal (simple approach)
        const hospitalName = await showPromptModal(
            `hospital ${t('care.emergency_contacts','응급 연락처 관리')}`,
            `${t('care.add_hospital','새 병원/의사 추가 — 병원명 입력 (빈칸이면 목록만 표시)')}\n\n현재 등록: ${contacts.length}건`,
            ''
        );
        if (!hospitalName) return; // just viewing

        const phone = await showPromptModal(t('care.phone','전화번호'), t('care.phone_prompt','전화번호를 입력하세요'), '');
        const doctorName = await showPromptModal(t('care.doctor','담당의'), t('care.doctor_prompt','담당 의사명 (선택)'), '');
        const address = await showPromptModal(t('care.address','주소'), t('care.address_prompt','병원 주소 (선택)'), '');

        if (!phone) { showToast(t('care.phone_required','전화번호는 필수입니다'), 'error'); return; }

        try {
            await db.collection('care_groups').doc(careGroupId).collection('emergency_contacts').add({
                hospitalName, phone, doctorName: doctorName || '', address: address || '',
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.ec_added','응급 연락처가 추가되었습니다 hospital'));
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function deleteEmergencyContact(id) {
        if (!confirm(t('care.delete_confirm','삭제하시겠습니까?'))) return;
        try {
            await db.collection('care_groups').doc(careGroupId).collection('emergency_contacts').doc(id).delete();
            showToast(t('common.delete','삭제됨'));
        } catch(e) { console.error(e); }
    }

    // ========== NEIGHBOR SETTINGS ==========
    async function showNeighborSettings() {
        if (!careGroupId) return;

        const email = await showPromptModal(
            `home ${t('care.neighbors','이웃 돌봄 네트워크')}`,
            t('care.neighbor_email_prompt','이웃의 이메일을 입력하세요 (빈칸이면 취소)'),
            ''
        );
        if (!email) return;

        try {
            const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
            if (userSnap.empty) {
                showToast(t('care.user_not_found','사용자를 찾을 수 없습니다'), 'error');
                return;
            }
            const neighborUser = userSnap.docs[0];
            const neighborData = neighborUser.data();

            // Get neighbor's location (prompt for manual input)
            const latStr = await showPromptModal(t('care.neighbor_lat','이웃 위도'), t('care.neighbor_lat_prompt','위도 입력 (예: 37.5665)'), '');
            const lngStr = await showPromptModal(t('care.neighbor_lng','이웃 경도'), t('care.neighbor_lng_prompt','경도 입력 (예: 126.9780)'), '');

            await db.collection('care_groups').doc(careGroupId).collection('neighbors').add({
                uid: neighborUser.id,
                email: email,
                name: neighborData.nickname || email,
                lat: latStr ? parseFloat(latStr) : null,
                lng: lngStr ? parseFloat(lngStr) : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast(t('care.neighbor_added','이웃이 등록되었습니다 home'));
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
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
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('photos').orderBy('createdAt', 'desc').limit(20).get();

            slideshowPhotos = snap.docs.map(d => d.data());
            renderSlideshow();
        } catch(e) {
            console.error(e);
        }
    }

    function renderSlideshow() {
        const el = document.getElementById('care-slideshow');
        if (!el) return;
        if (slideshowPhotos.length === 0) {
            el.innerHTML = `<p style="color:#6B5744; text-align:center; padding:2rem;">${t('care.no_photos','아직 사진이 없습니다 camera')}</p>`;
            return;
        }
        const photo = slideshowPhotos[slideshowIndex % slideshowPhotos.length];
        el.innerHTML = `
            <div class="care-photo-frame">
                <img src="${photo.url}" alt="${photo.caption || ''}" style="width:100%; max-height:400px; object-fit:cover; border-radius:12px;">
                ${photo.caption ? `<p style="text-align:center; margin-top:0.5rem; font-size:1.1rem; color:#6B5744;">${photo.caption}</p>` : ''}
            </div>
            ${slideshowPhotos.length > 1 ? `<div style="text-align:center; margin-top:0.5rem;">
                <button onclick="CARE.prevPhoto()" class="care-btn care-btn-small">◀</button>
                <span style="margin:0 1rem; color:#6B5744;">${(slideshowIndex % slideshowPhotos.length) + 1} / ${slideshowPhotos.length}</span>
                <button onclick="CARE.nextPhoto()" class="care-btn care-btn-small">▶</button>
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
                    const caption = await showPromptModal('camera 사진 설명', '사진에 대한 설명을 입력하세요 (선택)', '');

                    await db.collection('care_groups').doc(careGroupId).collection('photos').add({
                        url: resized,
                        caption: caption || '',
                        uploaderId: currentUser.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    showToast(t('care.photo_uploaded','사진이 업로드되었습니다 camera'));
                    loadPhotos();
                } catch(e) {
                    console.error(e);
                    showToast(t('common.error','오류'), 'error');
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
                    <button onclick="CARE.exitSmartBoard()" class="care-board-exit">✕</button>
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
            const days = ['일','월','화','수','목','금','토'];
            dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
        }
    }

    async function loadBoardMessages() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-messages');
        if (!el) return;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('messages').orderBy('createdAt','desc').limit(3).get();
            el.innerHTML = snap.docs.map(d => {
                const m = d.data();
                return `<div class="care-board-msg">${m.senderName}: ${m.text}</div>`;
            }).join('');
        } catch(e) { console.warn("[catch]", e); }
    }

    async function loadBoardSchedule() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-schedule');
        if (!el) return;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('schedules').orderBy('time','asc').get();
            el.innerHTML = snap.docs.map(d => {
                const s = d.data();
                return `<div class="care-board-sched">${s.time} ${s.icon || '📌'} ${s.title}</div>`;
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
