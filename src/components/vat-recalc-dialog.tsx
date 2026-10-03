import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function VatRecalcDialog({ selectedIds }: { selectedIds: string[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState("21");
  const [scope, setScope] = useState<"all" | "selected">(selectedIds.length ? "selected" : "all");

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("recalc_invoices_vat", {
        _ids: scope === "selected" ? selectedIds : (null as unknown as string[]),
        _rate: Number(rate),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      qc.invalidateQueries();
      toast.success(`DPH přepočteno u ${n} faktur.`);
      setOpen(false);
    },
    onError: () => toast.error("Přepočet DPH se nezdařil."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setScope(selectedIds.length ? "selected" : "all");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Percent className="mr-1.5 h-4 w-4" />
          Přepočet DPH
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hromadný přepočet DPH</DialogTitle>
          <DialogDescription>
            Všem položkám zvolených faktur se nastaví nová sazba a přepočte se DPH i celková
            částka. Ceny bez DPH zůstanou stejné. Zápisy v účtech se upraví automaticky.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Nová sazba</p>
            <div className="flex gap-2">
              {["21", "12", "0"].map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={rate === r ? "default" : "outline"}
                  onClick={() => setRate(r)}
                >
                  {r} %
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Rozsah</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={scope === "selected" ? "default" : "outline"}
                disabled={!selectedIds.length}
                onClick={() => setScope("selected")}
              >
                Vybrané ({selectedIds.length})
              </Button>
              <Button
                size="sm"
                variant={scope === "all" ? "default" : "outline"}
                onClick={() => setScope("all")}
              >
                Všechny faktury
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Přepočítávám…" : "Přepočítat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
