import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();

  return {
    ...config,
    name: config.name ?? "WhereToGo",
    slug: config.slug ?? "exp19216801018081",
    android: {
      ...config.android,
      ...(androidMapsApiKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { apiKey: androidMapsApiKey },
            },
          }
        : {}),
    },
  };
};
