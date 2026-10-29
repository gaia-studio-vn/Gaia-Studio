'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { TopBar } from '../TopBar';
import { useCredit } from '../CreditContext';
import { useToasts } from '../Toasts';
import { api } from '@/lib/client/api';
import { fmtDate, fmtDayMonthTime, fmtDelta, fmtNumber, fmtVnd } from '@/lib/format';
import {
  bonusPercent,
  CREDIT_VALIDITY_DAYS,
  MIN_TOPUP_VND,
  TOPUP_PRESETS,
  topupCredits,
  validateTopupAmount,
  VND_PER_CREDIT,
} from '@/lib/topup-rules';
import type { CreditSummary, LedgerEntry, LedgerKind, Profile, TopupView } from '@/lib/types';

type Step = 'choose' | 'wait' | 'done';
type LedgerFilter = 'all' | Exclude<LedgerKind, 'expire'>;

const FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'topup', label: 'Nạp' },
  { key: 'use', label: 'Sử dụng' },
  { key: 'refund', label: 'Hoàn credit' },
];

function bonusText(vnd: number) {
  const pct = bonusPercent(vnd);
  if (!pct) return null;
  return `+${fmtNumber(topupCredits(vnd).bonus)} credit (${pct}%)`;
}

function TopupPanel({ enabled, resume, onPaid }: { enabled: boolean; resume: TopupView | null; onPaid: () => void }) {
  const { push } = useToasts();
  const [preset, setPreset] = useState<number | null>(resume ? null : 100_000);
  const [custom, setCustom] = useState('');
  const [order, setOrder] = useState<TopupView | null>(resume);
  const [step, setStep] = useState<Step>(resume?.status === 'pending' ? 'wait' : resume?.status === 'paid' ? 'done' : 'choose');
  const [creating, setCreating] = useState(false);

  const customVnd = Number(custom.replace(/\D/g, '')) || 0;
  const amount = custom ? customVnd : preset ?? 0;
  const invalid = custom ? validateTopupAmount(customVnd) : amount ? null : 'Chọn số tiền muốn nạp';
  const receive = amount ? topupCredits(amount).total : 0;
  const bonus = amount ? bonusText(amount) : null;

  // Đang chờ chuyển khoản: hỏi trạng thái mỗi 3 giây.
  useEffect(() => {
    if (step !== 'wait' || !order) return;
    let stopped = false;
    const check = async () => {
      try {
        const view = await api<TopupView>(`/api/topups/${order.orderCode}`);
        if (stopped) return;
        if (view.status === 'paid') {
          setOrder(view);
          setStep('done');
          onPaid();
        } else if (view.status !== 'pending') {
          setStep('choose');
          push({ title: view.status === 'expired' ? 'Mã thanh toán đã hết hạn. Bạn tạo mã mới nhé.' : 'Đã huỷ giao dịch.' });
        }
      } catch {}
    };
    const t = setInterval(check, 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [step, order, onPaid, push]);

  const start = async () => {
    if (invalid || creating) return;
    setCreating(true);
    try {
      const view = await api<TopupView>('/api/topups', { method: 'POST', json: { amountVnd: amount } });
      setOrder(view);
      setStep('wait');
    } catch (err) {
      push({ kind: 'error', title: err instanceof Error ? err.message : 'Không tạo được mã thanh toán' });
    } finally {
      setCreating(false);
    }
  };

  const cancel = async () => {
    if (!order) return;
    try {
      await api(`/api/topups/${order.orderCode}`, { method: 'DELETE' });
    } catch {}
    setStep('choose');
  };

  if (step === 'done' && order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '12px 0' }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#2A2112', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={28} />
        </span>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Nạp credit thành công</h2>
        <p className="muted" style={{ margin: 0 }}>
          Đã cộng <span className="mono" style={{ color: '#EDEBE6' }}>{fmtNumber(order.credits + order.bonusCredits)} credit</span> vào tài khoản của bạn.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <Link href="/studio" className="primary" style={{ width: 'auto', height: 44, padding: '0 20px' }}>
            Về Studio
          </Link>
          <button type="button" className="ghost" style={{ width: 'auto', padding: '0 18px' }} onClick={() => setStep('choose')}>
            Nạp thêm
          </button>
        </div>
      </div>
    );
  }

  if (step === 'wait' && order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <button
            type="button"
            onClick={() => setStep('choose')}
            className="muted"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 8px 0 0', border: 0, background: 'transparent', fontWeight: 500 }}
          >
            <Icon name="arrow-left" />
            Đổi số tiền
          </button>
          <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600 }}>Thanh toán {fmtVnd(order.amountVnd)}</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div className="qr-box" aria-label="Mã QR chuyển khoản" dangerouslySetInnerHTML={{ __html: order.qrSvg ?? '' }} />
          <dl style={{ flex: '1 1 200px', margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div>
              <dt className="faint">Ngân hàng</dt>
              <dd style={{ margin: '2px 0 0' }}>{order.bankName ?? '—'}</dd>
            </div>
            <div>
              <dt className="faint">Số tài khoản</dt>
              <dd className="mono" style={{ margin: '2px 0 0' }}>{order.accountNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="faint">Chủ tài khoản</dt>
              <dd style={{ margin: '2px 0 0' }}>{order.accountName ?? '—'}</dd>
            </div>
            <div>
              <dt className="faint">Nội dung chuyển khoản</dt>
              <dd className="mono" style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                {order.description}
                <button
                  type="button"
                  className="ghost-icon"
                  aria-label="Sao chép nội dung chuyển khoản"
                  style={{ width: 32, height: 32 }}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(order.description ?? '')
                      .then(() => push({ title: 'Đã sao chép nội dung chuyển khoản' }))
                      .catch(() => {})
                  }
                >
                  <Icon name="copy" size={15} />
                </button>
              </dd>
            </div>
            {order.checkoutUrl && (
              <a href={order.checkoutUrl} target="_blank" rel="noreferrer" className="link-btn" style={{ padding: 0, height: 28 }}>
                Mở trang thanh toán PayOS
              </a>
            )}
          </dl>
        </div>
        <div className="waiting" aria-live="polite">
          <span className="dot" />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="accent" style={{ fontWeight: 600 }}>
              Đang chờ thanh toán
            </span>
            <span style={{ fontSize: 13, color: '#D8D3C8' }}>
              Credit được cộng tự động ngay khi GAIA nhận được tiền. Bạn có thể đóng trang này.
            </span>
          </span>
        </div>
        <button type="button" className="ghost" onClick={cancel}>
          Huỷ giao dịch
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Nạp credit</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Chọn số tiền muốn nạp.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {TOPUP_PRESETS.map((vnd) => {
          const pct = bonusPercent(vnd);
          return (
            <button
              key={vnd}
              type="button"
              className="amount"
              aria-pressed={!custom && preset === vnd}
              onClick={() => {
                setPreset(vnd);
                setCustom('');
              }}
            >
              <span>{fmtVnd(vnd)}</span>
              <span className="sub">{fmtNumber(topupCredits(vnd).total)} credit</span>
              {pct > 0 && <span className="badge">+{pct}%</span>}
            </button>
          );
        })}
      </div>
      <p className="faint" style={{ margin: '-8px 0 0', fontSize: 12 }}>
        Nạp từ 200.000đ được thưởng thêm 5% credit, từ 500.000đ được thưởng 10%.
      </p>
      <div>
        <label htmlFor="topup-custom" className="flabel">
          Hoặc nhập số tiền khác
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="topup-custom"
            className={`field mono${custom && invalid ? ' invalid' : ''}`}
            type="text"
            inputMode="numeric"
            placeholder={`Tối thiểu ${fmtNumber(MIN_TOPUP_VND)}`}
            style={{ paddingRight: 40 }}
            value={custom}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
              setCustom(digits ? fmtNumber(Number(digits)) : '');
            }}
          />
          <span className="faint" style={{ position: 'absolute', right: 14, top: 13 }}>
            đ
          </span>
        </div>
        {custom && invalid && (
          <p className="danger-text" style={{ margin: '6px 0 0', fontSize: 12 }}>
            {invalid}
          </p>
        )}
      </div>
      <div className="summary-box">
        <div>
          <span>Tỉ giá</span>
          <span className="mono">
            {fmtNumber(1000)}đ = {fmtNumber(1000 / VND_PER_CREDIT)} credit
          </span>
        </div>
        <div>
          <span>Thưởng</span>
          <span className={`mono${bonus ? ' accent' : ' faint'}`}>{bonus ?? 'Không có'}</span>
        </div>
        <div>
          <span>Hạn dùng</span>
          <span>{CREDIT_VALIDITY_DAYS} ngày kể từ ngày nạp</span>
        </div>
        <div>
          <span>Bạn nhận được</span>
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 500 }}>
            <Icon name="coin" className="accent" />
            {fmtNumber(invalid ? 0 : receive)} credit
          </span>
        </div>
      </div>
      <div>
        <span className="flabel">Phương thức thanh toán</span>
        <div className="pay-method">
          <span style={{ width: 36, height: 36, borderRadius: 10, background: '#2A2A26', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="qr" size={20} />
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600 }}>Chuyển khoản ngân hàng</span>
            <span className="muted" style={{ fontSize: 12 }}>
              Quét mã QR bằng app ngân hàng
            </span>
          </span>
          <span className="accent" style={{ display: 'flex' }}>
            <Icon name="check" size={18} />
          </span>
        </div>
      </div>
      <button type="button" className="primary" disabled={Boolean(invalid) || creating || !enabled} onClick={start}>
        {creating ? <span className="spinner" /> : null}
        Tiếp tục{amount && !invalid ? ` · ${fmtVnd(amount)}` : ''}
        <Icon name="arrow-right" />
      </button>
      {!enabled && (
        <p className="faint" style={{ margin: '-8px 0 0', fontSize: 12 }}>
          Thanh toán đang được thiết lập. Bạn quay lại sau nhé.
        </p>
      )}
    </div>
  );
}

/** Chế độ nhóm riêng (lib/access.ts): không nạp tiền trên web, chủ nhóm cấp credit. */
function GrantPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Credit do chủ nhóm cấp</h2>
      <p className="muted" style={{ margin: 0 }}>
        GAIA đang dùng riêng cho một nhóm nhỏ và không bán credit. Khi cần thêm credit, bạn nhắn chủ nhóm.
      </p>
      <Link href="/rules" className="link-btn" style={{ padding: 0, height: 28 }}>
        Xem quy ước dùng chung
      </Link>
    </div>
  );
}

function Ledger({ initial }: { initial: { entries: LedgerEntry[]; hasMore: boolean } }) {
  const { canTopup } = useCredit();
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [entries, setEntries] = useState(initial.entries);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f: LedgerFilter, o: 'desc' | 'asc', before?: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '20', order: o });
      if (f !== 'all') qs.set('kind', f);
      if (before) qs.set('before', String(before));
      const res = await api<{ entries: LedgerEntry[]; hasMore: boolean }>(`/api/credits?${qs}`);
      setEntries((prev) => (before ? [...prev, ...res.entries] : res.entries));
      setHasMore(res.hasMore);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="panel" id="history" aria-label="Lịch sử giao dịch" style={{ padding: '8px 24px 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px 24px', borderBottom: '1px solid #262622' }}>
        <h2 style={{ margin: 0, padding: '12px 0', fontSize: 18, fontWeight: 600 }}>Lịch sử giao dịch</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 20px' }}>
          <nav className="ledger-tabs" aria-label="Lọc giao dịch">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className="tab"
                aria-pressed={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  load(f.key, order);
                }}
              >
                {f.key === 'topup' && !canTopup ? 'Được cấp' : f.label}
              </button>
            ))}
          </nav>
          <div className="mini-toggle" role="group" aria-label="Sắp xếp giao dịch">
            {(['desc', 'asc'] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={order === o}
                onClick={() => {
                  if (o === order) return;
                  setOrder(o);
                  load(filter, o);
                }}
              >
                {o === 'desc' ? 'Mới nhất' : 'Cũ nhất'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ledger-head ledger">
        <span style={{ width: 110 }}>Thời gian</span>
        <span style={{ flex: '1 1 200px' }}>Nội dung</span>
        <span style={{ width: 90, textAlign: 'right' }}>Thay đổi</span>
        <span style={{ width: 90, textAlign: 'right' }}>Số dư sau</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty-note" style={{ borderTop: '1px solid #262622' }}>
          {loading ? 'Đang tải…' : 'Chưa có giao dịch nào.'}
        </div>
      ) : (
        <ul className="ledger">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="t">{fmtDayMonthTime(e.createdAt)}</span>
              <span className="c">
                <span style={{ fontWeight: 500 }}>{e.title}</span>
                {e.detail && <small>{e.detail}</small>}
              </span>
              <span className={`d${e.delta > 0 ? ' plus' : ''}`}>{fmtDelta(e.delta)}</span>
              <span className="a">
                <span className="a-label">Số dư </span>
                {fmtNumber(e.balanceAfter)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          className="ghost"
          style={{ marginTop: 8 }}
          disabled={loading}
          onClick={() => load(filter, order, entries[entries.length - 1]?.id)}
        >
          {loading ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </section>
  );
}

export function CreditPage({
  profile,
  initialSummary,
  initialLedger,
  resume,
  paymentsEnabled,
}: {
  profile: Profile;
  initialSummary: CreditSummary;
  initialLedger: { entries: LedgerEntry[]; hasMore: boolean };
  resume: TopupView | null;
  paymentsEnabled: boolean;
}) {
  const { balance, setBalance, canTopup } = useCredit();
  const [summary, setSummary] = useState(initialSummary);
  const [ledger, setLedger] = useState(initialLedger);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  const refresh = useCallback(() => {
    api<CreditSummary & { entries: LedgerEntry[]; hasMore: boolean }>('/api/credits?limit=20')
      .then((r) => {
        setBalance(r.balance);
        setSummary({ balance: r.balance, nextExpiry: r.nextExpiry });
        setLedger({ entries: r.entries, hasMore: r.hasMore });
        setLedgerVersion((v) => v + 1);
      })
      .catch(() => {});
  }, [setBalance]);

  return (
    <div className="page">
      <TopBar profile={profile} variant="credit" />
      <main style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 700 }}>Credit</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {canTopup ? 'Nạp credit và xem lại mọi giao dịch của bạn.' : 'Xem số dư và mọi giao dịch credit của bạn.'}
        </p>
        <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <section className="panel" aria-label={canTopup ? 'Nạp credit' : 'Cấp credit'} style={{ flex: '1 1 380px', minWidth: 0, padding: 24 }}>
            {canTopup ? <TopupPanel enabled={paymentsEnabled} resume={resume} onPaid={refresh} /> : <GrantPanel />}
          </section>
          <div style={{ flex: '1.6 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="panel" aria-label="Số dư" style={{ padding: 24 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                Số dư hiện tại
              </span>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="coin" size={28} className="accent" />
                <span className="mono" style={{ fontSize: 40, lineHeight: 1, fontWeight: 500 }}>
                  {fmtNumber(balance)}
                </span>
                <span className="muted" style={{ fontSize: 15 }}>
                  credit
                </span>
              </div>
              <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
                Credit có hạn {CREDIT_VALIDITY_DAYS} ngày kể từ ngày {canTopup ? 'nạp' : 'cấp'}.
                {summary.nextExpiry && (
                  <>
                    {' '}
                    <span className="mono" style={{ color: '#EDEBE6' }}>
                      {fmtNumber(summary.nextExpiry.credits)} credit
                    </span>{' '}
                    sẽ hết hạn vào{' '}
                    <span className="mono" style={{ color: '#EDEBE6' }}>
                      {fmtDate(summary.nextExpiry.expiresAt)}
                    </span>
                    .
                  </>
                )}
              </p>
            </section>
            <Ledger key={ledgerVersion} initial={ledger} />
          </div>
        </div>
      </main>
    </div>
  );
}
