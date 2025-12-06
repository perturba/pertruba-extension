// background.js

const API_BASE = "https://api.woojangpark.site";

// 탭이 업데이트될 때마다 URL을 감시
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("api.woojangpark.site/login/oauth2/code/google")
  ) {
    // 로그인 콜백 도착 → refresh 쿠키 들어왔는지 확인
    chrome.cookies.get(
      { url: API_BASE, name: "perturba_refresh" },
      (cookie) => {
        if (cookie) {
          // 쿠키 있으면 로그인 성공으로 보고 1초 후 탭 닫기
          setTimeout(() => {
            chrome.tabs.remove(tabId);
          }, 1000);
        }
      }
    );
  }
});
