'use client';

import { useActionState, useRef, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import {
  uploadDocumentAction,
  type UploadDocumentFields,
  type UploadDocumentState,
} from '@/lib/documents/actions';
import { DOC_TYPES } from '@/lib/types/db';

const INITIAL: UploadDocumentState = { ok: false };

interface Props {
  caseId: string;
}

export function DocumentUploadForm({ caseId }: Props) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<UploadDocumentState, FormData>(
    uploadDocumentAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Сброс полей после успешной загрузки — иначе File-input залипает с прошлым выбором.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  useShakeInvalidFields(formRef, state);

  function err(field: UploadDocumentFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[2fr_1fr]">
        <Field
          label={t.documents.upload.fileLabel}
          htmlFor="doc-file"
          error={err('file')}
          required
        >
          <Input
            id="doc-file"
            name="file"
            type="file"
            required
            aria-invalid={err('file') ? 'true' : undefined}
            className="file:mr-3 file:rounded-md file:border-0 file:bg-primary-subtle file:text-primary file:px-2.5 file:py-1 file:text-[12px] file:font-medium hover:file:bg-primary-subtle/80"
          />
        </Field>

        <Field
          label={t.documents.upload.docTypeLabel}
          htmlFor="doc-type"
          error={err('doc_type')}
          required
        >
          <Select
            id="doc-type"
            name="doc_type"
            defaultValue="other"
            required
            aria-invalid={err('doc_type') ? 'true' : undefined}
          >
            {DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {t.enums.docType[dt]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      {state.ok && (
        <p
          role="status"
          className="text-sm text-success bg-success-bg border border-success/15 rounded-md px-3 py-2"
        >
          {t.documents.upload.success}
        </p>
      )}

      <p className="text-[11px] text-text-subtle">
        {t.documents.upload.sizeHint}
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? t.documents.upload.submitting : t.documents.upload.submit}
    </Button>
  );
}
