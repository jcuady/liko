import { ImageResponse } from 'next/og';

import {
  BRAND_GREEN,
  MARK_PATHS,
  MARK_STROKE,
  MARK_VIEWBOX,
} from '@/components/brand/logo-geometry';

/**
 * Maskable icon.
 *
 * Next.js file conventions have no `icon-maskable` convention, so this is a
 * route handler rather than a metadata file. Android crops maskable icons to
 * the launcher shape, so the mark sits inside the 80% safe area with the
 * brand field bleeding to every edge.
 */

export const runtime = 'nodejs';

const size = { width: 512, height: 512 };

export function GET() {
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
        {/* 330px of a 512px tile keeps the mark inside the 80% safe area. */}
        <svg width="330" height="327" viewBox={MARK_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg">
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