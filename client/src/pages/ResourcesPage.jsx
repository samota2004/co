import React, { useEffect, useState } from 'react';
import { requestApi } from '../services/api.js';

const panel = 'rounded-2xl border border-white/10 bg-[#050A10] p-5';

export function ResourcesPage({ resources = [], users = [], onCreated, fetchJson = requestApi }) {
  const departmentCodes = [...new Set(users.map(user => user.departmentCode || user.department).filter(Boolean))];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentCode, setDepartmentCode] = useState(departmentCodes[0] || 'ENGINEERING');
  const [protectedText, setProtectedText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (departmentCodes.length && !departmentCodes.includes(departmentCode)) setDepartmentCode(departmentCodes[0]);
  }, [departmentCodes.join('|')]);

  const createResource = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await fetchJson('/api/resources', { method: 'POST', body: { name, description, departmentCode, sensitivity: 'INTERNAL', requiredRoles: ['EMPLOYEE', 'MANAGER'], protectedData: protectedText ? { text: protectedText } : null } });
      setName(''); setDescription(''); setProtectedText(''); await onCreated?.();
    } catch (failure) { setError(failure.message || 'Unable to create resource.'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto w-full max-w-[1200px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
    <section className={panel}><h1 className="text-2xl font-semibold">Protected Resources</h1><p className="mt-2 text-sm text-slate-400">Register company resources for policy controlled access. Protected content is excluded from the resource catalog.</p></section>
    <form className={`${panel} space-y-4`} onSubmit={createResource}>
      <h2 className="text-lg font-semibold">Register a resource</h2>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <label className="block text-sm">Resource name<input aria-label="Resource name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" /></label>
      <label className="block text-sm">Description<textarea aria-label="Description" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" /></label>
      <label className="block text-sm">Department code<input aria-label="Department code" required maxLength={80} value={departmentCode} onChange={event => setDepartmentCode(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" /></label>
      <label className="block text-sm">Protected resource data<textarea aria-label="Protected resource data" value={protectedText} onChange={event => setProtectedText(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" /></label>
      <button type="submit" disabled={busy} className="rounded-lg border border-cyan-700 px-4 py-3 text-cyan-200 disabled:opacity-50">{busy ? 'Creating…' : 'Create resource'}</button>
    </form>
    <section aria-label="Resource catalog" className={`${panel} space-y-3`}><h2 className="text-lg font-semibold">Registered resources</h2>{resources.length ? resources.map(resource => <article key={resource.id} className="rounded-lg border border-white/10 p-4"><h3 className="font-medium">{resource.name}</h3><p className="mt-1 text-sm text-slate-400">{resource.description || 'No description'} · {resource.departmentCode || resource.department} · {resource.sensitivity}</p></article>) : <p className="text-sm text-slate-400">No resources are registered.</p>}</section>
  </div>;
}
