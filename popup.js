const BASE_URL = "https://woojangpark.site";

document.addEventListener("DOMContentLoaded", () => {
    checkLoginStatus();
    document.getElementById("btn-guest-login").addEventListener("click", guestLogin);
    document.getElementById("btn-google-login").addEventListener("click", googleLogin);
    document.getElementById("btn-logout").addEventListener("click", logout);
});

async function checkLoginStatus() {
    try {
        let response = await fetch(`${BASE_URL}/v1/auth/me`, { credentials: "include" });
        if (!response.ok) {
            response = await fetch(`${BASE_URL}/v1/guest/me`, { credentials: "include" });
        }
        if (response.ok) {
            const json = await response.json();
            showProfile(json.data);
        } else {
            showLogin();
        }
    } catch (e) { showLogin(); }
}

async function guestLogin() {
    try {
        const res = await fetch(`${BASE_URL}/v1/guest/session`, { method: "POST", credentials: "include" });
        if (res.ok) checkLoginStatus();
        else alert("로그인 실패");
    } catch (e) { alert("서버 연결 실패"); }
}

function googleLogin() {
    chrome.tabs.create({ url: `${BASE_URL}/oauth2/authorization/google` });
}

async function logout() {
    try { await fetch(`${BASE_URL}/v1/auth/logout`, { method: "POST", credentials: "include" }); } catch (e) {}
    showLogin();
}

function showLogin() {
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("profile-view").classList.add("hidden");
}

function showProfile(data) {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("profile-view").classList.remove("hidden");
    const userStatus = document.getElementById("user-status");
    const userExpire = document.getElementById("user-expire");

    if (data.email) {
        userStatus.innerText = `${data.name}님`;
        userExpire.innerText = data.email;
    } else {
        userStatus.innerText = "게스트 모드";
        const date = new Date(data.expiresAt || data.expires_at);
        userExpire.innerText = `만료: ${date.toLocaleDateString()}`;
    }
}