/**
 * Embedding adapter interface ,  kept separate from text-generation provider
 * selection. MVP uses a keyword/lexical hybrid (no external embedding calls),
 * which keeps local startup dependency-free. A real multilingual embedding
 * model can implement this interface later; changing the text LLM never
 * requires re-uploading books. If the embedding model changes, bump
 * EMBEDDING_VERSION and run a controlled re-embedding migration.
 */

export const EMBEDDING_MODEL = 'keyword-v1';
export const EMBEDDING_VERSION = 1;
export const EMBEDDING_DIMENSION = 0; // 0 = lexical mode, no vectors

export interface EmbeddingResult {
  model: string;
  version: number;
  dimension: number;
  vector: number[];
}

export async function embedText(_text: string): Promise<EmbeddingResult> {
  // Lexical mode: no vectors. Retrieval uses multilingual keyword + variants.
  return { model: EMBEDDING_MODEL, version: EMBEDDING_VERSION, dimension: 0, vector: [] };
}

export function embeddingCompatible(chunkModel: string, chunkVersion: number): boolean {
  return chunkModel === EMBEDDING_MODEL && chunkVersion === EMBEDDING_VERSION;
}
