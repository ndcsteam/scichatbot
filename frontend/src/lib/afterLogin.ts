const KEY = "scichatbot.afterLogin";
const JOIN_PATH = /^\/join\/[A-Za-z0-9_-]{32}$/;

export function rememberAfterLogin(path: string): void {
  if (!JOIN_PATH.test(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // 瀏覽器不允許儲存時，登入後會回到首頁，學生可以再按一次連結。
  }
}

export function peekAfterLogin(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && JOIN_PATH.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearAfterLogin(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 沒有可清除的內容。
  }
}
