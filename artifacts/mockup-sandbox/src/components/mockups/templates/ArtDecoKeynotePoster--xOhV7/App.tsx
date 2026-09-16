import React from 'react';

const GOLD = '#c9a227';
const GOLD_BRIGHT = '#e6c463';
const CREAM = '#f1e6cc';
const INK = '#0b0907';
const INK2 = '#141008';

const Diamond = ({ size = 8, color = GOLD }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      background: color,
      transform: 'rotate(45deg)',
      flexShrink: 0,
    }}
  />
);

const Sunburst = ({ rays = 48, className = '', opacity = 0.5 }) => {
  const lines = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    lines.push(
      <line
        key={i}
        x1="200"
        y1="200"
        x2={200 + Math.cos(a) * 200}
        y2={200 + Math.sin(a) * 200}
        stroke={GOLD}
        strokeWidth={i % 2 === 0 ? 1.4 : 0.5}
        opacity={i % 2 === 0 ? 0.55 : 0.3}
      />
    );
  }
  return (
    <svg viewBox="0 0 400 400" className={className} style={{ opacity }}>
      {lines}
      <circle cx="200" cy="200" r="58" fill="none" stroke={GOLD} strokeWidth="1.5" opacity="0.8" />
      <circle cx="200" cy="200" r="50" fill="none" stroke={GOLD} strokeWidth="0.7" opacity="0.6" />
    </svg>
  );
};

const FanArc = ({ flip = false }) => (
  <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="none" style={{ transform: flip ? 'scaleY(-1)' : 'none' }}>
    {[10, 20, 30, 40, 48].map((r, i) => (
      <path key={i} d={`M ${50 - r} 50 A ${r} ${r} 0 0 1 ${50 + r} 50`} fill="none" stroke={GOLD} strokeWidth={i === 4 ? 1.4 : 0.7} opacity={0.35 + i * 0.13} />
    ))}
    {[0, 30, 60, 90, 120, 150, 180].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return <line key={deg} x1="50" y1="50" x2={50 - Math.cos(a) * 48} y2={50 - Math.sin(a) * 48} stroke={GOLD} strokeWidth="0.5" opacity="0.4" />;
    })}
  </svg>
);

const Chevrons = ({ count = 24 }) => (
  <div className="flex items-center justify-center gap-[6px] overflow-hidden">
    {Array.from({ length: count }).map((_, i) => (
      <svg key={i} width="14" height="10" viewBox="0 0 14 10">
        <path d="M0 10 L7 0 L14 10" fill="none" stroke={GOLD} strokeWidth="1.4" opacity={0.85} />
      </svg>
    ))}
  </div>
);

const Label = ({
  children,
  color = GOLD,
  size = '9px',
}: {
  children: React.ReactNode;
  color?: string;
  size?: string;
}) => (
  <div
    style={{
      fontFamily: "'Jost', sans-serif",
      fontSize: size,
      letterSpacing: '0.32em',
      textTransform: 'uppercase',
      color,
      fontWeight: 500,
    }}
  >
    {children}
  </div>
);

const DataCell = ({
  k,
  v,
  sub,
  dark = false,
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  sub?: React.ReactNode;
  dark?: boolean;
}) => (
  <div
    className="px-3 py-2.5 flex flex-col justify-between gap-1"
    style={{
      borderRight: `1px solid ${GOLD}33`,
      borderBottom: `1px solid ${GOLD}33`,
      background: dark ? INK : 'transparent',
    }}
  >
    <Label size="8px" color={`${GOLD}cc`}>{k}</Label>
    <div style={{ fontFamily: "'Cinzel', serif", color: CREAM, fontSize: '15px', fontWeight: 600, lineHeight: 1.05 }}>{v}</div>
    {sub && (
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: `${CREAM}99`, fontSize: '11px', lineHeight: 1.2 }}>{sub}</div>
    )}
  </div>
);

export default function App() {
  return (
    <div style={{ background: '#060504', minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '0' }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          * { box-sizing: border-box; }
          body { margin: 0; }
          .poster {
            position: relative;
            width: 100%;
            max-width: 1100px;
            background:
              radial-gradient(ellipse 80% 50% at 50% 0%, #1c150a 0%, transparent 60%),
              radial-gradient(ellipse 60% 40% at 50% 100%, #16100a 0%, transparent 60%),
              ${INK2};
            color: ${CREAM};
            border-left: 1px solid ${GOLD}55;
            border-right: 1px solid ${GOLD}55;
            box-shadow: 0 0 120px rgba(201,162,39,0.08), 0 0 0 1px #000;
          }
          .poster::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
            pointer-events: none;
            z-index: 5;
          }
          .gold-frame {
            border: 1px solid ${GOLD}88;
            outline: 1px solid ${GOLD}33;
            outline-offset: 3px;
          }
          .display-xl {
            font-family: 'Cinzel', serif;
            font-weight: 800;
            font-size: 15.5vw;
            line-height: 0.8;
            letter-spacing: -0.01em;
            color: ${CREAM};
            text-shadow: 0 2px 0 #000, 0 0 60px rgba(201,162,39,0.25);
          }
          @media (min-width: 1100px) {
            .display-xl { font-size: 170px; }
          }
          .gold-fill {
            color: transparent;
            -webkit-text-stroke: 1.5px ${GOLD};
            text-shadow: none;
          }
          .marquee-strip {
            font-family: 'Jost', sans-serif;
            font-size: 9px;
            letter-spacing: 0.4em;
            text-transform: uppercase;
            color: ${INK};
            background: linear-gradient(90deg, ${GOLD} 0%, ${GOLD_BRIGHT} 50%, ${GOLD} 100%);
            white-space: nowrap;
            overflow: hidden;
            padding: 6px 0;
            font-weight: 600;
          }
          .vert-rail {
            writing-mode: vertical-rl;
            font-family: 'Jost', sans-serif;
            font-size: 9px;
            letter-spacing: 0.45em;
            text-transform: uppercase;
            color: ${GOLD};
          }
        `,
        }}
      />

      <div className="poster">
        {/* ══════════ TOP MARQUEE ══════════ */}
        <div className="marquee-strip text-center">
          ✦ ONE NIGHT ONLY ✦ THE GRAND REBRAND REVEAL ✦ FORMAT/25 IDENTITY SUMMIT ✦ MAINSTAGE KEYNOTE ✦ ONE NIGHT ONLY ✦ THE GRAND REBRAND REVEAL ✦
        </div>

        {/* ══════════ HEADER BAND ══════════ */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3" style={{ borderBottom: `1px solid ${GOLD}44` }}>
          <div className="flex items-center gap-3">
            <Diamond size={7} />
            <Label>Format / 25 · Hall of Mirrors</Label>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "'Cinzel Decorative', serif", color: GOLD_BRIGHT, fontSize: '20px' }}>✦</span>
            <span style={{ fontFamily: "'Cinzel', serif", letterSpacing: '0.3em', fontSize: '13px', color: CREAM }}>MIDNIGHT PARLOUR STUDIO</span>
            <span style={{ fontFamily: "'Cinzel Decorative', serif", color: GOLD_BRIGHT, fontSize: '20px' }}>✦</span>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Label>Friday · 21 Nov 1925h · Doors 1900h</Label>
            <Diamond size={7} />
          </div>
        </div>

        {/* ══════════ HERO ══════════ */}
        <div className="relative px-6 pt-5 pb-4" style={{ borderBottom: `2px solid ${GOLD}` }}>
          {/* sunburst backdrops */}
          <Sunburst className="absolute -top-24 -left-32 w-[420px] h-[420px] pointer-events-none" opacity={0.22} />
          <Sunburst className="absolute -bottom-32 -right-32 w-[480px] h-[480px] pointer-events-none" opacity={0.22} />

          <div className="relative grid grid-cols-[64px_1fr_64px] gap-4 items-stretch">
            {/* left rail */}
            <div className="flex flex-col items-center justify-between py-2" style={{ borderRight: `1px solid ${GOLD}44` }}>
              <Diamond />
              <div className="vert-rail">Transfiguration of an Identity</div>
              <Diamond />
            </div>

            {/* title */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-2">
                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
                <Label size="10px" color={GOLD_BRIGHT}>A keynote in three acts — the studio formerly known as Midnight Parlour becomes</Label>
                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
              </div>

              <h1 className="display-xl">AURUM</h1>
              <h1 className="display-xl gold-fill" style={{ fontFamily: "'Cinzel', serif" }}>ATELIER</h1>

              <div className="mt-3 flex items-center justify-center gap-4">
                <Chevrons count={10} />
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '17px', color: GOLD_BRIGHT }}>
                  “Watch closely. Nothing up our sleeves but nine years of work.”
                </div>
                <Chevrons count={10} />
              </div>
            </div>

            {/* right rail */}
            <div className="flex flex-col items-center justify-between py-2" style={{ borderLeft: `1px solid ${GOLD}44` }}>
              <Diamond />
              <div className="vert-rail" style={{ transform: 'rotate(180deg)' }}>Est. MMXVI · Reborn MMXXV</div>
              <Diamond />
            </div>
          </div>
        </div>

        {/* ══════════ DENSE DATA GRID ══════════ */}
        <div className="grid grid-cols-12" style={{ borderBottom: `1px solid ${GOLD}44` }}>
          {/* Speaker column */}
          <div className="col-span-3 flex flex-col" style={{ borderRight: `2px solid ${GOLD}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GOLD}33`, background: INK }}>
              <Label color={GOLD_BRIGHT}>The Conjurer on Stage</Label>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', fontWeight: 700, color: CREAM, lineHeight: 1, marginTop: '6px' }}>
                ESMÉ<br />VANTERPOOL
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '13px', color: `${CREAM}aa`, marginTop: '4px' }}>
                Founder & Creative Director
              </div>
            </div>
            <div className="relative flex-1 min-h-[180px] overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&h=700&fit=crop"
                alt="Esmé Vanterpool"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'grayscale(100%) sepia(28%) contrast(1.1) brightness(0.85)' }}
              />
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${INK2} 100%)` }} />
              <div className="absolute inset-2 pointer-events-none gold-frame" />
              <div className="absolute bottom-2 left-0 right-0 text-center">
                <Label size="8px" color={GOLD_BRIGHT}>D&AD Pencil ×4 · Cannes Lion ×2</Label>
              </div>
            </div>
            <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${GOLD}33` }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '12.5px', lineHeight: 1.4, color: `${CREAM}cc` }}>
                Joined onstage by <span style={{ color: GOLD_BRIGHT }}>J. Okafor</span> (Type Direction) and <span style={{ color: GOLD_BRIGHT }}>R. Madsen</span> (Motion & Ritual).
              </div>
            </div>
          </div>

          {/* Centre — Acts + facts grid */}
          <div className="col-span-6 flex flex-col" style={{ borderRight: `2px solid ${GOLD}` }}>
            {/* Acts */}
            <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${GOLD}44` }}>
              {[
                { n: 'I', t: 'THE VANISH', d: 'Retiring nine years of Midnight Parlour — the marks, the navy, the whisper.', time: '1925 — 1940h' },
                { n: 'II', t: 'THE TURN', d: 'Inside the alchemy: 14 type trials, 212 lockups, one geometry of gold.', time: '1940 — 2005h' },
                { n: 'III', t: 'THE PRESTIGE', d: 'House lights down. The new identity, revealed in full ceremony.', time: '2005 — 2025h' },
              ].map((act, i) => (
                <div key={i} className="px-4 py-3 flex flex-col gap-1.5" style={{ borderRight: i < 2 ? `1px solid ${GOLD}33` : 'none' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: '26px', color: GOLD, lineHeight: 1 }}>{act.n}</span>
                    <div>
                      <Label size="8px">Act {act.n} · {act.time}</Label>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 700, color: CREAM, letterSpacing: '0.05em' }}>{act.t}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '12.5px', lineHeight: 1.35, color: `${CREAM}b3` }}>{act.d}</div>
                </div>
              ))}
            </div>

            {/* Fact cells */}
            <div className="grid grid-cols-4 flex-1">
              <DataCell k="Years in shadow" v="09" sub="Midnight Parlour, 2016–25" />
              <DataCell k="Wordmark drafts" v="212" sub="Final cut: nº 187" dark />
              <DataCell k="Custom typeface" v="Aurum Display" sub="38 styles · 1,204 glyphs" />
              <DataCell k="Brand colours" v="05" sub="Gilt, Soot, Bone, Oxblood, Verdigris" dark />
              <DataCell k="Identity assets" v="1,847" sub="Shipped on the night" dark />
              <DataCell k="Motion rituals" v="23" sub="Built static-first" />
              <DataCell k="Naming routes" v="64 → 1" sub="Aurum: Latin, gold" dark />
              <DataCell k="Months of work" v="14" sub="Under strict NDA" />
              <DataCell k="Slides" v="139" sub="Zero bullet points" />
              <DataCell k="Live unveilings" v="07" sub="Mark, type, voice, space…" dark />
              <DataCell k="Confetti, gold" v="40 KG" sub="Biodegradable foil" />
              <DataCell k="Encore Q&A" v="20 MIN" sub="Salon Vermeil, level 2" dark />
            </div>
          </div>

          {/* Right column — programme & particulars */}
          <div className="col-span-3 flex flex-col">
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GOLD}33`, background: INK }}>
              <Label color={GOLD_BRIGHT}>Evening Programme</Label>
            </div>
            {[
              ['1900', 'Doors · gilded foyer, coupe service'],
              ['1925', 'Keynote begins · Acts I–III'],
              ['2025', 'The reveal toast · Hall of Mirrors'],
              ['2045', 'Identity exhibition opens · Gallery B'],
              ['2130', 'Salon des Illusions · invitation only'],
              ['2300', 'Carriages'],
            ].map(([t, d], i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-[7px]" style={{ borderBottom: `1px solid ${GOLD}26` }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 700, color: GOLD_BRIGHT, width: '38px' }}>{t}</span>
                <Diamond size={4} />
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '13px', color: `${CREAM}cc`, lineHeight: 1.2 }}>{d}</span>
              </div>
            ))}
            <div className="flex-1 px-4 py-3 flex flex-col justify-end gap-2" style={{ background: `linear-gradient(180deg, transparent, ${INK})` }}>
              <div className="h-12 w-full"><FanArc /></div>
              <Label size="8px" color={`${GOLD}cc`}>Dress · black tie, gold encouraged</Label>
              <Label size="8px" color={`${GOLD}cc`}>Photography · forbidden until Act III</Label>
              <Label size="8px" color={`${GOLD}cc`}>Recording · never</Label>
            </div>
          </div>
        </div>

        {/* ══════════ BEFORE / AFTER STRIP ══════════ */}
        <div className="grid grid-cols-[1fr_auto_1fr]" style={{ borderBottom: `2px solid ${GOLD}` }}>
          <div className="px-6 py-4 flex items-center justify-end gap-5" style={{ background: '#0a0c10' }}>
            <div className="text-right">
              <Label size="8px" color={`${CREAM}66`}>What was</Label>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '26px', color: `${CREAM}77`, textDecoration: 'line-through', textDecorationColor: `${GOLD}88`, textDecorationThickness: '1px' }}>
                Midnight Parlour
              </div>
            </div>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <rect x="12" y="12" width="20" height="20" transform="rotate(45 22 22)" fill="none" stroke={`${CREAM}55`} strokeWidth="1" />
            </svg>
          </div>
          <div className="px-5 flex items-center" style={{ background: GOLD }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 800, color: INK, fontSize: '22px', letterSpacing: '0.1em' }}>BECOMES</span>
          </div>
          <div className="px-6 py-4 flex items-center justify-start gap-5">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <rect x="12" y="12" width="20" height="20" transform="rotate(45 22 22)" fill={GOLD} />
              <rect x="6" y="6" width="32" height="32" transform="rotate(45 22 22)" fill="none" stroke={GOLD} strokeWidth="1" />
            </svg>
            <div>
              <Label size="8px" color={GOLD_BRIGHT}>What will be</Label>
              <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: '26px', color: GOLD_BRIGHT, letterSpacing: '0.06em', lineHeight: 1 }}>
                Aurum Atelier
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ FOOTER ══════════ */}
        <div className="grid grid-cols-12 items-stretch">
          <div className="col-span-4 px-6 py-3 flex flex-col justify-center gap-1" style={{ borderRight: `1px solid ${GOLD}44` }}>
            <Label size="8px">Venue</Label>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 600, color: CREAM }}>The Meridian Palais · Hall of Mirrors</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: `${CREAM}99` }}>11 Carrington Row, Mayfair · London W1</div>
          </div>
          <div className="col-span-3 px-6 py-3 flex flex-col justify-center gap-1" style={{ borderRight: `1px solid ${GOLD}44` }}>
            <Label size="8px">Admission</Label>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 600, color: CREAM }}>Summit pass · Tier Or</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: `${CREAM}99` }}>Seat allocation closes 14 Nov</div>
          </div>
          <div className="col-span-3 px-6 py-3 flex flex-col justify-center gap-1" style={{ borderRight: `1px solid ${GOLD}44` }}>
            <Label size="8px">Reserve with the cipher</Label>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', fontWeight: 700, color: GOLD_BRIGHT, letterSpacing: '0.25em' }}>AURUM-XXV</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: `${CREAM}99` }}>format-summit.com/reveal</div>
          </div>
          <div className="col-span-2 flex items-center justify-center gap-3" style={{ background: INK }}>
            <Diamond size={6} />
            <span style={{ fontFamily: "'Cinzel Decorative', serif", color: GOLD, fontSize: '24px' }}>✦</span>
            <Diamond size={6} />
          </div>
        </div>

        {/* bottom marquee */}
        <div className="marquee-strip text-center">
          ✦ NO ENCORE ✦ NO RECORDINGS ✦ NO SECOND CHANCES ✦ THE PARLOUR CLOSES · THE ATELIER OPENS ✦ NO ENCORE ✦ NO RECORDINGS ✦ NO SECOND CHANCES ✦
        </div>
      </div>
    </div>
  );
}