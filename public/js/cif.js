// ═══════════════════════════════════════════════════════════
// CIF (Crowny Image Format) v1.0 — 순수 JS 인코더/디코더
// 원본: crowny-camera-cif.jsx → React 의존성 제거
//
// 4상균형3진법 이미지 포맷
//   3트릿 모드: 27색 (3^3), 최소용량
//   9트릿 모드: 19,683색 (3^9), 고화질
//   벡터 레이어 + RLE 압축
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';

    // ── 균형3진법 변환 ──
    function intToTrits(n, w = 6) {
        if (n === 0) return Array(w).fill(0);
        const t = []; let v = n;
        while (v !== 0 && t.length < w) {
            let r = ((v % 3) + 3) % 3;
            if (r === 2) { r = -1; v++; }
            t.push(r); v = Math.floor(v / 3);
        }
        while (t.length < w) t.push(0);
        return t.reverse();
    }

    // ── RGB → CrownyPixel (3트릿: 27색) ──
    function rgbToCrownyPixel(r, g, b) {
        return [
            r < 85 ? -1 : r < 170 ? 0 : 1,
            g < 85 ? -1 : g < 170 ? 0 : 1,
            b < 85 ? -1 : b < 170 ? 0 : 1,
        ];
    }

    // ── RGB → CrownyPixel (9트릿: 19,683색) ──
    function rgbToCrownyPixel9(r, g, b) {
        const encode = (v) => {
            const level = Math.round(v / 255 * 26);
            return intToTrits(level - 13, 3);
        };
        return [...encode(r), ...encode(g), ...encode(b)];
    }

    // ── CrownyPixel → RGB (디스플레이) ──
    function crownyPixel3ToRGB(t1, t2, t3) {
        return [
            Math.round((t1 + 1) * 127.5),
            Math.round((t2 + 1) * 127.5),
            Math.round((t3 + 1) * 127.5),
        ];
    }

    function crownyPixel9ToRGB(trits) {
        const decode = (t) => {
            const val = t[0] * 9 + t[1] * 3 + t[2];
            return Math.round((val + 13) / 26 * 255);
        };
        return [decode(trits.slice(0, 3)), decode(trits.slice(3, 6)), decode(trits.slice(6, 9))];
    }

    function arrEq(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        return a.every((v, i) => v === b[i]);
    }

    // ── 비트맵 → CIF 변환 (핵심 엔코더) ──
    function bitmapToCIF(imageData, width, height, options = {}) {
        const startTime = performance.now();
        const {
            colorDepth = 3,    // 3 또는 9 트릿
            vectorize = true,
            compress = true,
        } = options;

        // Phase 1: RGB → CrownyPixel
        const pixels = [];
        const pixelTrits = [];
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
            if (colorDepth === 9) {
                const cp = rgbToCrownyPixel9(r, g, b);
                pixels.push(cp);
                pixelTrits.push(...cp);
            } else {
                const cp = rgbToCrownyPixel(r, g, b);
                pixels.push(cp);
                pixelTrits.push(...cp);
            }
        }

        // Phase 2: 벡터 분석 (단색 영역 → 벡터 도형)
        const vectors = [];
        if (vectorize) {
            const visited = new Set();
            for (let y = 0; y < height; y += 4) {
                for (let x = 0; x < width; x += 4) {
                    const idx = y * width + x;
                    if (visited.has(idx)) continue;
                    const px = pixels[idx];
                    if (!px) continue;
                    let endX = x, endY = y;
                    while (endX < width - 1 && arrEq(pixels[y * width + endX + 1], px)) endX++;
                    while (endY < height - 1 && arrEq(pixels[(endY + 1) * width + x], px)) endY++;
                    if ((endX - x) > 2 && (endY - y) > 2) {
                        vectors.push({ type: 'rect', x, y, w: endX - x + 1, h: endY - y + 1, fill: px });
                        for (let vy = y; vy <= endY; vy++)
                            for (let vx = x; vx <= endX; vx++) visited.add(vy * width + vx);
                    }
                }
            }
        }

        // Phase 3: 런렝스 압축
        let compressed = pixelTrits;
        let compressionRatio = 1;
        if (compress) {
            const rle = [];
            let i = 0;
            while (i < pixelTrits.length) {
                const val = pixelTrits[i];
                let count = 1;
                while (i + count < pixelTrits.length && pixelTrits[i + count] === val && count < 364) count++;
                if (count > 3) {
                    rle.push(-1, 0, 1); // RLE 마커
                    rle.push(...intToTrits(count, 6));
                    rle.push(val);
                } else {
                    for (let j = 0; j < count; j++) rle.push(val);
                }
                i += count;
            }
            compressed = rle;
            compressionRatio = pixelTrits.length / compressed.length;
        }

        return {
            format: 'CIF/1.0',
            width, height, colorDepth,
            totalPixels: width * height,
            rawTrits: pixelTrits.length,
            compressedTrits: compressed.length,
            compressionRatio,
            vectors: vectors.length,
            pixels,
            compressed,
            vectorData: vectors,
            encodingTime: performance.now() - startTime,
            originalBytes: imageData.length,
            cifBytesEmul: Math.ceil(compressed.length * 2 / 8),
        };
    }

    // ── CIF → Canvas 렌더링 (디코더) ──
    function renderCIFToCanvas(canvas, cif) {
        if (!canvas || !cif) return;
        const ctx = canvas.getContext('2d');
        canvas.width = cif.width;
        canvas.height = cif.height;

        const imgData = ctx.createImageData(cif.width, cif.height);
        for (let i = 0; i < cif.pixels.length; i++) {
            const px = cif.pixels[i];
            let rgb;
            if (px.length === 9) {
                rgb = crownyPixel9ToRGB(px);
            } else {
                rgb = crownyPixel3ToRGB(px[0], px[1], px[2]);
            }
            imgData.data[i * 4] = rgb[0];
            imgData.data[i * 4 + 1] = rgb[1];
            imgData.data[i * 4 + 2] = rgb[2];
            imgData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // ── 이미지 파일 → CIF 변환 (File/Blob → CIF) ──
    function imageFileToCIF(file, maxSize = 640, colorDepth = 9) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                let w = img.width, h = img.height;
                // 리사이즈 (최대 maxSize)
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                    else { w = Math.round(w * maxSize / h); h = maxSize; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h).data;
                URL.revokeObjectURL(url);
                const cif = bitmapToCIF(imageData, w, h, { colorDepth, vectorize: true, compress: true });
                resolve(cif);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
            img.src = url;
        });
    }

    // ── CIF → Data URL (썸네일/공유용) ──
    function cifToDataURL(cif) {
        const canvas = document.createElement('canvas');
        renderCIFToCanvas(canvas, cif);
        return canvas.toDataURL('image/png');
    }

    // ── 외부 API ──
    window.CIF = {
        encode: bitmapToCIF,
        decode: renderCIFToCanvas,
        fromFile: imageFileToCIF,
        toDataURL: cifToDataURL,
        rgbToCrownyPixel,
        rgbToCrownyPixel9,
        crownyPixel3ToRGB,
        crownyPixel9ToRGB,
    };

    console.log('[CIF] Crowny Image Format v1.0 loaded');
})();
