# Staging AI review and hosted verification

On November 18, 2026, the staging build at commit `d5a036e81b` completed a signed-in walkthrough against the designated Supabase Preview project after migration 025. [Open the tested deployment](https://eprop-view-fwy18kf68-jevviis-projects.vercel.app).

| Review finding | Change and verification |
| --- | --- |
| The local worker could run its heuristic under an unsupported model name, skip the perimeter, and miss a narrow dark line between samples. | Only heuristic detection entries can run locally. Synthetic image tests cover an edge tile, a uniform wall, low-contrast variation, invalid bytes and invalid model settings. The hosted upload produced a crack-like finding in the expected tile. |
| Separate database writes could leave a job and its findings in different states. A stranded running job could disable retries. | A database transaction now commits the result, inspection risk and completed job together. SQL tests exercised an empty Gemini result, a superseded job and an older run attempting to overwrite newer findings. |
| Rejecting a finding changed its notes while leaving it in the risk calculation. Repeated verification could create duplicate maintenance tickets. | In the hosted walkthrough, adjusting and verifying a finding created one maintenance priority. Rejecting it reduced inspection risk to zero. After a rerun and reload the rejection persisted. SQL tests also repeated verification and counted the ticket. |
| Regenerating annotation candidates could discard human edits, and a first visit could write data while rendering the page. | The editor requests suggestions after opening. Replacement is transactional and preserves edited drafts. SQL tests checked failed replacement and notes-only edits. The hosted editor generated drafts and a second request added zero duplicates. |

## Verification

- The hosted admin session completed sign-in, synthetic image upload, stored-image heuristic analysis, engineering review, saved-photo Gemini analysis and annotation refresh.
- The temporary walkthrough project and its uploaded image were removed after testing.
- The hosted System Health diagnostic passed its blank-image control, repair-cost estimate, maintenance recommendation and report narrative checks. All four returned a validated response from `gemini-3.5-flash-lite`.
- All 245 automated tests passed. TypeScript and the Next.js build passed. ESLint reported 58 warnings and zero errors. Chromium canvas checks passed with desktop pointer and tablet touch input.

## Capstone interpretation

The local method proposes screen regions for crack-like, corrosion-like and spalling-like appearances. The hosted model can also suggest deformation and leakage. Reported confidence, severity and indicative costs require human review. The walkthrough measured workflow behavior with synthetic inputs. Field-image accuracy, missed-defect rates and engineering calibration still need independently labeled inspections.
