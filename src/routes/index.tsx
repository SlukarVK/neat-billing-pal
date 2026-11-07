import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Accountrix — účetnictví a fakturace" },
      { name: "description", content: "Accountrix pro správu faktur, účetních zápisů a podkladů DPH." },
      { property: "og:title", content: "Accountrix — účetnictví a fakturace" },
      { property: "og:description", content: "Správa faktur, účetních zápisů a podkladů DPH v Accountrix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/faktury" });
  },
  component: () => null,
});
