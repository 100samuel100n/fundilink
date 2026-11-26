import { ImageResponse } from 'next/og';
import { SITE_URL } from './api';

export function ogCard({ title, subtitle, eyebrow = 'FundiLink' }: { title: string; subtitle: string; eyebrow?: string }) {
  let host = 'fundilink';
  try { host = new URL(SITE_URL).host; } catch { /* keep default */ }
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg,#142A3B 0%,#0B7F73 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div style={{ display: 'flex', width: 56, height: 56, borderRadius: 14, background: '#22C1AE', color: '#142A3B', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>F</div>
          {eyebrow}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: title.length > 40 ? 60 : 76, fontWeight: 800, lineHeight: 1.08 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 32, opacity: 0.9 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, opacity: 0.8 }}>{host}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}