import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Service } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, EyeOff } from "lucide-react";
import { ServiceFormDialog } from "@/components/ServiceFormDialog";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("services")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        setServices((data as Service[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">My Services</h1>
          <p className="text-sm text-muted-foreground">Manage the services you offer on EasyMeet.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-gradient-brand">
          <Plus className="h-4 w-4 mr-2" /> Add New Service
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            You haven't added any services yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
                <div className="aspect-video bg-secondary">
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">No image</div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{s.title}</h3>
                      <div className="text-primary font-bold mt-0.5">{formatNgn(s.price_ngn)}</div>
                    </div>
                    {!s.is_active && (
                      <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Hidden</Badge>
                    )}
                  </div>
                  {s.category && (
                    <Badge variant="outline" className="mt-2 w-fit">{s.category}</Badge>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{s.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(s); setOpen(true); }} className="flex-1">
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