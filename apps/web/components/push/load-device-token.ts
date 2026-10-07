// The push-token code (and the Firebase SDK under it) as a separate chunk,
// loaded only around a sign-out: a static import would put Firebase in the
// bundle of every /auth page, sign-in included. SignOutLink starts the
// download when a member reaches for "Sign out", so the browser has it cached
// by the time the sign-out page asks again.

type DeviceTokenModule = typeof import("./device-token");

let loading: Promise<DeviceTokenModule> | null = null;

/** Start (or join) the download; a failed one may be tried again. */
export function loadDeviceToken(): Promise<DeviceTokenModule> {
  if (!loading) {
    loading = import("./device-token");
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
