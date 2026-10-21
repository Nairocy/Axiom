import { useRef, useEffect, useCallback } from "react";

interface ColorPickerProps { value: string; onChange: (color: string) => void; }

const hslToRgb = (h: number, s: number, l: number) => {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
};
const rgbToHex = (r: number, g: number, b: number) => "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
const hexToHsl = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s2 = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h2 = 0;
  if (max === r) h2 = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h2 = ((b - r) / d + 2) * 60;
  else h2 = ((r - g) / d + 4) * 60;
  return { h: h2, s: s2 * 100, l: l * 100 };
};

const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  const svRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const svP = useRef<HTMLDivElement>(null);
  const hueP = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const hueThumb = useRef<HTMLDivElement>(null);
  const hsl = useRef(hexToHsl(value || "#3b82f6"));

  // Efficient hue bar rendering
  const paintHue = useCallback(() => {
    const hueC = hueRef.current, hueD = hueP.current;
    if (!hueC || !hueD) return;
    const dpr = window.devicePixelRatio || 1;
    const r = hueD.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    hueC.width = r.width * dpr; hueC.height = r.height * dpr;
    const ctx = hueC.getContext("2d"); if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 0, hueC.height);
    for (let i = 0; i <= 360; i += 1) grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, hueC.width, hueC.height);
    // Position thumb
    if (hueThumb.current) hueThumb.current.style.top = `${(hsl.current.h / 360) * 100}%`;
  }, []);

  // Efficient SV panel rendering using canvas gradients (NOT pixel-by-pixel)
  const paintSV = useCallback(() => {
    const svC = svRef.current, svD = svP.current;
    if (!svC || !svD) return;
    const dpr = window.devicePixelRatio || 1;
    const r = svD.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const w = r.width * dpr, h = r.height * dpr;
    // Only resize if dimensions changed
    if (svC.width !== w || svC.height !== h) {
      svC.width = w; svC.height = h;
    }
    svC.style.width = "100%"; svC.style.height = "100%";
    const ctx = svC.getContext("2d"); if (!ctx) return;

    const hue = hsl.current.h;

    // Layer 1: Fill with pure hue color at max saturation & brightness
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);

    // Layer 2: Horizontal white gradient (left→right) = saturation axis
    const satGrad = ctx.createLinearGradient(0, 0, w, 0);
    satGrad.addColorStop(0, "rgba(255,255,255,1)");  // s=0 → white
    satGrad.addColorStop(1, "rgba(255,255,255,0)");  // s=100 → saturated hue
    ctx.fillStyle = satGrad;
    ctx.fillRect(0, 0, w, h);

    // Layer 3: Vertical black gradient (top→bottom) = value/brightness axis
    const valGrad = ctx.createLinearGradient(0, 0, 0, h);
    valGrad.addColorStop(0, "rgba(0,0,0,0)");    // v=100 → full brightness
    valGrad.addColorStop(1, "rgba(0,0,0,1)");    // v=0 → black
    ctx.fillStyle = valGrad;
    ctx.fillRect(0, 0, w, h);

    // Position dot
    if (dot.current) {
      dot.current.style.left = `${hsl.current.s}%`;
      dot.current.style.top = `${100 - hsl.current.l}%`;
    }
  }, []);

  // Paint both panels
  const paintAll = useCallback(() => {
    paintHue();
    paintSV();
  }, [paintHue, paintSV]);

  // Initial paint & resize
  useEffect(() => {
    // Delay initial paint to ensure layout is ready
    const raf = requestAnimationFrame(paintAll);
    return () => cancelAnimationFrame(raf);
  }, [paintAll]);

  // Re-paint when value changes externally
  useEffect(() => {
    hsl.current = hexToHsl(value || "#3b82f6");
    requestAnimationFrame(paintSV);
  }, [value, paintSV]);

  // Handle window resize
  useEffect(() => {
    const onResize = () => requestAnimationFrame(paintAll);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paintAll]);

  const pickSV = (e: React.PointerEvent) => {
    const el = svP.current; if (!el) return;
    el.setPointerCapture(e.pointerId);

    const upd = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const mx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const my = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      hsl.current = { h: hsl.current.h, s: Math.round(mx * 100), l: Math.round((1 - my) * 100) };
      const { r: rr, g, b } = hslToRgb(hsl.current.h, hsl.current.s, hsl.current.l);
      onChange(rgbToHex(rr, g, b));
      // Update dot position immediately
      if (dot.current) {
        dot.current.style.left = `${hsl.current.s}%`;
        dot.current.style.top = `${100 - hsl.current.l}%`;
      }
      // Repaint SV panel for the new saturation/lightness (hue unchanged)
      paintSV();
    };
    upd(e.nativeEvent);

    const m = (ev: PointerEvent) => upd(ev);
    const u = () => {
      el.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', m);
      document.removeEventListener('pointerup', u);
    };
    document.addEventListener('pointermove', m);
    document.addEventListener('pointerup', u);
  };

  const pickHue = (e: React.PointerEvent) => {
    const el = hueP.current; if (!el) return;
    el.setPointerCapture(e.pointerId);

    const upd = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const my = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      hsl.current = { h: Math.round(my * 360), s: hsl.current.s, l: hsl.current.l };
      const { r: rr, g, b } = hslToRgb(hsl.current.h, hsl.current.s, hsl.current.l);
      onChange(rgbToHex(rr, g, b));
      // Update hue thumb immediately
      if (hueThumb.current) hueThumb.current.style.top = `${(hsl.current.h / 360) * 100}%`;
      // Repaint SV panel (hue changed, so the base color changes)
      paintSV();
    };
    upd(e.nativeEvent);

    const m = (ev: PointerEvent) => upd(ev);
    const u = () => {
      el.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', m);
      document.removeEventListener('pointerup', u);
    };
    document.addEventListener('pointermove', m);
    document.addEventListener('pointerup', u);
  };

  return (<div style={{ display: 'flex', gap: '8px', width: '100%' }}>
    <div ref={svP} onPointerDown={pickSV} style={{ position: 'relative', flex: 1, aspectRatio: '1/1', borderRadius: '8px', cursor: 'crosshair', border: '1px solid var(--border-color)', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <canvas ref={svRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <div ref={dot} style={{ position: 'absolute', width: '14px', height: '14px', border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.3)', transform: 'translate(-50%,-50%)', pointerEvents: 'none', left: '50%', top: '50%' }} />
    </div>
    <div ref={hueP} onPointerDown={pickHue} style={{ position: 'relative', width: '22px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-color)', overflow: 'hidden', touchAction: 'none', userSelect: 'none', flexShrink: 0 }}>
      <canvas ref={hueRef} style={{ display: 'block', width: '100%', minHeight: '100px' }} />
      <div ref={hueThumb} style={{ position: 'absolute', left: '50%', width: '20px', height: '4px', background: '#fff', borderRadius: '3px', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)', transform: 'translate(-50%,-50%)', pointerEvents: 'none', top: '50%' }} />
    </div>
  </div>);
};

export default ColorPicker;
