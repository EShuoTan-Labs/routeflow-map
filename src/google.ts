// Google SDK objects stay at this boundary; URL configuration and query orchestration are independently testable.
declare global {
  interface Window {
    google: any;
    routeflowReady?: () => void;
    gm_authFailure?: () => void;
  }
}
export function loadGoogle(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 20000);
    const fail = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Google Maps 加载失败，请检查网络、API Key、域名限制和已启用的 API。",
        ),
      );
    };
    window.gm_authFailure = fail;
    window.routeflowReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const query = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback: "routeflowReady",
      language: "zh-CN",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
}
