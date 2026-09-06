import * as Location from "expo-location";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

type LocationContextValue = {
  coords: Location.LocationObjectCoords | null;
  permissionStatus: Location.PermissionStatus | "undetermined";
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<boolean>;
  refreshLocation: () => Promise<boolean>;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | "undetermined">("undetermined");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  const stopWatching = useCallback(() => {
    watcherRef.current?.remove();
    watcherRef.current = null;
  }, []);

  const startWatching = useCallback(async () => {
    stopWatching();
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setCoords(current.coords);
    watcherRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 10 },
      (next) => setCoords(next.coords),
    );
  }, [stopWatching]);

  const syncLocation = useCallback(async (askForPermission: boolean) => {
    setLoading(true);
    setError(null);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (askForPermission && permission.status !== Location.PermissionStatus.GRANTED && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      setPermissionStatus(permission.status);
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        stopWatching();
        setCoords(null);
        setError("Location permission is off. Enable Precise Location for Expo Go in iPhone Settings.");
        return false;
      }
      await startWatching();
      return true;
    } catch {
      stopWatching();
      setError("Your location could not be read. Check Location Services and try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [startWatching, stopWatching]);

  useEffect(() => {
    const startupTimer = setTimeout(() => void syncLocation(true), 0);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncLocation(false);
    });
    return () => {
      clearTimeout(startupTimer);
      appStateSubscription.remove();
      stopWatching();
    };
  }, [stopWatching, syncLocation]);

  const requestLocation = useCallback(() => syncLocation(true), [syncLocation]);
  const refreshLocation = useCallback(() => syncLocation(false), [syncLocation]);

  return <LocationContext.Provider value={{ coords, permissionStatus, loading, error, requestLocation, refreshLocation }}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  const value = useContext(LocationContext);
  if (!value) throw new Error("useUserLocation must be used inside LocationProvider");
  return value;
}
