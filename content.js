// ========================================================
// 1. 버튼 UI 생성 및 스타일링
// ========================================================
function createFloatingButton() {
    // 이미 버튼이 있으면 중복 생성 방지
    if (document.getElementById("perturba-floating-btn")) return;

    const button = document.createElement("button");
    button.id = "perturba-floating-btn";
    button.title = "Perturba로 이미지 보호하기";

    // 버튼 스타일 (원형, 그림자, 우측 하단 고정)
    Object.assign(button.style, {
        position: "fixed",
        top: "100px",      // 위에서 100px 아래로 (메뉴바 안 가리게)
        right: "30px",     // 오른쪽에서 30px 안쪽으로
        
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

    // 로고 이미지 생성
    const img = document.createElement("img");
    // manifest.json에 등록된 내부 리소스 접근
    img.src = chrome.runtime.getURL("icon.png");
    Object.assign(img.style, {
        width: "35px",
        height: "auto",
        pointerEvents: "none" // 이미지 클릭 시 이벤트 버블링 방지
    });

    // 버튼에 이미지 추가
    button.appendChild(img);

    // 마우스 호버 효과
    button.onmouseover = () => { button.style.transform = "scale(1.1)"; };
    button.onmouseout = () => { button.style.transform = "scale(1.0)"; };

    // 클릭 이벤트 연결
    button.addEventListener("click", () => {
        openFileSelector();
    });

    // 화면에 추가
    document.body.appendChild(button);
}

// ========================================================
// 2. 파일 선택창 실행
// ========================================================
function openFileSelector() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*"; // 이미지만 허용

    // 파일이 선택되면 실행될 함수
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadAndTransform(file);
        }
    };

    input.click(); // 사용자에게 파일 선택창 띄우기
}

// ========================================================
// 3. 백엔드 통신 (업로드 -> 변환 -> 다운로드)
// ========================================================
async function uploadAndTransform(file) {
    // 로딩 표시 (간단하게 alert 사용, 나중에 UI로 변경 가능)
    alert("🛡️ Perturba: 변환을 시작합니다. 잠시만 기다려주세요...");

    const formData = new FormData();
    // 백엔드 Controller가 받는 파라미터 이름 (예: @RequestPart("file"))
    formData.append("file", file); 

    try {
        // 1) 업로드 및 변환 요청
        const response = await fetch("https://woojangpark.site/v1/jobs", { 
            method: "POST",
            body: formData,
            // 중요: 쿠키(로그인 정보)를 같이 보내야 인증됨
            credentials: "include" 
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error("로그인이 필요합니다. woojangpark.site에 로그인해주세요.");
            }
            throw new Error(`서버 오류: ${response.status}`);
        }

        const resData = await response.json();
        console.log("Perturba 응답:", resData);

        // 2) 결과 처리 (다운로드)
        // 백엔드 응답 구조에 따라 수정 필요 (예: resData.data.resultUrl)
        // 지금은 예시로 resultUrl이 있다고 가정하고 다운로드 시도
        if (resData.data && resData.data.resultUrl) {
            downloadImage(resData.data.resultUrl, "perturba_protected_" + file.name);
            alert("✅ 변환 완료! 이미지가 다운로드되었습니다.");
        } else {
            // 결과 URL이 바로 안 오는 비동기 방식인 경우
            alert("✅ 작업이 생성되었습니다! (Job ID: " + (resData.data?.publicId || "Unknown") + ")");
        }

    } catch (error) {
        console.error("Perturba Error:", error);
        alert("❌ 실패: " + error.message);
    }
}

// 이미지 다운로드 헬퍼 함수
function downloadImage(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ========================================================
// 4. 실행 (페이지 로드 시)
// ========================================================
// 인스타/트위터는 SPA라서 URL이 바뀔 때 버튼이 사라질 수 있음
// 1초마다 체크해서 버튼이 없으면 다시 그려줌
setInterval(createFloatingButton, 1000);