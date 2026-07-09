export function isLocalWorkbenchHost(hostname) {
  return ["", "localhost", "127.0.0.1", "::1"].includes(String(hostname || ""));
}

export function shouldAutoLoadCsvPath(path, hostname) {
  if (!String(path || "").trim()) return false;
  return isLocalWorkbenchHost(hostname);
}

export function apiPath(path, pathname) {
  const api = String(path || "");
  const normalizedApi = api.startsWith("/") ? api : `/${api}`;
  const prefix = deploymentPrefix(pathname);
  return `${prefix}${normalizedApi}`;
}

export function deploymentPrefix(pathname) {
  const value = String(pathname || "/");
  if (value === "/" || value === "" || value.startsWith("/public/")) return "";
  const parts = value.split("/").filter(Boolean);
  if (!parts.length) return "";
  const last = parts.at(-1) || "";
  const prefixParts = last.includes(".") ? parts.slice(0, -1) : parts.slice(0, 1);
  return prefixParts.length ? `/${prefixParts.join("/")}` : "";
}
