import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { ProfileView } from "@/components/ProfileView";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile/$id")({
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        setProfile((data as Profile) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-muted-foreground">Loading…</div>;
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
      profile={profile}
      editButton={
        isMe ? (
          <Button asChild variant="outline">
            <Link to="/profile">
              <Pencil className="h-4 w-4 mr-2" /> Edit profile
            </Link>
          </Button>
        ) : null
      }
    />
  );
}