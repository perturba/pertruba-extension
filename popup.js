// popup.js

const API_BASE = "https://api.woojangpark.site";
const API_V1 = `${API_BASE}/v1`;

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-guest-login")
    .addEventListener("click", onGuestLogin);
  document
    .getElementById("btn-google-login")
    .addEventListener("click", onGoogleLogin);
  document
    .getElementById("btn-logout")
    .addEventListener("click", onLogout);

  refreshUI();
});

async function refreshUI() {
  const status = await getLoginStatus();

  if (status.mode === "USER") {
    showProfile(status.data, "USER");
  } else if (status.mode === "GUEST") {
    showProfile(status.data, "GUEST");
  } else {
    showLogin();
  }
}

// 현재 로그인 상태 조회
async function getLoginStatus() {
  try {
    // 1) 정식 로그인 사용자 확인
    let res = await fetch(`${API_V1}/auth/me`, {
      method: "GET",
      credentials: "include"
    });

    if (res.ok) {
      const json = await res.json();
      return { mode: "USER", data: json.data };
    }

    // 2) 게스트 세션 확인 (/v1/guest/me 는 스펙상 POST)
    res = await fetch(`${API_V1}/guest/me`, {
      method: "POST",
      credentials: "include"
    });

    if (res.ok) {
      const json = await res.json();
      return { mode: "GUEST", data: json.data };
    }

    return { mode: "NONE", data: null };
  } catch (e) {
    console.error(e);
    return { mode: "NONE", data: null };
  }
}

async function onGuestLogin() {
  try {
    const res = await fetch(`${API_V1}/guest/session`, {
      method: "POST",
      credentials: "include"
    });

    if (!res.ok) {
      alert("게스트 로그인에 실패했습니다.");
      return;
    }

    await refreshUI();
  } catch (e) {
    console.error(e);
    alert("서버 연결에 실패했습니다.");
  }
}

function onGoogleLogin() {
  chrome.tabs.create({ url: `${API_BASE}/oauth2/authorization/google` });
}

async function onLogout() {
  try {
    await fetch(`${API_V1}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (e) {
    console.error(e);
  } finally {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("profile-view").classList.add("hidden");
}

function showProfile(data, mode) {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("profile-view").classList.remove("hidden");

  const userStatusEl = document.getElementById("user-status");
  const userExpireEl = document.getElementById("user-expire");
  const badgeEl = document.getElementById("connection-badge");

  if (mode === "USER") {
    const email = data.email || "알 수 없는 사용자";
    const userId = data.userId != null ? `ID: ${data.userId}` : "";

    userStatusEl.textContent = email;
    userExpireEl.textContent = userId;
    badgeEl.textContent = "로그인 모드";
  } else if (mode === "GUEST") {
    userStatusEl.textContent = "게스트 모드";
    if (data && data.expiresAt) {
      const date = new Date(data.expiresAt);
      userExpireEl.textContent = `만료 시간: ${date.toLocaleString()}`;
    } else {
      userExpireEl.textContent = "만료 시간 정보를 가져오지 못했습니다.";
    }
    badgeEl.textContent = "게스트 세션 연결됨";
  } else {
    userStatusEl.textContent = "알 수 없는 상태";
    userExpireEl.textContent = "";
    badgeEl.textContent = "Disconnected";
  }
}
