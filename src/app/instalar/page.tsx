import type { Metadata } from "next";
import InstalarClient from "./InstalarClient";

export const metadata: Metadata = {
  title: "Instalar Chartly",
  description: "Instalá Chartly en tu iPhone o Android sin pasar por la App Store.",
};

export default function InstalarPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-md mx-auto">
        <InstalarClient />
      </div>
    </main>
  );
}
