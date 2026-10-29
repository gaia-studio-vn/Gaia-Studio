'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '../Icon';
import { useDismiss } from '../useDismiss';
import { useCredit } from '../CreditContext';
import { FIELD_LABEL, modeLabels, priceFor, resolveSelection, selectionFields } from '@/lib/catalog';
import { aspectOf } from '@/lib/client/upload';
import { fmtNumber } from '@/lib/format';
import type { CatalogModel, Kind, MediaRef, Selection } from '@/lib/types';

export interface Upload {
  key: string;
  preview: string;
  ref?: MediaRef;
  uploading: boolean;
  /** Start/End frame: ảnh gốc (file đã chọn hoặc URL frame cũ), để cắt lại khi đổi tỉ lệ video. */
  source?: File | string;
  /** Tỉ lệ video mà ảnh đã được chuẩn bị theo. */
  ratio?: string;
  /** Đã cắt bớt ảnh gốc để đúng `ratio`. */
  cropped?: boolean;
}

export interface Draft {
  kind: Kind;
  modelId: Partial<Record<Kind, string>>;
  sel: Record<Kind, Selection>;
  prompt: string;
  quantity: number;
  start: Upload | null;
  end: Upload | null;
  refs: Upload[];
}

export type Catalog = { image: CatalogModel[]; video: CatalogModel[] };

export function emptyDraft(kind: Kind = 'video'): Draft {
  return { kind, modelId: {}, sel: { image: {}, video: {} }, prompt: '', quantity: 1, start: null, end: null, refs: [] };
}

/** Model đang chọn của một loại (mặc định model dùng được đầu tiên). */
export function currentModel(catalog: Catalog, draft: Draft, kind: Kind = draft.kind): CatalogModel | undefined {
  const list = catalog[kind];
  return list.find((m) => m.id === draft.modelId[kind]) ?? list.find((m) => m.available) ?? list[0];
}

/** Giá một mục và tổng (ảnh nhân số lượng) cho bản nháp hiện tại. */
export function draftCost(catalog: Catalog, draft: Draft) {
  const model = currentModel(catalog, draft);
  if (!model) return { model, sel: {} as Selection, unit: null as number | null, qty: 1, total: null as number | null };
  const sel = resolveSelection(model, draft.sel[draft.kind]);
  const unit = priceFor(model, sel);
  const qty = draft.kind === 'image' ? draft.quantity : 1;
  return { model, sel, unit, qty, total: unit == null ? null : unit * qty };
}

const QUANTITIES = ['1', '2', '3', '4'];

export function OptionChip({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; price?: string }[];
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const current = options.find((o) => o.value === value);
  return (
    <div className="chip-wrap" ref={ref}>
      <button type="button" className="chip" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <span className="k">{label}</span>
        <span className="v">{current?.label ?? value}</span>
      </button>
      {open && (
        <div className="optmenu" role="menu" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              onClick={() => {
                onPick(o.value);
                close();
              }}
            >
              <span>{o.label}</span>
              {o.price && <span className="p">{o.price}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelPicker({
  models,
  current,
  open,
  onPick,
}: {
  models: CatalogModel[];
  current?: CatalogModel;
  open: boolean;
  onPick: (m: CatalogModel) => void;
}) {
  if (!open) return null;
  return (
    <div className="popover picker" role="listbox" aria-label="Chọn model">
      {models.length === 0 && <div className="empty-note">Chưa tải được danh sách model.</div>}
      {models.map((m) => {
        const selected = m.id === current?.id;
        return (
          <button
            key={m.id}
            type="button"
            className="pick"
            role="option"
            aria-selected={selected}
            disabled={!m.available}
            onClick={() => onPick(m)}
          >
            <span className="check">{selected && <Icon name="check" />}</span>
            <span className="body">
              <span style={{ fontWeight: 600 }}>{m.name}</span>
              {m.tags.length > 0 && (
                <span className="tags">
                  {m.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </span>
            {m.available ? (
              <span className="price">
                <span>từ {fmtNumber(m.fromCredits)}</span>
                {m.daily && (
                  <small>
                    {m.daily.used}/{m.daily.max} lượt hôm nay
                  </small>
                )}
              </span>
            ) : (
              <span className="price off">
                <span>{m.unavailableReason ?? 'Tạm ngưng'}</span>
                {m.daily && <small className="mono">{m.daily.used}/{m.daily.max}</small>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FrameChip({ label, upload, onRemove }: { label: string; upload: Upload; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  // Start/End frame: hình thu nhỏ theo đúng tỉ lệ video, bấm vào để xem ảnh sẽ gửi đi.
  const aspect = aspectOf(upload.ratio);
  const isFrame = upload.source !== undefined;
  return (
    <span className="frame-chip-wrap" ref={ref}>
      <span className="frame-chip">
        {isFrame ? (
          <button
            type="button"
            className="thumb-btn"
            aria-label={`Xem trước ${label}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="thumb"
              src={upload.preview}
              alt=""
              style={aspect ? { width: Math.round(Math.min(50, Math.max(16, 28 * aspect))) } : undefined}
            />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb" src={upload.preview} alt="" />
        )}
        {label}
        {upload.cropped && upload.ratio && <span className="faint">· đã cắt {upload.ratio}</span>}
        {upload.uploading && <span className="spinner" aria-label="Đang tải ảnh lên" />}
        <button type="button" aria-label={`Bỏ ${label}`} onClick={onRemove}>
          <Icon name="x" size={14} />
        </button>
      </span>
      {open && (
        <span className="popover frame-preview" role="dialog" aria-label={`${label} sẽ gửi đi`}>
          <span className="preview-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={upload.preview} alt={label} />
          </span>
          <span className="faint">
            {upload.uploading
              ? 'Đang chuẩn bị ảnh…'
              : upload.cropped
                ? `Đã cắt phần giữa ảnh cho đúng tỉ lệ ${upload.ratio} của video.`
                : aspect
                  ? `Ảnh đã đúng tỉ lệ ${upload.ratio}, giữ nguyên.`
                  : 'Ảnh giữ nguyên.'}
          </span>
        </span>
      )}
    </span>
  );
}

export function Composer({
  catalog,
  draft,
  setDraft,
  balance,
  submitting,
  onSubmit,
  onPickFile,
  onPasteImages,
  textareaRef,
  expanded,
  onExpandedChange,
}: {
  catalog: Catalog;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  balance: number;
  submitting: boolean;
  onSubmit: () => void;
  onPickFile: (slot: 'start' | 'end' | 'ref', file: File) => void;
  onPasteImages: (files: File[]) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Điện thoại: false thì khung tạo chỉ hiện 1 hàng (CSS `.composer.collapsed`, chỉ áp ở màn hẹp). */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  useDismiss(pickerOpen, pickerRef, closePicker);

  // Chạm ra ngoài khung tạo thì thu gọn lại; prompt và ảnh đã chọn vẫn giữ.
  useEffect(() => {
    if (!expanded) return;
    const onPointer = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onExpandedChange(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [expanded, onExpandedChange]);

  // Vừa mở ra (vd. prompt mang từ trang chủ sang): đặt con trỏ vào cuối prompt.
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      const el = textareaRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      }
    }
    wasExpanded.current = expanded;
  }, [expanded, textareaRef]);

  const expand = () => {
    // flushSync để focus ngay trong lần chạm: iOS chỉ mở bàn phím khi focus nằm trong thao tác của người dùng.
    flushSync(() => onExpandedChange(true));
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<'start' | 'end' | 'ref'>('start');

  const { model, sel, unit, qty, total } = draftCost(catalog, draft);
  const kind = draft.kind;
  const lacking = total != null && total > balance;
  const { canTopup } = useCredit();
  const uploading = Boolean(draft.start?.uploading || draft.end?.uploading || draft.refs.some((r) => r.uploading));
  const needsStart = kind === 'video' && Boolean(model?.frames.startRequired) && !draft.start;
  // Có model chỉ nhận Start + End frame ở một số mode (vd. Kling 2.5: Professional).
  const endModes = kind === 'video' ? model?.frames.endModes : undefined;
  const endModeBlocked = Boolean(draft.end && endModes && !endModes.includes(sel.mode ?? ''));
  const canSubmit =
    Boolean(draft.prompt.trim()) &&
    Boolean(model?.available) &&
    unit != null &&
    !lacking &&
    !submitting &&
    !uploading &&
    !needsStart &&
    !endModeBlocked;

  const fields = model ? selectionFields(model) : [];
  const fieldOptions = {} as Record<keyof Selection, { value: string; label: string; price?: string }[]>;
  if (model) {
    for (const f of fields) {
      const list = f === 'ratio' ? model.ratios : f === 'resolution' ? model.resolutions : f === 'duration' ? model.durations : model.modes;
      const prices = list.map((o) => priceFor(model, resolveSelection(model, { ...sel, [f]: o.value }, f)));
      const varies = new Set(prices.map(String)).size > 1;
      fieldOptions[f] = list.map((o, i) => ({
        value: o.value,
        label: o.label,
        price: varies && prices[i] != null ? `${fmtNumber(prices[i]!)} credit` : undefined,
      }));
    }
  }

  const setKind = (k: Kind) => {
    setPickerOpen(false);
    setDraft((d) => ({ ...d, kind: k }));
  };

  const pickModel = (m: CatalogModel) => {
    setPickerOpen(false);
    setDraft((d) => {
      const next: Draft = {
        ...d,
        modelId: { ...d.modelId, [m.kind]: m.id },
        sel: { ...d.sel, [m.kind]: resolveSelection(m, d.sel[m.kind]) },
      };
      if (m.kind === 'video') {
        if (!m.frames.start) {
          next.start = null;
          next.end = null;
        } else if (!m.frames.end) next.end = null;
      } else if (d.refs.length > m.maxReferences) {
        next.refs = d.refs.slice(0, m.maxReferences);
      }
      return next;
    });
  };

  const setField = (field: keyof Selection, value: string) => {
    if (!model) return;
    setDraft((d) => ({ ...d, sel: { ...d.sel, [kind]: resolveSelection(model, { ...sel, [field]: value }, field) } }));
  };

  const openFile = (slot: 'start' | 'end' | 'ref') => {
    slotRef.current = slot;
    fileRef.current?.click();
  };

  return (
    <div className="dock">
      <section className={`composer${expanded ? '' : ' collapsed'}`} aria-label="Tạo mới" ref={pickerRef}>
        <button type="button" className="composer-bar" aria-expanded={expanded} aria-label="Mở khung tạo" onClick={expand}>
          <span className="bar-model">
            <Icon name={kind === 'video' ? 'video' : 'image'} />
            {model?.name ?? 'Chọn model'}
          </span>
          <span className={`bar-prompt${draft.prompt.trim() ? ' has-text' : ''}`}>
            {draft.prompt.trim() || (kind === 'video' ? 'Mô tả video bạn muốn tạo…' : 'Mô tả ảnh bạn muốn tạo…')}
          </span>
          <span className="bar-open" aria-hidden="true">
            <Icon name="chevron" size={18} style={{ transform: 'rotate(180deg)' }} />
          </span>
        </button>
        <ModelPicker models={catalog[kind]} current={model} open={pickerOpen} onPick={pickModel} />

        <div className="row">
          <div className="segwrap" role="group" aria-label="Loại nội dung">
            <button type="button" className="seg" aria-pressed={kind === 'image'} onClick={() => setKind('image')}>
              <Icon name="image" />
              Ảnh
            </button>
            <button type="button" className="seg" aria-pressed={kind === 'video'} onClick={() => setKind('video')}>
              <Icon name="video" />
              Video
            </button>
          </div>
          <button
            type="button"
            className="ghost-icon composer-collapse"
            aria-label="Thu gọn khung tạo"
            onClick={() => {
              setPickerOpen(false);
              onExpandedChange(false);
            }}
          >
            <Icon name="chevron" size={18} />
          </button>
          <span className="row-break" aria-hidden="true" />
          <button
            type="button"
            className="model-btn"
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            onClick={() => setPickerOpen((v) => !v)}
          >
            <span>{model?.name ?? 'Chọn model'}</span>
            <Icon name="chevron" />
          </button>

          {kind === 'video' && model?.frames.start && (
            <div className="row" style={{ gap: 6 }}>
              {draft.start ? (
                <FrameChip
                  label="Start frame"
                  upload={draft.start}
                  onRemove={() => setDraft((d) => ({ ...d, start: null, end: null }))}
                />
              ) : (
                <button type="button" className="dashed" title="Chọn ảnh, hoặc dán ảnh (Ctrl+V) vào ô prompt" onClick={() => openFile('start')}>
                  <Icon name="plus" />
                  Start frame
                </button>
              )}
              {model.frames.end &&
                (draft.end ? (
                  <FrameChip label="End frame" upload={draft.end} onRemove={() => setDraft((d) => ({ ...d, end: null }))} />
                ) : (
                  <button
                    type="button"
                    className="dashed"
                    disabled={!draft.start}
                    title={draft.start ? undefined : 'Thêm Start frame trước'}
                    onClick={() => openFile('end')}
                  >
                    <Icon name="plus" />
                    End frame
                  </button>
                ))}
            </div>
          )}

          {kind === 'image' && model && model.maxReferences > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {draft.refs.map((r, i) => (
                <FrameChip
                  key={r.key}
                  label={draft.refs.length > 1 ? `Reference ${i + 1}` : 'Reference'}
                  upload={r}
                  onRemove={() => setDraft((d) => ({ ...d, refs: d.refs.filter((x) => x.key !== r.key) }))}
                />
              ))}
              {draft.refs.length < model.maxReferences && (
                <button type="button" className="dashed" title="Chọn ảnh, hoặc dán ảnh (Ctrl+V) vào ô prompt" onClick={() => openFile('ref')}>
                  <Icon name="plus" />
                  Reference
                </button>
              )}
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPickFile(slotRef.current, file);
          }}
        />

        <label htmlFor="gaia-prompt" className="sr-only">
          Prompt
        </label>
        <textarea
          id="gaia-prompt"
          ref={textareaRef}
          rows={2}
          maxLength={2000}
          placeholder={kind === 'video' ? 'Mô tả video bạn muốn tạo… (Enter để gửi)' : 'Mô tả ảnh bạn muốn tạo… (Enter để gửi)'}
          value={draft.prompt}
          onChange={(e) => {
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            setDraft((d) => ({ ...d, prompt: el.value }));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          onPaste={(e) => {
            // Dán ảnh (vd "Copy image" trên trình duyệt) → thêm ảnh; dán chữ thì giữ như bình thường.
            const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
            if (!files.length) return;
            e.preventDefault();
            onPasteImages(files);
          }}
        />

        <div className="row-between">
          <div className="row chips" style={{ gap: 6 }}>
            {model &&
              fields.map((f) => (
                <OptionChip
                  key={f}
                  label={FIELD_LABEL[f]}
                  value={sel[f] ?? ''}
                  options={fieldOptions[f] ?? []}
                  onPick={(v) => setField(f, v)}
                />
              ))}
            {kind === 'image' && (
              <OptionChip
                label="Số lượng"
                value={String(draft.quantity)}
                options={QUANTITIES.map((q) => ({
                  value: q,
                  label: q,
                  price: unit != null ? `${fmtNumber(unit * Number(q))} credit` : undefined,
                }))}
                onPick={(v) => setDraft((d) => ({ ...d, quantity: Number(v) }))}
              />
            )}
          </div>
          <div className="row submit-row" style={{ gap: 14 }}>
            {unit == null ? (
              <span className="cost lacking">Tổ hợp này không có giá</span>
            ) : (
              <span className={`cost${lacking ? ' lacking' : ''}`}>
                <Icon name="coin" size={14} />
                {fmtNumber(total!)} credit{qty > 1 ? ` (${qty} × ${fmtNumber(unit)})` : ''}
              </span>
            )}
            {lacking && canTopup && (
              <Link href="/credit" className="link-btn">
                Nạp credit
              </Link>
            )}
            <button type="button" className="submit" disabled={!canSubmit} onClick={onSubmit}>
              {lacking ? 'Không đủ credit' : 'Tạo'}
              {submitting ? <span className="spinner" /> : <Icon name="arrow-right" />}
            </button>
          </div>
        </div>
        {model && !model.available && (
          <div className="notice">
            {model.name}: {model.unavailableReason ?? 'tạm ngưng'}. Bạn chọn model khác nhé.
          </div>
        )}
        {model?.available && endModeBlocked && endModes && (
          <div className="notice hint">
            {model.name} chỉ tạo được Start + End frame ở Mode {modeLabels(model, endModes)}. Bạn đổi Mode hoặc bỏ End frame.
          </div>
        )}
        {model?.available && needsStart && (
          <div className="notice hint">{model.name} cần Start frame để tạo video. Bạn chọn ảnh, hoặc dán ảnh (Ctrl+V) vào ô prompt.</div>
        )}
      </section>
    </div>
  );
}
