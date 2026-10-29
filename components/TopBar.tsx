'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { Icon, LogoMark } from './Icon';
import { useDismiss } from './useDismiss';
import { useCredit } from './CreditContext';
import { api } from '@/lib/client/api';
import { fmtDelta, fmtNumber, fmtWhen } from '@/lib/format';
import type { LedgerEntry, Profile } from '@/lib/types';

function initialOf(profile: Profile) {
  const source = (profile.name || profile.email || 'G').trim();
  return source.charAt(0).toUpperCase();
}

export function Avatar({ profile, size = 44 }: { profile: Profile; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="avatar"
      style={size !== 44 ? { width: size, height: size, flexShrink: 0, fontSize: size < 40 ? 13 : 14 } : undefined}
    >
      {initialOf(profile)}
    </span>
  );
}

function AccountMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="avatar"
        aria-label="Tài khoản"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{initialOf(profile)}</span>
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 'calc(100% + 8px)', width: 260 }}>
          <div className="menu-head">
            <Avatar profile={profile} size={36} />
            <span className="who">
              <span>{profile.name || 'Tài khoản GAIA'}</span>
              <span>{profile.email}</span>
            </span>
          </div>
          <Link href="/credit" className="menu-link" onClick={close}>
            <Icon name="coin" />
            Credit &amp; giao dịch
          </Link>
          {(profile.role === 'owner' || profile.role === 'admin') && (
            <Link href="/admin" className="menu-link" onClick={close}>
              <Icon name="user" />
              Quản trị
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="danger">
              <Icon name="logout" />
              Đăng xuất
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CreditButton() {
  const { balance, canTopup } = useCredit();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      api<{ entries: LedgerEntry[] }>('/api/credits?limit=4')
        .then((r) => setEntries(r.entries))
        .catch(() => setEntries([]));
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="credit-btn" aria-expanded={open} aria-haspopup="true" onClick={toggle}>
        <Icon name="coin" className="accent" />
        {fmtNumber(balance)} <span className="unit">credit</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="popover credit-pop">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Lịch sử credit</span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              Số dư {fmtNumber(balance)}
            </span>
          </div>
          {entries === null ? (
            <div className="empty-note" style={{ padding: '16px 0' }}>Đang tải…</div>
          ) : entries.length === 0 ? (
            <div className="empty-note" style={{ padding: '16px 0', borderTop: '1px solid #262622' }}>
              Chưa có giao dịch nào.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {entries.map((e) => (
                <li className="tx" key={e.id}>
                  <span className="what">
                    <span>
                      {e.title}
                      {e.detail ? ` · ${e.detail}` : ''}
                    </span>
                    <span>{fmtWhen(e.createdAt)}</span>
                  </span>
                  <span className={`mono${e.delta > 0 ? ' accent' : ''}`} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {fmtDelta(e.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {canTopup && (
              <Link href="/credit" className="primary" style={{ flex: 1, height: 40, fontSize: 13 }} onClick={close}>
                Nạp credit
              </Link>
            )}
            <Link href="/credit#history" className="ghost" style={{ flex: 1, height: 40, fontSize: 13 }} onClick={close}>
              Xem tất cả
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Thanh trên cùng của Studio (logo + credit + tài khoản) hoặc của trang Credit/Quản trị (nút về Studio). */
export function TopBar({ profile, variant = 'studio' }: { profile: Profile; variant?: 'studio' | 'credit' }) {
  const { balance } = useCredit();
  return (
    <header className="topbar">
      {variant === 'studio' ? (
        <Link href="/" className="logo">
          <LogoMark className="mark" />
          GAIA<span className="sub">Studio</span>
        </Link>
      ) : (
        <Link href="/studio" className="back">
          <Icon name="arrow-left" size={18} />
          Studio
        </Link>
      )}
      <div className="topbar-right">
        {variant === 'studio' ? (
          <CreditButton />
        ) : (
          <span className="credit-btn" style={{ padding: '0 14px' }}>
            <Icon name="coin" className="accent" />
            {fmtNumber(balance)} <span className="unit">credit</span>
          </span>
        )}
        <AccountMenu profile={profile} />
      </div>
    </header>
  );
}
