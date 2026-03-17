// business.js v2.0 — 완전 기능 비즈니스 + 펀드레이즈 페이지
(function() {
    'use strict';

    // ===== BUSINESS REGISTRATION =====
    window.registerBusiness = async function() {
        if (!currentUser) {
            showToast('로그인이 필요합니다', 'warning');
            return;
        }

        const name = document.getElementById('biz-name')?.value?.trim();
        const description = document.getElementById('biz-desc')?.value?.trim();
        const category = document.getElementById('biz-category')?.value;
        const country = document.getElementById('biz-country')?.value?.trim();
        const website = document.getElementById('biz-website')?.value?.trim();
        const contactEmail = document.getElementById('biz-contact-email')?.value?.trim();
        const investmentGoal = document.getElementById('biz-investment-goal')?.value;

        if (!name || !description || !category || !country || !contactEmail) {
            showToast('필수 항목을 모두 입력해주세요', 'warning');
            return;
        }

        if (description.length > 500) {
            showToast('회사 설명은 500자 이내로 입력해주세요', 'warning');
            return;
        }

        try {
            const businessData = {
                name,
                description,
                category,
                country,
                website: website || null,
                contactEmail,
                investmentGoal: investmentGoal ? Number(investmentGoal) : 0,
                investmentCurrent: 0,
                images: [],
                ownerId: currentUser.uid,
                ownerEmail: currentUser.email,
                status: 'pending', // pending/approved/rejected
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // 이미지 업로드 처리 (선택사항)
            const imageFile = document.getElementById('biz-image')?.files[0];
            if (imageFile) {
                const fileName = `businesses/${currentUser.uid}/${Date.now()}_${imageFile.name}`;
                const imageRef = storage.ref(fileName);
                await imageRef.put(imageFile);
                const imageURL = await imageRef.getDownloadURL();
                businessData.images = [imageURL];
            }

            await db.collection('businesses').add(businessData);
            
            showToast('사업체가 등록되었습니다. 승인 후 공개됩니다.', 'success');
            
            // 폼 초기화
            document.getElementById('biz-name').value = '';
            document.getElementById('biz-desc').value = '';
            document.getElementById('biz-country').value = '';
            document.getElementById('biz-website').value = '';
            document.getElementById('biz-contact-email').value = '';
            document.getElementById('biz-investment-goal').value = '';
            if (document.getElementById('biz-image')) {
                document.getElementById('biz-image').value = '';
            }
            
            loadBusinesses(); // 목록 새로고침
            
        } catch (error) {
            console.error('[business] Registration error:', error);
            showToast('등록 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    };

    // ===== BUSINESS LIST =====
    window.loadBusinesses = async function() {
        const list = document.getElementById('business-list');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로딩 중...</p>';

        try {
            const snap = await db.collection('businesses')
                .where('status', '==', 'approved')
                .orderBy('createdAt', 'desc')
                .get();
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--accent);">
                        <div style="font-size:3rem;margin-bottom:1rem;">🏢</div>
                        <p style="font-size:1rem;margin-bottom:0.5rem;">승인된 사업체가 없습니다</p>
                        <p style="font-size:0.8rem;">사업체를 등록하고 승인을 기다려보세요</p>
                    </div>`;
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;padding:1.2rem;cursor:pointer;transition:transform 0.2s;';
                card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
                card.onmouseleave = () => card.style.transform = '';
                card.onclick = () => showBusinessDetail(doc.id, d);
                card.innerHTML = `
                    <div style="display:flex;gap:1rem;align-items:center;">
                        <div style="font-size:2.5rem;flex-shrink:0;">${d.emoji || '🏢'}</div>
                        <div style="flex:1;min-width:0;">
                            <strong style="display:block;font-size:1rem;">${d.name || '사업체'}</strong>
                            <p style="font-size:0.8rem;color:var(--accent);margin:0.2rem 0;">${d.category || ''} · ${d.country || ''}</p>
                            <p style="font-size:0.75rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.description || ''}</p>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            ${d.investmentGoal ? `<p style="font-size:0.7rem;color:var(--accent);">목표</p><strong style="font-size:0.9rem;">${Number(d.investmentGoal).toLocaleString()} CRTD</strong>` : ''}
                        </div>
                    </div>
                    ${d.investmentGoal && d.investmentCurrent !== undefined ? `
                    <div style="margin-top:0.8rem;background:var(--bg,#0a0a1a);border-radius:4px;height:6px;overflow:hidden;">
                        <div style="height:100%;background:var(--gold,#8B6914);width:${Math.min(100, (d.investmentCurrent/d.investmentGoal)*100)}%;border-radius:4px;"></div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">${Math.round((d.investmentCurrent/d.investmentGoal)*100)}% 달성</p>` : ''}`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[business] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">로드 실패: ${e.message}</p>`;
        }
    };

    // ===== BUSINESS DETAIL PAGE =====
    window.showBusinessDetail = async function(businessId, businessData) {
        const modal = document.getElementById('business-detail-modal');
        const content = document.getElementById('business-detail-content');
        if (!modal || !content) return;

        const d = businessData;
        const progress = d.investmentGoal && d.investmentCurrent !== undefined ? 
            Math.min(100, Math.round((d.investmentCurrent/d.investmentGoal)*100)) : 0;

        content.innerHTML = `
            <div style="margin-bottom:1.5rem;">
                ${d.images && d.images[0] ? `<img src="${d.images[0]}" style="width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
                <h3 style="margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
                    <span style="font-size:1.5rem;">${d.emoji || '🏢'}</span>
                    ${d.name || '사업체'}
                </h3>
                <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                    <span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border:1px solid var(--border);border-radius:10px;">${d.category || ''}</span>
                    <span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border:1px solid var(--border);border-radius:10px;">${d.country || ''}</span>
                </div>
                <p style="font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;white-space:pre-wrap;">${d.description || ''}</p>
                
                ${d.website ? `<p style="margin-bottom:1rem;"><strong>웹사이트:</strong> <a href="${d.website}" target="_blank" style="color:var(--gold);">${d.website}</a></p>` : ''}
                <p style="margin-bottom:1.5rem;"><strong>연락처:</strong> ${d.contactEmail || ''}</p>
                
                ${d.investmentGoal ? `
                <div style="background:#F7F3ED;border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <p style="font-size:0.8rem;color:var(--accent);margin-bottom:0.5rem;">투자 진행률</p>
                    <div style="background:#E8E0D8;border-radius:6px;height:10px;overflow:hidden;margin-bottom:0.5rem;">
                        <div style="height:100%;background:${progress >= 100 ? '#6B8F3C' : 'var(--gold,#8B6914)'};width:${progress}%;border-radius:6px;"></div>
                    </div>
                    <p style="font-size:0.85rem;margin-bottom:0.5rem;">
                        <strong>${(d.investmentCurrent||0).toLocaleString()}</strong> / ${(d.investmentGoal||0).toLocaleString()} CRTD (${progress}%)
                    </p>
                    <button onclick="investInBusiness('${businessId}', '${d.name}')" class="btn-primary" style="width:100%;padding:0.8rem;margin-bottom:0.5rem;">
                        <i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 투자하기
                    </button>
                </div>` : ''}
                
                <button onclick="showBusinessQA('${businessId}', '${d.name}')" style="width:100%;padding:0.8rem;margin-bottom:0.5rem;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;cursor:pointer;">
                    <i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Q&A 보기
                </button>
            </div>
            <button onclick="document.getElementById('business-detail-modal').style.display='none'" style="width:100%;padding:0.6rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">닫기</button>`;
        
        modal.style.display = 'flex';
    };

    // ===== INVESTMENT SYSTEM =====
    window.investInBusiness = async function(businessId, businessName) {
        if (!currentUser) { 
            showToast('로그인이 필요합니다', 'warning'); 
            return; 
        }

        const amount = prompt(`${businessName}에 투자할 CRTD 금액을 입력하세요:`);
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            showToast('올바른 금액을 입력해주세요', 'warning');
            return;
        }

        // TODO: 실제 지갑 연동 및 CRTD 잔액 확인
        // 현재는 시뮬레이션
        try {
            const businessRef = db.collection('businesses').doc(businessId);
            const businessDoc = await businessRef.get();
            if (!businessDoc.exists) {
                showToast('사업체를 찾을 수 없습니다', 'error');
                return;
            }

            const currentInvestment = businessDoc.data().investmentCurrent || 0;
            await businessRef.update({
                investmentCurrent: currentInvestment + Number(amount),
                updatedAt: new Date()
            });

            // 투자 기록 저장
            await db.collection('investments').add({
                businessId,
                businessName,
                investorUid: currentUser.uid,
                investorEmail: currentUser.email,
                amount: Number(amount),
                createdAt: new Date()
            });

            showToast(`${Number(amount).toLocaleString()} CRTD 투자가 완료되었습니다!`, 'success');
            
            // 모달 닫고 목록 새로고침
            document.getElementById('business-detail-modal').style.display = 'none';
            loadBusinesses();
            
        } catch (error) {
            console.error('[business] Investment error:', error);
            showToast('투자 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    };

    // ===== Q&A SYSTEM =====
    window.showBusinessQA = async function(businessId, businessName) {
        const modal = document.getElementById('business-qa-modal');
        const content = document.getElementById('business-qa-content');
        if (!modal || !content) return;

        content.innerHTML = '<p style="text-align:center;padding:2rem;">로딩 중...</p>';
        modal.style.display = 'flex';

        try {
            const questionsSnap = await db.collection('business_questions')
                .where('businessId', '==', businessId)
                .where('isPublic', '==', true)
                .orderBy('createdAt', 'desc')
                .get();

            let questionsHTML = '';
            if (questionsSnap.empty) {
                questionsHTML = `
                    <div style="text-align:center;padding:2rem;color:var(--accent);">
                        <div style="font-size:2rem;margin-bottom:1rem;">❓</div>
                        <p>아직 질문이 없습니다</p>
                        <p style="font-size:0.8rem;">첫 질문을 남겨보세요!</p>
                    </div>`;
            } else {
                questionsSnap.forEach(doc => {
                    const q = doc.data();
                    questionsHTML += `
                        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                                <strong style="font-size:0.9rem;">Q. ${q.question}</strong>
                                <span style="font-size:0.7rem;color:var(--accent);">${q.askerEmail}</span>
                            </div>
                            ${q.answered ? `
                                <div style="background:var(--bg);border-left:3px solid var(--gold);padding:0.5rem 1rem;margin-top:0.5rem;">
                                    <strong style="font-size:0.85rem;color:var(--gold);">A. </strong>
                                    <span style="font-size:0.85rem;">${q.answer}</span>
                                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">
                                        답변일: ${q.answeredAt?.toDate?.()?.toLocaleDateString() || ''}
                                    </div>
                                </div>
                            ` : `
                                <p style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">답변 대기 중...</p>
                            `}
                            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;">
                                질문일: ${q.createdAt?.toDate?.()?.toLocaleDateString() || ''}
                            </div>
                        </div>`;
                });
            }

            content.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <h3 style="margin-bottom:1rem;">${businessName} - Q&A</h3>
                    ${currentUser ? `
                        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
                            <textarea id="new-question" placeholder="궁금한 점을 질문해보세요..." rows="3" 
                                style="width:100%;padding:0.8rem;border:1px solid var(--border);border-radius:6px;resize:vertical;margin-bottom:0.5rem;"></textarea>
                            <button onclick="askBusinessQuestion('${businessId}')" class="btn-primary" style="width:100%;padding:0.6rem;">
                                <i data-lucide="send" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 질문하기
                            </button>
                        </div>
                    ` : `<p style="text-align:center;color:var(--accent);margin-bottom:1rem;">질문하려면 로그인이 필요합니다</p>`}
                </div>
                <div style="max-height:400px;overflow-y:auto;">
                    ${questionsHTML}
                </div>
                <button onclick="document.getElementById('business-qa-modal').style.display='none'" 
                    style="width:100%;padding:0.6rem;margin-top:1rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">닫기</button>`;
            
        } catch (error) {
            console.error('[business] Q&A load error:', error);
            content.innerHTML = `<p style="color:#e53935;text-align:center;">Q&A 로드 실패: ${error.message}</p>`;
        }
    };

    window.askBusinessQuestion = async function(businessId) {
        if (!currentUser) {
            showToast('로그인이 필요합니다', 'warning');
            return;
        }

        const questionInput = document.getElementById('new-question');
        const question = questionInput?.value?.trim();
        
        if (!question) {
            showToast('질문을 입력해주세요', 'warning');
            return;
        }

        try {
            await db.collection('business_questions').add({
                businessId,
                question,
                answer: null,
                askerUid: currentUser.uid,
                askerEmail: currentUser.email,
                answered: false,
                isPublic: true,
                createdAt: new Date(),
                answeredAt: null
            });

            showToast('질문이 등록되었습니다', 'success');
            questionInput.value = '';
            
            // Q&A 다시 로드
            const businessName = document.querySelector('#business-qa-content h3')?.textContent?.split(' - Q&A')[0] || '';
            showBusinessQA(businessId, businessName);
            
        } catch (error) {
            console.error('[business] Question submit error:', error);
            showToast('질문 등록 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    };

    window.answerBusinessQuestion = async function(questionId, businessId) {
        if (!currentUser) {
            showToast('로그인이 필요합니다', 'warning');
            return;
        }

        // 사업체 소유자인지 확인
        try {
            const businessDoc = await db.collection('businesses').doc(businessId).get();
            if (!businessDoc.exists || businessDoc.data().ownerId !== currentUser.uid) {
                showToast('답변 권한이 없습니다', 'error');
                return;
            }

            const answer = prompt('답변을 입력해주세요:');
            if (!answer?.trim()) return;

            await db.collection('business_questions').doc(questionId).update({
                answer: answer.trim(),
                answered: true,
                answeredAt: new Date()
            });

            showToast('답변이 등록되었습니다', 'success');
            
        } catch (error) {
            console.error('[business] Answer error:', error);
            showToast('답변 등록 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    };

    // ===== FUNDRAISE =====
    window.loadCampaigns = async function() {
        const list = document.getElementById('fund-campaigns');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로딩 중...</p>';

        const interestFilter = document.getElementById('fund-filter-interest')?.value || 'all';
        const countryFilter = document.getElementById('fund-filter-country')?.value || 'all';

        try {
            let query = db.collection('campaigns').orderBy('createdAt', 'desc');
            if (interestFilter !== 'all' && interestFilter !== 'best') {
                query = query.where('category', '==', interestFilter);
            }
            const snap = await query.limit(30).get();
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--accent);">
                        <div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="heart"></i></div>
                        <p style="font-size:1rem;margin-bottom:0.5rem;">진행 중인 캠페인이 없습니다</p>
                        <p style="font-size:0.8rem;">새 캠페인을 만들어보세요!</p>
                    </div>`;
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                if (countryFilter !== 'all' && d.country !== countryFilter) return;

                const progress = d.goal ? Math.min(100, Math.round((d.raised || 0) / d.goal * 100)) : 0;
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform 0.2s;';
                card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
                card.onmouseleave = () => card.style.transform = '';
                card.onclick = () => showCampaignDetail(doc.id, d);
                card.innerHTML = `
                    ${d.imageURL ? `<img src="${d.imageURL}" style="width:100%;height:180px;object-fit:cover;">` : `<div style="height:120px;background:linear-gradient(135deg,#3D2B1F,#6B5744);display:flex;align-items:center;justify-content:center;font-size:3rem;">${d.emoji || '<i data-lucide="heart"></i>'}</div>`}
                    <div style="padding:1rem;">
                        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                            ${d.category ? `<span style="font-size:0.65rem;padding:0.15rem 0.5rem;background:var(--bg);border-radius:10px;">${d.category}</span>` : ''}
                            ${d.country ? `<span style="font-size:0.65rem;padding:0.15rem 0.5rem;background:var(--bg);border-radius:10px;">${d.country}</span>` : ''}
                        </div>
                        <strong style="display:block;font-size:0.95rem;margin-bottom:0.5rem;">${d.title || '캠페인'}</strong>
                        <p style="font-size:0.8rem;color:var(--text-muted,#6B5744);margin-bottom:0.8rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${d.description || ''}</p>
                        <div style="background:var(--bg,#0a0a1a);border-radius:4px;height:8px;overflow:hidden;margin-bottom:0.5rem;">
                            <div style="height:100%;background:${progress >= 100 ? '#6B8F3C' : 'var(--gold,#8B6914)'};width:${progress}%;border-radius:4px;transition:width 0.3s;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.75rem;">
                            <span>${(d.raised || 0).toLocaleString()} / ${(d.goal || 0).toLocaleString()} CRTD</span>
                            <strong style="color:var(--gold,#8B6914);">${progress}%</strong>
                        </div>
                        ${d.supporters ? `<p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">👥 ${d.supporters}명 참여</p>` : ''}
                    </div>`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[fundraise] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">로드 실패: ${e.message}</p>`;
        }
    };

    window.showCampaignDetail = function(id, data) {
        const modal = document.getElementById('campaign-detail-modal');
        const content = document.getElementById('campaign-detail-content');
        if (!modal || !content) return;

        const progress = data.goal ? Math.min(100, Math.round((data.raised || 0) / data.goal * 100)) : 0;
        content.innerHTML = `
            ${data.imageURL ? `<img src="${data.imageURL}" style="width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
            <h3 style="margin-bottom:0.5rem;">${data.title || '캠페인'}</h3>
            <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                ${data.category ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.category}</span>` : ''}
                ${data.country ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.country}</span>` : ''}
            </div>
            <p style="font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;white-space:pre-wrap;">${data.description || ''}</p>
            <div style="background:#F7F3ED;border-radius:6px;height:10px;overflow:hidden;margin-bottom:0.5rem;">
                <div style="height:100%;background:${progress >= 100 ? '#6B8F3C' : '#8B6914'};width:${progress}%;border-radius:6px;"></div>
            </div>
            <p style="font-size:0.85rem;margin-bottom:1rem;"><strong>${(data.raised||0).toLocaleString()}</strong> / ${(data.goal||0).toLocaleString()} CRTD (${progress}%)</p>
            <button onclick="donateToCampaign('${id}')" class="btn-primary" style="width:100%;padding:0.8rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 후원하기</button>
            <button onclick="document.getElementById('campaign-detail-modal').style.display='none'" style="width:100%;padding:0.6rem;margin-top:0.5rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">닫기</button>`;
        modal.style.display = 'flex';
    };

    window.donateToCampaign = async function(campaignId) {
        if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
        showToast('후원 기능 준비 중입니다', 'info');
    };

})();
