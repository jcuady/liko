import { ImageResponse } from 'next/og';

import {
  BRAND_GREEN,
  LOCKUP_VIEWBOX,
  MARK_PATHS,
  MARK_STROKE,
  O_PATH,
  WORDMARK_PATHS,
} from '@/components/brand/logo-geometry';

export const alt = 'LIKO. Every teaching task, in one flow.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#fdf8f5',
          padding: '80px',
        }}
      >
        <svg width="286" height="95" viewBox={LOCKUP_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg">
          <g
            stroke={BRAND_GREEN}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="miter"
          >
            {MARK_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <path d={O_PATH} fill={BRAND_GREEN} fillRule="evenodd" stroke="none" />
          <g stroke={BRAND_GREEN} strokeLinecap="round" strokeLinejoin="miter">
            {WORDMARK_PATHS.map((p) => (
              <path key={p.d} d={p.d} strokeWidth={p.width} />
            ))}
          </g>
        </svg>

        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            color: '#1a1a1a',
            maxWidth: 900,
            display: 'flex',
          }}
        >
          Every teaching task, in one flow.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: 9999, background: BRAND_GREEN }} />
          <div style={{ fontSize: 28, color: '#5c5a54' }}>
            Plan · Create · Assess · Grade · Analyze
          </div>
        </div>
      </div>
    ),
    size,
  );
}