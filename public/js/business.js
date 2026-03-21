// business.js v2.0 — 완전 기능 비즈니스 + 펀드레이즈 페이지
(function() {
    'use strict';

    // ===== BUSINESS REGISTRATION =====
    window.registerBusiness = async function() {
        if (!currentUser) {
            showToast(t('business.login_required', 'Login required'), 'warning');
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
            showToast(t('business.fill_required', 'Please fill in all required fields'), 'warning');
            return;
        }

        if (description.length > 500) {
            showToast(t('business.desc_too_long', 'Description must be 500 characters or less'), 'warning');
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
            
            showToast(t('business.registered', 'Business registered. It will be public after approval.'), 'success');
            
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
            showToast(t('business.register_error', 'Registration error: ') + error.message, 'error');
        }
    };

    // ===== BUSINESS LIST =====
    window.loadBusinesses = async function() {
        const list = document.getElementById('business-list');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">' + t('business.loading', 'Loading...') + '</p>';

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
                        <p style="font-size:1rem;margin-bottom:0.5rem;">${t('business.no_approved', 'No approved businesses')}</p>
                        <p style="font-size:0.8rem;">${t('business.register_and_wait', 'Register a business and wait for approval')}</p>
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
                            <strong style="display:block;font-size:1rem;">${d.name || t('business.business', 'Business')}</strong>
                            <p style="font-size:0.8rem;color:var(--accent);margin:0.2rem 0;">${d.category || ''} · ${d.country || ''}</p>
                            <p style="font-size:0.75rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.description || ''}</p>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            ${d.investmentGoal ? `<p style="font-size:0.7rem;color:var(--accent);">${t('business.goal', 'Goal')}</p><strong style="font-size:0.9rem;">${Number(d.investmentGoal).toLocaleString()} CRTD</strong>` : ''}
                        </div>
                    </div>
                    ${d.investmentGoal && d.investmentCurrent !== undefined ? `
                    <div style="margin-top:0.8rem;background:var(--bg,#0a0a1a);border-radius:4px;height:6px;overflow:hidden;">
                        <div style="height:100%;background:var(--gold,#8B6914);width:${Math.min(100, (d.investmentCurrent/d.investmentGoal)*100)}%;border-radius:4px;"></div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">${Math.round((d.investmentCurrent/d.investmentGoal)*100)}% ${t('business.achieved', 'achieved')}</p>` : ''}`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[business] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">${t('business.load_failed', 'Load failed')}: ${e.message}</p>`;
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
                    ${d.name || t('business.business', 'Business')}
                </h3>
                <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                    <span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border:1px solid var(--border);border-radius:10px;">${d.category || ''}</span>
                    <span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border:1px solid var(--border);border-radius:10px;">${d.country || ''}</span>
                </div>
                <p style="font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;white-space:pre-wrap;">${d.description || ''}</p>
                
                ${d.website ? `<p style="margin-bottom:1rem;"><strong>${t('business.website', 'Website')}:</strong> <a href="${d.website}" target="_blank" style="color:var(--gold);">${d.website}</a></p>` : ''}
                <p style="margin-bottom:1.5rem;"><strong>${t('business.contact', 'Contact')}:</strong> ${d.contactEmail || ''}</p>
                
                ${d.investmentGoal ? `
                <div style="background:#F7F3ED;border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <p style="font-size:0.8rem;color:var(--accent);margin-bottom:0.5rem;">${t('business.investment_progress', 'Investment Progress')}</p>
                    <div style="background:#E8E0D8;border-radius:6px;height:10px;overflow:hidden;margin-bottom:0.5rem;">
                        <div style="height:100%;background:${progress >= 100 ? '#5A9A6E' : 'var(--gold,#8B6914)'};width:${progress}%;border-radius:6px;"></div>
                    </div>
                    <p style="font-size:0.85rem;margin-bottom:0.5rem;">
                        <strong>${(d.investmentCurrent||0).toLocaleString()}</strong> / ${(d.investmentGoal||0).toLocaleString()} CRTD (${progress}%)
                    </p>
                    <button onclick="investInBusiness('${businessId}', '${d.name}')" class="btn-primary" style="width:100%;padding:0.8rem;margin-bottom:0.5rem;">
                        <i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${t('business.invest', 'Invest')}
                    </button>
                </div>` : ''}
                
                <button onclick="showBusinessQA('${businessId}', '${d.name}')" style="width:100%;padding:0.8rem;margin-bottom:0.5rem;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;cursor:pointer;">
                    <i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${t('business.view_qa', 'View Q&A')}
                </button>
            </div>
            <button onclick="document.getElementById('business-detail-modal').style.display='none'" style="width:100%;padding:0.6rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">${t('common.close', 'Close')}</button>`;
        
        modal.style.display = 'flex';
    };

    // ===== INVESTMENT SYSTEM =====
    window.investInBusiness = async function(businessId, businessName) {
        if (!currentUser) {
            showToast(t('business.login_required', 'Login required'), 'warning');
            return;
        }

        const amount = prompt(t('business.invest_prompt', 'Enter CRTD amount to invest in ') + businessName + ':');
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            showToast(t('business.invalid_amount', 'Please enter a valid amount'), 'warning');
            return;
        }

        // TODO: 실제 지갑 연동 및 CRTD 잔액 확인
        // 현재는 시뮬레이션
        try {
            const businessRef = db.collection('businesses').doc(businessId);
            const businessDoc = await businessRef.get();
            if (!businessDoc.exists) {
                showToast(t('business.not_found', 'Business not found'), 'error');
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

            showToast(`${Number(amount).toLocaleString()} CRTD ${t('business.invest_complete', 'investment complete!')}`, 'success');
            
            // 모달 닫고 목록 새로고침
            document.getElementById('business-detail-modal').style.display = 'none';
            loadBusinesses();
            
        } catch (error) {
            console.error('[business] Investment error:', error);
            showToast(t('business.invest_error', 'Investment error: ') + error.message, 'error');
        }
    };

    // ===== Q&A SYSTEM =====
    window.showBusinessQA = async function(businessId, businessName) {
        const modal = document.getElementById('business-qa-modal');
        const content = document.getElementById('business-qa-content');
        if (!modal || !content) return;

        content.innerHTML = '<p style="text-align:center;padding:2rem;">' + t('business.loading', 'Loading...') + '</p>';
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
                        <p>${t('business.no_questions', 'No questions yet')}</p>
                        <p style="font-size:0.8rem;">${t('business.be_first_question', 'Be the first to ask!')}</p>
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
                                        ${t('business.answered_on', 'Answered')}: ${q.answeredAt?.toDate?.()?.toLocaleDateString() || ''}
                                    </div>
                                </div>
                            ` : `
                                <p style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">${t('business.awaiting_answer', 'Awaiting answer...')}</p>
                            `}
                            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;">
                                ${t('business.asked_on', 'Asked')}: ${q.createdAt?.toDate?.()?.toLocaleDateString() || ''}
                            </div>
                        </div>`;
                });
            }

            content.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <h3 style="margin-bottom:1rem;">${businessName} - Q&A</h3>
                    ${currentUser ? `
                        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
                            <textarea id="new-question" placeholder="${t('business.question_placeholder', 'Ask your question...')}" rows="3" 
                                style="width:100%;padding:0.8rem;border:1px solid var(--border);border-radius:6px;resize:vertical;margin-bottom:0.5rem;"></textarea>
                            <button onclick="askBusinessQuestion('${businessId}')" class="btn-primary" style="width:100%;padding:0.6rem;">
                                <i data-lucide="send" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${t('business.ask_question', 'Ask')}
                            </button>
                        </div>
                    ` : `<p style="text-align:center;color:var(--accent);margin-bottom:1rem;">${t('business.login_to_ask', 'Login required to ask questions')}</p>`}
                </div>
                <div style="max-height:400px;overflow-y:auto;">
                    ${questionsHTML}
                </div>
                <button onclick="document.getElementById('business-qa-modal').style.display='none'"
                    style="width:100%;padding:0.6rem;margin-top:1rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">${t('common.close', 'Close')}</button>`;
            
        } catch (error) {
            console.error('[business] Q&A load error:', error);
            content.innerHTML = `<p style="color:#e53935;text-align:center;">${t('business.qa_load_failed', 'Q&A load failed')}: ${error.message}</p>`;
        }
    };

    window.askBusinessQuestion = async function(businessId) {
        if (!currentUser) {
            showToast(t('business.login_required', 'Login required'), 'warning');
            return;
        }

        const questionInput = document.getElementById('new-question');
        const question = questionInput?.value?.trim();

        if (!question) {
            showToast(t('business.enter_question', 'Please enter a question'), 'warning');
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

            showToast(t('business.question_submitted', 'Question submitted'), 'success');
            questionInput.value = '';
            
            // Q&A 다시 로드
            const businessName = document.querySelector('#business-qa-content h3')?.textContent?.split(' - Q&A')[0] || '';
            showBusinessQA(businessId, businessName);
            
        } catch (error) {
            console.error('[business] Question submit error:', error);
            showToast(t('business.question_error', 'Question submit error: ') + error.message, 'error');
        }
    };

    window.answerBusinessQuestion = async function(questionId, businessId) {
        if (!currentUser) {
            showToast(t('business.login_required', 'Login required'), 'warning');
            return;
        }

        try {
            const businessDoc = await db.collection('businesses').doc(businessId).get();
            if (!businessDoc.exists || businessDoc.data().ownerId !== currentUser.uid) {
                showToast(t('business.no_answer_permission', 'You do not have permission to answer'), 'error');
                return;
            }

            const answer = prompt(t('business.enter_answer', 'Enter your answer:'));
            if (!answer?.trim()) return;

            await db.collection('business_questions').doc(questionId).update({
                answer: answer.trim(),
                answered: true,
                answeredAt: new Date()
            });

            showToast(t('business.answer_submitted', 'Answer submitted'), 'success');
            
        } catch (error) {
            console.error('[business] Answer error:', error);
            showToast(t('business.answer_error', 'Answer submit error: ') + error.message, 'error');
        }
    };

    // ===== FUNDRAISE =====
    window.loadCampaigns = async function() {
        const list = document.getElementById('fund-campaigns');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">' + t('business.loading', 'Loading...') + '</p>';

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
                        <p style="font-size:1rem;margin-bottom:0.5rem;">${t('business.no_campaigns', 'No active campaigns')}</p>
                        <p style="font-size:0.8rem;">${t('business.create_campaign', 'Create a new campaign!')}</p>
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
                        <strong style="display:block;font-size:0.95rem;margin-bottom:0.5rem;">${d.title || t('business.campaign', 'Campaign')}</strong>
                        <p style="font-size:0.8rem;color:var(--text-muted,#6B5744);margin-bottom:0.8rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${d.description || ''}</p>
                        <div style="background:var(--bg,#0a0a1a);border-radius:4px;height:8px;overflow:hidden;margin-bottom:0.5rem;">
                            <div style="height:100%;background:${progress >= 100 ? '#5A9A6E' : 'var(--gold,#8B6914)'};width:${progress}%;border-radius:4px;transition:width 0.3s;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.75rem;">
                            <span>${(d.raised || 0).toLocaleString()} / ${(d.goal || 0).toLocaleString()} CRTD</span>
                            <strong style="color:var(--gold,#8B6914);">${progress}%</strong>
                        </div>
                        ${d.supporters ? `<p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">👥 ${d.supporters} ${t('business.supporters', 'supporters')}</p>` : ''}
                    </div>`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[fundraise] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">${t('business.load_failed', 'Load failed')}: ${e.message}</p>`;
        }
    };

    window.showCampaignDetail = function(id, data) {
        const modal = document.getElementById('campaign-detail-modal');
        const content = document.getElementById('campaign-detail-content');
        if (!modal || !content) return;

        const progress = data.goal ? Math.min(100, Math.round((data.raised || 0) / data.goal * 100)) : 0;
        content.innerHTML = `
            ${data.imageURL ? `<img src="${data.imageURL}" style="width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
            <h3 style="margin-bottom:0.5rem;">${data.title || t('business.campaign', 'Campaign')}</h3>
            <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                ${data.category ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.category}</span>` : ''}
                ${data.country ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.country}</span>` : ''}
            </div>
            <p style="font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;white-space:pre-wrap;">${data.description || ''}</p>
            <div style="background:#F7F3ED;border-radius:6px;height:10px;overflow:hidden;margin-bottom:0.5rem;">
                <div style="height:100%;background:${progress >= 100 ? '#5A9A6E' : '#8B6914'};width:${progress}%;border-radius:6px;"></div>
            </div>
            <p style="font-size:0.85rem;margin-bottom:1rem;"><strong>${(data.raised||0).toLocaleString()}</strong> / ${(data.goal||0).toLocaleString()} CRTD (${progress}%)</p>
            <button onclick="donateToCampaign('${id}')" class="btn-primary" style="width:100%;padding:0.8rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('business.donate', 'Donate')}</button>
            <button onclick="document.getElementById('campaign-detail-modal').style.display='none'" style="width:100%;padding:0.6rem;margin-top:0.5rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">${t('common.close', 'Close')}</button>`;
        modal.style.display = 'flex';
    };

    window.donateToCampaign = async function(campaignId) {
        if (!currentUser) { showToast(t('business.login_required', 'Login required'), 'warning'); return; }
        showToast(t('business.donate_coming_soon', 'Donation feature coming soon'), 'info');
    };

})();
