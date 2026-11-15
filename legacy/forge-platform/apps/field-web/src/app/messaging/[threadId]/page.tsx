import { MessagingThreadView } from "@/components/messaging-thread";

export function generateStaticParams() {
  return [{ threadId: "placeholder" }];
}

export default function MessagingThreadPage() {
  return <MessagingThreadView />;
}
