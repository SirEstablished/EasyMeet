import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatServicePrice, type Service } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Loader2, EyeOff } from "lucide-react";
import { ServiceFormDialog } from "@/components/ServiceFormDialog";
import { toast } from "sonner";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/my-services")({
  component: MyServicesPage,
});

function MyServicesPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "customer") {
      navigate({ to: "/dashboard" });
      return;
    }
  }, [profile, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setServices((data as Service[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

  useLiveData(["services"], load);

  const onSaved = (s: Service) => {
    setServices((cur) => {
      const i = cur.findIndex((x) => x.id === s.id);
      if (i >= 0) { const next = [...cur]; next[i] = s; return next; }
      return [s, ...cur];
    });
  };

  const onDelete = async (s: Service) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    setServices((cur) => cur.filter((x) => x.id !== s.id));
    toast.success("Service deleted");
  };

  if (!profile) return null;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">My Services</h1>
          <p className="text-sm text-muted-foreground">Manage the services you offer on EasyMeet.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-full bg-gradient-brand glow-primary w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" /> Add New Service
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
              <Plus className="h-5 w-5" />
            </div>
            You haven't added any services yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((s) => (
              <div key={s.id} className="group rounded-2xl glass-card overflow-hidden flex flex-col lift-hover hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
                <ServiceMediaGallery media={s.media_urls ?? (s.image_url ? [s.image_url] : [])} title={s.title} />
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{s.title}</h3>
                      <div className="font-extrabold text-gradient-brand mt-0.5">{formatServicePrice(s.price)}</div>
                    </div>
                    {!s.is_active && (
                      <span className="status-pill status-cancelled"><EyeOff className="h-3 w-3" />Hidden</span>
                    )}
                  </div>
                  {s.category && (
                    <span className="mt-2 w-fit pill-glass px-2.5 py-0.5 text-[11px] font-semibold">{s.category}</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{s.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(s); setOpen(true); }} className="flex-1 rounded-full">
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(s)} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ServiceFormDialog open={open} onOpenChange={setOpen} service={editing} onSaved={onSaved} />
    </div>
  );
}

function ServiceMediaGallery({ media, title }: { media: string[]; title: string }) {
  const isVideo = (u: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
  const [idx, setIdx] = useState(0);
  if (!media || media.length === 0) {
    return (
      <div className="aspect-video bg-secondary grid place-items-center text-xs text-muted-foreground">
        No media
      </div>
    );
  }
  const current = media[Math.min(idx, media.length - 1)];
  return (
    <div className="relative aspect-video bg-secondary overflow-hidden">
      {isVideo(current) ? (
        <video src={current} controls className="w-full h-full object-cover" />
      ) : (
        <img src={current} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      {media.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm">
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              aria-label={`Go to media ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}