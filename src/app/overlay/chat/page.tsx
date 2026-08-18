import { ChatFeedOverlay } from "@/components/chat-feed-overlay";

export default async function ChatOverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <ChatFeedOverlay sessionId={session ?? "live_demo_001"} />;
}
