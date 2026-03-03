/**
 * Auth Profiles — lưu Bearer token / API Key / Basic Auth vào localStorage
 * Load 1 click → inject vào headers
 */

export type AuthType = "bearer" | "api_key" | "basic";

export interface AuthProfile {
  id: string;
  name: string;
  type: AuthType;
  /** Bearer token / API key value / username:password */
  value: string;
  /** For api_key: header name (default: X-API-Key) */
  headerName?: string;
  createdAt: string;
}

const STORAGE_KEY = "spamapi_auth_profiles";

export function loadProfiles(): AuthProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveProfile(
  profile: Omit<AuthProfile, "id" | "createdAt">,
): AuthProfile {
  const profiles = loadProfiles();
  const newProfile: AuthProfile = {
    ...profile,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  profiles.push(newProfile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  return newProfile;
}

export function deleteProfile(id: string): void {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

/** Convert an Auth Profile to a header key/value pair */
export function profileToHeader(profile: AuthProfile): {
  key: string;
  value: string;
} {
  switch (profile.type) {
    case "bearer":
      return { key: "Authorization", value: `Bearer ${profile.value}` };
    case "api_key":
      return {
        key: profile.headerName || "X-API-Key",
        value: profile.value,
      };
    case "basic": {
      const encoded = btoa(profile.value); // "username:password"
      return { key: "Authorization", value: `Basic ${encoded}` };
    }
  }
}
