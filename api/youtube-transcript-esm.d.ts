declare module "youtube-transcript/dist/youtube-transcript.esm.js" {
  export function fetchTranscript(
    videoIdOrUrl: string
  ): Promise<Array<{ text?: string; duration?: number; offset?: number }>>;
}
