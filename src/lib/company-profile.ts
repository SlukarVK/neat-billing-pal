import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CompanyProfile = Tables<"company_profiles">;

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("company_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useCompanyProfile() {
  return useQuery({ queryKey: ["company-profile"], queryFn: fetchCompanyProfile });
}

/** Downscale an image file to a data URL so it can be stored inline with the profile. */
export function fileToLogoDataUrl(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Soubor se nepodařilo načíst."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Neplatný obrázek."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas není dostupné."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
