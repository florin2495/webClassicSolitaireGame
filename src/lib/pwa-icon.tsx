import { ImageResponse } from "next/og";

// Opaque app icon: a white playing card (ace of spades) on the green table.
// `inset` shrinks the artwork (maskable icons keep it inside the central 80%).
export function pwaIcon(px: number, inset = 1): ImageResponse {
  const h = px * inset * 0.72;
  const w = h / 1.4;
  const spade = w * 0.62;
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#0b7a2e" }}>
        <div
          style={{
            width: w,
            height: h,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            background: "#ffffff",
            borderRadius: w * 0.1,
            boxShadow: `0 ${px * 0.01}px ${px * 0.03}px rgba(0,0,0,0.35)`,
          }}
        >
          <div style={{ position: "absolute", left: w * 0.08, top: h * 0.03, fontSize: h * 0.2, fontWeight: 700, color: "#141414", display: "flex" }}>A</div>
          <svg width={spade} height={spade} viewBox="0 0 100 100">
            <path
              fill="#141414"
              d="M50 3C42 20 5 38 5 62c0 15 11 25 25 25 8 0 14-4 17-10-1 10-7 17-17 20v0h40v0c-10-3-16-10-17-20 3 6 9 10 17 10 14 0 25-10 25-25C95 38 58 20 50 3z"
            />
          </svg>
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
