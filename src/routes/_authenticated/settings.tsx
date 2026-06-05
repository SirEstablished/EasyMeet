import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth, useTheme } from "@/lib/providers";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Moon, Sun, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [emailNotif, setEmailNotif] = useState(true);
  const [inAppNotif, setInAppNotif] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setAvatarUrl(profile.avatar_url ?? null);
    setEmailNotif(profile.email_notifications ?? true);
    setInAppNotif(profile.in_app_notifications ?? true);
  }, [profile]);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setErr(null);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadErr) {
      setErr(uploadErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        username,
        bio,
        location,
        avatar_url: avatarUrl,
        email_notifications: emailNotif,
        in_app_notifications: inAppNotif,
      },
      { onConflict: "id" },
    );
    setSaving(false);
    if (error) setErr(error.message);
    else {
      setMsg("Changes saved.");
      await refreshProfile();
    }
  };

  const initials = (fullName || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold text-gradient-tri">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <section className="rounded-2xl glass-card p-6">
        <h2 className="font-extrabold text-lg text-gradient-tri">Appearance</h2>
        <div className="mt-4 flex gap-3">
          <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className={theme === "light" ? "rounded-full bg-gradient-brand glow-primary" : "rounded-full"}>
            <Sun className="h-4 w-4 mr-2" /> Light
          </Button>
          <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className={theme === "dark" ? "rounded-full bg-gradient-brand glow-primary" : "rounded-full"}>
            <Moon className="h-4 w-4 mr-2" /> Dark
          </Button>
        </div>
      </section>

      <section className="rounded-2xl glass-card p-6 space-y-4">
        <h2 className="font-extrabold text-lg text-gradient-tri">Notifications</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Email notifications</div>
            <div className="text-xs text-muted-foreground">Updates about bookings and messages.</div>
          </div>
          <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">In-app notifications</div>
            <div className="text-xs text-muted-foreground">Real-time alerts inside EasyMeet.</div>
          </div>
          <Switch checked={inAppNotif} onCheckedChange={setInAppNotif} />
        </div>
      </section>

      <section className="rounded-2xl glass-card p-6 space-y-5">
        <h2 className="font-extrabold text-lg text-gradient-tri">Profile</h2>
        <div className="flex items-center gap-4">
          <span className="avatar-ring">
            <Avatar className="h-16 w-16 border-2 border-background">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-full px-4 py-2 text-sm pill-glass">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload avatar"}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-glow" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ada_o" className="input-glow" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lagos, Nigeria" className="input-glow" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself…" className="input-glow" />
        </div>

        {err && <div className="text-sm text-destructive">{err}</div>}
        {msg && <div className="text-sm text-accent">{msg}</div>}

        <Button onClick={handleSave} disabled={saving} className="rounded-full bg-gradient-brand glow-primary">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </section>
    </div>
  );
}