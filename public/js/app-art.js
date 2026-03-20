// ============================================================
// CROWNY ART MODULE — js/app-art.js v2.0
// Thirdweb NFT (ERC-721 / ERC-1155) + Firebase Storage Hybrid
// + Purchase System + Collection + Supply Limit + Artist Weight + Reservations
// ============================================================
//
// 로드 순서: config → ui → auth → wallet → offchain → social
//            → send → admin → marketplace → trading → ★ app-art
//
// 외부 의존성 (HANDOFF_TO_ART.md 참고):
//   currentUser, userWallet   ← config.js
//   db                        ← index.html (window.db)
//   loadUserWallet()          ← wallet.js
//   earnOffchainPoints()      ← offchain.js
//   distributeReferralReward()← social.js
//   window.tw5                ← index.html <script type="module">
//   firebase.storage()        ← Firebase Storage SDK
// ============================================================

const ART_VERSION = '2.0.0';

// ─── CONFIG ───
const ART_CONFIG = {
    thirdwebClientId: '26c044bdfa2f575538d00945419126bf',
    chainId: 137,
    chainSlug: 'polygon',
    contracts: {
        erc721: '',
        erc1155: ''
    },
    adminWallet: '0x24ed2F4babDceA75579CDD358c1b6Ea56D9Ac75E',
    defaultRoyaltyPercent: 10,
    maxImageSize: 1200,
    thumbnailSize: 400,
    storagePath: 'artworks',
    ipfsGateway: 'https://ipfs.io/ipfs/',
    donationMinCRFN: 10,
    platformFeePercent: 2.5
};

// ─── CATEGORIES ───
const ART_CATEGORIES = {
    painting:     t('art.cat.painting','<i data-lucide="paintbrush" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Painting'),
    digital:      t('art.cat.digital','<i data-lucide="monitor" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Digital Art'),
    photo:        t('art.cat.photo','📷 Photography'),
    sculpture:    t('art.cat.sculpture','🗿 Sculpture/Installation'),
    illustration: t('art.cat.illustration','✏️ Illustration'),
    calligraphy:  t('art.cat.calligraphy','🖋️ Calligraphy'),
    mixed:        t('art.cat.mixed','<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Mixed Media'),
    ai:           t('art.cat.ai','<i data-lucide="bot" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> AI Art'),
    music:        t('art.cat.music','<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Music/Sound'),
    video:        t('art.cat.video','🎬 Video Art'),
    generative:   t('art.cat.generative','🌀 Generative'),
    kpop:         t('art.cat.kpop','💜 K-Pop Goods'),
    other:        t('art.cat.other','🎨 Other')
};

// ─── MODULE STATE ───
let artModuleReady = false;
let tw5SDK = null;
let erc721Contract = null;
let erc1155Contract = null;
let storageSDK = null;
let firebaseStorage = null;

// ─── ARTIST WEIGHT CACHE ───
const _artistWeightCache = {};


// ============================================================
// 1. 초기화
// ============================================================

async function initArtModule() {
    console.log('🎨 [ART] Initializing v' + ART_VERSION);

    try {
        if (typeof firebase !== 'undefined' && firebase.storage) {
            firebaseStorage = firebase.storage();
            console.log('🎨 [ART] Firebase Storage ✅');
        } else {
            console.warn('🎨 [ART] Firebase Storage not loaded — Base64 fallback');
        }
    } catch (e) {
        console.warn('🎨 [ART] Firebase Storage init failed:', e.message);
    }

    try {
        if (window.tw5) {
            tw5SDK = window.tw5;
            if (ART_CONFIG.contracts.erc721) {
                erc721Contract = await tw5SDK.getContract(ART_CONFIG.contracts.erc721);
                console.log('🎨 [ART] ERC-721 ✅', ART_CONFIG.contracts.erc721);
            }
            if (ART_CONFIG.contracts.erc1155) {
                erc1155Contract = await tw5SDK.getContract(ART_CONFIG.contracts.erc1155);
                console.log('🎨 [ART] ERC-1155 ✅', ART_CONFIG.contracts.erc1155);
            }
            if (tw5SDK.storage) {
                storageSDK = tw5SDK.storage;
                console.log('🎨 [ART] IPFS Storage ✅');
            }
        } else {
            console.warn('🎨 [ART] Thirdweb SDK not ready — NFT features disabled');
        }
    } catch (e) {
        console.warn('🎨 [ART] Thirdweb init partial:', e.message);
    }

    artModuleReady = true;
    console.log('🎨 [ART] Module Ready ✅');
}

// Helper function to create Lucide icon HTML
function createLucideIcon(name, size = 14) {
    return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;"></i>`;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initArtModule, 1500));
} else {
    setTimeout(initArtModule, 1500);
}


// ============================================================
// 2. 이미지 업로드 — Firebase Storage + IPFS 하이브리드
// ============================================================

async function uploadToFirebaseStorage(file, artworkId) {
    if (!firebaseStorage) {
        const dataUrl = await _fileToDataUrl(file);
        const resized = await _resizeImageData(dataUrl, ART_CONFIG.maxImageSize);
        const thumb = await _resizeImageData(dataUrl, ART_CONFIG.thumbnailSize);
        return { firebaseUrl: resized, thumbnailUrl: thumb, isBase64: true };
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const path = `${ART_CONFIG.storagePath}/${artworkId || timestamp}`;
    const resizedBlob = await _resizeFileToBlob(file, ART_CONFIG.maxImageSize);
    const mainRef = firebaseStorage.ref(`${path}/main.${ext}`);
    await mainRef.put(resizedBlob, { contentType: file.type || 'image/jpeg' });
    const firebaseUrl = await mainRef.getDownloadURL();
    const thumbBlob = await _resizeFileToBlob(file, ART_CONFIG.thumbnailSize);
    const thumbRef = firebaseStorage.ref(`${path}/thumb.${ext}`);
    await thumbRef.put(thumbBlob, { contentType: file.type || 'image/jpeg' });
    const thumbnailUrl = await thumbRef.getDownloadURL();
    return { firebaseUrl, thumbnailUrl, isBase64: false };
}

async function uploadToIPFS(file) {
    if (!storageSDK) throw new Error('Thirdweb Storage 미초기화. NFT 민팅 불가.');
    const uri = await storageSDK.upload(file);
    return uri;
}

async function uploadMetadataToIPFS(metadata) {
    if (!storageSDK) throw new Error('Thirdweb Storage 미초기화');
    const uri = await storageSDK.upload(metadata);
    return uri;
}

function ipfsToHttp(ipfsUri) {
    if (!ipfsUri) return '';
    if (ipfsUri.startsWith('http')) return ipfsUri;
    return ipfsUri.replace('ipfs://', ART_CONFIG.ipfsGateway);
}


// ============================================================
// 3. 이미지 유틸리티
// ============================================================

function _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function _resizeImageData(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = dataUrl;
    });
}

function _resizeFileToBlob(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                    else { w = Math.round(w * maxSize / h); h = maxSize; }
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


// ============================================================
// 4. 아티스트 가중치 시스템
// ============================================================

async function _getArtistWeight(artistId) {
    if (!artistId) return 1.0;
    if (_artistWeightCache[artistId] && (Date.now() - _artistWeightCache[artistId]._ts < 60000)) {
        return _artistWeightCache[artistId].weight;
    }
    try {
        const doc = await db.collection('artist_profiles').doc(artistId).get();
        const w = doc.exists ? (doc.data().weightMultiplier || 1.0) : 1.0;
        _artistWeightCache[artistId] = { weight: w, _ts: Date.now() };
        return w;
    } catch (e) {
        console.warn('🎨 [Weight] fetch failed:', e.message);
        return 1.0;
    }
}

async function _recalculateArtistWeight(artistId) {
    if (!artistId) return;
    try {
        const ref = db.collection('artist_profiles').doc(artistId);
        const doc = await ref.get();
        if (!doc.exists) return;
        const data = doc.data();
        const totalSoldCount = data.totalSoldCount || data.totalSales || 0;
        const totalDonationContribution = data.totalDonationContribution || 0;
        let weight = 1.0 + (totalSoldCount * 0.05) + (totalDonationContribution * 0.01);
        weight = Math.max(1.0, Math.min(10.0, weight));
        weight = Math.round(weight * 100) / 100;
        await ref.update({ weightMultiplier: weight });
        _artistWeightCache[artistId] = { weight: weight, _ts: Date.now() };
        console.log(`🎨 [Weight] ${artistId} → ${weight}x`);
    } catch (e) {
        console.warn('🎨 [Weight] recalc failed:', e.message);
    }
}

function _calcEffectivePrice(basePrice, weight) {
    return Math.round((basePrice || 0) * (weight || 1.0) * 100) / 100;
}


// ============================================================
// 5. 작품 등록
// ============================================================

function toggleArtSaleOptions() {
    const type = document.getElementById('art-sale-type')?.value;
    const priceEl = document.getElementById('art-price-section');
    const auctionEl = document.getElementById('art-auction-section');
    if (priceEl) priceEl.style.display = (type === 'fixed') ? 'block' : 'none';
    if (auctionEl) auctionEl.style.display = (type === 'auction') ? 'block' : 'none';
}

function toggleNFTOptions() {
    const mintNFT = document.getElementById('art-mint-nft')?.checked;
    const nftOpts = document.getElementById('art-nft-options');
    if (nftOpts) nftOpts.style.display = mintNFT ? 'block' : 'none';
}

function updateBasePricePreview() {
    const basePriceEl = document.getElementById('art-base-price');
    const previewEl = document.getElementById('art-price-preview');
    if (!basePriceEl || !previewEl) return;
    const basePrice = parseFloat(basePriceEl.value) || 0;
    if (!currentUser || basePrice <= 0) {
        previewEl.textContent = '';
        return;
    }
    _getArtistWeight(currentUser.uid).then(w => {
        const effective = _calcEffectivePrice(basePrice, w);
        previewEl.textContent = `⭐ 가중치 ${w}x → 실제 판매가: ${effective} CRAC`;
    }).catch(() => {
        previewEl.textContent = '';
    });
}

async function uploadArtwork() {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }

    // Ensure Lucide icons are created
    if (window.lucide) setTimeout(() => lucide.createIcons(), 100);

    const title       = document.getElementById('art-title')?.value.trim();
    const description = document.getElementById('art-description')?.value.trim();
    const category    = document.getElementById('art-category')?.value;
    const saleType    = document.getElementById('art-sale-type')?.value;
    const imageFile   = document.getElementById('art-image')?.files?.[0];
    const mintNFT     = document.getElementById('art-mint-nft')?.checked || false;
    const basePrice   = parseFloat(document.getElementById('art-base-price')?.value) || 0;
    const totalSupply = parseInt(document.getElementById('art-total-supply')?.value) || 0;

    if (!title)     { showToast(t('art.enter_title','Please enter a title'), 'warning'); return; }
    if (!imageFile) { showToast(t('art.select_image','Please select an image'), 'warning'); return; }

    const nftType       = document.getElementById('art-nft-type')?.value || 'erc721';
    const editionCount  = parseInt(document.getElementById('art-edition-count')?.value) || 1;
    const royaltyPercent = parseInt(document.getElementById('art-royalty')?.value) || ART_CONFIG.defaultRoyaltyPercent;

    const statusEl = document.getElementById('art-upload-status');
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    try {
        setStatus(t('art.uploading','⏳ Uploading image...'));
        const tempId = `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const { firebaseUrl, thumbnailUrl, isBase64 } = await uploadToFirebaseStorage(imageFile, tempId);
        setStatus(t('art.upload_done','✅ Image upload complete'));

        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const artistNickname = userDoc.exists ? (userDoc.data().nickname || '') : '';
        const artistWallet   = userDoc.exists ? (userDoc.data().polygonAddress || '') : '';

        // Get artist weight
        const artistWeight = await _getArtistWeight(currentUser.uid);
        const effectivePrice = _calcEffectivePrice(basePrice, artistWeight);

        const artwork = {
            title, description, category, saleType,
            artistId: currentUser.uid,
            artistEmail: currentUser.email,
            artistNickname, artistWallet,
            likes: 0, views: 0, status: 'active',
            createdAt: new Date(),
            imageUrl: firebaseUrl,
            thumbnailUrl: thumbnailUrl || firebaseUrl,
            isBase64: isBase64 || false,
            imageData: isBase64 ? firebaseUrl : thumbnailUrl,
            // v2.0: basePrice + weight system
            basePrice: basePrice,
            artistWeight: artistWeight,
            price: effectivePrice,
            priceToken: 'CRAC',
            // v2.0: supply system
            totalSupply: totalSupply > 0 ? totalSupply : 0,
            soldCount: 0,
            // NFT
            isNFT: false,
            nftTokenId: null, nftContract: null, nftType: null,
            ipfsImageUri: null, ipfsMetadataUri: null,
            editionCount: 1, editionsMinted: 0,
            royaltyPercent
        };

        // 판매 유형별
        if (saleType === 'auction') {
            artwork.startPrice = parseFloat(document.getElementById('art-start-price')?.value) || 1;
            artwork.currentBid = 0;
            artwork.highestBidder = null;
            const hours = parseInt(document.getElementById('art-auction-hours')?.value) || 24;
            artwork.auctionEnd = new Date(Date.now() + hours * 3600000);
        }

        setStatus(t('art.saving','💾 Saving artwork info...'));
        const artDocRef = await db.collection('artworks').add(artwork);
        const artworkId = artDocRef.id;

        // NFT 민팅
        if (mintNFT) {
            setStatus(t('art.minting','🔗 Preparing NFT minting...'));
            try {
                const nftResult = await mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent);
                await artDocRef.update({
                    isNFT: true,
                    nftTokenId: nftResult.tokenId,
                    nftContract: nftResult.contractAddress,
                    nftType,
                    ipfsImageUri: nftResult.ipfsImageUri,
                    ipfsMetadataUri: nftResult.ipfsMetadataUri,
                    editionCount: nftType === 'erc1155' ? editionCount : 1,
                    mintTxHash: nftResult.txHash || null
                });
                setStatus(t('art.mint_done','🎉 NFT minting complete!'));
            } catch (nftErr) {
                console.error('🎨 [NFT] Mint failed:', nftErr);
                setStatus('⚠️ 작품 등록됨 (NFT 민팅 실패: ' + nftErr.message + ')');
            }
        }

        await _updateArtistProfile(currentUser.uid, {
            totalWorks: firebase.firestore.FieldValue.increment(1),
            totalWorksCount: firebase.firestore.FieldValue.increment(1),
            lastUpload: new Date()
        });

        showToast(`🎨 "${title}" 등록 완료!${mintNFT ? ' (NFT ✅)' : ''}`, 'success');
        _resetArtForm();
        loadArtGallery();
        loadMyCollection('my-artworks');

    } catch (error) {
        console.error('🎨 [Upload] Error:', error);
        setStatus('❌ 등록 실패: ' + error.message);
        showToast('등록 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 6. NFT 민팅
// ============================================================

async function mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent) {
    if (!tw5SDK) throw new Error('Thirdweb SDK 미초기화');
    const contract = nftType === 'erc721' ? erc721Contract : erc1155Contract;
    if (!contract) throw new Error(`${nftType.toUpperCase()} 컨트랙트 미설정`);
    if (!window.ethereum) throw new Error('MetaMask가 필요합니다');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const walletAddress = accounts[0];
    const ipfsImageUri = await uploadToIPFS(imageFile);
    const metadata = {
        name: artwork.title,
        description: artwork.description || '',
        image: ipfsImageUri,
        external_url: `https://crowny.org/art/${artworkId}`,
        attributes: [
            { trait_type: 'Category', value: ART_CATEGORIES[artwork.category] || artwork.category },
            { trait_type: 'Artist', value: artwork.artistNickname || artwork.artistEmail },
            { trait_type: 'Platform', value: 'CROWNY' },
            { trait_type: 'Created', value: new Date().toISOString().split('T')[0] }
        ],
        properties: { artworkId, artistId: artwork.artistId, royaltyPercent, category: artwork.category, platform: 'CROWNY', chainId: ART_CONFIG.chainId }
    };
    const ipfsMetadataUri = await uploadMetadataToIPFS(metadata);
    let result;
    if (nftType === 'erc721') {
        result = await contract.erc721.mintTo(walletAddress, { name: artwork.title, description: artwork.description, image: ipfsImageUri, external_url: metadata.external_url, attributes: metadata.attributes });
    } else {
        result = await contract.erc1155.mintTo(walletAddress, { metadata: { name: artwork.title, description: artwork.description, image: ipfsImageUri, external_url: metadata.external_url, attributes: metadata.attributes }, supply: editionCount });
    }
    const tokenId = result.id?.toString() || result.tokenId?.toString() || '0';
    const txHash = result.receipt?.transactionHash || null;
    const contractAddress = nftType === 'erc721' ? ART_CONFIG.contracts.erc721 : ART_CONFIG.contracts.erc1155;
    await db.collection('nft_records').add({
        artworkId, tokenId: parseInt(tokenId), contractAddress, nftType,
        ownerWallet: walletAddress, ownerUserId: currentUser.uid,
        minterUserId: currentUser.uid, minterWallet: walletAddress,
        ipfsImageUri, ipfsMetadataUri, editionCount: nftType === 'erc1155' ? editionCount : 1,
        royaltyPercent, txHash, chainId: ART_CONFIG.chainId, mintedAt: new Date(), status: 'minted'
    });
    return { tokenId: parseInt(tokenId), contractAddress, ipfsImageUri, ipfsMetadataUri, txHash };
}

async function mintExistingArtwork(artworkId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    try {
        const artDoc = await db.collection('artworks').doc(artworkId).get();
        if (!artDoc.exists) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = artDoc.data();
        if (art.artistId !== currentUser.uid) { showToast(t('art.own_only','Only your own artwork can be minted as NFT'), 'warning'); return; }
        if (art.isNFT) { showToast(t('art.already_nft','Already minted as NFT'), 'info'); return; }

        const choice = await showPromptModal(t('art.nft_type','NFT Type'), 'NFT:\n1) ERC-721 (1/1)\n2) ERC-1155 (Edition)', '1');
        const type = choice === '2' ? 'erc1155' : 'erc721';
        let editionCount = 1;
        if (type === 'erc1155') {
            const edInput = await showPromptModal(t('art.edition_count','Edition Count'), t('art.enter_edition','Enter the edition count:'), '10');
            editionCount = parseInt(edInput) || 10;
        }

        let imageBlob;
        if (art.imageUrl && !art.isBase64) {
            imageBlob = await (await fetch(art.imageUrl)).blob();
        } else if (art.imageData) {
            imageBlob = await (await fetch(art.imageData)).blob();
        } else {
            showToast(t('art.no_image','Image not found'), 'error'); return;
        }

        const imageFile = new File([imageBlob], `${artworkId}.jpg`, { type: 'image/jpeg' });
        showToast(t('art.approve_metamask','Please approve the transaction in MetaMask.'), 'info');

        const result = await mintArtworkNFT(artworkId, art, imageFile, type, editionCount, art.royaltyPercent || ART_CONFIG.defaultRoyaltyPercent);
        await db.collection('artworks').doc(artworkId).update({
            isNFT: true, nftTokenId: result.tokenId, nftContract: result.contractAddress, nftType: type,
            ipfsImageUri: result.ipfsImageUri, ipfsMetadataUri: result.ipfsMetadataUri,
            editionCount: type === 'erc1155' ? editionCount : 1, mintTxHash: result.txHash
        });
        showToast(`🎉 NFT 민팅 완료! Token #${result.tokenId}`, 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        viewArtwork(artworkId);
    } catch (error) {
        showToast('NFT 민팅 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 7. 갤러리
// ============================================================

async function loadArtGallery() {
    const container = document.getElementById('art-gallery');
    if (!container) return;
    container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${createLucideIcon('palette')} 로딩 중...</p>`;

    try {
        const filterCat  = document.getElementById('art-filter-category')?.value || 'all';
        const filterSort = document.getElementById('art-filter-sort')?.value || 'newest';
        const filterNFT  = document.getElementById('art-filter-nft')?.value || 'all';

        let query = db.collection('artworks').where('status', '==', 'active');
        if (filterCat !== 'all') query = query.where('category', '==', filterCat);

        if (filterSort === 'popular') query = query.orderBy('likes', 'desc');
        else query = query.orderBy('createdAt', 'desc');

        let snapshot;
        try {
            snapshot = await query.limit(40).get();
        } catch (indexError) {
            console.warn('Composite index missing, falling back:', indexError.message);
            query = db.collection('artworks').where('status', '==', 'active').orderBy('createdAt', 'desc');
            snapshot = await query.limit(40).get();
        }

        if (snapshot.empty) {
            container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">아직 등록된 작품이 없습니다. 첫 작품을 등록해보세요! ${createLucideIcon('palette')}</p>`;
            return;
        }

        let items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

        if (filterNFT === 'nft')     items = items.filter(a => a.isNFT);
        if (filterNFT === 'non-nft') items = items.filter(a => !a.isNFT);

        if (filterSort === 'price-low')  items.sort((a, b) => (a.price || 0) - (b.price || 0));
        if (filterSort === 'price-high') items.sort((a, b) => (b.price || 0) - (a.price || 0));
        if (filterSort === 'auction')    items = items.filter(a => a.saleType === 'auction');

        container.innerHTML = items.map(art => _renderArtCard(art)).join('');
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (error) {
        container.innerHTML = `<p style="color:red; grid-column:1/-1;">로드 실패: ${error.message}</p>`;
    }
}

function _renderArtCard(art) {
    const catLabel = ART_CATEGORIES[art.category] || '🎨';
    const imgSrc = art.thumbnailUrl || art.imageUrl || art.imageData || '';

    let badges = '';
    if (art.isNFT) {
        const typeLabel = art.nftType === 'erc1155' ? `Ed.×${art.editionCount || '?'}` : '1/1';
        badges += `<div style="position:absolute;top:6px;right:6px;background:rgba(138,43,226,0.9);color:#E8D5C4;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:700;backdrop-filter:blur(4px)">🔗 NFT · ${typeLabel}</div>`;
    }

    // Supply badge
    if (art.totalSupply > 0) {
        const remaining = Math.max(0, art.totalSupply - (art.soldCount || 0));
        const isSoldOut = remaining <= 0;
        if (isSoldOut) {
            badges += `<div style="position:absolute;top:6px;left:6px;background:rgba(204,0,0,0.9);color:#E8D5C4;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:700">SOLD OUT</div>`;
        } else {
            badges += `<div style="position:absolute;top:${art.isNFT ? '28' : '6'}px;right:6px;background:rgba(61,43,31,0.6);color:#E8D5C4;padding:2px 6px;border-radius:10px;font-size:0.6rem">${remaining}/${art.totalSupply}</div>`;
        }
    }

    // Price label with weight info
    let priceLabel = '';
    if (art.saleType === 'fixed' || art.basePrice > 0) {
        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, art.artistWeight || 1);
        const weightInfo = (art.artistWeight && art.artistWeight > 1) ? ` <span style="font-size:0.6rem;color:var(--accent)">(${art.artistWeight}x)</span>` : '';
        priceLabel = `<span style="color:#3D2B1F;font-weight:700">${effectivePrice} ${art.priceToken || 'CRAC'}${weightInfo}</span>`;
    } else if (art.saleType === 'auction') {
        const endMs = art.auctionEnd?.seconds ? art.auctionEnd.seconds * 1000 : art.auctionEnd;
        const ended = endMs && new Date(endMs) < new Date();
        priceLabel = ended
            ? '<span style="color:#B54534">경매 종료</span>'
            : `<span style="color:#C4841D">🔨 ${art.currentBid || art.startPrice} CRAC</span>`;
    } else {
        priceLabel = '<span style="color:var(--accent)">전시 중</span>';
    }

    return `
        <div onclick="viewArtwork('${art.id}')" class="art-gallery-card" style="position:relative;background:#FFF8F0;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);transition:transform .2s" onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''">
            ${badges}
            <div style="width:100%;height:170px;overflow:hidden;background:#F7F3ED">
                <img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover" alt="${art.title}" loading="lazy">
            </div>
            <div style="padding:.6rem">
                <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${art.title}</div>
                <div style="font-size:.7rem;color:var(--accent);margin:.2rem 0">${catLabel} · ${art.artistNickname || t('art.anonymous','Anonymous')}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.3rem">
                    ${priceLabel}
                    <span style="font-size:.7rem;color:var(--accent)"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${art.likes || 0}</span>
                </div>
            </div>
        </div>`;
}


// ============================================================
// 8. 작품 상세보기
// ============================================================

async function viewArtwork(artId) {
    try {
        const doc = await db.collection('artworks').doc(artId).get();
        if (!doc.exists) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = doc.data();

        db.collection('artworks').doc(artId).update({ views: (art.views || 0) + 1 }).catch(() => {});

        const catLabel = ART_CATEGORIES[art.category] || '🎨';
        const isOwner  = currentUser && art.artistId === currentUser.uid;
        const imgSrc   = art.imageUrl || art.imageData || '';
        const artistWeight = art.artistWeight || 1;
        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, artistWeight);

        // Supply info
        let supplyHtml = '';
        if (art.totalSupply > 0) {
            const remaining = Math.max(0, art.totalSupply - (art.soldCount || 0));
            const pct = Math.round(((art.soldCount || 0) / art.totalSupply) * 100);
            const isSoldOut = remaining <= 0;
            supplyHtml = `
                <div style="background:#f8f9fa;padding:.6rem;border-radius:8px;margin-bottom:.8rem">
                    <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.3rem">
                        <span>${isSoldOut ? '🚫 매진' : `📦 잔여 ${remaining}/${art.totalSupply}`}</span>
                        <span style="color:var(--accent)">${pct}% 판매됨</span>
                    </div>
                    <div style="background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden">
                        <div style="background:${isSoldOut ? '#B54534' : '#6B8F3C'};height:100%;width:${pct}%;border-radius:4px;transition:width .3s"></div>
                    </div>
                </div>`;
        }

        // Price info with weight breakdown
        let priceInfoHtml = '';
        if (art.basePrice > 0) {
            if (artistWeight > 1) {
                priceInfoHtml = `
                    <div style="background:#f0f7ff;padding:.6rem;border-radius:8px;margin-bottom:.8rem;font-size:.82rem">
                        <div><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.base_price','Base Price')}: <strong>${art.basePrice} ${art.priceToken || 'CRAC'}</strong></div>
                        <div>⭐ ${t('art.weight','Weight')}: <strong>${artistWeight}x</strong></div>
                        <div style="font-size:.95rem;font-weight:700;margin-top:.3rem;color:#3D2B1F">= ${effectivePrice} ${art.priceToken || 'CRAC'}</div>
                    </div>`;
            } else {
                priceInfoHtml = `
                    <div style="background:#f0f7ff;padding:.6rem;border-radius:8px;margin-bottom:.8rem;font-size:.85rem">
                        <i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.price','Price')}: <strong>${effectivePrice} ${art.priceToken || 'CRAC'}</strong>
                    </div>`;
            }
        }

        // NFT info panel
        let nftInfoHtml = '';
        if (art.isNFT) {
            const typeLabel = art.nftType === 'erc1155' ? `ERC-1155 (Ed.×${art.editionCount})` : 'ERC-721 (1/1)';
            const cShort = art.nftContract ? `${art.nftContract.slice(0,6)}…${art.nftContract.slice(-4)}` : '—';
            const scanUrl = `https://polygonscan.com/token/${art.nftContract}?a=${art.nftTokenId}`;
            const ipfsUrl = art.ipfsImageUri ? ipfsToHttp(art.ipfsImageUri) : null;
            nftInfoHtml = `
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:.8rem;border-radius:8px;margin-bottom:1rem;color:#E8D5C4">
                    <div style="font-weight:700;margin-bottom:.4rem">🔗 NFT 인증</div>
                    <div style="font-size:.78rem;display:grid;gap:.2rem">
                        <div>타입: ${typeLabel}</div>
                        <div>Token ID: #${art.nftTokenId}</div>
                        <div>컨트랙트: <a href="${scanUrl}" target="_blank" style="color:#E8D5C4;text-decoration:underline">${cShort}</a></div>
                        <div>로열티: ${art.royaltyPercent || 10}%</div>
                        ${ipfsUrl ? `<div>IPFS: <a href="${ipfsUrl}" target="_blank" style="color:#E8D5C4;text-decoration:underline">원본 보기</a></div>` : ''}
                        ${art.mintTxHash ? `<div>TX: <a href="https://polygonscan.com/tx/${art.mintTxHash}" target="_blank" style="color:#E8D5C4;text-decoration:underline">${art.mintTxHash.slice(0,10)}…</a></div>` : ''}
                    </div>
                </div>`;
        }

        // Action buttons
        let actionHtml = '';
        const isSoldOut = art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0;

        if ((art.saleType === 'fixed' || art.basePrice > 0) && !isOwner && art.status === 'active') {
            if (isSoldOut) {
                actionHtml = `<button disabled style="background:#6B5744;color:#E8D5C4;border:none;padding:.8rem 2rem;border-radius:8px;width:100%;font-weight:700;cursor:not-allowed">🚫 SOLD OUT</button>`;
            } else {
                actionHtml = `
                    <div style="display:flex;gap:.5rem">
                        <button onclick="buyArtwork('${artId}')" style="background:#3D2B1F;color:#E8D5C4;border:none;padding:.8rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:700;flex:1"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${effectivePrice} ${art.priceToken || 'CRAC'} 구매</button>
                        <button onclick="reserveArtwork('${artId}')" style="background:#C4841D;color:#E8D5C4;border:none;padding:.8rem 1rem;border-radius:8px;cursor:pointer;font-weight:700">📅 예약</button>
                    </div>
                    <p style="font-size:.7rem;color:var(--accent);margin-top:.3rem;text-align:center">📅 예약: 보증금 ${Math.ceil(effectivePrice / 10)} ${art.priceToken || 'CRAC'} (1/10) · 1년 내 잔금 결제</p>`;
            }
        } else if (art.saleType === 'auction' && !isOwner) {
            const curBid = art.currentBid || art.startPrice || 1;
            const minBid = curBid + 1;
            actionHtml = `
                <div style="display:flex;gap:.5rem">
                    <input type="number" id="bid-amount-${artId}" value="${minBid}" min="${minBid}" style="flex:1;padding:.7rem;border:1px solid var(--border);border-radius:6px">
                    <button onclick="placeBid('${artId}')" style="background:#C4841D;color:#E8D5C4;border:none;padding:.8rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:700">🔨 입찰</button>
                </div>
                <p style="font-size:.75rem;color:var(--accent);margin-top:.3rem">현재 최고: ${curBid} CRAC${art.highestBidderNickname ? ' (' + art.highestBidderNickname + ')' : ''}</p>`;
        }

        if (isOwner) {
            actionHtml = '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
            if (!art.isNFT) {
                actionHtml += `<button onclick="mintExistingArtwork('${artId}')" style="background:linear-gradient(135deg,#8B6914,#6B5744);color:#E8D5C4;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem;flex:1">🔗 NFT 민팅</button>`;
            }
            actionHtml += `<button onclick="deleteArtwork('${artId}')" style="background:#B54534;color:#E8D5C4;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem">삭제</button></div>`;
        }

        // Modal
        const modal = document.createElement('div');
        modal.id = 'art-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,.88);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#FFF8F0;border-radius:12px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;position:relative">
                <button onclick="document.getElementById('art-modal').remove()" style="position:absolute;top:10px;right:12px;background:rgba(61,43,31,.5);color:#E8D5C4;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;z-index:1">✕</button>
                <img src="${imgSrc}" style="width:100%;border-radius:12px 12px 0 0;max-height:50vh;object-fit:contain;background:#F7F3ED">
                <div style="padding:1.2rem">
                    <h3 style="margin-bottom:.5rem">${art.title}</h3>
                    <div style="font-size:.85rem;color:var(--accent);margin-bottom:.8rem">
                        ${catLabel} · 🎨 <span onclick="viewArtistProfile('${art.artistId}')" style="cursor:pointer;text-decoration:underline">${art.artistNickname || t('art.anonymous','Anonymous')}</span> · 👁️ ${(art.views||0)+1} · <i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${art.likes||0}
                    </div>
                    ${art.description ? `<p style="font-size:.9rem;line-height:1.6;margin-bottom:1rem;color:#3D2B1F">${art.description}</p>` : ''}
                    ${supplyHtml}
                    ${priceInfoHtml}
                    ${nftInfoHtml}
                    <div style="display:flex;gap:.5rem;margin-bottom:1rem">
                        <button onclick="likeArtwork('${artId}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 좋아요</button>
                        <button onclick="shareArtwork('${artId}','${art.title.replace(/'/g, "\\'")}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer">🔗 공유</button>
                    </div>
                    ${actionHtml}
                </div>
            </div>`;

        document.body.appendChild(modal);
    } catch (error) {
        showToast('작품 로드 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 9. 좋아요 / 공유 / 삭제
// ============================================================

async function likeArtwork(artId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    try {
        const likeRef = db.collection('artworks').doc(artId).collection('likes').doc(currentUser.uid);
        if ((await likeRef.get()).exists) { showToast('이미 좋아요 한 작품입니다', 'info'); return; }
        await likeRef.set({ userId: currentUser.uid, timestamp: new Date() });
        await db.collection('artworks').doc(artId).update({ likes: firebase.firestore.FieldValue.increment(1) });
        showToast('<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 좋아요!', 'success');
    } catch (e) { console.error('🎨 [Like]', e); }
}

function shareArtwork(artId, title) {
    const url = `https://crowny.org/art/${artId}`;
    if (navigator.share) {
        navigator.share({ title: `CROWNY ART: ${title}`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('🔗 링크 복사됨!', 'success')).catch(() => {});
    }
}

async function deleteArtwork(artId) {
    const confirmed = await showConfirmModal(t('art.delete_artwork','Delete Artwork'), t('art.confirm_delete','Are you sure you want to delete this artwork?\n(NFTs remain on-chain)'));
    if (!confirmed) return;
    try {
        await db.collection('artworks').doc(artId).update({ status: 'deleted' });
        showToast('🗑️ 삭제 완료', 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
    } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
}


// ============================================================
// 10. 구매 시스템 (강화)
// ============================================================

async function buyArtwork(artId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();
        if (art.status !== 'active') { showToast('이미 판매된 작품', 'warning'); return; }

        // Supply check
        if (art.totalSupply > 0) {
            const remaining = art.totalSupply - (art.soldCount || 0);
            if (remaining <= 0) { showToast('🚫 매진된 작품입니다', 'warning'); return; }
        }

        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, art.artistWeight || 1);
        const tokenKey = 'crac';
        const isOffchain = true;

        // Balance check (CRAC 오프체인 전용)
        {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const offBal = userDoc.data()?.offchainBalances?.[tokenKey] || 0;
            if (offBal < effectivePrice) {
                showToast(`CRAC 잔액 부족. 보유: ${offBal}, 필요: ${effectivePrice}`, 'warning');
                return;
            }
        }

        // Purchase confirmation with details
        const platformFee = Math.round(effectivePrice * (ART_CONFIG.platformFeePercent / 100) * 100) / 100;
        const artistReceive = Math.round((effectivePrice - platformFee) * 100) / 100;

        const confirmMsg = `"${art.title}"\n\n` +
            `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 가격: ${effectivePrice} ${art.priceToken || 'CRAC'}\n` +
            (art.basePrice && art.artistWeight > 1 ? `   (기본가 ${art.basePrice} × 가중치 ${art.artistWeight}x)\n` : '') +
            `📊 수수료: ${platformFee} (${ART_CONFIG.platformFeePercent}%)\n` +
            `🎨 아티스트 수령: ${artistReceive}\n` +
            (art.totalSupply > 0 ? `📦 잔여: ${art.totalSupply - (art.soldCount || 0) - 1}/${art.totalSupply}\n` : '') +
            (art.isNFT ? '\n🔗 NFT 소유권이 이전됩니다' : '') +
            `\n\n구매하시겠습니까?`;

        const confirmBuy = await showConfirmModal(t('art.buy_confirm','Confirm Purchase'), confirmMsg);
        if (!confirmBuy) return;

        // Execute payment
        if (isOffchain) {
            const spent = await spendOffchainPoints(tokenKey, effectivePrice, `아트 구매: ${art.title}`);
            if (!spent) return;
            const sellerDoc = await db.collection('users').doc(art.artistId).get();
            const sellerOff = sellerDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(art.artistId).update({
                [`offchainBalances.${tokenKey}`]: (sellerOff[tokenKey] || 0) + artistReceive
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const walletDoc = wallets.docs[0];
            const balances = walletDoc.data().balances || {};
            await walletDoc.ref.update({ [`balances.${tokenKey}`]: balances[tokenKey] - effectivePrice });
            const sellerWallets = await db.collection('users').doc(art.artistId).collection('wallets').limit(1).get();
            if (!sellerWallets.empty) {
                const sw = sellerWallets.docs[0];
                const sb = sw.data().balances || {};
                await sw.ref.update({ [`balances.${tokenKey}`]: (sb[tokenKey] || 0) + artistReceive });
            }
        }

        // Update artwork
        const updateData = {
            soldCount: firebase.firestore.FieldValue.increment(1)
        };
        // If single supply or no supply limit, mark as sold
        if (!art.totalSupply || art.totalSupply <= 1) {
            updateData.status = 'sold';
            updateData.buyerId = currentUser.uid;
            updateData.buyerEmail = currentUser.email;
            updateData.soldAt = new Date();
            updateData.soldPrice = effectivePrice;
            updateData.soldToken = art.priceToken || 'CRAC';
        }
        await db.collection('artworks').doc(artId).update(updateData);

        // Record purchase in art_purchases subcollection
        await db.collection('artworks').doc(artId).collection('purchases').add({
            buyerId: currentUser.uid,
            buyerEmail: currentUser.email,
            price: effectivePrice,
            token: art.priceToken || 'CRAC',
            timestamp: new Date()
        });

        // Transaction record
        await db.collection('art_transactions').add({
            artworkId: artId, artworkTitle: art.title,
            from: currentUser.uid, to: art.artistId,
            amount: effectivePrice, artistReceive, platformFee,
            basePrice: art.basePrice || effectivePrice,
            artistWeight: art.artistWeight || 1,
            token: art.priceToken || 'CRAC', isNFT: art.isNFT || false,
            nftTokenId: art.nftTokenId || null,
            type: 'art_purchase', timestamp: new Date()
        });

        // Auto donation
        await _artDonationAuto(currentUser.uid, effectivePrice, art.priceToken || 'CRAC');

        // Referral
        if (typeof distributeReferralReward === 'function') {
            await distributeReferralReward(currentUser.uid, effectivePrice, art.priceToken || 'CRAC');
        }

        // Update artist profile + recalculate weight
        await _updateArtistProfile(art.artistId, {
            totalSales: firebase.firestore.FieldValue.increment(1),
            totalSoldCount: firebase.firestore.FieldValue.increment(1),
            totalRevenue: firebase.firestore.FieldValue.increment(artistReceive)
        });
        await _recalculateArtistWeight(art.artistId);

        showToast(`🎉 "${art.title}" 구매 완료!${art.isNFT ? ' 🔗 NFT 소유권 이전됨' : ''}`, 'success');

        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
        loadMyCollection('my-purchases');
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast('구매 실패: ' + error.message, 'error');
    }
}

async function placeBid(artId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const bidInput = document.getElementById(`bid-amount-${artId}`);
    const bidAmount = parseFloat(bidInput?.value);
    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();
        const minBid = (art.currentBid || art.startPrice || 1) + 1;
        if (bidAmount < minBid) { showToast(`최소 입찰가: ${minBid} CRAC`, 'warning'); return; }
        const userDocBid = await db.collection('users').doc(currentUser.uid).get();
        const cracBal = userDocBid.data()?.offchainBalances?.crac || 0;
        if (cracBal < bidAmount) { showToast(`CRAC 잔액 부족. 보유: ${cracBal}`, 'warning'); return; }
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const nickname = userDoc.data()?.nickname || currentUser.email;
        await db.collection('artworks').doc(artId).update({
            currentBid: bidAmount, highestBidder: currentUser.uid,
            highestBidderEmail: currentUser.email, highestBidderNickname: nickname
        });
        await db.collection('artworks').doc(artId).collection('bids').add({
            bidderId: currentUser.uid, bidderEmail: currentUser.email,
            bidderNickname: nickname, amount: bidAmount, timestamp: new Date()
        });
        showToast(`🔨 ${bidAmount} CRAC 입찰 완료!`, 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
    } catch (error) { showToast('입찰 실패: ' + error.message, 'error'); }
}


// ============================================================
// 11. 예약 구매 시스템
// ============================================================

async function reserveArtwork(artId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        if (!artDoc.exists) { showToast('작품을 찾을 수 없습니다', 'warning'); return; }
        const art = artDoc.data();

        if (art.status !== 'active') { showToast('구매 불가능한 작품입니다', 'warning'); return; }
        if (art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0) {
            showToast('🚫 매진된 작품입니다', 'warning'); return;
        }

        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, art.artistWeight || 1);
        const depositAmount = Math.ceil(effectivePrice / 10);
        const remainingAmount = effectivePrice - depositAmount;
        const tokenKey = (art.priceToken || 'CRAC').toLowerCase();

        const confirmMsg = `📅 예약 구매\n\n"${art.title}"\n\n` +
            `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 총 가격: ${effectivePrice} ${art.priceToken || 'CRAC'}\n` +
            `💵 보증금 (1/10): ${depositAmount} ${art.priceToken || 'CRAC'}\n` +
            `📋 잔금: ${remainingAmount} ${art.priceToken || 'CRAC'}\n` +
            `⏰ 잔금 결제 기한: 1년\n\n` +
            `⚠️ 예약 취소 시 보증금은 환불되지 않습니다.\n\n진행하시겠습니까?`;

        const confirmed = await showConfirmModal('📅 예약 구매', confirmMsg);
        if (!confirmed) return;

        // Check balance for deposit
        const isOffchain = typeof isOffchainToken === 'function' && isOffchainToken(tokenKey);
        if (isOffchain) {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const offBal = userDoc.data()?.offchainBalances?.[tokenKey] || 0;
            if (offBal < depositAmount) {
                showToast(`보증금 부족. 보유: ${offBal}, 필요: ${depositAmount}`, 'warning'); return;
            }
            const spent = await spendOffchainPoints(tokenKey, depositAmount, `아트 예약 보증금: ${art.title}`);
            if (!spent) return;
            // Pay deposit to artist
            const sellerDoc = await db.collection('users').doc(art.artistId).get();
            const sellerOff = sellerDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(art.artistId).update({
                [`offchainBalances.${tokenKey}`]: (sellerOff[tokenKey] || 0) + depositAmount
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            if (wallets.empty) { showToast('지갑이 없습니다', 'warning'); return; }
            const walletDoc = wallets.docs[0];
            const balances = walletDoc.data().balances || {};
            if ((balances[tokenKey] || 0) < depositAmount) {
                showToast(`보증금 부족`, 'warning'); return;
            }
            await walletDoc.ref.update({ [`balances.${tokenKey}`]: balances[tokenKey] - depositAmount });
            const sellerWallets = await db.collection('users').doc(art.artistId).collection('wallets').limit(1).get();
            if (!sellerWallets.empty) {
                const sw = sellerWallets.docs[0];
                const sb = sw.data().balances || {};
                await sw.ref.update({ [`balances.${tokenKey}`]: (sb[tokenKey] || 0) + depositAmount });
            }
        }

        // Create reservation
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await db.collection('art_reservations').add({
            artworkId: artId,
            artworkTitle: art.title,
            artworkImage: art.thumbnailUrl || art.imageUrl || '',
            buyerId: currentUser.uid,
            buyerEmail: currentUser.email,
            artistId: art.artistId,
            totalPrice: effectivePrice,
            depositAmount: depositAmount,
            depositPaid: true,
            depositPaidAt: new Date(),
            depositToken: art.priceToken || 'CRAC',
            remainingAmount: remainingAmount,
            expiresAt: expiresAt,
            status: 'reserved',
            completedAt: null,
            createdAt: new Date()
        });

        // Transaction record
        await db.collection('art_transactions').add({
            artworkId: artId, artworkTitle: art.title,
            from: currentUser.uid, to: art.artistId,
            amount: depositAmount, token: art.priceToken || 'CRAC',
            type: 'art_reservation_deposit', timestamp: new Date()
        });

        showToast(`📅 "${art.title}" 예약 완료! 보증금 ${depositAmount} ${art.priceToken || 'CRAC'} 결제됨`, 'success');

        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast('예약 실패: ' + error.message, 'error');
    }
}

async function completeReservation(reservationId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    try {
        const resDoc = await db.collection('art_reservations').doc(reservationId).get();
        if (!resDoc.exists) { showToast('예약을 찾을 수 없습니다', 'warning'); return; }
        const res = resDoc.data();

        if (res.buyerId !== currentUser.uid) { showToast('본인의 예약만 결제 가능합니다', 'warning'); return; }
        if (res.status !== 'reserved') { showToast('이미 처리된 예약입니다', 'info'); return; }

        const expiresAt = res.expiresAt?.toDate ? res.expiresAt.toDate() : new Date(res.expiresAt);
        if (new Date() > expiresAt) {
            await db.collection('art_reservations').doc(reservationId).update({ status: 'expired' });
            showToast('⏰ 예약 기한이 만료되었습니다', 'warning');
            return;
        }

        const remainingAmount = res.remainingAmount;
        const tokenKey = (res.depositToken || 'CRAC').toLowerCase();

        const confirmed = await showConfirmModal('잔금 결제', `"${res.artworkTitle}"\n\n잔금: ${remainingAmount} ${res.depositToken || 'CRAC'}\n\n결제하시겠습니까?`);
        if (!confirmed) return;

        // Pay remaining
        const isOffchain = typeof isOffchainToken === 'function' && isOffchainToken(tokenKey);
        const platformFee = Math.round(res.totalPrice * (ART_CONFIG.platformFeePercent / 100) * 100) / 100;
        const artistReceiveRemaining = Math.round((remainingAmount - platformFee) * 100) / 100;

        if (isOffchain) {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const offBal = userDoc.data()?.offchainBalances?.[tokenKey] || 0;
            if (offBal < remainingAmount) {
                showToast(`잔액 부족. 보유: ${offBal}, 필요: ${remainingAmount}`, 'warning'); return;
            }
            const spent = await spendOffchainPoints(tokenKey, remainingAmount, `아트 예약 잔금: ${res.artworkTitle}`);
            if (!spent) return;
            const sellerDoc = await db.collection('users').doc(res.artistId).get();
            const sellerOff = sellerDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(res.artistId).update({
                [`offchainBalances.${tokenKey}`]: (sellerOff[tokenKey] || 0) + artistReceiveRemaining
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            if (wallets.empty) { showToast('지갑이 없습니다', 'warning'); return; }
            const walletDoc = wallets.docs[0];
            const balances = walletDoc.data().balances || {};
            if ((balances[tokenKey] || 0) < remainingAmount) { showToast('잔액 부족', 'warning'); return; }
            await walletDoc.ref.update({ [`balances.${tokenKey}`]: balances[tokenKey] - remainingAmount });
            const sellerWallets = await db.collection('users').doc(res.artistId).collection('wallets').limit(1).get();
            if (!sellerWallets.empty) {
                const sw = sellerWallets.docs[0];
                const sb = sw.data().balances || {};
                await sw.ref.update({ [`balances.${tokenKey}`]: (sb[tokenKey] || 0) + artistReceiveRemaining });
            }
        }

        // Update reservation
        await db.collection('art_reservations').doc(reservationId).update({
            status: 'completed',
            completedAt: new Date()
        });

        // Update artwork soldCount
        await db.collection('artworks').doc(res.artworkId).update({
            soldCount: firebase.firestore.FieldValue.increment(1)
        });

        // Record purchase in art_purchases
        await db.collection('artworks').doc(res.artworkId).collection('purchases').add({
            buyerId: currentUser.uid,
            buyerEmail: currentUser.email,
            price: res.totalPrice,
            token: res.depositToken || 'CRAC',
            type: 'reservation_complete',
            reservationId: reservationId,
            timestamp: new Date()
        });

        // Transaction
        await db.collection('art_transactions').add({
            artworkId: res.artworkId, artworkTitle: res.artworkTitle,
            from: currentUser.uid, to: res.artistId,
            amount: remainingAmount, token: res.depositToken || 'CRAC',
            type: 'art_reservation_complete', timestamp: new Date()
        });

        // Update artist
        await _updateArtistProfile(res.artistId, {
            totalSales: firebase.firestore.FieldValue.increment(1),
            totalSoldCount: firebase.firestore.FieldValue.increment(1),
            totalRevenue: firebase.firestore.FieldValue.increment(artistReceiveRemaining)
        });
        await _recalculateArtistWeight(res.artistId);

        showToast(`🎉 "${res.artworkTitle}" 잔금 결제 완료!`, 'success');
        loadMyCollection('my-reservations');
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast('잔금 결제 실패: ' + error.message, 'error');
    }
}

async function cancelReservation(reservationId) {
    if (!currentUser) return;
    try {
        const confirmed = await showConfirmModal('⚠️ 예약 취소',
            '예약을 취소하시겠습니까?\n\n⚠️ 보증금은 환불되지 않습니다.');
        if (!confirmed) return;
        await db.collection('art_reservations').doc(reservationId).update({
            status: 'cancelled',
            cancelledAt: new Date()
        });
        showToast('예약이 취소되었습니다 (보증금 환불 없음)', 'info');
        loadMyCollection('my-reservations');
    } catch (error) {
        showToast('취소 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 12. 자동 기부
// ============================================================

async function _artDonationAuto(userId, amount, token) {
    try {
        const donationAmount = Math.max(ART_CONFIG.donationMinCRFN, amount * 0.02);
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        const cracBal = userDoc.data()?.offchainBalances?.crac || 0;
        if (cracBal >= donationAmount) {
            await db.collection('users').doc(userId).update({
                ['offchainBalances.crac']: cracBal - donationAmount
            });
            await db.collection('giving_pool_logs').add({
                userId, amount: donationAmount, token: 'CRAC',
                source: 'art_trade', note: `아트 거래 자동 기부 (${amount} ${token})`,
                timestamp: new Date()
            });
            // Update artist donation contribution for weight
            // (the artist benefits from buyer's donation)
        }
    } catch (e) {
        console.warn('🎨 [Donation] Failed:', e.message);
    }
}


// ============================================================
// 13. 내 컬렉션 (상단 배치, 탭 시스템)
// ============================================================

async function loadMyCollection(tab) {
    if (!currentUser) {
        const container = document.getElementById('my-collection-content');
        if (container) container.innerHTML = '<div class="art-empty-state"><span class="icon">🔒</span><p>로그인하면 내 컬렉션을 확인할 수 있습니다</p></div>';
        return;
    }

    // Update active tab
    document.querySelectorAll('.collection-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const container = document.getElementById('my-collection-content');
    if (!container) return;

    switch (tab) {
        case 'my-artworks': await _loadMyArtworks(container); break;
        case 'my-purchases': await _loadMyPurchases(container); break;
        case 'my-nfts': await _loadMyNFTs(container); break;
        case 'my-reservations': await _loadMyReservations(container); break;
        case 'my-transactions': await _loadMyTransactions(container); break;
        default: await _loadMyArtworks(container);
    }
}

async function _loadMyArtworks(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">로딩 중...</p>';
    try {
        let arts;
        try {
            arts = await db.collection('artworks')
                .where('artistId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc').limit(30).get();
        } catch (e) {
            console.warn('🎨 [MyArt] index fallback:', e.message);
            arts = await db.collection('artworks')
                .where('artistId', '==', currentUser.uid).limit(30).get();
        }

        if (arts.empty) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('palette')}</span><p>등록한 작품이 없습니다<br><small>작품 등록 버튼을 눌러 첫 작품을 올려보세요!</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        arts.forEach(doc => {
            const art = { id: doc.id, ...doc.data() };
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            const status = art.status === 'sold' ? '✅ 판매됨' : art.status === 'active' ? '🟢 판매 중' : '⬜';
            html += `
                <div onclick="viewArtwork('${art.id}')" class="collection-card">
                    ${art.isNFT ? `<div class="collection-nft-badge">${createLucideIcon('link', 12)} NFT</div>` : ''}
                    <img src="${img}" loading="lazy">
                    <div class="collection-card-info">
                        <div class="collection-card-title">${art.title}</div>
                        <div class="collection-card-meta">${status}</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">⚠️</span><p>로드 실패: ${e.message}</p></div>`;
    }
}

async function _loadMyPurchases(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">로딩 중...</p>';
    try {
        let arts;
        try {
            arts = await db.collection('artworks')
                .where('buyerId', '==', currentUser.uid)
                .orderBy('soldAt', 'desc').limit(30).get();
        } catch (e) {
            console.warn('🎨 [MyPurchases] index fallback:', e.message);
            arts = await db.collection('artworks')
                .where('buyerId', '==', currentUser.uid).limit(30).get();
        }

        if (arts.empty) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('shopping-cart')}</span><p>구매한 작품이 없습니다<br><small>갤러리에서 마음에 드는 작품을 찾아보세요!</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        arts.forEach(doc => {
            const art = doc.data();
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            html += `
                <div onclick="viewArtwork('${doc.id}')" class="collection-card">
                    <img src="${img}" loading="lazy">
                    <div class="collection-card-info">
                        <div class="collection-card-title">${art.title}</div>
                        <div class="collection-card-meta">🎨 ${art.artistNickname || '익명'} ${art.isNFT ? createLucideIcon('link', 12) : ''}</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">⚠️</span><p>로드 실패: ${e.message}</p></div>`;
    }
}

async function _loadMyNFTs(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">로딩 중...</p>';
    try {
        let minted, bought;
        try {
            [minted, bought] = await Promise.all([
                db.collection('artworks').where('artistId', '==', currentUser.uid).where('isNFT', '==', true).get(),
                db.collection('artworks').where('buyerId', '==', currentUser.uid).where('isNFT', '==', true).get()
            ]);
        } catch (e) {
            console.warn('🎨 [MyNFTs] fallback:', e.message);
            const all = await db.collection('artworks').where('isNFT', '==', true).limit(100).get();
            minted = { forEach: cb => all.forEach(d => { if (d.data().artistId === currentUser.uid) cb(d); }) };
            bought = { forEach: cb => all.forEach(d => { if (d.data().buyerId === currentUser.uid) cb(d); }) };
        }

        const nfts = new Map();
        minted.forEach(d => nfts.set(d.id, { id: d.id, ...d.data(), relation: 'minted' }));
        bought.forEach(d => {
            if (nfts.has(d.id)) nfts.get(d.id).relation = 'minted+owned';
            else nfts.set(d.id, { id: d.id, ...d.data(), relation: 'owned' });
        });

        const items = Array.from(nfts.values());
        if (!items.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('link')}</span><p>보유한 NFT가 없습니다<br><small>작품을 NFT로 민팅하거나 NFT를 구매해보세요!</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        items.forEach(art => {
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            const typeLabel = art.nftType === 'erc1155' ? `×${art.editionCount}` : '1/1';
            html += `
                <div onclick="viewArtwork('${art.id}')" class="collection-card" style="border:2px solid rgba(138,43,226,.3)">
                    <img src="${img}" loading="lazy">
                    <div class="collection-card-info">
                        <div class="collection-card-title">${art.title}</div>
                        <div class="collection-card-meta" style="color:#8B2BE2">${createLucideIcon('link', 12)} #${art.nftTokenId || '?'} · ${typeLabel}</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">⚠️</span><p>로드 실패: ${e.message}</p></div>`;
    }
}

async function _loadMyReservations(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">로딩 중...</p>';
    try {
        let snap;
        try {
            snap = await db.collection('art_reservations')
                .where('buyerId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc').limit(20).get();
        } catch (e) {
            console.warn('🎨 [Reservations] index fallback:', e.message);
            snap = await db.collection('art_reservations')
                .where('buyerId', '==', currentUser.uid).limit(20).get();
        }

        if (snap.empty) {
            container.innerHTML = '<div class="art-empty-state"><span class="icon">📅</span><p>예약 내역이 없습니다</p></div>';
            return;
        }

        let html = '<div style="display:grid;gap:.8rem">';
        snap.forEach(doc => {
            const r = doc.data();
            const expiresAt = r.expiresAt?.toDate ? r.expiresAt.toDate() : new Date(r.expiresAt);
            const isExpired = new Date() > expiresAt;
            const statusLabel = r.status === 'completed' ? '✅ 완료' :
                r.status === 'cancelled' ? '❌ 취소됨' :
                isExpired ? '⏰ 만료' : '📅 예약 중';
            const img = r.artworkImage || '';

            html += `
                <div style="background:#FFF8F0;border-radius:10px;padding:.8rem;display:flex;gap:.8rem;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
                    ${img ? `<img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">` : ''}
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.artworkTitle}</div>
                        <div style="font-size:.75rem;color:var(--accent)">${statusLabel} · 총 ${r.totalPrice} ${r.depositToken || 'CRAC'}</div>
                        <div style="font-size:.7rem;color:var(--accent)">보증금: ${r.depositAmount} · 잔금: ${r.remainingAmount}</div>
                        ${r.status === 'reserved' && !isExpired ? `<div style="font-size:.7rem;color:#C4841D">만료: ${expiresAt.toLocaleDateString()}</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:.3rem">
                        ${r.status === 'reserved' && !isExpired ? `
                            <button onclick="completeReservation('${doc.id}')" style="background:#6B8F3C;color:#E8D5C4;border:none;padding:.4rem .6rem;border-radius:6px;cursor:pointer;font-size:.75rem;font-weight:600"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잔금</button>
                            <button onclick="cancelReservation('${doc.id}')" style="background:none;border:1px solid #E8E0D8;padding:.3rem .5rem;border-radius:6px;cursor:pointer;font-size:.7rem;color:#6B5744">취소</button>
                        ` : ''}
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">⚠️</span><p>로드 실패: ${e.message}</p></div>`;
    }
}

async function _loadMyTransactions(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">로딩 중...</p>';
    try {
        let snap;
        try {
            snap = await db.collection('art_transactions')
                .where('from', '==', currentUser.uid)
                .orderBy('timestamp', 'desc').limit(20).get();
        } catch (e) {
            console.warn('🎨 [Transactions] index fallback:', e.message);
            snap = await db.collection('art_transactions')
                .where('from', '==', currentUser.uid).limit(20).get();
        }

        // Also get sales (where I'm the artist)
        let salesSnap;
        try {
            salesSnap = await db.collection('art_transactions')
                .where('to', '==', currentUser.uid)
                .orderBy('timestamp', 'desc').limit(20).get();
        } catch (e) {
            salesSnap = await db.collection('art_transactions')
                .where('to', '==', currentUser.uid).limit(20).get();
        }

        const txs = [];
        snap.forEach(d => txs.push({ id: d.id, ...d.data(), direction: 'out' }));
        salesSnap.forEach(d => txs.push({ id: d.id, ...d.data(), direction: 'in' }));
        txs.sort((a, b) => {
            const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return tb - ta;
        });

        if (!txs.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('clipboard')}</span><p>거래 내역이 없습니다</p></div>`;
            return;
        }

        let html = '<div style="display:grid;gap:.5rem">';
        txs.slice(0, 30).forEach(tx => {
            const date = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
            const typeLabel = {
                'art_purchase': '🛒 구매',
                'art_reservation_deposit': '📅 예약 보증금',
                'art_reservation_complete': '✅ 예약 완료'
            }[tx.type] || tx.type;
            const dirIcon = tx.direction === 'in' ? '📥' : '📤';
            const dirColor = tx.direction === 'in' ? '#6B8F3C' : '#e53935';

            html += `
                <div style="background:#FFF8F0;padding:.6rem .8rem;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:.8rem">
                    <div>
                        <div style="font-weight:600">${dirIcon} ${typeLabel}</div>
                        <div style="color:var(--accent);font-size:.7rem">${tx.artworkTitle || '—'} · ${date.toLocaleDateString()}</div>
                    </div>
                    <div style="font-weight:700;color:${dirColor}">${tx.direction === 'in' ? '+' : '-'}${tx.amount} ${tx.token || 'CRAC'}</div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">⚠️</span><p>로드 실패: ${e.message}</p></div>`;
    }
}

// Legacy functions that redirect to new system
function loadMyArtworks() { loadMyCollection('my-artworks'); }
function loadMyPurchases() { loadMyCollection('my-purchases'); }
function loadMyNFTs() { loadMyCollection('my-nfts'); }


// ============================================================
// 14. 아티스트 프로필
// ============================================================

async function _updateArtistProfile(userId, updateData) {
    try {
        const ref = db.collection('artist_profiles').doc(userId);
        const doc = await ref.get();
        if (!doc.exists) {
            const userDoc = await db.collection('users').doc(userId).get();
            const ud = userDoc.exists ? userDoc.data() : {};
            await ref.set({
                userId, nickname: ud.nickname || '', email: ud.email || '',
                bio: '', profileImage: '',
                totalWorks: 0, totalWorksCount: 0,
                totalSales: 0, totalSoldCount: 0,
                totalRevenue: 0, totalLikes: 0,
                totalDonationContribution: 0,
                baseWeightMultiplier: 1.0,
                weightMultiplier: 1.0,
                verified: false, createdAt: new Date(),
                ...updateData
            });
        } else {
            await ref.update(updateData);
        }
    } catch (e) { console.warn('🎨 [Profile] Update failed:', e.message); }
}

async function viewArtistProfile(artistId) {
    try {
        const [profileDoc, userDoc] = await Promise.all([
            db.collection('artist_profiles').doc(artistId).get(),
            db.collection('users').doc(artistId).get()
        ]);
        const profile = profileDoc.exists ? profileDoc.data() : {};
        const user = userDoc.exists ? userDoc.data() : {};
        const nickname = profile.nickname || user.nickname || '익명 아티스트';
        const weight = profile.weightMultiplier || 1.0;

        const worksSnap = await db.collection('artworks')
            .where('artistId', '==', artistId)
            .where('status', '==', 'active').get();

        const modal = document.createElement('div');
        modal.id = 'artist-profile-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,.88);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#FFF8F0;border-radius:12px;max-width:400px;width:100%;padding:1.5rem">
                <div style="text-align:center;margin-bottom:1rem">
                    <div style="width:60px;height:60px;background:linear-gradient(135deg,#8B6914,#6B5744);border-radius:50%;margin:0 auto .5rem;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#E8D5C4">${nickname.charAt(0).toUpperCase()}</div>
                    <h3>${nickname} ${profile.verified ? '✅' : ''}</h3>
                    <div style="font-size:.85rem;color:#8B2BE2;margin-top:.3rem">⭐ 아티스트 가중치: ${weight}x</div>
                    ${profile.bio ? `<p style="font-size:.85rem;color:var(--accent);margin-top:.3rem">${profile.bio}</p>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem;text-align:center;margin-bottom:1rem">
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${worksSnap.size}</div><div style="font-size:.7rem;color:var(--accent)">작품</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalSales || 0}</div><div style="font-size:.7rem;color:var(--accent)">판매</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalLikes || 0}</div><div style="font-size:.7rem;color:var(--accent)">좋아요</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700;color:#8B2BE2">${weight}x</div><div style="font-size:.7rem;color:var(--accent)">가중치</div></div>
                </div>
                <button onclick="this.closest('#artist-profile-modal').remove()" style="width:100%;background:var(--bg);border:1px solid var(--border);padding:.6rem;border-radius:6px;cursor:pointer">닫기</button>
            </div>`;
        document.body.appendChild(modal);
    } catch (e) { console.error('🎨 [Profile] View failed:', e); }
}


// ============================================================
// 15. 유틸리티
// ============================================================

function _resetArtForm() {
    ['art-title', 'art-description', 'art-base-price', 'art-total-supply'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const imgEl = document.getElementById('art-image');
    if (imgEl) imgEl.value = '';
    const nftChk = document.getElementById('art-mint-nft');
    if (nftChk) nftChk.checked = false;
    toggleNFTOptions();
    const statusEl = document.getElementById('art-upload-status');
    if (statusEl) statusEl.textContent = '';
    const previewEl = document.getElementById('art-price-preview');
    if (previewEl) previewEl.textContent = '';
}


// ============================================================
// 16. Thirdweb 배포 가이드
// ============================================================

function showDeployGuide() {
    console.log(`
╔═════════════════════════════════════════════╗
║   CROWNY NFT 컬렉션 배포 가이드               ║
╠═════════════════════════════════════════════╣
║  1. thirdweb.com/dashboard 접속              ║
║  2. "Deploy" 클릭                            ║
║  ERC-721: NFT Collection / CRART / Polygon   ║
║  ERC-1155: Edition / CREDI / Polygon         ║
║  Royalty: 10% → ${ART_CONFIG.adminWallet}    ║
║  배포 후 → ART_CONFIG.contracts에 주소 입력     ║
╚═════════════════════════════════════════════╝
    `);
}

console.log('🎨 js/app-art.js v' + ART_VERSION + ' loaded. showDeployGuide() for NFT setup.');
