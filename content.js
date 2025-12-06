// content.js

const API_BASE = "https://api.woojangpark.site";
const API_V1 = `${API_BASE}/v1`;

// ========================================================
// 0. 토스트 유틸 (페이지 우측 상단에 잠깐 뜨는 메시지)
// ========================================================
function showPerturbaToast(message, type = "info", duration = 2500) {
  let container = document.getElementById("perturba-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "perturba-toast-container";
    Object.assign(container.style, {
      position: "fixed",
      top: "90px",
      right: "30px",
      zIndex: "99999",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      maxWidth: "260px",
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.textContent = message;
  const bgColor =
    type === "error"
      ? "rgba(239, 68, 68, 0.96)" // 빨강
      : type === "success"
      ? "rgba(34, 197, 94, 0.96)" // 초록
      : "rgba(15, 23, 42, 0.9)"; // 진한 네이비

  Object.assign(toast.style, {
    padding: "10px 12px",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "13px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    background: bgColor,
    backdropFilter: "blur(6px)"
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s ease";
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.remove();
      if (!container.hasChildNodes()) {
        container.remove();
      }
    }, 300);
  }, duration);
}

// ========================================================
// 1. 플로팅 버튼 생성
// ========================================================
function createFloatingButton() {
  if (document.getElementById("perturba-floating-btn")) return;

  const button = document.createElement("button");
  button.id = "perturba-floating-btn";
  button.title = "Perturba로 이미지 보호하기";

  Object.assign(button.style, {
    position: "fixed",
    top: "100px", // 상단 메뉴 피해서
    right: "30px",
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
    transition: "transform 0.2s ease-in-out",
    padding: "0"
  });

  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("icon.png");
  Object.assign(img.style, {
    width: "35px",
    height: "auto",
    pointerEvents: "none"
  });

  button.appendChild(img);
  button.addEventListener("click", openFileSelector);
  button.onmouseover = () => {
    button.style.transform = "scale(1.08)";
  };
  button.onmouseout = () => {
    button.style.transform = "scale(1.0)";
  };

  document.body.appendChild(button);
}

// ========================================================
// 2. 파일 선택 → 메인 플로우
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
    showPerturbaToast("🛡️ 이미지 업로드 준비 중...", "info");

    // 1. 메타데이터 추출
    const meta = await getImageMeta(file);

    // 2. 업로드 URL 발급
    const uploadInfo = await apiGetUploadUrl(meta);

    // 3. S3 업로드 (SKIP이 아닌 경우에만)
    if (uploadInfo.method !== "SKIP" && uploadInfo.uploadUrl) {
      await apiUploadToS3(uploadInfo, file, meta.mimeType);
    }

    // 4. 업로드 완료 처리
    const assetData = await apiCompleteAsset(uploadInfo.objectKey);
    const assetId = assetData.assetId;
    if (!assetId) {
      throw new Error("assetId를 받지 못했습니다.");
    }

    // 5. 변환 Job 생성
    showPerturbaToast("🛡️ 변환 작업을 요청했습니다. 잠시만 기다려주세요...", "info");
    const jobData = await apiCreateJob(assetId);
    const publicId = jobData.publicId;

    // 6. 상태 폴링 & 결과 다운로드
    await pollJobStatusAndDownload(publicId, file.name);
  } catch (error) {
    console.error(error);
    const msg = String(error?.message || error);

    if (msg.includes("401") || msg.includes("403")) {
      showPerturbaToast(
        "로그인이 필요합니다. 확장프로그램 아이콘을 눌러 로그인해주세요.",
        "error",
        4000
      );
    } else {
      showPerturbaToast("❌ 오류 발생: " + msg, "error", 4000);
    }
  }
}

// ========================================================
// 3. API 호출 함수들
// ========================================================

async function apiGetUploadUrl(meta) {
  const res = await fetch(`${API_V1}/assets/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      filename: meta.filename,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      sha256Hex: meta.sha256Hex,
      width: meta.width,
      height: meta.height
    })
  });

  if (!res.ok) {
    throw new Error(`Upload URL 요청 실패 (${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error?.message || "Upload URL Error");
  }
  return json.data;
}

async function apiUploadToS3(uploadInfo, file, mimeType) {
  const res = await fetch(uploadInfo.uploadUrl, {
    method: uploadInfo.method || "PUT",
    headers: {
      "Content-Type": mimeType,
      ...(uploadInfo.headers || {})
    },
    body: file
  });

  if (!res.ok) {
    throw new Error(`S3 업로드 실패 (${res.status})`);
  }
}

async function apiCompleteAsset(objectKey) {
  const res = await fetch(`${API_V1}/assets/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ objectKey })
  });

  if (!res.ok) {
    throw new Error(`업로드 완료 처리 실패 (${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error?.message || "Complete Asset Error");
  }
  return json.data;
}

async function apiCreateJob(assetId) {
  const res = await fetch(`${API_V1}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": crypto.randomUUID()
    },
    credentials: "include",
    body: JSON.stringify({
      inputAssetId: assetId,
      intensity: "MEDIUM",
      notifyVia: "NONE", // 지금은 폴링 방식, 나중에 SSE 쓰면 "SSE"
      clientChannel: "WEB",
      requestMode: "ASYNC"
    })
  });

  if (!res.ok) {
    throw new Error(`작업 생성 실패 (${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error?.message || "Job Create Error");
  }
  return json.data;
}

async function pollJobStatusAndDownload(publicId, originalName) {
  const maxSeconds = 120;
  let elapsed = 0;

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      elapsed += 1;

      try {
        const res = await fetch(`${API_V1}/jobs/${publicId}/status`, {
          method: "GET",
          credentials: "include"
        });
        if (!res.ok) throw new Error(`상태 조회 실패 (${res.status})`);
        const json = await res.json();
        const status = json.data?.status;

        console.log(`[Perturba] Polling status: ${status}`);

        if (status === "COMPLETED") {
          clearInterval(timer);

          // 결과 조회
          const resultRes = await fetch(`${API_V1}/jobs/${publicId}/result`, {
            method: "GET",
            credentials: "include"
          });
          if (!resultRes.ok) {
            throw new Error(`결과 조회 실패 (${resultRes.status})`);
          }

          const resultJson = await resultRes.json();
          const downloadUrl = resultJson.data?.perturbed?.url;

          if (downloadUrl) {
            downloadImage(downloadUrl, "perturba_" + originalName);
            showPerturbaToast("✅ 변환 완료! 보호된 이미지를 다운로드했습니다.", "success", 4000);
            resolve();
          } else {
            showPerturbaToast("❌ 결과 URL이 없습니다.", "error");
            reject(new Error("No result url"));
          }
        } else if (status === "FAILED") {
          clearInterval(timer);
          showPerturbaToast("❌ 변환 실패 (서버 오류)", "error");
          reject(new Error("Job failed"));
        } else if (elapsed >= maxSeconds) {
          clearInterval(timer);
          showPerturbaToast("⚠️ 시간이 너무 오래 걸립니다. 나중에 다시 시도해주세요.", "error");
          reject(new Error("Timeout"));
        }
      } catch (e) {
        clearInterval(timer);
        console.error(e);
        showPerturbaToast("❌ 상태 조회 중 오류가 발생했습니다.", "error");
        reject(e);
      }
    }, 1000);
  });
}

// ========================================================
// 4. 이미지 메타 / 다운로드 유틸
// ========================================================
async function getImageMeta(file) {
  // SHA-256
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256Hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // width/height
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sha256Hex,
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
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    })
    .catch((e) => {
      console.error(e);
      showPerturbaToast("❌ 다운로드 중 오류가 발생했습니다.", "error");
    });
}

// SPA 대응: 1초마다 버튼이 존재하는지 체크
setInterval(createFloatingButton, 1000);
