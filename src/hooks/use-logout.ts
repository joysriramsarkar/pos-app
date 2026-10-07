import { signOut } from "next-auth/react";
import { useCartStore } from "@/stores/pos-store";
import { useProductsStore } from "@/stores/pos-store";
import { useCustomersStore } from "@/stores/pos-store";
import { useSyncStore } from "@/stores/pos-store";
import { useSalesStore } from "@/stores/pos-store";
import { useUIStore } from "@/stores/pos-store";

export function useLogout() {
  const handleLogout = async () => {
    // Reset non-persisted stores
    useProductsStore.getState().reset();
    useCustomersStore.getState().reset();
    useSyncStore.getState().reset();
    useUIStore.getState().reset();

    // Clear persisted stores
    useCartStore.persist.clearStorage();

    // Clear all browser storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear IndexedDB
    try {
      // indexedDB.databases() is not available on all Android WebViews
      if (typeof window.indexedDB?.databases === 'function') {
        const databases = await window.indexedDB.databases();
        databases.forEach((db) => {
          if (db.name) {
            window.indexedDB.deleteDatabase(db.name);
          }
        });
      }
    } catch (error) {
      console.error("Error clearing IndexedDB:", error);
    }

    // Sign out from next-auth.
    // IMPORTANT: redirect: false is required for Capacitor Android —
    // signOut with redirect:true causes the WebView to open an external browser.
    // We manually navigate with window.location.replace so navigation stays
    // inside the WebView.
    await signOut({ redirect: false });

    // Also sign out of the native Firebase/Google session, otherwise the next
    // native Google sign-in may silently reuse the previous account instead of
    // showing the account picker.
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        await FirebaseAuthentication.signOut();
      }
    } catch {
      // Native plugin unavailable (web) — nothing to do.
    }

    window.location.replace("/login");
  };

  return handleLogout;
}
