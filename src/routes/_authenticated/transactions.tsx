import { createFileRoute } from "@tanstack/react-router";
import { TransactionsSection } from "@/components/TransactionsSection";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your escrow activity, deal history, and CSV export.
        </p>
      </div>
      <TransactionsSection />
    </div>
  );
}