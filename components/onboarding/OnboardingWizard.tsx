'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Key,
  Server,
  Cloud,
  MessageSquare,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { useChatStore } from '@/lib/store/chat';
import { useStorage, useStorageMode } from '@/lib/storage/provider';
import { markOnboarded } from '@/lib/onboarding';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LucyMark } from '@/components/brand/LucyMark';

const CLOUD_URL = 'https://justlucy.ai';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1 as Step, label: 'Welcome', icon: Sparkles },
  { id: 2 as Step, label: 'Power Lucy', icon: Key },
  { id: 3 as Step, label: 'Test Chat', icon: MessageSquare },
  { id: 4 as Step, label: 'Finish', icon: CheckCircle },
];

interface StepOneProps {
  standalone: boolean;
  companyName: string;
  onCompanyNameChange: (v: string) => void;
}

function StepOne({ standalone, companyName, onCompanyNameChange }: StepOneProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4">
          <LucyMark className="w-16 h-16" />
        </div>
        <h2 className="text-2xl font-bold text-white">Welcome to Lucy</h2>
        <p className="text-gray-400 mt-2">
          {standalone
            ? 'Your private AI, running on your machine. Your chats and keys stay local. Let’s get you set up in a couple of steps.'
            : 'Lucy is your AI-powered onboarding and productivity platform. Let’s get you set up in just a few steps.'}
        </p>
      </div>
      <div className="max-w-sm mx-auto">
        <Input
          label={standalone ? 'Your name or workspace (optional)' : 'Company Name'}
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          placeholder={standalone ? 'e.g. Alex, or Acme Corp' : 'Acme Corp'}
          hint={standalone ? 'Shown in your workspace. You can skip this.' : 'This will be displayed in your workspace'}
        />
      </div>
      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-8">
        {[
          { label: 'Cloud or Local', desc: 'Bring a key or run Ollama' },
          { label: 'Streaming', desc: 'Real-time responses' },
          { label: standalone ? 'Private' : 'History', desc: standalone ? 'Stored on your device' : 'Persistent conversations' },
        ].map((feature) => (
          <div
            key={feature.label}
            className="text-center p-3 rounded-lg bg-gray-800 border border-gray-700"
          >
            <CheckCircle className="w-5 h-5 text-lucy-400 mx-auto mb-1" />
            <p className="text-xs font-medium text-gray-200">{feature.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ApiKeyFieldProps {
  label: string;
  provider: 'openai' | 'anthropic' | 'google';
  placeholder: string;
  description: string;
  docsUrl: string;
}

function ApiKeyField({ label, provider, placeholder, description, docsUrl }: ApiKeyFieldProps) {
  const { apiKeys, setApiKey } = useSettingsStore();
  const adapter = useStorage();
  const [showKey, setShowKey] = useState(false);
  const [localValue, setLocalValue] = useState<string | null>(null);
  const value = localValue ?? apiKeys[provider];

  const handleBlur = async () => {
    if (localValue !== null) {
      await setApiKey(provider, localValue, adapter);
      setLocalValue(null);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-gray-800 border border-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-lucy-400 hover:text-lucy-300"
        >
          Get API key
        </a>
      </div>
      <p className="text-xs text-gray-400">{description}</p>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="
            w-full bg-gray-900 border border-gray-700 rounded-lg
            px-3 py-2 pr-9 text-sm text-gray-100 placeholder-gray-600
            focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500
          "
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {value && (
        <div className="flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>API key configured</span>
        </div>
      )}
    </div>
  );
}

interface LocalModel {
  id: string;
  name: string;
  provider: string;
}

interface LocalStatus {
  ollama: { available: boolean; url: string; modelCount: number };
  lmstudio: { available: boolean; url: string; modelCount: number };
}

/** Detects locally-running Ollama / LM Studio models and lets the user pick one. */
function LocalModelPanel() {
  const adapter = useStorage();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const fetchLocal = async (): Promise<void> => {
    try {
      const res = await fetch('/api/models?includeLocal=true');
      const data = await res.json();
      const local: LocalModel[] = (data.models ?? []).filter((m: LocalModel) => m.provider === 'local');
      setModels(local);
      setStatus(data.localStatus ?? null);
    } catch {
      setModels([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // Manual "Recheck" — flips the spinner on before re-probing.
  const probe = () => {
    setLoading(true);
    void fetchLocal();
  };

  // Initial probe: the first setState happens after the awaited fetch (not
  // synchronously in the effect body), and `loading` already defaults to true.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchLocal();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (m: LocalModel) => {
    setChosen(m.id);
    useChatStore.getState().setSelectedModel(m.id);
    useChatStore.getState().setSelectedProvider('local');
    await useSettingsStore.getState().setDefaultModel(m.id, adapter);
    await useSettingsStore.getState().setDefaultProvider('local', adapter);
    markOnboarded();
  };

  const anyAvailable = status?.ollama.available || status?.lmstudio.available;

  return (
    <div className="p-4 rounded-lg bg-gray-800 border border-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-lucy-400" />
          <h3 className="text-sm font-semibold text-white">Local model</h3>
        </div>
        <button
          type="button"
          onClick={probe}
          className="flex items-center gap-1 text-xs text-lucy-400 hover:text-lucy-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Detecting…' : 'Recheck'}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Run models on your own machine with no API key. Lucy looks for Ollama (port 11434) and LM Studio (port 1234).
      </p>

      {loading ? (
        <p className="text-xs text-gray-500">Looking for local servers…</p>
      ) : anyAvailable && models.length > 0 ? (
        <div className="space-y-1.5">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m)}
              className={`
                w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm
                ${chosen === m.id
                  ? 'border-lucy-500 bg-lucy-900/30 text-white'
                  : 'border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-600'}
              `}
            >
              <span className="truncate">{m.name || m.id}</span>
              {chosen === m.id ? (
                <CheckCircle className="w-4 h-4 text-lucy-400 shrink-0" />
              ) : (
                <span className="text-xs text-gray-500 shrink-0">Use</span>
              )}
            </button>
          ))}
          {chosen && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 pt-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Lucy will use this model.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-gray-900 border border-gray-700 p-3 space-y-2">
          <p className="text-xs text-gray-300">
            No local model server detected. Install Ollama, pull a model
            (e.g. <code className="text-lucy-300">ollama run llama3.2</code>), then click Recheck.
          </p>
          <a
            href="https://ollama.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-lucy-400 hover:text-lucy-300"
          >
            Get Ollama <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function StepTwo() {
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud');
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Power Lucy</h2>
        <p className="text-gray-400 mt-2">
          Choose how Lucy thinks: bring a cloud API key, or run a model locally. You can change this anytime in Settings.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex rounded-lg bg-gray-800 border border-gray-700 p-1">
          <button
            type="button"
            onClick={() => setTab('cloud')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'cloud' ? 'bg-lucy-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cloud className="w-4 h-4" /> Cloud provider
          </button>
          <button
            type="button"
            onClick={() => setTab('local')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'local' ? 'bg-lucy-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="w-4 h-4" /> Local model
          </button>
        </div>
      </div>

      {tab === 'cloud' ? (
        <div className="space-y-4">
          <ApiKeyField
            label="Anthropic"
            provider="anthropic"
            placeholder="sk-ant-..."
            description="Access Claude Opus 4.8, Sonnet 4.6, and Haiku 4.5 models."
            docsUrl="https://console.anthropic.com/settings/keys"
          />
          <ApiKeyField
            label="OpenAI"
            provider="openai"
            placeholder="sk-..."
            description="Access GPT-4o, GPT-4o Mini, and GPT-3.5 Turbo models."
            docsUrl="https://platform.openai.com/api-keys"
          />
          <ApiKeyField
            label="Google AI"
            provider="google"
            placeholder="AIza..."
            description="Access Gemini 2.0 Flash and Gemini 1.5 Pro models."
            docsUrl="https://aistudio.google.com/app/apikey"
          />
          <p className="text-xs text-gray-500 text-center">
            API keys are stored locally on your device. Never shared with our servers.
          </p>
        </div>
      ) : (
        <LocalModelPanel />
      )}
    </div>
  );
}

function StepThree({ onGoToChat }: { onGoToChat: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lucy-500 to-lucy-700 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">Test Your Setup</h2>
        <p className="text-gray-400 mt-2">
          Everything looks good! Let&apos;s make sure Lucy is responding.
        </p>
      </div>
      <div className="max-w-sm mx-auto space-y-3">
        <div className="p-4 rounded-lg bg-gray-800 border border-gray-700 text-left">
          <p className="text-sm text-gray-300">
            Click &ldquo;Go to Chat&rdquo; to open the chat interface and send your first message.
            Responses stream in as Lucy thinks.
          </p>
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={onGoToChat}>
          Go to Chat
        </Button>
      </div>
    </div>
  );
}

function StepFour({ standalone, onComplete }: { standalone: boolean; onComplete: () => void }) {
  const [emails, setEmails] = useState('');

  if (standalone) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lucy-500 to-lucy-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">You&apos;re all set</h2>
          <p className="text-gray-400 mt-2">
            Lucy runs entirely on this device. Want your chats and settings to sync across machines?
          </p>
        </div>
        <div className="max-w-sm mx-auto space-y-4">
          <div className="p-4 rounded-lg bg-gray-800 border border-gray-700 space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-lucy-400" />
              <h3 className="text-sm font-semibold text-white">Connect to Cloud</h3>
            </div>
            <p className="text-xs text-gray-400">
              Create a free account at justlucy.ai to sync across devices and use the web app. Optional &mdash; your local setup keeps working either way.
            </p>
            <a
              href={CLOUD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-lucy-400 hover:text-lucy-300"
            >
              Open justlucy.ai <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={onComplete}>
            Start using Lucy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Invite Your Team</h2>
        <p className="text-gray-400 mt-2">
          Share Lucy with your colleagues. (Team features coming soon)
        </p>
      </div>
      <div className="max-w-sm mx-auto space-y-4">
        <Input
          label="Email addresses"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="alice@company.com, bob@company.com"
          hint="Separate multiple emails with commas"
        />
        <div className="p-3 rounded-lg bg-lucy-900/30 border border-lucy-800 text-xs text-lucy-300">
          Team invitations and multi-user support are on our roadmap. Stay tuned!
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={onComplete}>
          Finish Setup
        </Button>
        <button
          onClick={onComplete}
          className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const adapter = useStorage();
  const standalone = useStorageMode() === 'local';
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState('');

  // Pre-fill from saved preferences so onboarding doesn't re-ask what's already set.
  useEffect(() => {
    let cancelled = false;
    adapter
      .getPreferences()
      .then((prefs) => {
        if (!cancelled && prefs.companyName) setCompanyName(prefs.companyName);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // Company name is required only in connected (B2B) mode; optional standalone.
  const canProceed = step === 1 && !standalone ? companyName.trim().length > 0 : true;

  const handleNext = () => {
    if (step < 4) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  // Persist the company name (if any) and mark setup complete before leaving.
  const goToChat = async () => {
    markOnboarded();
    const name = companyName.trim();
    if (name) {
      try {
        await adapter.updatePreferences({ companyName: name });
      } catch {
        /* non-fatal — still proceed to chat */
      }
    }
    router.push('/chat');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Progress bar */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map(({ id, label }) => (
              <div
                key={id}
                className={`flex items-center gap-2 text-sm ${
                  id === step
                    ? 'text-white font-medium'
                    : id < step
                    ? 'text-lucy-400'
                    : 'text-gray-600'
                }`}
              >
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                    ${
                      id < step
                        ? 'bg-lucy-500 text-white'
                        : id === step
                        ? 'bg-gray-700 text-white ring-2 ring-lucy-500'
                        : 'bg-gray-800 text-gray-600'
                    }
                  `}
                >
                  {id < step ? <CheckCircle className="w-4 h-4" /> : id}
                </div>
                <span className="hidden sm:block">{label}</span>
              </div>
            ))}
          </div>
          <div className="h-1 bg-gray-800 rounded-full">
            <div
              className="h-1 bg-gradient-to-r from-lucy-600 to-lucy-400 rounded-full transition-all duration-500"
              style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-12 px-6">
        <div className="w-full max-w-2xl">
          {step === 1 && (
            <StepOne
              standalone={standalone}
              companyName={companyName}
              onCompanyNameChange={setCompanyName}
            />
          )}
          {step === 2 && <StepTwo />}
          {step === 3 && <StepThree onGoToChat={goToChat} />}
          {step === 4 && <StepFour standalone={standalone} onComplete={goToChat} />}
        </div>
      </div>

      {/* Navigation */}
      {step !== 3 && (
        <div className="border-t border-gray-800 bg-gray-900 px-6 py-4">
          <div className="max-w-2xl mx-auto flex justify-between">
            <Button
              variant="ghost"
              icon={<ChevronLeft className="w-4 h-4" />}
              onClick={handleBack}
              disabled={step === 1}
            >
              Back
            </Button>
            {step < 4 && (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={!canProceed}
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
