import { RiffCaptionOverlay } from "@/components/riff-caption-overlay";

export default async function RiffOverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <RiffCaptionOverlay sessionId={session ?? "active"} />;
}
