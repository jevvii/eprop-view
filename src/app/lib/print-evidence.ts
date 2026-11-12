type EvidenceImage = Pick<HTMLImageElement, 'decode' | 'complete' | 'naturalWidth'>

/** A signed URL alone does not mean its photograph is ready for publication. */
export async function preparePrintEvidence(images: readonly EvidenceImage[]): Promise<void> {
  await Promise.all(images.map(async (image) => {
    await image.decode()
    if (!image.complete || image.naturalWidth === 0) {
      throw new Error('An evidence photograph could not be loaded.')
    }
  }))
}
