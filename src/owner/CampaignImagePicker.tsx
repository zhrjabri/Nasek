import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { readImageFile } from '@/lib/imageFile'
import {
  CAMPAIGN_IMAGE_LIMIT,
  CAMPAIGN_IMAGE_MIME,
  campaignImageUrl,
  removeCampaignImage,
  uploadCampaignImage,
} from '@/services/storage/campaignImages'
import { Field, Spinner, cx } from '@/components/ui'

/**
 * The photographs on a campaign.
 *
 * Uploads happen here rather than at save time, and that is the opposite of how
 * `LicencePicker` works — worth being explicit about, because the difference is
 * not an inconsistency.
 *
 * A permit is chosen during registration, when there is no session yet, so the
 * file has to be held until one exists. A campaign is only ever edited by an
 * owner who is already signed in, so there is a session from the first click —
 * and uploading immediately is much the better experience: the owner sees the
 * photograph appear or sees why it did not, one at a time, instead of filling
 * in a long form and discovering at the end that the third image was 9 MB.
 *
 * What the parent holds is therefore a list of object paths, which is exactly
 * what goes on the campaign row. No `File` ever reaches it.
 *
 * With no backend configured there is nowhere to upload to, so the same
 * downscaling used for permits produces a data URL and the list holds that
 * instead. `campaignImageUrl` returns a data URL untouched, so nothing
 * downstream has to know which kind it is looking at.
 */
export function CampaignImagePicker({
  value,
  onChange,
}: {
  /** Object paths, in display order. The first is the cover. */
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { t, n } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const full = value.length >= CAMPAIGN_IMAGE_LIMIT

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')

    /*
     * Trimmed to the remaining room rather than refused outright.
     *
     * Someone selecting ten photographs when two slots are left meant to add
     * photographs. Taking the first two and saying so is what they wanted;
     * rejecting all ten is a lecture.
     */
    const room = CAMPAIGN_IMAGE_LIMIT - value.length
    const chosen = [...files].slice(0, room)
    if (files.length > room) setError(t('prov.imageTooMany'))

    setBusy(true)
    const added: string[] = []

    for (const file of chosen) {
      if (file.type && !CAMPAIGN_IMAGE_MIME.includes(file.type)) {
        setError(t('prov.imageTypeError'))
        continue
      }

      if (!isSupabaseConfigured) {
        // No bucket to put it in. The downscaled data URL is what the offline
        // prototype has always stored for a permit, and it works here for the
        // same reason and with the same caveat: it is a demo, not a deployment.
        try {
          const preview = await readImageFile(file)
          added.push(preview.dataUrl)
        } catch {
          setError(t('prov.imageFailed'))
        }
        continue
      }

      const upload = await uploadCampaignImage(file)
      if (upload.ok) {
        added.push(upload.path)
      } else {
        setError(
          upload.error === 'size'
            ? t('prov.imageSizeError')
            : upload.error === 'type'
              ? t('prov.imageTypeError')
              : t('prov.imageFailed'),
        )
      }
    }

    setBusy(false)
    if (added.length) onChange([...value, ...added])
    // Or choosing the same file twice in a row fires no `change` event.
    if (input.current) input.current.value = ''
  }

  const remove = (path: string) => {
    onChange(value.filter((p) => p !== path))
    /*
     * Fired and not awaited, deliberately.
     *
     * The campaign row is the record of which photographs a campaign has; an
     * object left behind in the bucket is wasted bytes. Blocking the edit on a
     * delete that failed would be wrong in the expensive direction.
     */
    void removeCampaignImage(path)
  }

  return (
    <Field
      label={t('prov.formImages')}
      hint={t('prov.formImagesHint', { n: n(CAMPAIGN_IMAGE_LIMIT) })}
      error={error}
    >
      {(p) => (
        <div>
          <input
            {...p}
            ref={input}
            type="file"
            multiple
            accept={CAMPAIGN_IMAGE_MIME.join(',')}
            className="sr-only"
            onChange={(e) => void add(e.target.files)}
          />

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {value.map((path, index) => (
              <li key={path} className="group relative">
                <img
                  src={campaignImageUrl(path)}
                  alt=""
                  className="aspect-[4/3] w-full rounded-[3px] border border-ivory-300 object-cover"
                />
                {/* The first photograph is the card image everywhere else, so
                    say which one that is rather than leaving the owner to
                    discover it after publishing. */}
                {index === 0 && (
                  <span className="absolute start-1.5 top-1.5 rounded-[2px] bg-nasek-900/85 px-1.5 py-0.5 text-2xs font-bold text-ivory-50">
                    {t('prov.imageCover')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(path)}
                  aria-label={t('prov.imageRemove')}
                  className="absolute end-1.5 top-1.5 rounded-[2px] bg-ivory-50/90 p-1.5 text-ink-500 transition-colors hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}

            {!full && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                  className={cx(
                    'flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 text-xs font-semibold text-ink-500 transition-colors',
                    busy ? 'opacity-60' : 'hover:border-nasek-700 hover:text-nasek-800',
                  )}
                >
                  {busy ? (
                    <>
                      <Spinner className="size-4" />
                      {t('prov.imageUploading')}
                    </>
                  ) : (
                    <>
                      <ImagePlus className="size-5" />
                      {t('prov.imageAdd')}
                    </>
                  )}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </Field>
  )
}
