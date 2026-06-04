import { useEffect, useState } from "react";
import { supabase, type Profile, type Service, type Review, type Post } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "./VerificationTicks";
import { StarRating } from "./StarRating";
import { Globe, MapPin } from "lucide-react";
import { PostCard } from "./PostCard";
import { CommentsDrawer } from "./CommentsDrawer";
import { calcCompletion } from "@/lib/profileCompletion";
import { fetchLikeCount } from "@/lib/likeCounts";

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
}: {
  profile: Profile;
  editButton?: React.ReactNode;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  const refreshLike = async (postId: string) => {
    const count = await fetchLikeCount(postId);
    setLikeCounts((m) => ({ ...m, [postId]: count }));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (cancelled) return;
      setServices((s as Service[]) ?? []);
      setReviews((r as Review[]) ?? []);
      setPosts((p as Post[]) ?? []);
      const arr = (p as Post[]) ?? [];
      const entries = await Promise.all(
        arr.map(async (post) => [post.id, await fetchLikeCount(post.id)] as const),
      );
      if (!cancelled) setLikeCounts(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.role]);

  // Realtime: any like/unlike on this profile's posts updates the count for all viewers.
  useEffect(() => {
    const channel = supabase
      .channel(`profile_post_likes:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { post_id?: string } | null;
          if (row?.post_id) refreshLike(row.post_id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const isBusiness = profile.role === "business";
  const isCustomer = profile.role === "customer";
  const initials = initialsOf(profile.full_name || profile.username || "U");

  const completion = calcCompletion(profile);

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Cover */}
      <div
        className={`h-44 sm:h-56 w-full rounded-b-2xl relative ${
          profile.cover_url ? "" : "bg-mesh-brand"
        }`}
        style={
          profile.cover_url
            ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      />
      <div className="px-4 sm:px-6 -mt-12 sm:-mt-14">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-end gap-4">
            <span className="inline-block rounded-full p-[3px] bg-gradient-brand shadow-lg">
              <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </span>
          </div>
          {editButton && (
            <div className="w-full sm:w-auto [&_a]:w-full [&_button]:w-full sm:[&_a]:w-auto sm:[&_button]:w-auto">
              {editButton}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold">
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
            <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize text-xs font-medium">
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
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Globe className="h-4 w-4" /> Website
              </a>
            )}
          </div>

          {profile.bio && <p className="mt-4 text-sm leading-relaxed">{profile.bio}</p>}

          <div className="mt-5 max-w-md rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Profile completion</span>
              <span className="text-primary font-bold">{completion}%</span>
            </div>
            <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-brand transition-all"
                style={{ width: `${completion}%` }}
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

          {!isCustomer && (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
              <Stat
                label="Rating"
                value={
                  <StarRating
                    value={profile.avg_rating}
                    count={profile.review_count}
                    showNumber={false}
                  />
                }
              />
              <Stat label="Reviews" value={profile.review_count} />
              <Stat label="Services" value={services.length} />
            </div>
          )}
        </div>

        {/* Tabs */}
        {!isCustomer && (
        <Tabs defaultValue="services" className="mt-8">
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-4">
            {services.length === 0 ? (
              <EmptyState>No services yet</EmptyState>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((s) => (
                  <div key={s.id} className="rounded-xl glass-card overflow-hidden flex flex-col lift-hover hover:-translate-y-0.5 hover:shadow-xl">
                    <div
                      className="h-32 bg-secondary"
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
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-bold text-primary">
                          ₦{Number(s.price).toLocaleString()}
                        </span>
                        <Button size="sm">Book Now</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <div className="flex items-center gap-3 mb-4">
              <StarRating value={profile.avg_rating} count={profile.review_count} />
            </div>
            {reviews.length === 0 ? (
              <EmptyState>No reviews yet</EmptyState>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
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
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="posts" className="mt-4">
              {posts.length === 0 ? (
                <EmptyState>No posts yet</EmptyState>
              ) : (
                <div className="space-y-4">
                  {posts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      likeCount={likeCounts[p.id] ?? 0}
                      onLikeChanged={refreshLike}
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl glass-card px-3 py-2 border-l-2 border-l-primary/60">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}