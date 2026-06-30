'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  changeUserEmailAction,
  deleteUserAction,
  getUserCredentialsAction,
  reissueUserPasswordAction,
  sendUserInviteAction,
  setUserPasswordAction,
  type DeleteBlockers,
  type UserCredentials,
} from '@/lib/users/credentials-actions';

// Триггер (строка сотрудника) + модалка управления доступом. Только для
// владельца (рендерится из page.tsx под actorIsOwner && !isSelf). Логин, пароль
// (зеркало последнего выданного), смена логина, приглашение и удаление.
export function UserCredentialsButton({
  userId,
  fullName,
  email,
}: {
  userId: string;
  fullName: string;
  email: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2.5 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-sunken transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        title={t.users.credentials.open}
      >
        <Avatar name={fullName} size="sm" />
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text group-hover:text-primary transition-colors">
            {fullName}
            <KeyRound
              size={12}
              strokeWidth={1.75}
              className="text-text-subtle group-hover:text-primary transition-colors"
            />
          </span>
          <span className="text-[12px] text-text-muted">{email}</span>
        </span>
      </button>

      {open && (
        <CredentialsModal
          userId={userId}
          fullName={fullName}
          initialEmail={email}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CredentialsModal({
  userId,
  fullName,
  initialEmail,
  onClose,
}: {
  userId: string;
  fullName: string;
  initialEmail: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [creds, setCreds] = useState<UserCredentials | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState(initialEmail);

  // Загрузка логина + зеркала пароля при открытии.
  const [loading, startLoad] = useTransition();
  const load = useCallback(() => {
    startLoad(async () => {
      const res = await getUserCredentialsAction(userId);
      if (res.ok) {
        setCreds(res.data);
        setEmail(res.data.email);
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
    });
  }, [userId]);

  // Первичная загрузка при открытии модалки.
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal
      open
      onClose={onClose}
      title={t.users.credentials.title}
      subtitle={fullName}
      closeLabel={t.common.close}
    >
      {loadError ? (
        <p className="text-[13px] text-error" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {creds?.password && (
            <CredentialsCard email={email} password={creds.password} />
          )}
          <LoginSection
            userId={userId}
            email={email}
            onChanged={(next) => {
              setEmail(next);
              router.refresh();
            }}
          />
          <PasswordSection
            userId={userId}
            password={creds?.password ?? null}
            updatedAt={creds?.passwordUpdatedAt ?? null}
            loading={loading && !creds}
            onIssued={(pw) =>
              setCreds((c) =>
                c
                  ? { ...c, password: pw, passwordUpdatedAt: new Date().toISOString() }
                  : { email, fullName, password: pw, passwordUpdatedAt: null },
              )
            }
          />
          <InviteSection userId={userId} email={email} />
          <DangerSection userId={userId} onDeleted={onClose} />
        </div>
      )}
    </Modal>
  );
}

// ── Готовый блок доступов (логин + пароль + ссылка) с копированием ───────────
// Владелец нажимает «Скопировать всё» и отправляет сотруднику одним сообщением.
function CredentialsCard({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const c = t.users.credentials.card;
  const loginUrl =
    (typeof window !== 'undefined' ? window.location.origin : '') + '/login';
  const block = `${c.title}\n${c.loginLabel} ${email}\n${c.passwordLabel} ${password}\n${c.loginUrlLabel} ${loginUrl}`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      toast.success(c.copiedToast);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.users.credentials.copyFailed);
    }
  }

  return (
    <div className="rounded-control border border-primary/20 bg-primary/[0.04] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-primary">
          <KeyRound size={14} strokeWidth={1.75} />
          {c.title}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={copyAll}>
          {copied ? (
            <Check size={14} strokeWidth={2} className="text-success" />
          ) : (
            <Copy size={14} strokeWidth={1.75} />
          )}
          {copied ? t.common.copied : c.copyAll}
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-text-muted">{c.loginLabel}</dt>
        <dd className="truncate font-mono text-text">{email}</dd>
        <dt className="text-text-muted">{c.passwordLabel}</dt>
        <dd className="truncate font-mono text-text">{password}</dd>
        <dt className="text-text-muted">{c.loginUrlLabel}</dt>
        <dd className="truncate font-mono text-text">{loginUrl}</dd>
      </dl>
    </div>
  );
}

// ── Логин (email) ────────────────────────────────────────────────────────────
function LoginSection({
  userId,
  email,
  onChanged,
}: {
  userId: string;
  email: string;
  onChanged: (next: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await changeUserEmailAction(userId, value);
      if (res.ok) {
        toast.success(t.users.credentials.loginChanged);
        onChanged(res.email);
        setEditing(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel icon={<Mail size={14} strokeWidth={1.75} />}>
        {t.users.credentials.loginSection}
      </SectionLabel>
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            className="h-9 flex-1"
            aria-label={t.users.credentials.loginSection}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(email);
                setEditing(false);
              }}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? t.common.saving : t.common.save}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-muted/40 px-3 py-2">
          <span className="truncate text-[13.5px] tabular-nums text-text">{email}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(email);
              setEditing(true);
            }}
          >
            {t.users.credentials.changeLogin}
          </Button>
        </div>
      )}
    </section>
  );
}

// ── Пароль (зеркало + выдать новый) ──────────────────────────────────────────
function PasswordSection({
  userId,
  password,
  updatedAt,
  loading,
  onIssued,
}: {
  userId: string;
  password: string | null;
  updatedAt: string | null;
  loading: boolean;
  onIssued: (pw: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reissuePending, startReissue] = useTransition();

  // Подраздел «задать свой пароль».
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [customPending, startCustom] = useTransition();

  const copy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.users.credentials.copyFailed);
    }
  }, [password, toast, t]);

  function reissue() {
    startReissue(async () => {
      const res = await reissueUserPasswordAction(userId);
      if (res.ok) {
        onIssued(res.password);
        setReveal(true);
        toast.success(t.users.credentials.passwordIssued);
      } else {
        toast.error(res.error);
      }
    });
  }

  function saveCustom() {
    startCustom(async () => {
      const res = await setUserPasswordAction(userId, custom);
      if (res.ok) {
        onIssued(res.password);
        setReveal(true);
        setCustom('');
        setCustomOpen(false);
        toast.success(t.users.credentials.passwordIssued);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel icon={<KeyRound size={14} strokeWidth={1.75} />}>
        {t.users.credentials.passwordSection}
      </SectionLabel>

      {loading ? (
        <p className="text-[13px] text-text-muted">{t.common.loading}</p>
      ) : password ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-muted/40 px-3 py-2">
            <span className="truncate font-mono text-[13.5px] text-text">
              {reveal ? password : '•'.repeat(Math.min(password.length, 16))}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn
                onClick={() => setReveal((v) => !v)}
                label={reveal ? t.users.credentials.hide : t.users.credentials.reveal}
              >
                {reveal ? (
                  <EyeOff size={15} strokeWidth={1.75} />
                ) : (
                  <Eye size={15} strokeWidth={1.75} />
                )}
              </IconBtn>
              <IconBtn onClick={copy} label={t.common.copy}>
                {copied ? (
                  <Check size={15} strokeWidth={2} className="text-success" />
                ) : (
                  <Copy size={15} strokeWidth={1.75} />
                )}
              </IconBtn>
            </div>
          </div>
          {updatedAt && (
            <p className="text-[12px] text-text-subtle">
              {t.users.credentials.issuedAt.replace('{date}', formatDate(updatedAt))}
            </p>
          )}
          <p className="text-[12px] text-text-subtle">{t.users.credentials.staleHint}</p>
        </>
      ) : (
        <p className="text-[13px] text-text-muted">{t.users.credentials.passwordNone}</p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={reissue} disabled={reissuePending}>
          <RefreshCw size={14} strokeWidth={1.75} />
          {reissuePending ? t.users.credentials.issuing : t.users.credentials.reissue}
        </Button>
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="text-[12.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          {t.users.credentials.setOwn}
        </button>
      </div>

      {customOpen && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={72}
            placeholder={t.users.credentials.setOwnPlaceholder}
            className="h-9 flex-1 font-mono"
            aria-label={t.users.credentials.setOwn}
          />
          <Button type="button" size="sm" onClick={saveCustom} disabled={customPending}>
            {customPending ? t.common.saving : t.users.credentials.setOwnSave}
          </Button>
        </div>
      )}
    </section>
  );
}

// ── Приглашение на email ─────────────────────────────────────────────────────
function InviteSection({ userId, email }: { userId: string; email: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();

  function invite() {
    start(async () => {
      const res = await sendUserInviteAction(userId);
      if (res.ok) {
        toast.success(t.users.credentials.invited.replace('{email}', res.email));
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel icon={<Send size={14} strokeWidth={1.75} />}>
        {t.users.credentials.inviteSection}
      </SectionLabel>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={invite}
        disabled={pending || !email}
        className="self-start"
      >
        <Mail size={14} strokeWidth={1.75} />
        {pending ? t.users.credentials.inviting : t.users.credentials.invite}
      </Button>
      <p className="text-[12px] text-text-subtle">{t.users.credentials.inviteHint}</p>
    </section>
  );
}

// ── Опасная зона: удаление ───────────────────────────────────────────────────
function DangerSection({
  userId,
  onDeleted,
}: {
  userId: string;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blockers, setBlockers] = useState<DeleteBlockers | null>(null);
  const [pending, start] = useTransition();

  function doDelete() {
    start(async () => {
      const res = await deleteUserAction(userId);
      if (res.ok) {
        toast.success(t.users.credentials.deleted);
        setConfirmOpen(false);
        onDeleted();
        router.refresh();
      } else if (res.blockers) {
        setBlockers(res.blockers);
        setConfirmOpen(false);
        toast.error(t.users.errors.deleteBlocked);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <SectionLabel icon={<Trash2 size={14} strokeWidth={1.75} />} tone="danger">
        {t.users.credentials.dangerSection}
      </SectionLabel>

      {blockers && !blockers.can_delete && (
        <div className="rounded-control border border-warning/20 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
          <p className="font-medium">{t.users.credentials.deleteBlockedTitle}</p>
          <p className="mt-1 text-text">{summarizeBlockers(blockers, t)}</p>
          <p className="mt-1 text-text-muted">{t.users.credentials.deleteBlockedHint}</p>
        </div>
      )}

      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="self-start"
      >
        <Trash2 size={14} strokeWidth={1.75} />
        {t.users.credentials.delete}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title={t.users.credentials.deleteConfirmTitle}
        description={t.users.credentials.deleteConfirmBody}
        confirmLabel={pending ? t.common.deleting : t.common.delete}
        tone="danger"
        pending={pending}
        onConfirm={doDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}

// ── Мелкие хелперы ───────────────────────────────────────────────────────────
function SectionLabel({
  icon,
  children,
  tone = 'default',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] ${
        tone === 'danger' ? 'text-error' : 'text-text-subtle'
      }`}
    >
      <span className={tone === 'danger' ? 'text-error' : 'text-text-muted'}>
        {icon}
      </span>
      {children}
    </span>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function summarizeBlockers(
  b: DeleteBlockers,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const labels = t.users.credentials.blockers;
  const parts: string[] = [];
  const push = (n: number, label: string) => {
    if (n > 0) parts.push(label.replace('{n}', String(n)));
  };
  push(b.cases, labels.cases);
  push(b.clients, labels.clients);
  push(b.payments, labels.payments);
  push(b.documents, labels.documents);
  push(b.tasks, labels.tasks);
  push(b.acts, labels.acts);
  push(b.comments, labels.comments);
  push(b.cash, labels.cash);
  push(b.payroll, labels.payroll);
  return parts.join(' · ');
}
