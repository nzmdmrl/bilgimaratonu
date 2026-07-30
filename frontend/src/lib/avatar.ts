// Avatar kaynağı çözücü.
// - avatar_url doluysa: mutlaksa (http) olduğu gibi, göreliyse API ile öneklenir.
// - boşsa: seed'den DiceBear avatarı üretir (fotoğraf yüklemeyen kullanıcılar/botlar).

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

export const DICEBEAR = 'https://api.dicebear.com/9.x'

// Fotoğrafı olmayan kullanıcılar için varsayılan stil (yüz temelli)
const FALLBACK_STYLE = 'avataaars'

export function dicebear(style: string, seed: string): string {
  return `${DICEBEAR}/${style}/svg?seed=${encodeURIComponent(seed)}`
}

export function avatarSrc(avatarUrl?: string | null, seed?: string): string {
  if (avatarUrl) {
    return avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`
  }
  return dicebear(FALLBACK_STYLE, (seed || 'user').toString())
}

// AvatarPicker için stiller
export const AVATAR_STYLES = [
  'avataaars', 'adventurer', 'big-smile', 'bottts', 'fun-emoji',
  'lorelei', 'micah', 'personas', 'thumbs', 'notionists',
]
