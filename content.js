const BASE_URL = "https://woojangpark.site/v1";

// ========================================================
// 1. UI 생성 (우측 상단 플로팅 버튼)
// ========================================================
function createFloatingButton() {
    if (document.getElementById("perturba-floating-btn")) return;

    const button = document.createElement("button");
    button.id = "perturba-floating-btn";
    button.title = "Perturba로 이미지 보호하기";

    // 버튼 스타일 (우측 상단 배치, 원형, 로고 포함)
    Object.assign(button.style, {
        position: "fixed",
        top: "100px",       // 상단에서 100px (메뉴바 회피)
        right: "30px",      // 우측에서 30px
        zIndex: "9999",
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        backgroundColor: "white",
        border: "none",
        boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.2s ease-in-out"
    });

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icon.png");
    Object.assign(img.style, { width: "35px", height: "auto", pointerEvents: "none" });

    button.appendChild(img);
    button.addEventListener("click", openFileSelector);
    button.onmouseover = () => { button.style.transform = "scale(1.1)"; };
    button.onmouseout = () => { button.style.transform = "scale(1.0)"; };

    document.body.appendChild(button);
}

// ========================================================
// 2. 파일 선택 및 메인 로직
// ========================================================
function openFileSelector() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg, image/png"; 
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await processImage(file);
    };
    input.click();
}

async function processImage(file) {
    try {
        alert("🛡️ Perturba: 이미지 분석 및 업로드를 시작합니다...");

        // 1. 메타데이터 추출
        const meta = await getImageMeta(file);
        
        // 2. Presigned URL 발급
        const uploadInfo = await apiGetUploadUrl(meta);

        // 3. S3 업로드 (SKIP이 아닐 경우)
        if (uploadInfo.method !== 'SKIP' && uploadInfo.uploadUrl) {
            await apiUploadToS3(uploadInfo.uploadUrl, file, meta.mimeType);
        }

        // 4. 업로드 완료 통보
        const assetData = await apiCompleteAsset(uploadInfo.objectKey, meta);
        const assetId = assetData.assetId;

        // 5. 작업 생성
        alert("🛡️ Perturba: 변환 작업을 요청했습니다. 처리 중...");
        const jobData = await apiCreateJob(assetId);
        const jobId = jobData.publicId;

        // 6. 폴링 및 다운로드
        pollJobStatus(jobId, file.name);

    } catch (error) {
        console.error(error);
        // 401/403 에러면 로그인 안내
        if (error.message.includes("401") || error.message.includes("403")) {
            alert("로그인이 필요합니다. 확장프로그램 아이콘을 눌러 로그인해주세요.");
        } else {
            alert("❌ 오류 발생: " + error.message);
        }
    }
}

// ========================================================
// 3. API 호출 함수들
// ========================================================

async function apiGetUploadUrl(meta) {
    const res = await fetch(`${BASE_URL}/assets/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            filename: meta.filename,
            mimeType: meta.mimeType,
            sizeBytes: meta.sizeBytes,
            sha256Hex: meta.sha256Hex
        }),
        credentials: "include" // 쿠키 전송
    });
    if (!res.ok) throw new Error(`Upload URL 실패 (${res.status})`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message || "Upload URL Error");
    return json.data;
}

async function apiUploadToS3(url, file, mimeType) {
    const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file
        // S3에는 credentials: include 금지 (CORS 에러남)
    });
    if (!res.ok) throw new Error(`S3 업로드 실패 (${res.status})`);
}

async function apiCompleteAsset(objectKey, meta) {
    const res = await fetch(`${BASE_URL}/assets/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            objectKey: objectKey,
            sha256Hex: meta.sha256Hex,
            width: meta.width,
            height: meta.height,
            mimeType: meta.mimeType,
            sizeBytes: meta.sizeBytes
        }),
        credentials: "include"
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message);
    return json.data;
}

async function apiCreateJob(assetId) {
    const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            inputAssetId: assetId,
            intensity: "MEDIUM",
            notifyVia: "NONE"
        }),
        credentials: "include"
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message);
    return json.data;
}

async function pollJobStatus(jobId, originalName) {
    let count = 0;
    const max = 60; // 60초 제한

    const interval = setInterval(async () => {
        count++;
        try {
            const res = await fetch(`${BASE_URL}/jobs/${jobId}/status`, {
                method: "GET",
                credentials: "include"
            });
            const json = await res.json();
            const status = json.data?.status;

            console.log(`Polling... ${status}`);

            if (status === "COMPLETED") {
                clearInterval(interval);
                // 결과 조회
                const resultRes = await fetch(`${BASE_URL}/jobs/${jobId}/result`, {
                    method: "GET",
                    credentials: "include"
                });
                const resultJson = await resultRes.json();
                const downloadUrl = resultJson.data?.perturbed?.url;
                
                if (downloadUrl) {
                    downloadImage(downloadUrl, "perturba_" + originalName);
                    alert("✅ 변환 완료! 이미지를 다운로드합니다.");
                } else {
                    alert("❌ 결과 URL이 없습니다.");
                }
            } else if (status === "FAILED") {
                clearInterval(interval);
                alert("❌ 변환 실패 (서버 오류)");
            } else if (count >= max) {
                clearInterval(interval);
                alert("⚠️ 시간 초과");
            }
        } catch (e) {
            clearInterval(interval);
            console.error(e);
        }
    }, 1000);
}

// ========================================================
// 4. 유틸리티
// ========================================================
async function getImageMeta(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({
                filename: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                sha256Hex: sha256Hex,
                width: img.width,
                height: img.height
            });
            URL.revokeObjectURL(img.src);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function downloadImage(url, filename) {
    fetch(url)
        .then(r => r.blob())
        .then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
}

// 1초마다 버튼 상태 체크 (SPA 페이지 대응)
setInterval(createFloatingButton, 1000);