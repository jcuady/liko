import { ImageResponse } from 'next/og';

import {
  BRAND_GREEN,
  MARK_PATHS,
  MARK_STROKE,
  MARK_VIEWBOX,
} from '@/components/brand/logo-geometry';

/**
 * App icon. Rendered at build time by Next.js rather than checked in as a
 * binary, so the mark always matches `public/brand/liko-mark.svg`.
 *
 * `size` and `contentType` are the two props next/og requires; the rest are
 * style props accepted by Satori.
 */
export const size = { width: 1024, height: 1024 };
export const contentType = 'image/png';
export const alt = 'LIKO';

export default function Icon() {
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
        <svg width="580" height="574" viewBox={MARK_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg">
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