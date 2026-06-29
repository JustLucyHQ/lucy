'use client';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Check } from 'lucide-react';

export default function Page() {
  const sb = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await sb
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? '');
        setAvatarUrl(data.avatar_url ?? '');
        setCompany(data.company ?? '');
      }
    })();
  }, [sb]);

  const save = async () => {
    if (!sb) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error: err } = await sb
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          company: company.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    setSaving(false);
    if (err) {
      setError('Failed to save profile.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const initial = (displayName || email || 'L')[0].toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-t1 tracking-tight">Profile</h2>
        <p className="text-sm text-t3 mt-0.5">How you appear across Lucy.</p>
      </div>

      <div className="bg-surface border border-edge rounded-theme p-6 max-w-xl space-y-6">
        {/* Identity header */}
        <div className="flex items-center gap-4 pb-5 border-b border-edge">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, next/image needs domain allowlisting
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-14 h-14 rounded-full object-cover border border-edge shadow-glow-sm"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-lucy-400 to-lucy-700 shadow-glow-sm flex items-center justify-center text-white text-xl font-bold">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-t1 truncate">{displayName || 'Unnamed'}</p>
            <p className="text-xs text-t3 truncate">{email}</p>
          </div>
        </div>

        <div className="space-y-5">
          <Input label="Email" value={email} readOnly hint="Managed by your login provider." />
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Input
            label="Avatar URL"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            hint="Direct link to an image."
          />
          <Input
            label="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Inc. (optional)"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 bg-accent hover:bg-accent-soft disabled:opacity-50 text-white font-semibold rounded-theme px-5 py-2.5 text-sm transition-colors"
          >
            {saved && <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
