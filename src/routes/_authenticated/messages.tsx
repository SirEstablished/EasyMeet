import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  component: Messages,
});

function Messages() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
      <MessageCircle className="h-10 w-10 mx-auto text-primary" />
      <h1 className="text-3xl font-bold mt-4">Messages</h1>
      <p className="text-muted-foreground mt-2">
        Secure messaging with professionals. Your inbox is empty for now.
      </p>
    </div>
  );
}