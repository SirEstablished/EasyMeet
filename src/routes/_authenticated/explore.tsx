import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
});

function Explore() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
      <Search className="h-10 w-10 mx-auto text-primary" />
      <h1 className="text-3xl font-bold mt-4">Explore Professionals</h1>
      <p className="text-muted-foreground mt-2">
        Browse verified professionals and businesses across Nigeria. Listings coming soon.
      </p>
    </div>
  );
}