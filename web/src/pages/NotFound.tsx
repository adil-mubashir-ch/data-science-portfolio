import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-32 text-center">
      <h1 className="font-serif text-4xl font-semibold text-ink">Nothing growing here</h1>
      <p className="mt-3 text-ink-2">That page doesn't exist.</p>
      <Link to="/" className="mt-6 inline-block text-accent underline underline-offset-4">Back to projects</Link>
    </main>
  );
}
