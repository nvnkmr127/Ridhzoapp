"use client";

import * as React from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ALERT_SOUNDS, getAlertSound, playAlertSound, setAlertSound, type AlertSound } from "@/lib/alertSound";

// Per-device choice (saved in this browser) of the sound played when a new lead or alert arrives.
export function AlertSoundPicker() {
  const [sound, setSound] = React.useState<AlertSound>("chime");
  React.useEffect(() => setSound(getAlertSound()), []);

  return (
    <div className="bg-card p-6 rounded-2xl border border-border space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Alert sound</h2>
        <p className="text-sm text-muted-foreground">Plays when a new lead or reminder arrives while Ridhzo is open. Saved for this device.</p>
      </div>
      <div className="flex max-w-md items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="alert-sound">Sound</Label>
          <select
            id="alert-sound"
            value={sound}
            onChange={(e) => {
              const v = e.target.value as AlertSound;
              setSound(v);
              setAlertSound(v);
              void playAlertSound(v);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ALERT_SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => playAlertSound(sound)} disabled={sound === "off"}>
          <Volume2 className="h-4 w-4" /> Test
        </Button>
      </div>
    </div>
  );
}
