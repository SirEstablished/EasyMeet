import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { ProfileView } from "@/components/ProfileView";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Pencil, MessageCircle, Loader2 } from "lucide-react";
import { getOrCreateConversation } from "@/lib/conversations";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile/$id")({
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setErr(null);
    setProfile(null);

    console.log("[profile] fetching id:", id);

    timeoutId = setTimeout(() => {
      if (cancelled) return;
      console.warn("[profile] timeout after 5s for id:", id);
      setErr("Loading timed out. Please try again.");
      setLoading(false);
    }, 5000);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        console.log("[profile] response:", { data, error });
        if (error) setErr(error.message);
        else if (!data) setErr("Profile not found");
        setProfile((data as Profile) ?? null);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        console.error("[profile] fetch failed:", e);
        setErr(e?.message || "Failed to load profile");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id]);

  const onMessage = async () => {
    if (!profile) return;
    if (!user) return;
    const targetId = profile.id;
    if (!targetId || targetId === user.id) {
      toast.error("You cannot message yourself");
      return;
    }
    try {
      setStarting(true);
      const cid = await getOrCreateConversation(user.id, targetId);
      navigate({ to: "/messages", search: { c: cid } as any });
    } catch (e: any) {
      toast.error(e.message || "Could not start conversation");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }
  if (err || !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <h1 className="text-xl font-semibold">Profile not found</h1>
        <p className="text-sm text-muted-foreground mt-1">{err || "This user does not exist."}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/explore">Back to Explore</Link>
        </Button>
      </div>
    );
  }

  const isMe = user?.id === profile.id;

  return (
    <ProfileView
      key={profile.id}
      profile={profile}
      isMe={isMe}
      editButton={
        isMe ? (
          <Button asChild variant="outline">
            <Link to="/profile">
              <Pencil className="h-4 w-4 mr-2" /> Edit profile
            </Link>
          </Button>
        ) : (
          <Button onClick={onMessage} disabled={starting} className="bg-gradient-brand">
            <MessageCircle className="h-4 w-4 mr-2" />
            {starting ? "Opening…" : "Message"}
          </Button>
        )
      }
    />
  );
}