'use client';

import { useCallback, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { TopBar } from '../TopBar';
import { useCredit } from '../CreditContext';
import { useToasts } from '../Toasts';
import { useDismiss } from '../useDismiss';
import { api } from '@/lib/client/api';
import { fmtDate, fmtDayMonthTime, fmtNumber } from '@/lib/format';
import { CREDIT_VALIDITY_DAYS } from '@/lib/topup-rules';
import type { AdminMember, AdminOverview, Profile, Role } from '@/lib/types';

// Trang Quản trị, dựng theo màn #admin trong mockup (duyệt 25/10/2026).
// Chủ nhóm: cấp credit, thêm quản trị viên, đổi vai trò. Quản trị viên: mời và gỡ thành viên.
// Server kiểm tra lại mọi quyền (lib/admin.server.ts); ở đây chỉ ẩn những gì người xem không dùng được.

const GRANT_PRESETS = [50_000, 100_000, 200_000];
const ROLE_LABEL: Record<Role, string> = { owner: 'Chủ nhóm', admin: 'Quản trị', member: 'Thành viên' };
const AVATAR_COLORS = ['#2D3142', '#2F3B2E', '#3A2E2A', '#2E2A3A', '#3A3424'];

const displayName = (m: AdminMember) => m.name || m.email.split('@')[0];
const initialOf = (m: AdminMember) => displayName(m).trim().charAt(0).toUpperCase() || '?';
const colorOf = (email: string) => AVATAR_COLORS[[...email].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

function errorText(err: unknown) {
  return err instanceof Error ? err.message : 'Có lỗi xảy ra. Bạn thử lại sau ít phút.';
}

function GrantPanel({
  data,
  grantTo,
  setGrantTo,
  selectRef,
  onGranted,
}: {
  data: AdminOverview;
  grantTo: string;
  setGrantTo: (email: string) => void;
  selectRef: React.RefObject<HTMLSelectElement | null>;
  onGranted: (next: AdminOverview & { myBalance: number }, amount: number, email: string) => void;
}) {
  const { push } = useToasts();
  const [preset, setPreset] = useState<number | null>(100_000);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const joined = data.members.filter((m) => m.userId);
  const customValue = Number(custom.replace(/\D/g, '')) || 0;
  const amount = custom ? customValue : preset ?? 0;
  const lowBalance = data.providerBalance != null && amount > data.providerBalance;

  const submit = async () => {
    if (!grantTo || amount <= 0 || busy) return;
    setBusy(true);
    try {
      const next = await api<AdminOverview & { myBalance: number }>('/api/admin/grants', {
        method: 'POST',
        json: { email: grantTo, amount, note },
      });
      setNote('');
      onGranted(next, amount, grantTo);
    } catch (err) {
      push({ kind: 'error', title: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Cấp credit</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Chỉ chủ nhóm cấp được credit.
        </p>
      </div>
      <div>
        <label htmlFor="grant-to" className="flabel">
          Cấp cho
        </label>
        <select id="grant-to" ref={selectRef} className="field" value={grantTo} onChange={(e) => setGrantTo(e.target.value)}>
          {joined.map((m) => (
            <option key={m.email} value={m.email}>
              {displayName(m)}
              {m.email === data.me.email ? ' (bạn)' : ''} · {m.email}
            </option>
          ))}
        </select>
        {joined.length < data.members.length && (
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 12 }}>
            Người được mời nhưng chưa đăng nhập GAIA lần nào thì chưa cấp credit được.
          </p>
        )}
      </div>
      <div>
        <span className="flabel">Số credit</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {GRANT_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              className="amount"
              style={{ height: 52 }}
              aria-pressed={!custom && preset === v}
              onClick={() => {
                setPreset(v);
                setCustom('');
              }}
            >
              {fmtNumber(v)}
            </button>
          ))}
        </div>
        <input
          className="field mono"
          type="text"
          inputMode="numeric"
          aria-label="Số credit khác"
          placeholder="Hoặc nhập số khác"
          style={{ marginTop: 8 }}
          value={custom}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
            setCustom(digits ? fmtNumber(Number(digits)) : '');
          }}
        />
      </div>
      <div>
        <label htmlFor="grant-note" className="flabel">
          Ghi chú <span className="faint" style={{ fontWeight: 400 }}>(tuỳ chọn)</span>
        </label>
        <input
          id="grant-note"
          className="field"
          type="text"
          maxLength={200}
          placeholder="Vd: Minh Anh góp 100.000đ ngày 25/10"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="summary-box">
        <div>
          <span>Giá trị</span>
          <span className="mono">1 credit = 1đ chi phí</span>
        </div>
        <div>
          <span>Hạn dùng</span>
          <span>{CREDIT_VALIDITY_DAYS} ngày kể từ ngày cấp</span>
        </div>
        <div>
          <span>Số dư lúc này</span>
          <span className="mono">{data.providerBalance == null ? '—' : fmtNumber(data.providerBalance)}</span>
        </div>
      </div>
      {lowBalance && (
        <p className="warn-text" style={{ margin: '-6px 0 0' }}>
          Số dư thấp hơn số credit cấp. Khi số dư hết, mọi người sẽ thấy &ldquo;GAIA đang tạm dừng nhận yêu cầu tạo mới&rdquo;
          dù còn credit. Nạp thêm trước để credit dùng được.
        </p>
      )}
      <button type="button" className="primary" disabled={!grantTo || amount <= 0 || busy} onClick={submit}>
        {busy ? <span className="spinner" /> : null}
        Cấp {fmtNumber(amount)} credit
        <Icon name="arrow-right" />
      </button>
    </div>
  );
}

function MemberMenu({
  member,
  isOwner,
  onRole,
  onRemove,
}: {
  member: AdminMember;
  isOwner: boolean;
  onRole: (role: 'admin' | 'member') => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="ghost-icon"
        aria-label={`Thao tác với ${member.email}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 'calc(100% + 6px)', width: 230 }}>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                close();
                onRole(member.role === 'admin' ? 'member' : 'admin');
              }}
            >
              <Icon name="user" size={16} />
              {member.role === 'admin' ? 'Đổi thành Thành viên' : 'Đổi thành Quản trị'}
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={() => {
              close();
              onRemove();
            }}
          >
            <Icon name="x" size={16} />
            Gỡ quyền dùng GAIA
          </button>
        </div>
      )}
    </span>
  );
}

export function AdminPage({ profile, initial }: { profile: Profile; initial: AdminOverview }) {
  const { setBalance } = useCredit();
  const { push } = useToasts();
  const [data, setData] = useState(initial);
  const isOwner = data.me.role === 'owner';
  const [grantTo, setGrantTo] = useState(
    () => (initial.members.find((m) => m.userId && m.email !== initial.me.email) ?? initial.members.find((m) => m.userId))?.email ?? '',
  );
  const selectRef = useRef<HTMLSelectElement>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const pending = data.members.filter((m) => !m.userId).length;
  const overBalance = data.providerBalance != null && data.outstanding > data.providerBalance;
  // Ai được thao tác với dòng nào (server kiểm tra lại): chủ nhóm với mọi người trừ mình; quản trị viên chỉ với thành viên.
  const canManage = (m: AdminMember) =>
    m.invitedAt != null && m.role !== 'owner' && (isOwner || m.role === 'member') && m.email !== data.me.email;

  const invite = async () => {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const next = await api<AdminOverview>('/api/admin/members', {
        method: 'POST',
        json: { email: email.trim(), role: isOwner ? role : 'member' },
      });
      setData(next);
      push({ title: `Đã mời ${email.trim().toLowerCase()}`, sub: 'Người này đăng nhập bằng Google với đúng email đó' });
      setEmail('');
      setRole('member');
    } catch (err) {
      push({ kind: 'error', title: errorText(err) });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m: AdminMember, next: 'admin' | 'member') => {
    setBusyEmail(m.email);
    try {
      setData(await api<AdminOverview>('/api/admin/members', { method: 'PATCH', json: { email: m.email, role: next } }));
      push({ title: `${displayName(m)} giờ là ${ROLE_LABEL[next]}` });
    } catch (err) {
      push({ kind: 'error', title: errorText(err) });
    } finally {
      setBusyEmail(null);
    }
  };

  const remove = async (m: AdminMember) => {
    setConfirmRemove(null);
    setBusyEmail(m.email);
    try {
      setData(await api<AdminOverview>(`/api/admin/members?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }));
      push({ title: `Đã gỡ quyền của ${displayName(m)}`, sub: 'Dữ liệu của người này vẫn được giữ' });
    } catch (err) {
      push({ kind: 'error', title: errorText(err) });
    } finally {
      setBusyEmail(null);
    }
  };

  const onGranted = (next: AdminOverview & { myBalance: number }, amount: number, to: string) => {
    const { myBalance, ...overview } = next;
    setData(overview);
    setBalance(myBalance);
    const m = overview.members.find((x) => x.email === to);
    push({ title: `Đã cấp ${fmtNumber(amount)} credit cho ${m ? displayName(m) : to}` });
  };

  const pickGrant = (m: AdminMember) => {
    setGrantTo(m.email);
    selectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectRef.current?.focus();
  };

  return (
    <div className="page">
      <TopBar profile={profile} variant="credit" />
      <main style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 700 }}>Quản trị</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Mời người dùng GAIA và cấp credit. Chỉ quản trị viên thấy trang này.
        </p>
        <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <section className="panel" aria-label="Cấp credit" style={{ flex: '1 1 380px', minWidth: 0, padding: 24 }}>
            {isOwner ? (
              <GrantPanel data={data} grantTo={grantTo} setGrantTo={setGrantTo} selectRef={selectRef} onGranted={onGranted} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Cấp credit</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Chỉ chủ nhóm{data.ownerName ? ` (${data.ownerName})` : ''} cấp được credit và thêm quản trị viên, vì chủ nhóm là
                  người trả tiền. Khi ai cần thêm credit, nhắn chủ nhóm.
                </p>
              </div>
            )}
          </section>

          <div style={{ flex: '1.6 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="panel stat-row" aria-label="Tổng quan">
              <div className="stat">
                <span className="k">Số dư</span>
                <div className="v">{data.providerBalance == null ? '—' : fmtNumber(data.providerBalance)}</div>
                <span className="n">{data.providerBalance == null ? 'Chưa đọc được số dư' : 'Tiền thật để tạo ảnh, video'}</span>
              </div>
              <div className="stat">
                <span className="k">Credit đã cấp, còn hạn</span>
                <div className="v">{fmtNumber(data.outstanding)}</div>
                <span className={`n${overBalance ? ' warn' : ''}`}>{overBalance ? 'Nhiều hơn số dư' : 'Chưa dùng, chưa hết hạn'}</span>
              </div>
              <div className="stat">
                <span className="k">Thành viên</span>
                <div className="v">{fmtNumber(data.members.length)}</div>
                <span className="n">{pending ? `${fmtNumber(pending)} người chưa đăng nhập` : 'Đều đã đăng nhập'}</span>
              </div>
            </section>

            <section className="panel" aria-label="Thành viên" style={{ padding: '8px 24px 16px' }}>
              <h2 style={{ margin: 0, padding: '12px 0', fontSize: 18, fontWeight: 600, borderBottom: '1px solid #262622' }}>Thành viên</h2>
              <form
                className="invite-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  invite();
                }}
              >
                <input
                  className="field"
                  type="email"
                  required
                  aria-label="Email Google của người được mời"
                  placeholder="Email Google của người được mời"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {isOwner && (
                  <select className="field" aria-label="Vai trò" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
                    <option value="member">Thành viên</option>
                    <option value="admin">Quản trị</option>
                  </select>
                )}
                <button type="submit" className="mini-btn invite-btn" disabled={inviting || !email.trim()}>
                  {inviting ? <span className="spinner" /> : <Icon name="plus" size={14} />}
                  Mời
                </button>
              </form>
              <p className="faint" style={{ margin: '0 0 8px', fontSize: 12 }}>
                Người được mời đăng nhập bằng Google với đúng email này. Gỡ quyền thì người đó bị đăng xuất, dữ liệu vẫn giữ.
                {!isOwner && ' Chỉ chủ nhóm thêm được quản trị viên.'}
              </p>
              <ul className="member-list">
                {data.members.map((m) => (
                  <li key={m.email} className="member-row" aria-busy={busyEmail === m.email}>
                    {confirmRemove === m.email ? (
                      <div className="member-confirm" role="alertdialog" aria-label={`Gỡ quyền của ${m.email}`}>
                        <span className="danger-text" style={{ fontSize: 13, fontWeight: 500 }}>
                          Gỡ quyền dùng GAIA của {displayName(m)}?
                        </span>
                        <span className="row" style={{ gap: 8 }}>
                          <button type="button" className="mini-btn danger-fill" onClick={() => remove(m)}>
                            Gỡ
                          </button>
                          <button type="button" className="mini-btn" onClick={() => setConfirmRemove(null)}>
                            Huỷ
                          </button>
                        </span>
                      </div>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className={`member-avatar${m.userId ? '' : ' pending'}`}
                          style={m.userId ? { background: colorOf(m.email) } : undefined}
                        >
                          {initialOf(m)}
                        </span>
                        <span className="who">
                          {m.userId ? (
                            <>
                              <span className="n">
                                {displayName(m)}
                                {m.email === data.me.email && <span className="faint" style={{ fontWeight: 400 }}> (bạn)</span>}
                              </span>
                              <span className="e">{m.email}</span>
                            </>
                          ) : (
                            <>
                              <span className="n muted">{m.email}</span>
                              <span className="e faint">
                                {m.invitedAt ? `Đã mời ${fmtDate(m.invitedAt).slice(0, 5)} · chưa đăng nhập` : 'Chưa đăng nhập'}
                              </span>
                            </>
                          )}
                        </span>
                        <span className={`role-badge ${m.role}`}>{ROLE_LABEL[m.role]}</span>
                        <span className={`bal${m.balance == null ? ' faint' : ''}`}>{m.balance == null ? '—' : fmtNumber(m.balance)}</span>
                        <span className="grant-cell">
                          {isOwner && m.userId && (
                            <button type="button" className="link-btn" onClick={() => pickGrant(m)}>
                              Cấp credit
                            </button>
                          )}
                        </span>
                        <span className="menu-cell">
                          {canManage(m) && (
                            <MemberMenu
                              member={m}
                              isOwner={isOwner}
                              onRole={(next) => changeRole(m, next)}
                              onRemove={() => setConfirmRemove(m.email)}
                            />
                          )}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel" aria-label="Lịch sử cấp credit" style={{ padding: '8px 24px 16px' }}>
              <h2 style={{ margin: 0, padding: '12px 0', fontSize: 18, fontWeight: 600, borderBottom: '1px solid #262622' }}>
                Lịch sử cấp credit
              </h2>
              {data.grants.length === 0 ? (
                <div className="empty-note">Chưa cấp credit lần nào.</div>
              ) : (
                <ul className="ledger">
                  {data.grants.map((g) => (
                    <li key={g.id}>
                      <span className="t">{fmtDayMonthTime(g.createdAt)}</span>
                      <span className="c">
                        <span style={{ fontWeight: 500 }}>{g.name || g.email || 'Tài khoản đã xoá'}</span>
                        <small>
                          {data.ownerName ? `${data.ownerName} cấp` : 'Chủ nhóm cấp'}
                          {g.note ? ` · ${g.note}` : ''}
                        </small>
                      </span>
                      <span className="d plus">+{fmtNumber(g.amount)}</span>
                      <span className="a">{CREDIT_VALIDITY_DAYS} ngày</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
