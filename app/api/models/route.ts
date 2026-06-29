import { NextRequest, NextResponse } from 'next/server';
import { getAllModels, getModelsByProvider } from '@/lib/providers';
import {
  discoverLocalModels,
  localModelInfoToAIModel,
  OLLAMA_DEFAULT_URL,
  LM_STUDIO_DEFAULT_URL,
} from '@/lib/providers/local';
import type { AIModel } from '@/lib/providers/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const includeLocal = searchParams.get('includeLocal') === 'true';

    // Base models from all registered providers
    const models = getAllModels();
    const byProvider = getModelsByProvider();

    if (!includeLocal) {
      return NextResponse.json({ models, byProvider });
    }

    // ── Dynamic local model discovery ─────────────────────────────────────
    const ollamaUrl = process.env.OLLAMA_URL ?? OLLAMA_DEFAULT_URL;
    const lmStudioUrl = process.env.LM_STUDIO_URL ?? LM_STUDIO_DEFAULT_URL;

    // discoverLocalModels never throws — returns empty lists on failure
    const localStatus = await discoverLocalModels(ollamaUrl, lmStudioUrl);

    const discoveredLocalModels: AIModel[] = [
      ...localStatus.ollama.models.map(localModelInfoToAIModel),
      ...localStatus.lmstudio.models.map(localModelInfoToAIModel),
    ];

    // Replace static local models with the dynamically discovered list when
    // at least one server is available; fall back to static otherwise.
    const allLocalModels =
      discoveredLocalModels.length > 0
        ? discoveredLocalModels
        : byProvider.local;

    const enrichedByProvider = {
      ...byProvider,
      local: allLocalModels,
    };

    // Rebuild the flat model list with the enriched local set
    const enrichedModels = [
      ...models.filter((m) => m.provider !== 'local'),
      ...allLocalModels,
    ];

    return NextResponse.json({
      models: enrichedModels,
      byProvider: enrichedByProvider,
      localStatus: {
        ollama: {
          available: localStatus.ollama.available,
          url: ollamaUrl,
          modelCount: localStatus.ollama.models.length,
        },
        lmstudio: {
          available: localStatus.lmstudio.available,
          url: lmStudioUrl,
          modelCount: localStatus.lmstudio.models.length,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
