import type { GenerationInput, DiaryOutput } from "../../contracts/src/diary";
/** Production adapter is intentionally not active before provider configuration and G3 evaluation. */
export interface DiaryGenerator {
  generate(input: GenerationInput): Promise<DiaryOutput>;
}
