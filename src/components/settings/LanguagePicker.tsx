"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { setLanguageAction } from "@/lib/actions/notificationPrefs";

export function LanguagePicker({ initial }: { initial: Lang }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lang, setLang] = React.useState<Lang>(initial);

  async function change(v: Lang) {
    setLang(v);
    const res = await setLanguageAction(v);
    if (!res.ok) {
      setLang(initial);
      toast({ variant: "destructive", title: "Couldn't change language", description: res.message });
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-card p-6 rounded-2xl border border-border space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Language / भाषा / భాష</h2>
        <p className="text-sm text-muted-foreground">
          Used for the menu and your phone notifications (new leads, reminders, morning summary). Other screens are still in English for now.
        </p>
      </div>
      <div className="max-w-xs space-y-1">
        <Label htmlFor="language">Language</Label>
        <select
          id="language"
          value={lang}
          onChange={(e) => change(e.target.value as Lang)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>
    </div>
  );
}
