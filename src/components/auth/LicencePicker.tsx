import { useRef } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { readImageFile, type ImageReadError } from '@/lib/imageFile'
import { Field } from '@/components/ui'

/**
 * Choosing the trade permit.
 *
 * Shared by first registration and by resubmission after a refusal, which is
 * the reason it exists as a component at all: those are the two screens where
 * an owner hands NASEK the document the entire "Verified" badge rests on, and
 * two copies of this would drift — one would get the preview fix, the other the
 * error-message fix, and only one of them would keep the original file.
 *
 * It holds a `File` *and* a downscaled data URL, and it needs both.
 *
 *   * The data URL is the preview, and it is also the whole answer when no
 *     backend is configured — that fallback has nowhere but the store to put an
 *     image, so it gets the version that fits in a quota.
 *   * The `File` is the original, at full resolution, and it is what goes to
 *     Storage. Uploading the downscaled copy would mean deliberately degrading a
 *     document whose only job is to be legible enough to verify.
 *
 * The upload itself is *not* done here. It cannot be: the object path begins
 * with the uploader's account id, so there has to be a session first, and
 * during registration there is not one until the address has been proved. The
 * page uploads at submit time; this component only chooses.
 */

export interface LicenceSelection {
  /** Downscaled preview. Also what the no-backend fallback stores. */
  dataUrl: string
  fileName: string
  /** Bytes of the downscaled copy, which is what the preview line reports. */
  storedBytes: number
  /** The original, for Storage. Absent when a saved licence is being shown back. */
  file?: File
}

export function LicencePicker({
  value,
  onChange,
  error,
  onError,
  label,
  hint,
}: {
  value: LicenceSelection | null
  onChange: (selection: LicenceSelection | null) => void
  error?: string
  onError: (message: string) => void
  label?: string
  hint?: string
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    onError('')
    try {
      const preview = await readImageFile(file)
      onChange({ ...preview, file })
    } catch (reason) {
      const messages: Record<ImageReadError, string> = {
        type: t('auth.licenceTypeError'),
        size: t('auth.licenceSizeError'),
        decode: t('auth.licenceDecodeError'),
      }
      onChange(null)
      onError(messages[reason as ImageReadError] ?? t('auth.licenceDecodeError'))
    }
  }

  const clear = () => {
    onChange(null)
    // Without this, choosing the same file again fires no `change` event at all
    // — the input still holds it — and the picker appears to do nothing.
    if (input.current) input.current.value = ''
  }

  return (
    <Field
      label={label ?? t('auth.licenceLabel')}
      hint={hint ?? t('auth.licenceHint')}
      required
      error={error}
    >
      {(p) => (
        <div>
          <input
            {...p}
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {value ? (
            <div className="flex items-center gap-3 rounded-[3px] border border-ivory-400 bg-ivory-50 p-3">
              <img
                src={value.dataUrl}
                alt={t('auth.licencePreviewAlt')}
                className="size-16 shrink-0 rounded-[2px] border border-ivory-300 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-800">{value.fileName}</p>
                <p className="nums mt-0.5 text-2xs text-ink-400">
                  {Math.max(1, Math.round(value.storedBytes / 1024))} KB
                </p>
              </div>
              <button
                type="button"
                onClick={clear}
                className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold text-ink-500 transition-colors hover:bg-ivory-200 hover:text-red-700"
              >
                <Trash2 className="size-3.5" />
                {t('auth.licenceRemove')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full items-center justify-center gap-2.5 rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-6 text-sm font-semibold text-ink-500 transition-colors hover:border-nasek-700 hover:text-nasek-800"
            >
              <Upload className="size-4" />
              {t('auth.licenceUpload')}
            </button>
          )}
        </div>
      )}
    </Field>
  )
}
