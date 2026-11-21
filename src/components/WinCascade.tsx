"use client";

import { useEffect, useRef } from "react";
import { faceUrl } from "@/lib/cards";

export interface Launch {
  card: number;
  x: number;
  y: number;
}

/**
 * The win animation: the cards leave the foundations one by one (kings first), fall and bounce off the bottom edge,
 * and every frame stays painted, so each card leaves a trail. A tap ends it.
 */
export function WinCascade({
  launches,
  cardW,
  cardH,
  onLaunch,
  onDone,
}: {
  launches: Launch[];
  cardW: number;
  cardH: number;
  onLaunch: (card: number) => void;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onLaunch, onDone });
  useEffect(() => {
    callbacks.current = { onLaunch, onDone };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const images = new Map<number, HTMLImageElement>();
    for (const l of launches) {
      const img = new Image();
      img.src = faceUrl(l.card);
      images.set(l.card, img);
    }
    const s = Math.max(0.8, cardW / 71);
    let i = -1;
    let cur: { card: number; x: number; y: number; vx: number; vy: number } | null = null;
    let stopped = false;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const next = () => {
      i++;
      if (i >= launches.length) {
        cur = null;
        stopped = true;
        callbacks.current.onDone();
        return;
      }
      const l = launches[i];
      const dir = Math.random() < 0.5 ? -1 : 1;
      cur = { card: l.card, x: l.x, y: l.y, vx: dir * (3 + Math.random() * 5) * s, vy: -Math.random() * 7 * s };
      callbacks.current.onLaunch(l.card);
    };

    const step = () => {
      if (!cur) return;
      cur.vy += 0.5 * s;
      cur.x += cur.vx;
      cur.y += cur.vy;
      if (cur.y + cardH > H) {
        cur.y = H - cardH;
        cur.vy = -cur.vy * 0.8;
      }
      const img = images.get(cur.card);
      if (img?.complete) ctx.drawImage(img, cur.x, cur.y, cardW, cardH);
      if (cur.x + cardW < 0 || cur.x > W) next();
    };

    const loop = (t: number) => {
      acc += Math.min(100, t - last);
      last = t;
      // Two physics steps per 16 ms: the classic look, at twice the speed.
      while (acc >= 8 && !stopped) {
        step();
        acc -= 8;
      }
      if (!stopped) raf = requestAnimationFrame(loop);
    };

    next();
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [launches, cardW, cardH]);

  return (
    <div className="absolute inset-0 z-[5000]" onPointerDown={() => callbacks.current.onDone()} data-testid="win-cascade">
      <canvas ref={canvasRef} className="h-full w-full" aria-label="Ai câștigat!" />
      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white/90 drop-shadow">
        Ai câștigat! Atinge ecranul pentru a continua.
      </p>
    </div>
  );
}
