import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

/**
 * PWA icon at 192×192: a purple circle with a white "L".
 */
export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 112,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        L
      </div>
    ),
    { ...size }
  );
}
