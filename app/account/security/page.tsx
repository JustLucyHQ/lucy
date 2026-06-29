'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';

interface DeviceRecord {
  id: number;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  last_active_at: string;
  is_current: boolean;
}

export default function Page() {
  const sb = getSupabaseClient();

  // ---------- Change password ----------
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwStatus(null);
    if (newPassword.length < 8) { setPwStatus({ ok: false, msg: 'Password must be at least 8 characters.' }); return; }
    if (newPassword !== confirmPassword) { setPwStatus({ ok: false, msg: 'Passwords do not match.' }); return; }
    setPwLoading(true);
    const { error } = await sb!.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) { setPwStatus({ ok: false, msg: error.message }); }
    else { setPwStatus({ ok: true, msg: 'Password updated successfully.' }); setNewPassword(''); setConfirmPassword(''); }
  };

  // ---------- TOTP ----------
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(true);
  const [totpStatus, setTotpStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.auth.mfa
      .listFactors()
      .then(({ data }) => {
        const verified = data?.totp?.find((f) => f.status === 'verified') ?? null;
        setTotpFactorId(verified?.id ?? null);
      })
      .finally(() => setTotpLoading(false));
  }, [sb]);

  const handleDisableTotp = async () => {
    if (!sb || !totpFactorId) return;
    setTotpStatus(null);
    const { error } = await sb.auth.mfa.unenroll({ factorId: totpFactorId });
    if (error) { setTotpStatus({ ok: false, msg: error.message }); }
    else { setTotpFactorId(null); setTotpStatus({ ok: true, msg: 'Authenticator app removed.' }); }
  };

  // ---------- Email 2FA ----------
  const [emailTwofa, setEmailTwofa] = useState(false);
  const [emailTwofaLoading, setEmailTwofaLoading] = useState(true);
  const [emailTwofaStatus, setEmailTwofaStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user?.id) { setEmailTwofaLoading(false); return; }
      const { data: prof } = await sb
        .from('user_profiles')
        .select('two_factor_email_enabled')
        .eq('user_id', u.user.id)
        .maybeSingle();
      setEmailTwofa(Boolean(prof?.two_factor_email_enabled));
      setEmailTwofaLoading(false);
    })();
  }, [sb]);

  // ---------- Devices & sessions ----------
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  const loadDevices = useCallback(() => {
    return fetch('/api/auth/devices')
      .then((res) => res.json().catch(() => ({ devices: [] })))
      .then((json) => setDevices(json.devices ?? []))
      .finally(() => setDevicesLoading(false));
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const handleRemoveDevice = async (id: number) => {
    setDevicesLoading(true);
    await fetch(`/api/auth/devices?id=${id}`, { method: 'DELETE' });
    await loadDevices();
  };

  const handleToggleEmailTwofa = async (val: boolean) => {
    if (!sb) return;
    setEmailTwofaStatus(null);
    const { data: u } = await sb.auth.getUser();
    if (!u.user?.id) return;
    const { error } = await sb
      .from('user_profiles')
      .upsert({ user_id: u.user.id, two_factor_email_enabled: val }, { onConflict: 'user_id' });
    if (error) { setEmailTwofaStatus({ ok: false, msg: error.message }); }
    else { setEmailTwofa(val); setEmailTwofaStatus({ ok: true, msg: val ? 'Email 2FA enabled.' : 'Email 2FA disabled.' }); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-t1 tracking-tight">Security</h2>
        <p className="text-sm text-t3 mt-0.5">Password, two-factor authentication, and active devices.</p>
      </div>

      {/* Change Password */}
      <div className="bg-surface border border-edge rounded-theme p-6 max-w-xl space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-t1">Change password</h3>
          <p className="text-xs text-t3 mt-0.5">At least 8 characters.</p>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
          {pwStatus && (
            <p className={`text-xs ${pwStatus.ok ? 'text-green-400' : 'text-red-400'}`}>{pwStatus.msg}</p>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="btn-primary bg-accent hover:bg-accent-soft disabled:opacity-50 text-white font-semibold rounded-theme px-5 py-2.5 text-sm transition-colors"
          >
            {pwLoading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>

      {/* Two-factor authentication — TOTP */}
      <div className="bg-surface border border-edge rounded-theme p-6 max-w-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-t1">Authenticator app</h3>
          <p className="text-xs text-t3 mt-0.5">Time-based one-time codes (TOTP) at sign-in.</p>
        </div>
        {totpLoading ? (
          <p className="text-xs text-t3">Loading…</p>
        ) : totpFactorId ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Enabled
            </span>
            <button
              onClick={handleDisableTotp}
              className="text-xs font-medium text-red-400 hover:text-red-300 border border-red-900/60 hover:border-red-700 rounded-theme px-3 py-1.5 transition-colors"
            >
              Disable
            </button>
          </div>
        ) : (
          <Link
            href="/auth/two-factor-setup"
            className="btn-primary inline-block text-sm font-semibold bg-accent hover:bg-accent-soft text-white rounded-theme px-4 py-2 transition-colors"
          >
            Enable authenticator app
          </Link>
        )}
        {totpStatus && (
          <p className={`text-xs ${totpStatus.ok ? 'text-green-400' : 'text-red-400'}`}>{totpStatus.msg}</p>
        )}
      </div>

      {/* Two-factor authentication — Email OTP */}
      <div className="bg-surface border border-edge rounded-theme p-6 max-w-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-t1">Email verification code</h3>
          <p className="text-xs text-t3 mt-0.5">Require a code sent to your email when signing in.</p>
        </div>
        {emailTwofaLoading ? (
          <p className="text-xs text-t3">Loading…</p>
        ) : (
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <div
              onClick={() => handleToggleEmailTwofa(!emailTwofa)}
              className={`relative w-10 h-[22px] rounded-full transition-colors ${emailTwofa ? 'bg-accent' : 'bg-edge-strong'}`}
            >
              <div
                className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${emailTwofa ? 'translate-x-[21px]' : 'translate-x-[3px]'}`}
              />
            </div>
            <span className="text-sm font-medium text-t2">{emailTwofa ? 'Enabled' : 'Disabled'}</span>
          </label>
        )}
        {emailTwofaStatus && (
          <p className={`text-xs ${emailTwofaStatus.ok ? 'text-green-400' : 'text-red-400'}`}>{emailTwofaStatus.msg}</p>
        )}
      </div>

      {/* Devices & sessions */}
      <div className="bg-surface border border-edge rounded-theme p-6 max-w-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-t1">Devices &amp; sessions</h3>
          <p className="text-xs text-t3 mt-0.5">Where your account has signed in.</p>
        </div>
        {devicesLoading ? (
          <p className="text-xs text-t3">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-xs text-t3">No devices recorded yet.</p>
        ) : (
          <ul>
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3 border-b border-edge last:border-0 last:pb-0 first:pt-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-t1 truncate">{d.device_name ?? 'Unknown device'}</span>
                    {d.is_current && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent-soft border border-accent/30 rounded-full px-2 py-0.5">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-t3">
                    {d.browser && <span>{d.browser}</span>}
                    {d.os && <span>· {d.os}</span>}
                    {d.ip_address && <span>· {d.ip_address}</span>}
                    <span>· {new Date(d.last_active_at).toLocaleString()}</span>
                  </div>
                </div>
                {!d.is_current && (
                  <button
                    onClick={() => handleRemoveDevice(d.id)}
                    className="shrink-0 text-xs font-medium text-red-400 hover:text-red-300 border border-red-900/60 hover:border-red-700 rounded-theme px-3 py-1.5 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
