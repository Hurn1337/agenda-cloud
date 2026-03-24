"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
      setPassword("");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm text-center">
        <Image src="/logo.png" alt="Publivio" width={80} height={80} className="mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800 mb-1">Publivio Agenda Manager</h1>
        <p className="text-sm text-gray-400 mb-6">Bitte Passwort eingeben</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Passwort"
            autoFocus
            className={`w-full border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none ${
              error ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-blue-300"
            }`}
          />
          {error && <p className="text-red-500 text-sm">Falsches Passwort</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white py-3 rounded-lg font-medium text-sm transition-colors"
          >
            {loading ? "..." : "Zugang"}
          </button>
        </form>
      </div>
    </div>
  );
}
