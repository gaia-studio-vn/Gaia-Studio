// Kiểu dữ liệu dùng chung giữa server và client.

export type Kind = 'image' | 'video';
export type GenStatus = 'pending' | 'processing' | 'success' | 'error';
// 'upscale' chỉ còn ở vài dòng cũ trong DB (tính năng đã gỡ 2026-10-11); server lọc bỏ khi trả về.
export type GenOp = 'create' | 'edit' | 'upscale';

export interface Option {
  value: string;
  label: string;
}

/** Một dòng bảng giá của model, đã đổi sang credit GAIA. Trường bỏ trống = áp dụng cho mọi giá trị. */
export interface PriceRow {
  mode?: string;
  resolution?: string;
  duration?: string;
  credits: number;
}

export interface CatalogModel {
  id: string; // giá trị gửi vào tham số `model` của Gommo
  name: string;
  kind: Kind;
  available: boolean;
  unavailableReason?: string;
  ratios: Option[];
  resolutions: Option[];
  durations: Option[];
  modes: Option[];
  prices: PriceRow[];
  baseCredits: number;
  modeCredits: Record<string, number>;
  fromCredits: number;
  tags: string[];
  /**
   * `startRequired`: model không tạo được video chỉ từ prompt, phải có Start frame.
   * `endModes`: End frame chỉ chạy ở các mode này (không có = mọi mode).
   */
  frames: { start: boolean; end: boolean; startRequired: boolean; endModes?: string[] };
  maxReferences: number;
  /** Sửa ảnh (gửi kèm ảnh gốc) đã kiểm chứng giữ được ảnh gốc trên model này. */
  edit: boolean;
  daily?: { used: number; max: number };
}

export interface Selection {
  ratio?: string;
  resolution?: string;
  duration?: string;
  mode?: string;
}

export interface MediaRef {
  id: string;
  url: string;
}

export interface GenerationInputs {
  start?: MediaRef;
  end?: MediaRef;
  references?: MediaRef[];
}

export interface GenerationItem {
  id: string;
  kind: Kind;
  op: GenOp;
  rootId: string | null;
  sourceId: string | null;
  model: string;
  modelName: string;
  params: Selection;
  inputs: GenerationInputs;
  prompt: string;
  status: GenStatus;
  url: string | null;
  thumbUrl: string | null;
  errorMessage: string | null;
  credits: number;
  refundedCredits: number;
  createdAt: string;
  finishedAt: string | null;
  /** Lúc chuyển vào Thùng rác (null nếu đang ở thư viện). */
  deletedAt: string | null;
}

/** Một ngày trong thư viện: tổng số mục của ngày đó (theo bộ lọc) và các mục của trang đang xem. */
export interface LibraryDay {
  /** YYYY-MM-DD theo giờ Việt Nam, giống `dayKey()` trong lib/format.ts. */
  day: string;
  total: number;
  page: number;
  items: LibraryItem[];
}

/** Một ô trong thư viện: bản gốc + tóm tắt các phiên bản sửa (chỉ ảnh mới có). */
export interface LibraryItem extends GenerationItem {
  versionCount: number;
  totalCredits: number;
  /** Ảnh hiển thị trên thẻ: phiên bản thành công mới nhất (cũng là bản "Tải về" tải). */
  displayId: string | null;
  displayUrl: string | null;
  displayThumbUrl: string | null;
}

export type LedgerKind = 'topup' | 'use' | 'refund' | 'expire';

export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  delta: number;
  balanceAfter: number;
  title: string;
  detail: string | null;
  createdAt: string;
}

/** Vai trò trong GAIA (lib/access.ts). Chủ nhóm: GAIA_OWNER_EMAIL; quản trị viên/thành viên: bảng gaia_members. */
export type Role = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: Role | null;
}

/** Một dòng ở trang Quản trị: người đã được mời (có thể chưa đăng nhập lần nào). */
export interface AdminMember {
  email: string;
  name: string | null;
  role: Role;
  /** null: được mời nhưng chưa đăng nhập GAIA lần nào (chưa có tài khoản, chưa cấp credit được). */
  userId: string | null;
  balance: number | null;
  invitedAt: string | null;
}

export interface AdminGrant {
  id: number;
  email: string | null;
  name: string | null;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface AdminOverview {
  me: { email: string; role: 'owner' | 'admin' };
  ownerName: string | null;
  /** Số dư thật ở nhà cung cấp (credit Gommo qua 79ai); null nếu không đọc được. */
  providerBalance: number | null;
  /** Tổng credit GAIA còn hạn, chưa dùng, của mọi người. */
  outstanding: number;
  members: AdminMember[];
  grants: AdminGrant[];
}

export interface CreditSummary {
  balance: number;
  /** Lô credit hết hạn sớm nhất còn dư. */
  nextExpiry: { credits: number; expiresAt: string } | null;
}

export interface TopupView {
  orderCode: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  amountVnd: number;
  credits: number;
  bonusCredits: number;
  qrSvg: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  description: string | null;
  checkoutUrl: string | null;
}
