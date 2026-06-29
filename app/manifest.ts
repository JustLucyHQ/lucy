import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lucy AI',
    short_name: 'Lucy',
    description: 'Multi-provider AI chat platform with visual workflow builder',
    start_url: '/chat',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#8B5CF6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
