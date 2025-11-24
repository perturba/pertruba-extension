// background.js

// 탭이 업데이트될 때마다 주소를 감시합니다.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    
    // 1. 페이지 로딩이 끝났고(complete),
    // 2. 주소가 우리가 아는 '구글 로그인 콜백 URL'이라면?
    if (changeInfo.status === 'complete' && 
        tab.url && 
        tab.url.includes('woojangpark.site/login/oauth2/code/google')) {

        // 3. 쿠키가 잘 들어왔는지 확인합니다.
        chrome.cookies.get({ url: "https://woojangpark.site", name: "perturba_refresh" }, (cookie) => {
            if (cookie) {
                // 4. 쿠키가 있으면 로그인 성공! -> 1초 뒤에 창을 닫습니다.
                setTimeout(() => {
                    chrome.tabs.remove(tabId);
                }, 1000);
            }
        });
    }
});