/**
 * Hosts de redes sociais / plataformas de vídeo suportadas pelo yt-dlp.
 */

/**
 * Qualquer host deste conjunto é roteado para o adaptador social (motor yt-dlp).
 */
export const SOCIAL_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com',
  'reddit.com', 'www.reddit.com', 'old.reddit.com', 'v.redd.it',
  'linkedin.com', 'www.linkedin.com',
  'twitch.tv', 'www.twitch.tv', 'clips.twitch.tv',
  'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
  'dailymotion.com', 'www.dailymotion.com', 'dai.ly',
  'bilibili.com', 'www.bilibili.com',
  'vk.com', 'm.vk.com',
  'pinterest.com', 'www.pinterest.com', 'pin.it',
  'rumble.com', 'www.rumble.com',
  'odysee.com', 'www.odysee.com',
  'streamable.com', 'www.streamable.com',
  'vidmoly.me', 'www.vidmoly.me',
  'videos.pexels.com',
]);

const SOCIAL_LABELS = {
  'facebook.com': 'Facebook', 'fb.watch': 'Facebook',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok', 'vm.tiktok.com': 'TikTok',
  'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)',
  'reddit.com': 'Reddit', 'v.redd.it': 'Reddit',
  'linkedin.com': 'LinkedIn',
  'twitch.tv': 'Twitch', 'clips.twitch.tv': 'Twitch',
  'vimeo.com': 'Vimeo',
  'dailymotion.com': 'Dailymotion',
  'bilibili.com': 'Bilibili',
  'vk.com': 'VK',
  'pinterest.com': 'Pinterest',
  'rumble.com': 'Rumble',
  'odysee.com': 'Odysee',
  'streamable.com': 'Streamable',
  'vidmoly.me': 'VidMoly',
};

export function isSocialMediaUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return SOCIAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** Nome amigavel da plataforma social a partir da URL (ex.: "Facebook"). */
export function socialLabelForUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const exact = SOCIAL_LABELS[host];
    if (exact) return exact;
    for (const [key, label] of Object.entries(SOCIAL_LABELS)) {
      if (host.endsWith(`.${key}`) || key.endsWith(host)) return label;
    }
    return 'rede social';
  } catch {
    return 'rede social';
  }
}
