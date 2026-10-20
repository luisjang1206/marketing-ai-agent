export type ProfileStatus = { id: string; loggedIn: boolean }

export function pickProfile(profiles: ProfileStatus[], lastUsedId: string | null): string | null {
  const ok = profiles.filter((p) => p.loggedIn)
  if (ok.length === 0) return null
  const idx = profiles.findIndex((p) => p.id === lastUsedId)
  if (idx === -1) return ok[0].id
  for (let k = 1; k <= profiles.length; k++) {
    const cand = profiles[(idx + k) % profiles.length]
    if (cand.loggedIn) return cand.id
  }
  return null
}
