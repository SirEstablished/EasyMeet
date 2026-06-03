import { useEffect, useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile;
}) {
  const { user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(profile.full_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setWebsite(profile.website ?? "");
    setAvatarUrl(profile.avatar_url);
    setCoverUrl(profile.cover_url);
    setErr(null);
  }, [open, profile]);

  const upload = async (
    e: ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "cover",
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(kind);
    setErr(null);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      setErr(error.message);
      setUploading(null);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    if (kind === "avatar") setAvatarUrl(data.publicUrl);
    else setCoverUrl(data.publicUrl);
    setUploading(null);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        bio,
        location,
        website,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await refreshProfile();
    onOpenChange(false);
  };

  const initials = (fullName || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your public profile details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Cover photo</Label>
            <div
              className="h-28 rounded-lg bg-gradient-brand"
              style={
                coverUrl
                  ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : undefined
              }
            />
            <label className="mt-2 inline-flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">
              <Upload className="h-3.5 w-3.5" />
              {uploading === "cover" ? "Uploading…" : "Change cover"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "cover")} />
            </label>
          </div>

          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
              <Upload className="h-4 w-4" />
              {uploading === "avatar" ? "Uploading…" : "Change avatar"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "avatar")} />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ep-name">Full name</Label>
              <Input id="ep-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-username">Username</Label>
              <Input id="ep-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-location">Location</Label>
            <Input id="ep-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lagos, Nigeria" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-website">Website</Label>
            <Input id="ep-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-bio">Bio</Label>
            <Textarea id="ep-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>

          {err && <div className="text-sm text-destructive">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-brand">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}