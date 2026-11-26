import { ImageResponse } from 'next/og';
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#142A3B', color: '#22C1AE', fontSize: 340, fontWeight: 800 }}>F</div>, { width: 512, height: 512 });
}