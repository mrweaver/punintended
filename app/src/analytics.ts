const UMAMI_SCRIPT_ID = "umami-analytics";
const UMAMI_SRC = "/umami/script.js";

export function installAnalytics() {
  if (typeof document === "undefined") return;
  if (document.getElementById(UMAMI_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = UMAMI_SCRIPT_ID;
  script.defer = true;
  script.src = UMAMI_SRC;
  script.setAttribute(
    "data-website-id",
    "7759fce6-d100-4a22-a0d7-6d32e8ad31b6",
  );
  script.setAttribute("data-host-url", "/umami");

  document.head.appendChild(script);
}
