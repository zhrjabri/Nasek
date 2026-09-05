import { useRef } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { readImageFile, type ImageReadError } from '@/lib/imageFile'
import { LICENCE_MAX_BYTES, LICENCE_MIME } from '@/services/storage/licence'
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
 * It holds a `File` *and*, for an image, a downscaled data URL, and it needs
 * both.
 *
 *   * The data URL is the preview, and it is also the whole answer when no
 *     backend is configured — that fallback has nowhere but the store to put an
 *     image, so it gets the version that fits in a quota.
 *   * The `File` is the original, at full resolution, and it is what goes to
 *     Storage. Uploading the downscaled copy would mean deliberately degrading a
 *     document whose only job is to be legible enough to verify.
 *
 * ---------------------------------------------------------------------------
 * PDF
 *
 * An official Omani operating permit arrives as a PDF at least as often as a
 * photograph, and this used to reject one outright: `accept` listed three image
 * types and `readImageFile` threw on anything else. An owner with the correct
 * document and no way to submit it is the worst failure this form has, because
 * it looks like their document is wrong.
 *
 * A PDF takes a different path and it is deliberately a shorter one. There is
 * no canvas preview — rendering a PDF page in the browser needs a library this
 * project has no other use for — so it is shown as what it is: a named
 * document, with its size. Two consequences follow, and both are fine:
 *
 *   * `dataUrl` is empty for a PDF, so the no-backend fallback cannot store one.
 *     That fallback is a development convenience with no administrator to read
 *     the file anyway, and the form says a backend is needed.
 *   * The MIME type is carried on the selection and written to the provider
 *     row, so the administrator's review dialog can embed a PDF viewer instead
 *     of an `<img>` that would render as a broken icon.
 * ---------------------------------------------------------------------------
 */

export interface LicenceSelection {
  /** Downscaled preview. Empty for a PDF, which has no in-browser preview. */
  dataUrl: string
  fileName: string
  /** Bytes of what is being kept — the downscaled copy, or the PDF itself. */
  storedBytes: number
  /** The original, for Storage. Absent when a saved licence is being shown back. */
  file?: File
  /** What the document is. Decides how an administrator is shown it. */
  mime: string
}

const PDF_MIME = 'application/pdf'

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
  const { t, n } = useI18n()
  const input = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    onError('')

    /*
     * The type is checked here rather than left to the file dialog.
     *
     * `accept` is a hint the picker may honour and every platform lets you get
     * round — "all files" is one menu away on macOS, and Android's picker
     * ignores it for some sources entirely. The bucket would refuse the upload
     * anyway, but at that point the owner has filled in a whole registration
     * and gets a status code instead of a sentence.
     */
    if (file.type && !LICENCE_MIME.includes(file.type)) {
      onChange(null)
      onError(t('auth.licenceTypeError'))
      return
    }
    if (file.size > LICENCE_MAX_BYTES) {
      onChange(null)
      onError(t('auth.licenceSizeError'))
      return
    }

    if (file.type === PDF_MIME) {
      onChange({
        dataUrl: '',
        fileName: file.name,
        storedBytes: file.size,
        file,
        mime: PDF_MIME,
      })
      return
    }

    try {
      const preview = await readImageFile(file)
      onChange({ ...preview, file, mime: file.type || 'image/jpeg' })
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
            accept={LICENCE_MIME.join(',')}
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {value ? (
            <div className="flex items-center gap-3 rounded-[3px] border border-ivory-400 bg-ivory-50 p-3">
              {value.dataUrl ? (
                <img
                  src={value.dataUrl}
                  alt={t('auth.licencePreviewAlt')}
                  className="size-16 shrink-0 rounded-[2px] border border-ivory-300 object-cover"
                />
              ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-[2px] border border-ivory-300 bg-ivory-100 text-nasek-700">
                  <FileText className="size-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-800">{value.fileName}</p>
                <p className="nums mt-0.5 text-2xs text-ink-400">
                  {n(Math.max(1, Math.round(value.storedBytes / 1024)))} KB
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
