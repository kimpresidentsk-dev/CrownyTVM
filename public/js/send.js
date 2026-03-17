// ===== send.js - 토큰 전송 =====
// ========== SEND TOKENS ==========
let selectedToken = null;

function selectToken(tokenType) {
    selectedToken = tokenType;
    
    // Remove all selected classes
    document.querySelectorAll('.token-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class (safe check for element existence)
    const card = document.getElementById(`token-card-${tokenType}`);
    if (card) card.classList.add('selected');
    
    console.log('Selected token:', tokenType.toUpperCase());
}

async function showSendModal() {
    if (!selectedToken) {
        showToast(t('send.select_token', '전송할 토큰을 먼저 선택하세요'), 'warning');
        return;
    }
    
    // Off-chain tokens → 오프체인 전송 플로우
    if (isOffchainToken(selectedToken)) {
        showOffchainSendModal();
        return;
    }
    
    const tokenType = selectedToken.toUpperCase();
    const balance = userWallet.balances[selectedToken];
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    if (contacts.empty) {
        const email = await showPromptModal(t('send.recipient', '받는 사람'), t('send.recipient_email', '받는 사람 이메일'), '');
        if (!email) return;
        
        const amount = await showPromptModal(t('send.send_amount', '전송 수량'), `${email} ${t('send.send_to', '에게 전송할')} ${tokenType} ${t('offchain.amount_label', '수량')} (${t('wallet.balance_label', '잔액')}: ${balance})`, '');
        if (!amount) return;
        
        await sendTokensByEmail(email, parseFloat(amount), tokenType);
    } else {
        // Get wallet addresses for contacts
        let contactList = `${tokenType} ${t('send.transfer_select', '전송 - 받는 사람 선택')}:\n\n`;
        const contactsArray = [];
        
        for (const doc of contacts.docs) {
            const contact = doc.data();
            
            // Get user's wallet address
            const users = await db.collection('users').where('email', '==', contact.email).get();
            let walletAddr = '';
            if (!users.empty) {
                const userData = users.docs[0].data();
                if (userData.walletAddress) {
                    const addr = userData.walletAddress;
                    walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                }
            }
            
            contactsArray.push({...contact, walletAddr});
            contactList += `${contactsArray.length}. ${contact.name}\n`;
            contactList += `   ${contact.email}\n`;
            if (walletAddr) {
                contactList += `   ${t('wallet.wallet_label', '지갑')}: ${walletAddr}\n`;
            }
            contactList += `\n`;
        }
        
        contactList += `0. ${t('send.enter_directly', '직접 입력')}`;
        
        const choice = await showPromptModal(t('send.select_recipient', '받는 사람 선택'), contactList, '1');
        if (!choice) return;
        
        const choiceNum = parseInt(choice);
        let recipientEmail;
        
        if (choiceNum === 0) {
            recipientEmail = await showPromptModal(t('send.recipient', '받는 사람'), t('send.recipient_email', '받는 사람 이메일'), '');
        } else if (choiceNum > 0 && choiceNum <= contactsArray.length) {
            recipientEmail = contactsArray[choiceNum - 1].email;
        } else {
            showToast(t('send.invalid_choice', '잘못된 선택입니다'), 'error');
            return;
        }
        
        if (!recipientEmail) return;
        
        const amount = await showPromptModal(t('send.send_amount', '전송 수량'), `${recipientEmail} ${t('send.send_to', '에게 전송할')} ${tokenType} ${t('offchain.amount_label', '수량')} (${t('wallet.balance_label', '잔액')}: ${balance})`, '');
        if (!amount) return;
        
        await sendTokensByEmail(recipientEmail, parseFloat(amount), tokenType);
    }
}

async function sendTokensByEmail(recipientEmail, amount, tokenType = 'CRNY') {
    if (!userWallet) return;
    
    const tokenKey = tokenType.toLowerCase();
    const balance = userWallet.balances[tokenKey];
    
    if (amount <= 0 || amount > balance) {
        showToast(`${t('send.insufficient_or_invalid', '잔액이 부족하거나 잘못된 수량입니다')} (${t('wallet.balance_label', '잔액')}: ${balance} ${tokenType})`, 'error');
        return;
    }
    
    const users = await db.collection('users').where('email', '==', recipientEmail).get();
    
    if (users.empty) {
        showToast(t('send.user_not_found', '사용자를 찾을 수 없습니다'), 'error');
        return;
    }
    
    const recipientDoc = users.docs[0];
    const recipient = recipientDoc.data();
    
    try {
        // Check if Crowny wallet (gas subsidy) or external wallet
        if (userWallet.isImported) {
            showToast(t('send.external_gas_warning', '⚠️ 외부 지갑은 가스비가 차감됩니다. MATIC이 충분한지 확인하세요.'), 'warning');
            // TODO: Implement actual blockchain transfer with user's gas
            showToast(t('send.external_coming', '외부 지갑 전송은 곧 지원됩니다.'), 'info');
            return;
        }
        
        // Crowny wallet - Admin gas subsidy
        const gasEstimate = 0.001; // Estimated MATIC for transfer
        
        showToast(`⏳ ${t('send.requesting', '전송 요청 중...')} ${t('send.gas_subsidy', '가스비')} ${gasEstimate} MATIC ${t('send.gas_subsidy_admin', '관리자가 대납합니다.')}`, 'info');
        
        // Request admin-sponsored transfer
        await db.collection('transfer_requests').add({
            from: currentUser.uid,
            fromEmail: currentUser.email,
            fromAddress: userWallet.walletAddress,
            to: recipientDoc.id,
            toEmail: recipientEmail,
            toAddress: recipient.walletAddress,
            amount: amount,
            token: tokenType,
            estimatedGas: gasEstimate,
            status: 'pending',
            requestedAt: new Date()
        });
        
        showToast(`✅ ${t('send.request_success', '전송 요청 완료!')} ${amount} ${tokenType} ${t('send.transfer_label', '전송')} (${t('send.gas_subsidy', '가스비')} ${gasEstimate} MATIC ${t('send.gas_subsidy_short', '대납')})`, 'success');
        
        console.log('Transfer requested:', {
            from: currentUser.email,
            to: recipientEmail,
            amount: amount,
            token: tokenType,
            gas: gasEstimate
        });
        
    } catch (error) {
        console.error('❌ Transfer request error:', error);
        showToast(t('send.request_failed', '전송 요청 실패') + ': ' + error.message, 'error');
    }
}

