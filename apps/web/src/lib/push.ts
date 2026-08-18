import { api } from "./api";

export async function setupPushNotifications() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      console.error("Service Worker registration failed");
    }
  }
}

export async function enableNotifications() {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return;
  }

  if (Notification.permission === "granted") {
    return;
  }

  if (Notification.permission !== "denied") {
    await Notification.requestPermission();
  }
}

export async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export async function subscribeToPushNotifications() {
  const registration = await navigator.serviceWorker.ready;
  if (!registration.pushManager) {
    throw new Error("Push notifications not supported");
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY,
    });

    await api("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    });
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
  }
}
