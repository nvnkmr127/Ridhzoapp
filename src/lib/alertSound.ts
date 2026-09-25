// New-alert sound, generated with Web Audio (no audio files to ship). The choice is per device —
// a shop owner may want a loud ring on the counter PC and silence on their laptop.
export type AlertSound = "chime" | "ring" | "bell" | "off";

export const ALERT_SOUNDS: { id: AlertSound; label: string }[] = [
  { id: "chime", label: "Chime (soft)" },
  { id: "ring", label: "Phone ring (loud)" },
  { id: "bell", label: "Shop bell" },
  { id: "off", label: "No sound" },
];

const KEY = "ridhzo_alert_sound";

export function getAlertSound(): AlertSound {
  try {
    const v = localStorage.getItem(KEY) as AlertSound | null;
    return v && ALERT_SOUNDS.some((s) => s.id === v) ? v : "chime";
  } catch {
    return "chime";
  }
}

export function setAlertSound(v: AlertSound) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked — falls back to the default */
  }
}

// [frequency Hz, start s, duration s] notes per sound.
const NOTES: Record<Exclude<AlertSound, "off">, [number, number, number][]> = {
  chime: [[880, 0, 0.25], [1320, 0.18, 0.4]],
  ring: [[1400, 0, 0.1], [1100, 0.1, 0.1], [1400, 0.2, 0.1], [1100, 0.3, 0.1], [1400, 0.7, 0.1], [1100, 0.8, 0.1], [1400, 0.9, 0.1], [1100, 1.0, 0.1]],
  bell: [[1568, 0, 0.9], [2093, 0.02, 0.7]],
};

let ctx: AudioContext | null = null;

export async function playAlertSound(sound: AlertSound = getAlertSound()) {
  if (sound === "off" || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    // Browsers keep audio suspended until the user has clicked the page once; resume is a no-op after.
    if (ctx.state === "suspended") await ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, dur] of NOTES[sound]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound === "ring" ? "square" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(sound === "ring" ? 0.15 : 0.3, t0 + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    }
  } catch {
    /* audio unavailable — the badge still shows */
  }
}
