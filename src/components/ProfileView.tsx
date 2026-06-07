import { useCallback, useEffect, useState } from "react";
import { supabase, type Profile, type Service, type Review, type Post } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "./VerificationTicks";
import { StarRating } from "./StarRating";
import { Globe, MapPin, Star as StarIcon, MessageSquare, Briefcase } from "lucide-react";
import { PostCard } from "./PostCard";
import { CommentsDrawer } from "./CommentsDrawer";
import { calcCompletion } from "@/lib/profileCompletion";
import { useLiveData } from "@/hooks/use-live-data";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { getOrCreateConversation } from "@/lib/conversations";
import { toast } from "sonner";

function initialsOf(s: string) {
  return s
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProfileView({
  profile,
  editButton,
  isMe,
}: {
  profile: Profile;
  editButton?: React.ReactNode;
  isMe?: boolean;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("services").select("*").eq("provider_id", profile.id).order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("*, reviewer:reviewer_id(id, full_name, username, avatar_url)")
        .eq("professional_id", profile.id)
        .order("created_at", { ascending: false }),
      profile.role === "customer"
        ? Promise.resolve({ data: [] as Post[] })
        : supabase
            .from("posts")
            .select(
              "*, author:author_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick)",
            )
            .eq("author_id", profile.id)
            .order("created_at", { ascending: false }),
    ]);
    setServices((s as Service[]) ?? []);
    setReviews((r as Review[]) ?? []);
    setPosts((p as Post[]) ?? []);
  }, [profile.id, profile.role]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveData(["services", "reviews", "posts"], load);

  const bookService = async (s: Service) => {
    if (!user) return;
    if (user.id === profile.id) {
      toast.message("This is your own service.");
      return;
    }
    try {
      const cid = await getOrCreateConversation(user.id, profile.id);
      const m = `Hi, I'm interested in your service: ${s.title}. Can we discuss further?`;
      navigate({ to: "/messages", search: { c: cid, m } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

  const isBusiness = profile.role === "business";
  const isCustomer = profile.role === "customer";
  const initials = initialsOf(profile.full_name || profile.username || "U");

  const completion = calcCompletion(profile);

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Cover */}
      <div
        className={`relative h-[160px] sm:h-[220px] w-full rounded-b-3xl overflow-hidden ${
          profile.cover_url ? "" : "bg-mesh-brand"
        }`}
        style={
          profile.cover_url
            ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {profile.cover_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        )}
      </div>
      <div className="px-4 sm:px-6 -mt-12 sm:-mt-14">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-end gap-4">
            <span className="group relative inline-block rounded-full p-[3px] shadow-[0_10px_40px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--primary),var(--accent),var(--coral),var(--primary))] group-hover:spin-slow"
              />
              <Avatar className="relative h-[90px] w-[90px] sm:h-[120px] sm:w-[120px] border-4 border-background">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </span>
          </div>
          {editButton && (
            <div className="w-full sm:w-auto [&_a]:w-full [&_button]:w-full sm:[&_a]:w-auto sm:[&_button]:w-auto [&_button]:rounded-full [&_a]:rounded-full">
              {editButton}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              {profile.full_name || profile.username || "Unnamed"}
            </h1>
            {!isCustomer && (
              <VerificationTicks
                blue={profile.blue_tick}
                white={profile.white_tick}
                gold={profile.gold_tick}
                size="lg"
              />
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
            <span className="inline-flex items-center px-3 py-1 rounded-full glass-card text-xs font-semibold capitalize text-primary">
              {isBusiness ? "Business" : profile.role === "professional" ? "Professional" : "Customer"}
            </span>
            {profile.username && (
              <span className="text-muted-foreground">@{profile.username}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {profile.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-gradient-tri font-semibold hover:underline"
              >
                <Globe className="h-4 w-4" /> Website
              </a>
            )}
          </div>

          {profile.bio && <p className="mt-4 text-sm leading-relaxed">{profile.bio}</p>}

          {isMe && (
            <div className="mt-5 max-w-md rounded-2xl glass-card p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Profile completion</span>
                <span className="text-gradient-tri font-extrabold text-base">{completion}%</span>
              </div>
              <div className="mt-3 h-2.5 w-full bg-secondary/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary via-accent to-coral transition-all"
                  style={{ width: `${Math.max(4, completion)}%` }}
                />
              </div>
              <ul className="mt-3 text-xs text-muted-foreground space-y-1">
                {isCustomer ? (
                  <>
                    <li className={profile.avatar_url ? "text-accent" : ""}>
                      {profile.avatar_url ? "✓" : "•"} Profile photo
                    </li>
                    <li className={profile.full_name && profile.bio ? "text-accent" : ""}>
                      {profile.full_name && profile.bio ? "✓" : "•"} Full name &amp; bio
                    </li>
                    <li className={profile.location ? "text-accent" : ""}>
                      {profile.location ? "✓" : "•"} Location
                    </li>
                    <li className={profile.phone ? "text-accent" : ""}>
                      {profile.phone ? "✓" : "•"} Phone number
                    </li>
                  </>
                ) : (
                  <>
                    <li className={profile.avatar_url ? "text-accent" : ""}>
                      {profile.avatar_url ? "✓" : "•"} Profile photo
                    </li>
                    <li className={profile.full_name ? "text-accent" : ""}>
                      {profile.full_name ? "✓" : "•"} Full name
                    </li>
                    <li className={profile.bio ? "text-accent" : ""}>
                      {profile.bio ? "✓" : "•"} Bio
                    </li>
                    <li className={profile.location ? "text-accent" : ""}>
                      {profile.location ? "✓" : "•"} Location
                    </li>
                    <li className={profile.phone ? "text-accent" : ""}>
                      {profile.phone ? "✓" : "•"} Phone number
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}

          {!isCustomer && (
            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 max-w-xl">
              <StatCard
                icon={<StarIcon className="h-4 w-4 fill-amber-400 text-amber-400" />}
                label="Rating"
                value={Number(profile.avg_rating || 0).toFixed(1)}
                accent="from-amber-400 to-coral"
              />
              <StatCard
                icon={<MessageSquare className="h-4 w-4 text-accent" />}
                label="Reviews"
                value={profile.review_count}
                accent="from-accent to-primary"
              />
              <StatCard
                icon={<Briefcase className="h-4 w-4 text-primary" />}
                label="Services"
                value={services.length}
                accent="from-primary to-coral"
              />
            </div>
          )}
        </div>

        {/* Tabs */}
        {!isCustomer && (
        <Tabs defaultValue="services" className="mt-8">
          <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none p-0 h-auto gap-2">
            {(["services", "reviews", "posts"] as const).map((v) => (
              <TabsTrigger
                key={v}
                value={v}
                className="capitalize relative rounded-none bg-transparent px-4 py-2.5 text-sm font-semibold text-muted-foreground data-[state=active]:text-gradient-tri data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:left-2 data-[state=active]:after:right-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-gradient-to-r data-[state=active]:after:from-primary data-[state=active]:after:via-accent data-[state=active]:after:to-coral transition-colors"
              >
                {v}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="services" className="mt-6">
            {services.length === 0 ? (
              <EmptyState>No services yet</EmptyState>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {services.map((s) => (
                  <div key={s.id} className="rounded-2xl glass-card overflow-hidden flex flex-col lift-hover hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
                    <div
                      className="h-36 bg-mesh-brand"
                      style={
                        s.image_url
                          ? { backgroundImage: `url(${s.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                          : undefined
                      }
                    />
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-semibold">{s.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">
                        {s.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="font-extrabold text-lg text-gradient-tri">
                          ₦{Number(s.price).toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          className="rounded-full bg-gradient-brand glow-primary"
                          onClick={() => bookService(s)}
                          disabled={isMe}
                        >
                          Book Now
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <div className="mb-5 rounded-2xl glass-card p-5 flex items-center gap-4">
              <div className="text-5xl font-extrabold text-gradient-tri leading-none">
                {Number(profile.avg_rating || 0).toFixed(1)}
              </div>
              <div>
                <StarRating value={profile.avg_rating} showNumber={false} size={18} />
                <div className="text-xs text-muted-foreground mt-1">
                  {profile.review_count ?? 0} review{(profile.review_count ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            {reviews.length === 0 ? (
              <EmptyState>No reviews yet</EmptyState>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl glass-card p-5 lift-hover hover:-translate-y-0.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={r.reviewer?.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {initialsOf(r.reviewer?.full_name || "U")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {r.reviewer?.full_name || "User"}
                        </div>
                        <StarRating value={r.rating} showNumber={false} size={12} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.comment && <p className="mt-3 text-sm leading-relaxed">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="posts" className="mt-6">
              {posts.length === 0 ? (
                <EmptyState>No posts yet</EmptyState>
              ) : (
                <div className="space-y-4">
                  {posts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      onOpenComments={setCommentsFor}
                      onDeleted={(id) => setPosts((cur) => cur.filter((x) => x.id !== id))}
                    />
                  ))}
                </div>
              )}
          </TabsContent>
        </Tabs>
        )}
        <CommentsDrawer
          postId={commentsFor}
          open={!!commentsFor}
          onOpenChange={(v) => !v && setCommentsFor(null)}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="relative rounded-2xl glass-card p-4 lift-hover hover:-translate-y-0.5 hover:shadow-[0_15px_40px_-15px_color-mix(in_oklab,var(--primary)_50%,transparent)] overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-extrabold text-2xl mt-1 text-gradient-tri">{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-primary/30 glass-card p-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}