import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, user } = useAuth();
  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-5">
        <Avatar className="h-20 w-20">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{profile?.full_name || "Unnamed user"}</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.username ? `@${profile.username}` : user?.email}
          </p>
          <div className="text-xs mt-1 inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
            {profile?.role}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/settings">Edit profile</Link>
        </Button>
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">About</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {profile?.bio || "No bio yet. Add one in Settings."}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          📍 {profile?.location || "Location not set"}
        </p>
      </div>
    </div>
  );
}