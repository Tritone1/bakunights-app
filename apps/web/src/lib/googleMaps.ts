let googleMapsPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string) {
  const existingGoogle = (window as unknown as { google?: { maps?: { importLibrary?: unknown } } }).google;
  if (typeof existingGoogle?.maps?.importLibrary === "function") return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const callbackName = "__initWhereToGoGoogleMaps";
    const callbackWindow = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    callbackWindow[callbackName] = () => {
      delete callbackWindow[callbackName];
      resolve();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete callbackWindow[callbackName];
      reject(new Error("Google Maps could not be loaded"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise.catch((error) => {
    googleMapsPromise = null;
    throw error;
  });
}
