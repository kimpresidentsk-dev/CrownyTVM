// ============================================================
// CROWNY ART MODULE — js/app-art.js v3.0
// Server REST API version (no Firebase/Firestore)
// Thirdweb NFT (ERC-721 / ERC-1155) + Base64 Image Storage
// + Purchase System + Collection + Supply Limit + Artist Weight + Reservations
// ============================================================
//
// 로드 순서: config → ui → auth → wallet → offchain → social
//            → send → admin → marketplace → trading → ★ app-art
//
// 외부 의존성:
//   currentUser               ← config.js  { uid, email, displayName }
//   loadUserWallet()          ← wallet.js
//   earnOffchainPoints()      ← offchain.js
//   distributeReferralReward()← social.js
//   window.tw5                ← index.html <script type="module">
// ============================================================

const ART_VERSION = '3.0.0';

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
    photo:        t('art.cat.photo','<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Photography'),
    sculpture:    t('art.cat.sculpture','<i data-lucide="box" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Sculpture/Installation'),
    illustration: t('art.cat.illustration','Illustration'),
    calligraphy:  t('art.cat.calligraphy','Calligraphy'),
    mixed:        t('art.cat.mixed','<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Mixed Media'),
    ai:           t('art.cat.ai','<i data-lucide="bot" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> AI Art'),
    music:        t('art.cat.music','<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Music/Sound'),
    video:        t('art.cat.video','<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Video Art'),
    generative:   t('art.cat.generative','<i data-lucide="infinity" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Generative'),
    kpop:         t('art.cat.kpop','<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> K-Pop Goods'),
    other:        t('art.cat.other','Other')
};

// ─── MODULE STATE ───
let artModuleReady = false;
let tw5SDK = null;
let erc721Contract = null;
let erc1155Contract = null;
let storageSDK = null;

// ─── ARTIST WEIGHT CACHE ───
const _artistWeightCache = {};

// ─── AUTH HELPERS ───
function _artHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function _artFetch(url, opts = {}) {
    if (!opts.headers) opts.headers = _artHeaders();
    const res = await fetch(url, opts);
    return res.json();
}


// ============================================================
// 1. 초기화
// ============================================================

async function initArtModule() {
    console.log('🎨 [ART] Initializing v' + ART_VERSION);

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
// 2. 이미지 업로드 — Server Base64 Storage + IPFS 하이브리드
// ============================================================

async function uploadArtImage(file, artworkId) {
    const dataUrl = await _fileToDataUrl(file);
    const resized = await _resizeImageData(dataUrl, ART_CONFIG.maxImageSize);
    const thumb = await _resizeImageData(dataUrl, ART_CONFIG.thumbnailSize);

    const result = await _artFetch('/api/art/upload-image', {
        method: 'POST',
        headers: _artHeaders(),
        body: JSON.stringify({ imageData: resized, thumbnailData: thumb, artworkId })
    });

    if (!result.ok) throw new Error('Image upload failed');
    return { firebaseUrl: resized, thumbnailUrl: thumb, isBase64: true };
}

async function uploadToIPFS(file) {
    if (!storageSDK) throw new Error(t('art.storage_not_init','Thirdweb Storage not initialized. NFT minting unavailable.'));
    const uri = await storageSDK.upload(file);
    return uri;
}

async function uploadMetadataToIPFS(metadata) {
    if (!storageSDK) throw new Error(t('art.storage_not_init_short','Thirdweb Storage not initialized'));
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
        const data = await _artFetch('/api/art/artist-profile?artistId=' + encodeURIComponent(artistId), {
            headers: _artHeaders()
        });
        const w = (data.ok && data.profile) ? (data.profile.weightMultiplier || 1.0) : 1.0;
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
        const data = await _artFetch('/api/art/recalculate-weight', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artistId })
        });
        if (data.ok) {
            _artistWeightCache[artistId] = { weight: data.weight, _ts: Date.now() };
            console.log(`🎨 [Weight] ${artistId} → ${data.weight}x`);
        }
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
        previewEl.textContent = '\u2B50 ' + t('art.weight','Weight') + ' ' + w + 'x \u2192 ' + t('art.effective_price','Effective price') + ': ' + effective + ' CRAC';
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

        const { firebaseUrl, thumbnailUrl, isBase64 } = await uploadArtImage(imageFile, tempId);
        setStatus(t('art.upload_done','✅ Image upload complete'));

        // Get user info from server
        const userInfo = await _artFetch('/api/art/user-info', { headers: _artHeaders() });
        const artistNickname = userInfo.ok ? (userInfo.nickname || '') : '';
        const artistWallet   = userInfo.ok ? (userInfo.polygonAddress || '') : '';

        // Get artist weight
        const artistWeight = await _getArtistWeight(currentUser.uid);
        const effectivePrice = _calcEffectivePrice(basePrice, artistWeight);

        const artwork = {
            title, description, category, saleType,
            artistId: currentUser.uid,
            artistEmail: currentUser.email,
            artistNickname, artistWallet,
            likes: 0, views: 0, status: 'active',
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
            artwork.auctionEnd = new Date(Date.now() + hours * 3600000).toISOString();
        }

        setStatus(t('art.saving','Saving artwork info...'));
        const createResult = await _artFetch('/api/art/artwork', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artwork })
        });
        if (!createResult.ok) throw new Error('Failed to save artwork');
        const artworkId = createResult.id;

        // NFT 민팅
        if (mintNFT) {
            setStatus(t('art.minting','Preparing NFT minting...'));
            try {
                const nftResult = await mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent);
                await _artFetch('/api/art/artwork', {
                    method: 'PUT',
                    headers: _artHeaders(),
                    body: JSON.stringify({
                        id: artworkId,
                        updateData: {
                            isNFT: true,
                            nftTokenId: nftResult.tokenId,
                            nftContract: nftResult.contractAddress,
                            nftType,
                            ipfsImageUri: nftResult.ipfsImageUri,
                            ipfsMetadataUri: nftResult.ipfsMetadataUri,
                            editionCount: nftType === 'erc1155' ? editionCount : 1,
                            mintTxHash: nftResult.txHash || null
                        }
                    })
                });
                setStatus(t('art.mint_done','NFT minting complete!'));
            } catch (nftErr) {
                console.error('🎨 [NFT] Mint failed:', nftErr);
                setStatus('\u26A0\uFE0F ' + t('art.status_registered','Artwork registered') + ' (' + t('art.minting_failed','Minting failed') + ': ' + nftErr.message + ')');
            }
        }

        await _updateArtistProfile(currentUser.uid, {
            totalWorks: { _inc: 1 },
            totalWorksCount: { _inc: 1 },
            lastUpload: new Date().toISOString()
        });

        showToast('\uD83C\uDFA8 "' + title + '" ' + t('art.registration_complete','Registration complete!') + (mintNFT ? ' (NFT \u2705)' : ''), 'success');
        _resetArtForm();
        loadArtGallery();
        loadMyCollection('my-artworks');

    } catch (error) {
        console.error('🎨 [Upload] Error:', error);
        setStatus('\u274C ' + t('art.registration_failed','Registration failed') + ': ' + error.message);
        showToast(t('art.registration_failed','Registration failed') + ': ' + error.message, 'error');
    }
}


// ============================================================
// 6. NFT 민팅
// ============================================================

async function mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent) {
    if (!tw5SDK) throw new Error(t('art.sdk_not_init','Thirdweb SDK not initialized'));
    const contract = nftType === 'erc721' ? erc721Contract : erc1155Contract;
    if (!contract) throw new Error(nftType.toUpperCase() + ' ' + t('art.contract_not_set','contract not configured'));
    if (!window.ethereum) throw new Error(t('art.metamask_required','MetaMask is required'));
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

    await _artFetch('/api/art/nft-record', {
        method: 'POST',
        headers: _artHeaders(),
        body: JSON.stringify({
            record: {
                artworkId, tokenId: parseInt(tokenId), contractAddress, nftType,
                ownerWallet: walletAddress, ownerUserId: currentUser.uid,
                minterUserId: currentUser.uid, minterWallet: walletAddress,
                ipfsImageUri, ipfsMetadataUri, editionCount: nftType === 'erc1155' ? editionCount : 1,
                royaltyPercent, txHash, chainId: ART_CONFIG.chainId, mintedAt: new Date().toISOString(), status: 'minted'
            }
        })
    });

    return { tokenId: parseInt(tokenId), contractAddress, ipfsImageUri, ipfsMetadataUri, txHash };
}

async function mintExistingArtwork(artworkId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
    try {
        const artData = await _artFetch('/api/art/artwork?id=' + encodeURIComponent(artworkId), { headers: _artHeaders() });
        if (!artData.ok) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = artData;
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
        await _artFetch('/api/art/artwork', {
            method: 'PUT',
            headers: _artHeaders(),
            body: JSON.stringify({
                id: artworkId,
                updateData: {
                    isNFT: true, nftTokenId: result.tokenId, nftContract: result.contractAddress, nftType: type,
                    ipfsImageUri: result.ipfsImageUri, ipfsMetadataUri: result.ipfsMetadataUri,
                    editionCount: type === 'erc1155' ? editionCount : 1, mintTxHash: result.txHash
                }
            })
        });
        showToast('\uD83C\uDF89 ' + t('art.nft_mint_complete','NFT minting complete!') + ' Token #' + result.tokenId, 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        viewArtwork(artworkId);
    } catch (error) {
        showToast(t('art.nft_mint_failed','NFT minting failed') + ': ' + error.message, 'error');
    }
}


// ============================================================
// 7. 갤러리
// ============================================================

async function loadArtGallery() {
    const container = document.getElementById('art-gallery');
    if (!container) return;
    container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${createLucideIcon('palette')} ${t('art.loading','Loading...')}</p>`;

    try {
        const filterCat  = document.getElementById('art-filter-category')?.value || 'all';
        const filterSort = document.getElementById('art-filter-sort')?.value || 'newest';
        const filterNFT  = document.getElementById('art-filter-nft')?.value || 'all';

        const qs = new URLSearchParams({ category: filterCat, sort: filterSort, nft: filterNFT, limit: '40' });
        const data = await _artFetch('/api/art/gallery?' + qs.toString(), { headers: _artHeaders() });

        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('art.no_artworks_yet','No artworks registered yet. Register your first artwork!')} ${createLucideIcon('palette')}</p>`;
            return;
        }

        container.innerHTML = data.items.map(art => _renderArtCard(art)).join('');
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (error) {
        container.innerHTML = `<p style="color:red; grid-column:1/-1;">${t('art.load_failed','Load failed')}: ${error.message}</p>`;
    }
}

function _renderArtCard(art) {
    const catLabel = ART_CATEGORIES[art.category] || 'Art';
    const imgSrc = art.thumbnailUrl || art.imageUrl || art.imageData || '';

    let badges = '';
    if (art.isNFT) {
        const typeLabel = art.nftType === 'erc1155' ? `Ed.×${art.editionCount || '?'}` : '1/1';
        badges += `<div style="position:absolute;top:6px;right:6px;background:rgba(138,43,226,0.9);color:#E8D5C4;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:700;backdrop-filter:blur(4px)"><i data-lucide="link" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> NFT · ${typeLabel}</div>`;
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
        const endMs = typeof art.auctionEnd === 'string' ? new Date(art.auctionEnd).getTime() : (art.auctionEnd?.seconds ? art.auctionEnd.seconds * 1000 : art.auctionEnd);
        const ended = endMs && new Date(endMs) < new Date();
        priceLabel = ended
            ? '<span style="color:#B54534">' + t('art.auction_ended','Auction ended') + '</span>'
            : `<span style="color:#C4841D"><i data-lucide="gavel" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${art.currentBid || art.startPrice} CRAC</span>`;
    } else {
        priceLabel = '<span style="color:var(--accent)">' + t('art.on_display','On display') + '</span>';
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
        const artData = await _artFetch('/api/art/artwork?id=' + encodeURIComponent(artId), { headers: _artHeaders() });
        if (!artData.ok) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = artData;

        // Increment views
        _artFetch('/api/art/artwork', {
            method: 'PUT',
            headers: _artHeaders(),
            body: JSON.stringify({ id: artId, updateData: { views: (art.views || 0) + 1 } })
        }).catch(e => console.warn(e.message));

        const catLabel = ART_CATEGORIES[art.category] || 'Art';
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
                        <span>${isSoldOut ? '\uD83D\uDEAB ' + t('art.sold_out','Sold out') : '\uD83D\uDCE6 ' + t('art.remaining','Remaining') + ' ' + remaining + '/' + art.totalSupply}</span>
                        <span style="color:var(--accent)">${pct}% ${t('art.sold','Sold')}</span>
                    </div>
                    <div style="background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden">
                        <div style="background:${isSoldOut ? '#B54534' : '#5B7B8C'};height:100%;width:${pct}%;border-radius:4px;transition:width .3s"></div>
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
                        <div>${t('art.weight','Weight')}: <strong>${artistWeight}x</strong></div>
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
                    <div style="font-weight:700;margin-bottom:.4rem">\uD83D\uDD17 ${t('art.nft_certified','NFT Certified')}</div>
                    <div style="font-size:.78rem;display:grid;gap:.2rem">
                        <div>${t('art.type','Type')}: ${typeLabel}</div>
                        <div>Token ID: #${art.nftTokenId}</div>
                        <div>${t('art.contract','Contract')}: <a href="${scanUrl}" target="_blank" style="color:#E8D5C4;text-decoration:underline">${cShort}</a></div>
                        <div>${t('art.royalty','Royalty')}: ${art.royaltyPercent || 10}%</div>
                        ${ipfsUrl ? `<div>IPFS: <a href="${ipfsUrl}" target="_blank" style="color:#E8D5C4;text-decoration:underline">${t('art.view_original','View original')}</a></div>` : ''}
                        ${art.mintTxHash ? `<div>TX: <a href="https://polygonscan.com/tx/${art.mintTxHash}" target="_blank" style="color:#E8D5C4;text-decoration:underline">${art.mintTxHash.slice(0,10)}\u2026</a></div>` : ''}
                    </div>
                </div>`;
        }

        // Action buttons
        let actionHtml = '';
        const isSoldOut = art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0;

        if ((art.saleType === 'fixed' || art.basePrice > 0) && !isOwner && art.status === 'active') {
            if (isSoldOut) {
                actionHtml = `<button disabled style="background:#6B5744;color:#E8D5C4;border:none;padding:.8rem 2rem;border-radius:8px;width:100%;font-weight:700;cursor:not-allowed">SOLD OUT</button>`;
            } else {
                actionHtml = `
                    <div style="display:flex;gap:.5rem">
                        <button onclick="buyArtwork('${artId}')" style="background:#3D2B1F;color:#E8D5C4;border:none;padding:.8rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:700;flex:1"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${effectivePrice} ${art.priceToken || 'CRAC'} ${t('art.purchase','Purchase')}</button>
                        <button onclick="reserveArtwork('${artId}')" style="background:#C4841D;color:#E8D5C4;border:none;padding:.8rem 1rem;border-radius:8px;cursor:pointer;font-weight:700">\uD83D\uDCC5 ${t('art.reserve','Reserve')}</button>
                    </div>
                    <p style="font-size:.7rem;color:var(--accent);margin-top:.3rem;text-align:center">\uD83D\uDCC5 ${t('art.reserve','Reserve')}: ${t('art.deposit','Deposit')} ${Math.ceil(effectivePrice / 10)} ${art.priceToken || 'CRAC'} (1/10) \u00B7 ${t('art.pay_balance_within_year','Pay balance within 1 year')}</p>`;
            }
        } else if (art.saleType === 'auction' && !isOwner) {
            const curBid = art.currentBid || art.startPrice || 1;
            const minBid = curBid + 1;
            actionHtml = `
                <div style="display:flex;gap:.5rem">
                    <input type="number" id="bid-amount-${artId}" value="${minBid}" min="${minBid}" style="flex:1;padding:.7rem;border:1px solid var(--border);border-radius:6px">
                    <button onclick="placeBid('${artId}')" style="background:#C4841D;color:#E8D5C4;border:none;padding:.8rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:700">\uD83D\uDD28 ${t('art.bid','Bid')}</button>
                </div>
                <p style="font-size:.75rem;color:var(--accent);margin-top:.3rem">${t('art.current_highest','Current highest')}: ${curBid} CRAC${art.highestBidderNickname ? ' (' + art.highestBidderNickname + ')' : ''}</p>`;
        }

        if (isOwner) {
            actionHtml = '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
            if (!art.isNFT) {
                actionHtml += `<button onclick="mintExistingArtwork('${artId}')" style="background:linear-gradient(135deg,#8B6914,#6B5744);color:#E8D5C4;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem;flex:1">\uD83D\uDD17 ${t('art.nft_mint','NFT Mint')}</button>`;
            }
            actionHtml += `<button onclick="deleteArtwork('${artId}')" style="background:#B54534;color:#E8D5C4;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem">${t('art.delete','Delete')}</button></div>`;
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
                        ${catLabel} · <span onclick="viewArtistProfile('${art.artistId}')" style="cursor:pointer;text-decoration:underline">${art.artistNickname || t('art.anonymous','Anonymous')}</span> · <i data-lucide="eye" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${(art.views||0)+1} · <i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${art.likes||0}
                    </div>
                    ${art.description ? `<p style="font-size:.9rem;line-height:1.6;margin-bottom:1rem;color:#3D2B1F">${art.description}</p>` : ''}
                    ${supplyHtml}
                    ${priceInfoHtml}
                    ${nftInfoHtml}
                    <div style="display:flex;gap:.5rem;margin-bottom:1rem">
                        <button onclick="likeArtwork('${artId}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.like','Like')}</button>
                        <button onclick="shareArtwork('${artId}','${art.title.replace(/'/g, "\\'")}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer">\uD83D\uDD17 ${t('art.share','Share')}</button>
                    </div>
                    ${actionHtml}
                </div>
            </div>`;

        document.body.appendChild(modal);
    } catch (error) {
        showToast(t('art.artwork_load_failed','Artwork load failed') + ': ' + error.message, 'error');
    }
}


// ============================================================
// 9. 좋아요 / 공유 / 삭제
// ============================================================

async function likeArtwork(artId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
    try {
        const result = await _artFetch('/api/art/like', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artId })
        });
        if (result.alreadyLiked) { showToast(t('art.already_liked','You already liked this artwork'), 'info'); return; }
        if (result.ok) showToast('<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('art.liked','Liked!'), 'success');
    } catch (e) { console.error('🎨 [Like]', e); }
}

function shareArtwork(artId, title) {
    const url = `https://crowny.org/art/${artId}`;
    if (navigator.share) {
        navigator.share({ title: `CROWNY ART: ${title}`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('\uD83D\uDD17 ' + t('art.link_copied','Link copied!'), 'success')).catch(e => console.warn(e.message));
    }
}

async function deleteArtwork(artId) {
    const confirmed = await showConfirmModal(t('art.delete_artwork','Delete Artwork'), t('art.confirm_delete','Are you sure you want to delete this artwork?\n(NFTs remain on-chain)'));
    if (!confirmed) return;
    try {
        const result = await _artFetch('/api/art/delete', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artId })
        });
        if (result.ok) {
            showToast('\uD83D\uDDD1\uFE0F ' + t('art.delete_complete','Deletion complete'), 'success');
            const modal = document.getElementById('art-modal');
            if (modal) modal.remove();
            loadArtGallery();
        } else {
            showToast(t('art.delete_failed','Deletion failed') + ': ' + (result.error || ''), 'error');
        }
    } catch (e) { showToast(t('art.delete_failed','Deletion failed') + ': ' + e.message, 'error'); }
}


// ============================================================
// 10. 구매 시스템 (강화)
// ============================================================

async function buyArtwork(artId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }

    try {
        const artData = await _artFetch('/api/art/artwork?id=' + encodeURIComponent(artId), { headers: _artHeaders() });
        if (!artData.ok) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = artData;
        if (art.status !== 'active') { showToast(t('art.already_sold','Already sold'), 'warning'); return; }

        // Supply check
        if (art.totalSupply > 0) {
            const remaining = art.totalSupply - (art.soldCount || 0);
            if (remaining <= 0) { showToast('\uD83D\uDEAB ' + t('art.sold_out_artwork','This artwork is sold out'), 'warning'); return; }
        }

        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, art.artistWeight || 1);
        const platformFee = Math.round(effectivePrice * (ART_CONFIG.platformFeePercent / 100) * 100) / 100;
        const artistReceive = Math.round((effectivePrice - platformFee) * 100) / 100;

        // Purchase confirmation with details
        const confirmMsg = `"${art.title}"\n\n` +
            `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.price','Price')}: ${effectivePrice} ${art.priceToken || 'CRAC'}\n` +
            (art.basePrice && art.artistWeight > 1 ? `   (${t('art.base_price','Base price')} ${art.basePrice} \u00D7 ${t('art.weight','Weight')} ${art.artistWeight}x)\n` : '') +
            `\uD83D\uDCCA ${t('art.fee','Fee')}: ${platformFee} (${ART_CONFIG.platformFeePercent}%)\n` +
            `\uD83C\uDFA8 ${t('art.artist_receives','Artist receives')}: ${artistReceive}\n` +
            (art.totalSupply > 0 ? `\uD83D\uDCE6 ${t('art.remaining','Remaining')}: ${art.totalSupply - (art.soldCount || 0) - 1}/${art.totalSupply}\n` : '') +
            (art.isNFT ? '\n\uD83D\uDD17 ' + t('art.nft_ownership_transfer','NFT ownership will be transferred') : '') +
            `\n\n${t('art.proceed_purchase','Proceed with purchase?')}`;

        const confirmBuy = await showConfirmModal(t('art.buy_confirm','Confirm Purchase'), confirmMsg);
        if (!confirmBuy) return;

        // Execute purchase via server
        const result = await _artFetch('/api/art/buy', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artId })
        });

        if (!result.ok) {
            if (result.error === 'insufficient_balance') {
                showToast(t('art.insufficient_crac','Insufficient CRAC balance') + '. ' + t('art.balance_held','Held') + ': ' + result.balance + ', ' + t('art.balance_needed','Needed') + ': ' + result.needed, 'warning');
            } else {
                showToast(t('art.purchase_failed','Purchase failed') + ': ' + (result.error || ''), 'error');
            }
            return;
        }

        // Referral
        if (typeof distributeReferralReward === 'function') {
            try { await distributeReferralReward(currentUser.uid, effectivePrice, art.priceToken || 'CRAC'); } catch(e) { console.warn(e); }
        }

        // Update artist profile + recalculate weight
        await _updateArtistProfile(art.artistId, {
            totalSales: { _inc: 1 },
            totalSoldCount: { _inc: 1 },
            totalRevenue: { _inc: artistReceive }
        });
        await _recalculateArtistWeight(art.artistId);

        showToast('\uD83C\uDF89 "' + art.title + '" ' + t('art.purchase_complete','Purchase complete!') + (art.isNFT ? ' \uD83D\uDD17 ' + t('art.nft_ownership_transferred','NFT ownership transferred') : ''), 'success');

        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
        loadMyCollection('my-purchases');
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast(t('art.purchase_failed','Purchase failed') + ': ' + error.message, 'error');
    }
}

async function placeBid(artId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
    const bidInput = document.getElementById(`bid-amount-${artId}`);
    const bidAmount = parseFloat(bidInput?.value);
    try {
        const result = await _artFetch('/api/art/bid', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artId, bidAmount })
        });

        if (!result.ok) {
            if (result.error === 'bid_too_low') {
                showToast(t('art.minimum_bid','Minimum bid') + ': ' + result.minBid + ' CRAC', 'warning');
            } else if (result.error === 'insufficient_balance') {
                showToast(t('art.insufficient_crac','Insufficient CRAC balance') + '. ' + t('art.balance_held','Held') + ': ' + result.balance, 'warning');
            } else {
                showToast(t('art.bid_failed','Bid failed') + ': ' + (result.error || ''), 'error');
            }
            return;
        }

        showToast('\uD83D\uDD28 ' + bidAmount + ' CRAC ' + t('art.bid_complete','Bid placed!'), 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
    } catch (error) { showToast(t('art.bid_failed','Bid failed') + ': ' + error.message, 'error'); }
}


// ============================================================
// 11. 예약 구매 시스템
// ============================================================

async function reserveArtwork(artId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }

    try {
        const artData = await _artFetch('/api/art/artwork?id=' + encodeURIComponent(artId), { headers: _artHeaders() });
        if (!artData.ok) { showToast(t('art.not_found','Artwork not found'), 'warning'); return; }
        const art = artData;

        if (art.status !== 'active') { showToast(t('art.not_available','This artwork is not available for purchase'), 'warning'); return; }
        if (art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0) {
            showToast('\uD83D\uDEAB ' + t('art.sold_out_artwork','This artwork is sold out'), 'warning'); return;
        }

        const effectivePrice = art.price || _calcEffectivePrice(art.basePrice || 0, art.artistWeight || 1);
        const depositAmount = Math.ceil(effectivePrice / 10);
        const remainingAmount = effectivePrice - depositAmount;

        const confirmMsg = `\uD83D\uDCC5 ${t('art.reserve_purchase','Reserve Purchase')}\n\n"${art.title}"\n\n` +
            `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.total_price','Total price')}: ${effectivePrice} ${art.priceToken || 'CRAC'}\n` +
            `\uD83D\uDCB5 ${t('art.deposit','Deposit')} (1/10): ${depositAmount} ${art.priceToken || 'CRAC'}\n` +
            `\uD83D\uDCCB ${t('art.balance_due','Balance due')}: ${remainingAmount} ${art.priceToken || 'CRAC'}\n` +
            `\u23F0 ${t('art.payment_deadline','Payment deadline')}: ${t('art.one_year','1 year')}\n\n` +
            `\u26A0\uFE0F ${t('art.deposit_no_refund','Deposit is non-refundable if reservation is cancelled.')}\n\n${t('art.proceed_question','Proceed?')}`;

        const confirmed = await showConfirmModal('\uD83D\uDCC5 ' + t('art.reserve_purchase','Reserve Purchase'), confirmMsg);
        if (!confirmed) return;

        const result = await _artFetch('/api/art/reserve', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artId })
        });

        if (!result.ok) {
            if (result.error === 'insufficient_balance') {
                showToast(t('art.insufficient_deposit','Insufficient deposit') + '. ' + t('art.balance_held','Held') + ': ' + result.balance + ', ' + t('art.balance_needed','Needed') + ': ' + result.needed, 'warning');
            } else {
                showToast(t('art.reservation_failed','Reservation failed') + ': ' + (result.error || ''), 'error');
            }
            return;
        }

        showToast('\uD83D\uDCC5 "' + art.title + '" ' + t('art.reservation_complete','Reservation complete!') + ' ' + t('art.deposit','Deposit') + ' ' + result.depositAmount + ' ' + (art.priceToken || 'CRAC') + ' ' + t('art.paid','paid'), 'success');

        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast(t('art.reservation_failed','Reservation failed') + ': ' + error.message, 'error');
    }
}

async function completeReservation(reservationId) {
    if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }

    try {
        // Get reservation info for confirmation dialog
        const myRes = await _artFetch('/api/art/my-reservations', { headers: _artHeaders() });
        const reservation = myRes.ok ? myRes.items.find(r => r.id === reservationId) : null;

        if (!reservation) { showToast(t('art.reservation_not_found','Reservation not found'), 'warning'); return; }
        if (reservation.buyerId !== currentUser.uid) { showToast(t('art.own_reservation_only','Only your own reservations can be paid'), 'warning'); return; }
        if (reservation.status !== 'reserved') { showToast(t('art.reservation_already_processed','This reservation has already been processed'), 'info'); return; }

        const expiresAt = new Date(reservation.expiresAt);
        if (new Date() > expiresAt) {
            showToast('\u23F0 ' + t('art.reservation_expired','Reservation has expired'), 'warning');
            return;
        }

        const confirmed = await showConfirmModal(t('art.pay_balance','Pay Balance'), '"' + reservation.artworkTitle + '"\n\n' + t('art.balance_due','Balance due') + ': ' + reservation.remainingAmount + ' ' + (reservation.depositToken || 'CRAC') + '\n\n' + t('art.proceed_payment','Proceed with payment?'));
        if (!confirmed) return;

        const result = await _artFetch('/api/art/complete-reservation', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ reservationId })
        });

        if (!result.ok) {
            if (result.error === 'insufficient_balance') {
                showToast(t('art.insufficient_balance','Insufficient balance') + '. ' + t('art.balance_held','Held') + ': ' + result.balance + ', ' + t('art.balance_needed','Needed') + ': ' + result.needed, 'warning');
            } else if (result.error === 'expired') {
                showToast('\u23F0 ' + t('art.reservation_expired','Reservation has expired'), 'warning');
            } else {
                showToast(t('art.balance_payment_failed','Balance payment failed') + ': ' + (result.error || ''), 'error');
            }
            return;
        }

        // Update artist profile + recalculate weight
        const platformFee = Math.round(reservation.totalPrice * 2.5 / 100 * 100) / 100;
        const artistReceiveRemaining = Math.round((reservation.remainingAmount - platformFee) * 100) / 100;
        await _updateArtistProfile(reservation.artistId, {
            totalSales: { _inc: 1 },
            totalSoldCount: { _inc: 1 },
            totalRevenue: { _inc: artistReceiveRemaining }
        });
        await _recalculateArtistWeight(reservation.artistId);

        showToast('\uD83C\uDF89 "' + reservation.artworkTitle + '" ' + t('art.balance_payment_complete','Balance payment complete!'), 'success');
        loadMyCollection('my-reservations');
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast(t('art.balance_payment_failed','Balance payment failed') + ': ' + error.message, 'error');
    }
}

async function cancelReservation(reservationId) {
    if (!currentUser) return;
    try {
        const confirmed = await showConfirmModal('\u26A0\uFE0F ' + t('art.cancel_reservation','Cancel Reservation'),
            t('art.cancel_reservation_confirm','Cancel this reservation?') + '\n\n\u26A0\uFE0F ' + t('art.deposit_no_refund','Deposit is non-refundable if reservation is cancelled.'));
        if (!confirmed) return;

        const result = await _artFetch('/api/art/cancel-reservation', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ reservationId })
        });
        if (result.ok) {
            showToast(t('art.reservation_cancelled','Reservation cancelled (deposit non-refundable)'), 'info');
            loadMyCollection('my-reservations');
        }
    } catch (error) {
        showToast(t('art.cancel_failed','Cancellation failed') + ': ' + error.message, 'error');
    }
}


// ============================================================
// 12. 자동 기부 (handled server-side in /api/art/buy)
// ============================================================

// _artDonationAuto is now handled server-side during buy


// ============================================================
// 13. 내 컬렉션 (상단 배치, 탭 시스템)
// ============================================================

async function loadMyCollection(tab) {
    if (!currentUser) {
        const container = document.getElementById('my-collection-content');
        if (container) container.innerHTML = '<div class="art-empty-state"><span class="icon">\uD83D\uDD12</span><p>' + t('art.login_to_view_collection','Log in to view your collection') + '</p></div>';
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
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">' + t('art.loading','Loading...') + '</p>';
    try {
        const data = await _artFetch('/api/art/my-artworks', { headers: _artHeaders() });
        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('palette')}</span><p>${t('art.no_registered_works','No registered artworks')}<br><small>${t('art.upload_first_work','Press the upload button to register your first artwork!')}</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        data.items.forEach(art => {
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            const status = art.status === 'sold' ? '\u2705 ' + t('art.sold','Sold') : art.status === 'active' ? '\uD83D\uDFE2 ' + t('art.on_sale','On sale') : '\u2B1C';
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
        container.innerHTML = `<div class="art-empty-state"><span class="icon">\u26A0\uFE0F</span><p>${t('art.load_failed','Load failed')}: ${e.message}</p></div>`;
    }
}

async function _loadMyPurchases(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">' + t('art.loading','Loading...') + '</p>';
    try {
        const data = await _artFetch('/api/art/my-purchases', { headers: _artHeaders() });
        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('shopping-cart')}</span><p>${t('art.no_purchases','No purchased artworks')}<br><small>${t('art.browse_gallery','Browse the gallery to find artworks you love!')}</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        data.items.forEach(art => {
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            html += `
                <div onclick="viewArtwork('${art.id}')" class="collection-card">
                    <img src="${img}" loading="lazy">
                    <div class="collection-card-info">
                        <div class="collection-card-title">${art.title}</div>
                        <div class="collection-card-meta">\uD83C\uDFA8 ${art.artistNickname || t('art.anonymous','Anonymous')} ${art.isNFT ? createLucideIcon('link', 12) : ''}</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">\u26A0\uFE0F</span><p>${t('art.load_failed','Load failed')}: ${e.message}</p></div>`;
    }
}

async function _loadMyNFTs(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">' + t('art.loading','Loading...') + '</p>';
    try {
        const data = await _artFetch('/api/art/my-nfts', { headers: _artHeaders() });
        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('link')}</span><p>${t('art.no_nfts','No NFTs owned')}<br><small>${t('art.mint_or_buy_nft','Mint your artwork as an NFT or purchase one!')}</small></p></div>`;
            return;
        }

        let html = '<div class="collection-scroll">';
        data.items.forEach(art => {
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
        container.innerHTML = `<div class="art-empty-state"><span class="icon">\u26A0\uFE0F</span><p>${t('art.load_failed','Load failed')}: ${e.message}</p></div>`;
    }
}

async function _loadMyReservations(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">' + t('art.loading','Loading...') + '</p>';
    try {
        const data = await _artFetch('/api/art/my-reservations', { headers: _artHeaders() });
        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = '<div class="art-empty-state"><span class="icon">\uD83D\uDCC5</span><p>' + t('art.no_reservations','No reservations') + '</p></div>';
            return;
        }

        let html = '<div style="display:grid;gap:.8rem">';
        data.items.forEach(r => {
            const expiresAt = new Date(r.expiresAt);
            const isExpired = new Date() > expiresAt;
            const statusLabel = r.status === 'completed' ? '\u2705 ' + t('art.completed','Completed') :
                r.status === 'cancelled' ? '\u274C ' + t('art.cancelled','Cancelled') :
                isExpired ? '\u23F0 ' + t('art.expired','Expired') : '\uD83D\uDCC5 ' + t('art.reserved','Reserved');
            const img = r.artworkImage || '';

            html += `
                <div style="background:#FFF8F0;border-radius:10px;padding:.8rem;display:flex;gap:.8rem;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
                    ${img ? `<img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">` : ''}
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.artworkTitle}</div>
                        <div style="font-size:.75rem;color:var(--accent)">${statusLabel} \u00B7 ${t('art.total','Total')} ${r.totalPrice} ${r.depositToken || 'CRAC'}</div>
                        <div style="font-size:.7rem;color:var(--accent)">${t('art.deposit','Deposit')}: ${r.depositAmount} \u00B7 ${t('art.balance_due','Balance due')}: ${r.remainingAmount}</div>
                        ${r.status === 'reserved' && !isExpired ? `<div style="font-size:.7rem;color:#C4841D">${t('art.expires','Expires')}: ${expiresAt.toLocaleDateString()}</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:.3rem">
                        ${r.status === 'reserved' && !isExpired ? `
                            <button onclick="completeReservation('${r.id}')" style="background:#5B7B8C;color:#E8D5C4;border:none;padding:.4rem .6rem;border-radius:6px;cursor:pointer;font-size:.75rem;font-weight:600"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('art.pay_balance_short','Balance')}</button>
                            <button onclick="cancelReservation('${r.id}')" style="background:none;border:1px solid #E8E0D8;padding:.3rem .5rem;border-radius:6px;cursor:pointer;font-size:.7rem;color:#6B5744">${t('art.cancel','Cancel')}</button>
                        ` : ''}
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    } catch (e) {
        container.innerHTML = `<div class="art-empty-state"><span class="icon">\u26A0\uFE0F</span><p>${t('art.load_failed','Load failed')}: ${e.message}</p></div>`;
    }
}

async function _loadMyTransactions(container) {
    container.innerHTML = '<p style="color:var(--accent);text-align:center;padding:1rem">' + t('art.loading','Loading...') + '</p>';
    try {
        const data = await _artFetch('/api/art/my-transactions', { headers: _artHeaders() });
        if (!data.ok || !data.items || !data.items.length) {
            container.innerHTML = `<div class="art-empty-state"><span class="icon">${createLucideIcon('clipboard')}</span><p>${t('art.no_transactions','No transaction history')}</p></div>`;
            return;
        }

        let html = '<div style="display:grid;gap:.5rem">';
        data.items.forEach(tx => {
            const date = new Date(tx.timestamp);
            const typeLabel = {
                'art_purchase': t('art.purchase','Purchase'),
                'art_reservation_deposit': t('art.reservation_deposit','Reservation deposit'),
                'art_reservation_complete': t('art.reservation_complete_label','Reservation complete')
            }[tx.type] || tx.type;
            const dirIcon = tx.direction === 'in' ? '<i data-lucide="arrow-down-left" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>' : '<i data-lucide="arrow-up-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
            const dirColor = tx.direction === 'in' ? '#5B7B8C' : '#e53935';

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
        container.innerHTML = `<div class="art-empty-state"><span class="icon">\u26A0\uFE0F</span><p>${t('art.load_failed','Load failed')}: ${e.message}</p></div>`;
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
        // Get user info for init data
        let initData = null;
        const profileCheck = await _artFetch('/api/art/artist-profile?artistId=' + encodeURIComponent(userId), { headers: _artHeaders() });
        if (!profileCheck.profile) {
            // Need to create profile - get user info
            const userInfo = await _artFetch('/api/art/user-info', { headers: _artHeaders() });
            initData = {
                nickname: userInfo.ok ? (userInfo.nickname || '') : '',
                email: userInfo.ok ? (userInfo.email || '') : ''
            };
        }

        await _artFetch('/api/art/artist-profile', {
            method: 'POST',
            headers: _artHeaders(),
            body: JSON.stringify({ artistId: userId, updateData, initData })
        });
    } catch (e) { console.warn('🎨 [Profile] Update failed:', e.message); }
}

async function viewArtistProfile(artistId) {
    try {
        const [profileData, worksData] = await Promise.all([
            _artFetch('/api/art/artist-profile?artistId=' + encodeURIComponent(artistId), { headers: _artHeaders() }),
            _artFetch('/api/art/artist-works?artistId=' + encodeURIComponent(artistId), { headers: _artHeaders() })
        ]);

        const profile = (profileData.ok && profileData.profile) ? profileData.profile : {};
        const nickname = profile.nickname || t('art.anonymous_artist','Anonymous artist');
        const weight = profile.weightMultiplier || 1.0;
        const worksCount = worksData.ok ? worksData.count : 0;

        const modal = document.createElement('div');
        modal.id = 'artist-profile-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,.88);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#FFF8F0;border-radius:12px;max-width:400px;width:100%;padding:1.5rem">
                <div style="text-align:center;margin-bottom:1rem">
                    <div style="width:60px;height:60px;background:linear-gradient(135deg,#8B6914,#6B5744);border-radius:50%;margin:0 auto .5rem;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#E8D5C4">${nickname.charAt(0).toUpperCase()}</div>
                    <h3>${nickname} ${profile.verified ? '✅' : ''}</h3>
                    <div style="font-size:.85rem;color:#8B2BE2;margin-top:.3rem">\u2B50 ${t('art.artist_weight','Artist weight')}: ${weight}x</div>
                    ${profile.bio ? `<p style="font-size:.85rem;color:var(--accent);margin-top:.3rem">${profile.bio}</p>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem;text-align:center;margin-bottom:1rem">
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${worksCount}</div><div style="font-size:.7rem;color:var(--accent)">${t('art.works','Works')}</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalSales || 0}</div><div style="font-size:.7rem;color:var(--accent)">${t('art.sales','Sales')}</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalLikes || 0}</div><div style="font-size:.7rem;color:var(--accent)">${t('art.likes','Likes')}</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700;color:#8B2BE2">${weight}x</div><div style="font-size:.7rem;color:var(--accent)">${t('art.weight','Weight')}</div></div>
                </div>
                <button onclick="this.closest('#artist-profile-modal').remove()" style="width:100%;background:var(--bg);border:1px solid var(--border);padding:.6rem;border-radius:6px;cursor:pointer">${t('art.close','Close')}</button>
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
