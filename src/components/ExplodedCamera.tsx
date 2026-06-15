"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  cubicBezier,
  useScroll,
  useSpring,
  useTransform,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { AuroraText, TERRA_GREEN } from "./ui/aurora-text";

const FRAME_COUNT = 12;
const frameSrc = (i: number) => `/cam/cam_${String(i + 1).padStart(4, "0")}.png`;

/**
 * ExplodedCamera, Apple-style scroll-scrubbed exploded view of the real
 * AGRI CAM X1. Frames go assembled -> fully apart as you scroll, and
 * reassemble when you scroll back. No edge gradients.
 */
export function ExplodedCamera() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const currentFrame = useRef(-1);
  const [, setReady] = useState(false);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const headY = useTransform(scrollYProgress, [0, 0.5], [0, -50]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  // as the camera explodes, the ghost words glide up out of the way, very smooth
  const ghostYRaw = useTransform(scrollYProgress, [0.2, 0.7], [0, -210], {
    ease: cubicBezier(0.16, 1, 0.3, 1),
  });
  const ghostY = useSpring(ghostYRaw, { stiffness: 70, damping: 20, mass: 0.6 });
  // "THE EYES" blur-fades in word by word as you enter the section (reverses on scroll back)
  const theOpacity = useTransform(scrollYProgress, [0, 0.08], [0, 1]);
  const theBlur = useTransform(scrollYProgress, [0, 0.08], [22, 0]);
  const theFilter = useMotionTemplate`blur(${theBlur}px)`;
  const eyesOpacity = useTransform(scrollYProgress, [0.05, 0.14], [0, 1]);
  const eyesBlur = useTransform(scrollYProgress, [0.05, 0.14], [22, 0]);
  const eyesFilter = useMotionTemplate`blur(${eyesBlur}px)`;

  function setupSize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sizeRef.current = { w, h, dpr };
  }

  function drawFrame(index: number) {
    const canvas = canvasRef.current;
    const img = imagesRef.current[index];
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // contain-fit, scaled down so the camera reads smaller on the page
    const scale = 0.6;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = w / h;
    let dw, dh;
    if (cr > ir) {
      dh = h * scale;
      dw = dh * ir;
    } else {
      dw = w * scale;
      dh = dw / ir;
    }
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    currentFrame.current = index;
  }

  useEffect(() => {
    let loaded = 0;
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = frameSrc(i);
      img.onload = () => {
        loaded += 1;
        if (i === 0) {
          setupSize();
          drawFrame(0);
        }
        if (loaded >= FRAME_COUNT) setReady(true);
      };
      imgs.push(img);
    }
    imagesRef.current = imgs;

    const redraw = () => {
      setupSize();
      drawFrame(currentFrame.current < 0 ? 0 : currentFrame.current);
    };
    window.addEventListener("resize", redraw);
    const ro = new ResizeObserver(redraw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    requestAnimationFrame(redraw);
    return () => {
      window.removeEventListener("resize", redraw);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (reduce) return;
    const idx = Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(p * (FRAME_COUNT - 1))));
    if (idx !== currentFrame.current) drawFrame(idx);
  });

  return (
    <section id="camera" ref={ref} className="relative h-[260vh] scroll-mt-24 bg-[#0a0a0a] text-white">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* giant ghost name split either side of the camera */}
        <motion.div
          style={reduce ? undefined : { y: ghostY }}
          className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-between px-[10vw]"
        >
          <motion.span
            className="font-bold uppercase leading-none"
            style={{
              fontSize: "clamp(56px, 15vw, 240px)",
              letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.18)",
              ...(reduce ? {} : { opacity: theOpacity, filter: theFilter }),
            }}
          >
            The
          </motion.span>
          <motion.span
            className="font-bold uppercase leading-none"
            style={{
              fontSize: "clamp(56px, 15vw, 240px)",
              letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.18)",
              ...(reduce ? {} : { opacity: eyesOpacity, filter: eyesFilter }),
            }}
          >
            Eyes
          </motion.span>
        </motion.div>
        {/* transparent PNG frames sit opaquely over the ghost (true occlusion) */}
        <canvas ref={canvasRef} className="absolute inset-0 z-[1] h-full w-full" />

        {/* bottom-left content */}
        <motion.div
          style={reduce ? undefined : { y: headY }}
          className="absolute bottom-12 left-6 right-6 z-10 max-w-sm sm:bottom-16 sm:left-12 sm:right-auto lg:left-20"
        >
          <a
            href="#inquire"
            className="group mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-400 transition-colors hover:text-accent-300"
          >
            Engineered in the Central Valley
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </a>
          <h2 className="mb-3 text-pretty text-2xl font-semibold leading-[1.15] tracking-tight text-white sm:mb-4 sm:text-5xl sm:leading-[1.06]">
            Engineered from the lens in.{" "}
            <br className="sm:hidden" />
            <AuroraText colors={TERRA_GREEN}>Built to survive the field.</AuroraText>
          </h2>
          <p className="text-sm text-white/60 sm:text-base">
            4K computer vision · all-weather · tractor-mounted.
          </p>
        </motion.div>

        <motion.div
          style={{ opacity: hintOpacity }}
          className="absolute bottom-10 right-6 z-10 text-xs uppercase tracking-[0.2em] text-white/40 sm:right-12"
        >
          Scroll to disassemble
        </motion.div>
      </div>
    </section>
  );
}
