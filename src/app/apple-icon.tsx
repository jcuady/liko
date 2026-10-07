import { ImageResponse } from 'next/og';

import {
  BRAND_GREEN,
  MARK_PATHS,
  MARK_STROKE,
  MARK_VIEWBOX,
} from '@/components/brand/logo-geometry';

/**
 * PWA icons. Next.js derives the `apple-icon` link tag and the manifest
 * entries from these files, so no separate PNG is checked into `public/icons/`.
 *
 * The tile is full-bleed because iOS applies its own squircle mask; the mark is
 * sized to the same optical ratio the brand lockup uses.
 */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_GREEN,
        }}
      >
        <svg width="290" height="287" viewBox={MARK_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg">
          <g
            stroke="#ffffff"
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="miter"
          >
            {MARK_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </svg>
      </div>
    ),
    size,
  );
}