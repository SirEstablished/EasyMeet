import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/providers";
import { ProfileView } from "@/components/ProfileView";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "@/components/VerificationTicks";
import { Pencil, Star } from "lucide-react";
import { VerificationModal } from "@/components/VerificationModal";

export const Route = createFileRoute("/_authenticated/profile/")({
  component: MyProfilePage,
});

function MyProfilePage() {
  const { profile } = useAuth();
  const [edit, setEdit] = useState(false);
  const [verifyTick, setVerifyTick] = useState<"blue" | "white" | null>(null);

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  const isBusiness = profile.role === "business";
  const isProfessional = profile.role === "professional";

  return (
    <>
      <ProfileView
        profile={profile}
        isMe
        editButton={
          <Button onClick={() => setEdit(true)} variant="outline">
            <Pencil className="h-4 w-4 mr-2" /> Edit profile
          </Button>
        }
      />

      {(isBusiness || isProfessional) && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-3xl glass-card p-6">
            <h2 className="font-extrabold text-xl text-gradient-tri">Get Verified</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your current verification status:
            </p>
            <div className="mt-3">
              {profile.blue_tick || profile.white_tick || profile.gold_tick ? (
                <VerificationTicks
                  blue={profile.blue_tick}
                  white={profile.white_tick}
                  gold={profile.gold_tick}
                  size="lg"
                />
              ) : (
                <span className="text-sm text-muted-foreground">No verification yet</span>
              )}
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {isProfessional && (
                <VerificationCard
                  title="Blue Tick"
                  badge={<VerificationTicks blue size="lg" />}
                  description="Verified Professional badge. Builds trust with customers."
                  price="₦2,000/month"
                  cta="Get Blue Tick"
                  disabled={profile.blue_tick}
                  disabledLabel="Active"
                  onClick={() => setVerifyTick("blue")}
                />
              )}
              {isBusiness && (
                <VerificationCard
                  title="White Tick"
                  badge={<VerificationTicks white size="lg" />}
                  description="Verified Organisation badge for registered businesses."
                  price="₦5,000/month"
                  cta="Get White Tick"
                  disabled={profile.white_tick}
                  disabledLabel="Active"
                  onClick={() => setVerifyTick("white")}
                />
              )}
              <div className="relative rounded-2xl p-4 overflow-hidden border border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-amber-300/5 to-transparent shadow-[0_10px_30px_-15px_rgba(245,193,74,0.5)]">
                <div className="absolute inset-0 pointer-events-none gold-shimmer opacity-[0.06]" />
                <div className="flex items-center gap-2">
                  <VerificationTicks gold size="lg" />
                  <h3 className="font-semibold">Gold Tick</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  Earned automatically when you have 4.8+ rating, 50+ reviews, active for 6+ months, and a complete profile.
                </p>
                <div className="mt-3 text-xs">
                  Status:{" "}
                  <span className={profile.gold_tick ? "text-accent font-medium" : "text-muted-foreground"}>
                    {profile.gold_tick ? "Awarded" : "Not yet earned"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <EditProfileDialog open={edit} onOpenChange={setEdit} profile={profile} />
      {verifyTick && (
        <VerificationModal
          open={!!verifyTick}
          onOpenChange={(v) => !v && setVerifyTick(null)}
          tickType={verifyTick}
        />
      )}
    </>
  );
}

function VerificationCard({
  title,
  badge,
  description,
  price,
  cta,
  disabled,
  disabledLabel,
  onClick,
}: {
  title: string;
  badge: React.ReactNode;
  description: string;
  price: string;
  cta: string;
  disabled?: boolean;
  disabledLabel?: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4 flex flex-col">
      <div className="flex items-center gap-2">
        {badge}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mt-2 flex-1">{description}</p>
      <div className="mt-3 font-bold text-primary">{price}</div>
      <Button className="mt-3 bg-gradient-brand" disabled={disabled} onClick={onClick}>
        {disabled ? disabledLabel || "Active" : cta}
      </Button>
    </div>
  );
}