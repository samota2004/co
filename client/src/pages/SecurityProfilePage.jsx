import React from 'react';

export function SecurityProfilePage({ currentUser }) {
  return <div className="mx-auto w-full max-w-[1000px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
    <section className="rounded-2xl border border-white/10 bg-[#050A10] p-6"><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Administrator identity</p><h1 className="mt-3 text-3xl font-semibold">Security Profile</h1><p className="mt-2 text-sm text-slate-400">Account identity and current administrative role from the authenticated session.</p></section>
    <section aria-label="Authenticated security profile" className="grid gap-4 rounded-2xl border border-white/10 bg-[#050A10] p-6 sm:grid-cols-2">
      <div><h2 className="text-xs uppercase tracking-wide text-slate-400">Name</h2><p className="mt-2">{currentUser?.name || 'Unavailable'}</p></div>
      <div><h2 className="text-xs uppercase tracking-wide text-slate-400">Email</h2><p className="mt-2">{currentUser?.email || 'Unavailable'}</p></div>
      <div><h2 className="text-xs uppercase tracking-wide text-slate-400">Role</h2><p className="mt-2">{currentUser?.roleCode || currentUser?.role || 'Unavailable'}</p></div>
      <div><h2 className="text-xs uppercase tracking-wide text-slate-400">Account status</h2><p className="mt-2">{currentUser?.status || 'Unavailable'}</p></div>
    </section>
  </div>;
}
