// The app's public origin: page metadata and push notification links resolve
// against it. A push message opens outside the page, so its link must be
// absolute, and FCM refuses a web push link that is not HTTPS.
export const SITE_URL = "https://camp-404.com";
