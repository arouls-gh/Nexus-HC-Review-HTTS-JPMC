(function (global) {
  function normalizePathname(value) {
    const normalized = String(value || "").replace(/\/{2,}/g, "/");

    if (!normalized || normalized === "/") {
      return "/";
    }

    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  }

  function detectBasePath(pathname) {
    const normalized = normalizePathname(pathname);

    if (normalized === "/") {
      return "";
    }

    const segments = normalized.split("/");
    const lastSegment = segments[segments.length - 1] || "";

    if (/\.[A-Za-z0-9]+$/.test(lastSegment)) {
      segments.pop();
    }

    const basePath = segments.join("/");
    return basePath === "/" ? "" : basePath;
  }

  const basePath = detectBasePath(global.location?.pathname || "/");

  function buildApiUrl(resource) {
    const normalizedResource = String(resource || "").replace(/^\/+/, "");
    return `${basePath}/api/${normalizedResource}`;
  }

  global.APP_CONFIG = {
    basePath,
    buildApiUrl,
  };
})(window);
