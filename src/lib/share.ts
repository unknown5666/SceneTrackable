import type { ArtElement, CastMember, ProductionLocation, Scene } from "@/types";
import { formatCurrency } from "@/lib/utils";

// ============================================================
// SHARE — plain-text summaries + WhatsApp click-to-chat deep link
// ============================================================
// WhatsApp's public API (api.whatsapp.com/send / wa.me) only supports a
// pre-filled TEXT message — it cannot attach a file via URL. There is no
// client-only way to push a file into WhatsApp; that needs the WhatsApp
// Business Platform (Meta app review + a registered number + a server this
// app doesn't have). So the flow here is: build a text summary, open
// WhatsApp with it, and — when a PDF was also generated — tell the user to
// attach the file they just downloaded.

export function whatsappUrl(text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppShare(text: string) {
  window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
}

export async function copyShareText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Per-entity plain-text summaries
// ------------------------------------------------------------

export function buildSceneShareText(scene: Scene, projectTitle: string): string {
  const lines = [
    `${projectTitle} — Scene ${scene.number}`,
    `${scene.intExt}. ${scene.location} — ${scene.timeOfDay}`,
    scene.synopsis ? `\n${scene.synopsis}` : "",
    `\nPages: ${scene.pages} · Est. ${scene.estimatedShootMinutes} min`,
    scene.shotStatus === "shot" ? "Status: Shot" : "Status: Not shot",
  ];
  if (scene.elements.length) {
    lines.push(
      `\nElements (${scene.elements.length}): ` +
        scene.elements.map((e) => e.name).slice(0, 20).join(", ") +
        (scene.elements.length > 20 ? "…" : "")
    );
  }
  return lines.filter(Boolean).join("\n");
}

export function buildLocationShareText(
  loc: ProductionLocation,
  sceneNumbers: string[],
  projectTitle: string
): string {
  const lines = [
    `${projectTitle} — Location: ${loc.name}`,
    `${loc.type} · Permit: ${loc.permitStatus.replace(/_/g, " ")}`,
    loc.lockDate ? `Locked: ${loc.lockDate.slice(0, 10)}` : "",
    loc.address ? `Address: ${loc.address}` : "",
    [loc.contactName, loc.contactPhone].filter(Boolean).join(" · "),
    `\nScenes (${sceneNumbers.length}): ${sceneNumbers.join(", ") || "none yet"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildCastShareText(
  c: CastMember,
  sceneNumbers: string[],
  projectTitle: string,
  currency: string
): string {
  const lines = [
    `${projectTitle} — Cast: ${c.name}`,
    `Character: ${c.role} (${c.category.replace("_", " ")})`,
    `Rate/day: ${formatCurrency(c.ratePerDay, currency)}`,
    c.agent ? `Agent: ${c.agent}` : "",
    c.contact ? `Contact: ${c.contact}` : "",
    `\nScenes (${sceneNumbers.length}): ${sceneNumbers.join(", ") || "none yet"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildWardrobeShareText(
  el: ArtElement,
  sceneNumbers: string[],
  projectTitle: string,
  currency: string
): string {
  const lines = [
    `${projectTitle} — ${el.category.replace("_", " ")}: ${el.name}`,
    `Status: ${el.status.replace(/_/g, " ")}`,
    el.characterName ? `Character: ${el.characterName}` : "",
    el.cost !== undefined ? `Cost: ${formatCurrency(el.cost, currency)}` : "",
    el.notes ? `Notes: ${el.notes}` : "",
    `\nScenes (${sceneNumbers.length}): ${sceneNumbers.join(", ") || "none"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildReportShareText(reportTitle: string, rowCount: number, projectTitle: string): string {
  return `${projectTitle} — ${reportTitle}\n${rowCount} rows. PDF attached separately.`;
}

export function buildAssetShareText(
  kindLabel: string,
  name: string,
  details: Record<string, string | number | undefined | null>,
  projectTitle: string
): string {
  const detailLines = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return [`${projectTitle} — ${kindLabel}: ${name}`, ...detailLines].join("\n");
}
