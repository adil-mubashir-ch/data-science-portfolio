import { Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import { projects } from "./projects/registry";

function Loading() {
  return <div className="mx-auto max-w-7xl px-6 py-32 text-center text-ink-3">Loading project…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          {projects.map(({ meta, Page }) => (
            <Route
              key={meta.slug}
              path={`projects/${meta.slug}`}
              element={
                <Suspense fallback={<Loading />}>
                  <Page />
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
