"use client";

import { useState } from "react";

function add(a: number, b: number): number {
  return a + b;
}

export default function Home() {
  const [a, setA] = useState<any>("0");
  const [b, setB] = useState<string>("0");
  const [result, setResult] = useState<number | null>(null);

  function handleCalculate() {
    const numA = Number(a);
    const numB = Number(b);
    setResult(add(numA, numB));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-xl font-semibold text-zinc-800 dark:text-zinc-100">
          Calculator (+)
        </h1>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              First number
            </span>
            <input
              type="text"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <span className="text-center text-lg text-zinc-500">+</span>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Second number
            </span>
            <input
              type="number"
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <button
            type="button"
            onClick={handleCalculate}
            className="mt-2 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Calculate
          </button>
          {result !== null && (
            <p className="rounded-lg bg-zinc-100 py-3 text-center text-lg font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              Result: {result}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
