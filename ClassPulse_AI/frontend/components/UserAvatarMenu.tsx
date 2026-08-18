"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function UserAvatarMenu() {
  const [hasClerkKey, setHasClerkKey] = useState(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (key && key.startsWith("pk_") && !key.includes("placeholder")) {
      setHasClerkKey(true);
    }
  }, []);

  return (
    <Link
      href="/profile"
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs text-slate-200 transition shadow-sm"
      title="Teacher Profile & Settings"
    >
      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow">
        CP
      </div>
      <span className="hidden sm:inline font-medium">Instructor</span>
    </Link>
  );
}
