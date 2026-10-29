# Cài đặt GAIA Studio

Code đã viết xong cho cả 7 màn: trang chủ, đăng nhập Google, Studio, chi tiết ảnh, chi tiết video, Credit & nạp tiền. Để chạy thật, cần 3 thứ mà chỉ chủ tài khoản làm được: **Supabase** (đăng nhập + cơ sở dữ liệu), **Google OAuth** (nút "Tiếp tục với Google") và **PayOS** (nạp tiền). Làm theo thứ tự dưới đây.

Mỗi bước ghi rõ cần lấy gì và dán vào đâu. Tên menu trên dashboard của Supabase/Google/PayOS có thể hơi khác tuỳ thời điểm.

---

## Bước 1 — Tạo project Supabase mới

Project Supabase cũ trong `.env` đã chết (tên miền không còn tồn tại, kiểm tra ngày 08/10/2026), nên phải tạo project mới.

1. Vào https://supabase.com/dashboard → **New project**. Gói Free là đủ để chạy thử.
2. Region: chọn **Southeast Asia (Singapore)** cho gần Việt Nam.
3. Đặt mật khẩu database và lưu lại (GAIA không dùng trực tiếp mật khẩu này, nhưng cần khi quản trị).

## Bước 2 — Tạo bảng và hàm credit

1. Trong project → **SQL Editor** → **New query**.
2. Mở file `supabase/migrations/0001_gaia_init.sql`, sao chép **toàn bộ**, dán vào rồi bấm **Run**. Làm tiếp như vậy, lần lượt với `0002_credit_unit_vnd.sql`, `0003_library_days.sql` và `0004_members.sql`.
3. Thấy "Success" là xong. File này tạo bảng thư viện, ví credit (lô 90 ngày, tiêu lô cũ trước), lịch sử giao dịch, đơn nạp tiền, và chặn người dùng tự cộng credit.

> File SQL này đã chạy thử trên Postgres với 34 kiểm thử: trừ, hoàn, hết hạn, nạp tiền, quyền truy cập. Tất cả đều qua.

## Bước 3 — Lấy khoá Supabase điền vào `.env`

Trong project → **Project Settings → API Keys** (và **Data API** để lấy URL):

| Trên dashboard | Dán vào `.env` |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_…`) | `SUPABASE_SECRET_KEY` |

**Secret key tuyệt đối không chia sẻ**: ai có khoá này là đọc/ghi được toàn bộ dữ liệu. Nếu project chỉ có khoá kiểu cũ (`anon` / `service_role`) thì dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`; code nhận cả hai kiểu.

Xem mẫu đầy đủ ở `.env.example`.

## Bước 4 — Bật đăng nhập Google

Hướng dẫn gốc của Supabase: https://supabase.com/docs/guides/auth/social-login/auth-google

1. Vào https://console.cloud.google.com → tạo project (vd "GAIA").
2. **APIs & Services → OAuth consent screen**: điền tên app "GAIA", email hỗ trợ, chọn External.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, loại **Web application**:
   - **Authorized redirect URIs**: `https://<mã-project>.supabase.co/auth/v1/callback`. Mã project nằm trong Project URL ở bước 3.
4. Copy **Client ID** và **Client secret**.
5. Quay lại Supabase → **Authentication → Sign In / Providers → Google** → bật, dán Client ID và Client secret → Save.
6. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (khi có tên miền thật thì đổi thành tên miền đó).
   - **Redirect URLs**: thêm `http://localhost:3000/auth/callback`, sau này thêm `https://<tên-miền>/auth/callback`.

## Bước 5 — Chạy thử trên máy

```bash
cd gaia-studio
npm install
npm run dev
```

Mở http://localhost:3000 → **Đăng nhập** → chọn tài khoản Google. Lần đầu đăng nhập, GAIA tự tạo tài khoản với số dư 0 credit.

**Tặng credit cho chính mình để thử tạo ảnh/video** (khi chưa có PayOS): vào Supabase → SQL Editor, chạy:

```sql
select gaia_grant((select id from auth.users where email = 'email-cua-ban@gmail.com'), 50000, 'Credit dùng thử');
```

> Mỗi lần bấm **Tạo** là gọi Gommo thật và **tốn credit thật** trên tài khoản 79ai.

## Chế độ nhóm riêng (đang dùng từ 21/10/2026)

GAIA hiện chỉ cho bạn và vài người bạn dùng, không bán credit. Đây là mặc định; chỉ khi đặt `GAIA_OPEN_SIGNUP=1` thì ai có tài khoản Google cũng vào được.

- Chỉ chủ nhóm (`GAIA_OWNER_EMAIL` trong `.env`) và những email được mời trên trang **Quản trị** (`/admin`) mới đăng nhập được. Email khác đăng nhập Google xong sẽ bị đăng xuất, kèm thông báo "Email này chưa được mời dùng GAIA".
- Phần Nạp tiền tắt. Trang Credit hiện "Credit do chủ nhóm cấp". Trang đăng nhập dẫn tới **Quy ước dùng chung** (`/rules`) thay cho Điều khoản và Bảo mật.
- `GAIA_MARKUP=1`: credit đúng giá gốc 79ai, không lãi. 1 credit = 1đ, nên giá một lượt tạo bằng đúng số tiền 79ai bị trừ.

**Vai trò** (mở trang Quản trị từ menu tài khoản, góc trên bên phải):

| | Chủ nhóm | Quản trị | Thành viên |
|---|---|---|---|
| Dùng GAIA | Có | Có | Có |
| Mời / gỡ thành viên | Có | Có | Không |
| Thêm / gỡ quản trị viên, đổi vai trò | Có | Không | Không |
| Cấp credit | Có | Không | Không |

Chủ nhóm là email trong `GAIA_OWNER_EMAIL`, không đổi được trên trang Quản trị. Danh sách người được mời nằm trong bảng `gaia_members` (file `0004_members.sql`).

**Thêm một người bạn:**

1. Trang Quản trị → ô **Mời**: nhập email Google của họ, chọn vai trò. Có hiệu lực ngay, không cần deploy lại.
2. Họ đăng nhập GAIA một lần để tạo tài khoản.
3. Chủ nhóm cấp credit ở khung **Cấp credit** (chọn người, chọn số, ghi chú nếu cần).

**Gỡ một người:** trang Quản trị → nút ⋯ ở dòng của họ → **Gỡ quyền dùng GAIA**. Họ bị đăng xuất ở lần tải trang tiếp theo (trên Vercel có thể chậm tối đa 30 giây) và không đăng nhập lại được. Dữ liệu của họ vẫn còn.

Vẫn cấp credit được bằng SQL khi cần (chỉ chủ nhóm nên làm):

```sql
select gaia_grant((select id from auth.users where email = 'email-cua-ban-be@gmail.com'), 50000, 'Chủ nhóm cấp');
```

**Góp chi phí:** nếu bạn bè muốn góp, họ chuyển thẳng cho bạn, đúng giá gốc, không qua web. Thu tiền trên web (PayOS) hoặc cộng lãi thì thành kinh doanh: phải đăng ký hộ kinh doanh và thông báo website (Nghị định 248/2026), và Vercel Hobby không còn dùng được.

**Khi mở bán công khai:** đặt `GAIA_OPEN_SIGNUP=1`, đặt lại `GAIA_MARKUP=1.5`, rồi làm Bước 6 (PayOS) và Bước 7.

## Bước 6 — Bật nạp tiền PayOS

1. Đăng ký tại https://payos.vn, xác minh tài khoản (cá nhân dùng CCCD).
2. Tạo **kênh thanh toán**, liên kết tài khoản ngân hàng nhận tiền.
3. Trong kênh thanh toán, lấy 3 khoá điền vào `.env`: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.
4. **Webhook URL** (cần tên miền công khai, tức là sau khi deploy): `https://<tên-miền>/api/payos/webhook`.

Khi chạy trên máy (chưa có webhook), trang Credit tự hỏi PayOS mỗi 3 giây trong lúc chờ chuyển khoản. Vì vậy credit vẫn được cộng ngay khi tiền về. Webhook là đường thứ hai, phòng khi người dùng đã đóng trang. Credit chỉ được cộng một lần dù cả hai đường cùng báo.

Thử thật trên máy: nạp mốc thấp nhất (20.000đ) bằng chính tài khoản ngân hàng của bạn. Tiền về đúng tài khoản nhận của bạn, nên gần như không tốn gì.

## Bước 7 — Đưa lên mạng (Vercel, chế độ nhóm riêng)

`vercel.json` đã cài sẵn hai thứ:
- Máy chủ chạy ở Singapore (`sin1`), gần Supabase. Mặc định của Vercel là Mỹ, mỗi trang sẽ chậm hơn hẳn.
- Một cron mỗi ngày gọi `/api/cron/daily`: báo lỗi và hoàn credit cho job bị treo khi không ai mở GAIA, đồng thời giữ Supabase gói Free không bị tạm dừng (Supabase tạm dừng project Free nếu 7 ngày ít hoạt động).

Vercel gói Hobby (miễn phí) dùng được vì web không thu tiền. Giới hạn cần biết: mỗi request tối đa 4,5 MB (ảnh tải lên đã được nén JPEG dưới 4 MB), mỗi request chạy tối đa 300 giây, cron tối đa 1 lần/ngày.

1. **Nạp 79ai.** Số dư 79ai là giới hạn thật: hết tiền thì bấm Tạo sẽ báo "GAIA đang tạm dừng nhận yêu cầu tạo mới" (credit GAIA không bị trừ). `GAIA_PROVIDER_RESERVE` (mặc định 0) giữ lại một khoản trong 79ai nếu cần.
2. **Google cho phép bạn bè đăng nhập:** Google Cloud Console → **Google Auth Platform → Audience** (OAuth consent screen). Nếu **Publishing status** là **Testing** thì chỉ email trong danh sách **Test users** đăng nhập được (tối đa 100): thêm email bạn bè vào đó, hoặc bấm **Publish app**. Nút Publish app chỉ bấm được khi trang **Branding** có đủ link trang chủ, chính sách bảo mật và điều khoản (đều trỏ được về `https://<tên>.vercel.app/rules`), nên làm sau khi deploy; logo để trống để không phải xác minh thương hiệu.
3. **Vercel** (https://vercel.com, gói Hobby): **Add New → Project** → import repo GitHub → **Root Directory** để mặc định `./` (repo GitHub chính là thư mục `gaia-studio`) → **Environment Variables**:
   - Chép từ `.env`: `GOMMO_ACCESS_TOKEN`, `GOMMO_DOMAIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GAIA_OWNER_EMAIL`, `GAIA_MARKUP` (=1), `GAIA_COST_PER_GOMMO_CREDIT` (=1), `PROMPT_TRANSLATOR` (=gommo).
   - `CRON_SECRET`: một chuỗi ngẫu nhiên từ 16 ký tự trở lên. Vercel tự gửi kèm khi gọi cron; thiếu biến này thì cron bị từ chối.
   - Không cần các biến `PAYOS_*` và `NEXT_PUBLIC_SITE_URL` (chỉ dùng khi bật nạp tiền).
   - Bấm **Deploy**. Vercel cấp một địa chỉ dạng `https://<tên>.vercel.app`, dùng luôn được, không cần mua tên miền.
4. **Supabase** → **Authentication → URL Configuration**: **Site URL** = địa chỉ Vercel; **Redirect URLs** thêm `https://<tên>.vercel.app/**`.
5. **Thử trên địa chỉ thật:** đăng nhập bằng email của bạn, tạo một ảnh rẻ, tải về một video, rồi thử đăng nhập bằng một email chưa mời (phải bị chặn). Ở Vercel → **Settings → Cron Jobs** có nút chạy thử cron và xem log.
6. **Mời bạn bè:** trên trang Quản trị của địa chỉ thật, xem mục "Chế độ nhóm riêng" ở trên.

**Khi mở bán công khai (sau này):**

1. Đăng ký hộ kinh doanh và thông báo website theo Nghị định 248/2026 trước khi bật nạp tiền.
2. Đổi sang Vercel Pro ($20/tháng) hoặc nơi host khác cho phép thu tiền: Vercel tính là thương mại khi web có "requesting or processing payment from visitors" (https://vercel.com/docs/limits/fair-use-guidelines).
3. Đặt `GAIA_OPEN_SIGNUP=1`, `GAIA_MARKUP=1.5`, khai báo `PAYOS_*` và `NEXT_PUBLIC_SITE_URL`, thêm **Webhook URL** của PayOS (bước 6).
4. `GAIA_TOPUP_MIN_PROVIDER_BALANCE`: số dư 79ai dưới mức này thì tạm dừng nạp credit, để không ai trả tiền mà không tạo được gì. Mặc định 0 (tắt); khi mở thật nên đặt, ví dụ `100000`. Tiền người dùng nạp vào GAIA không tự chuyển sang 79ai; bạn tự lấy doanh thu nạp vào đó.
5. Điền trang Điều khoản và Bảo mật: sửa `lib/legal.ts` (tên người vận hành, email hỗ trợ, độ tuổi), chốt các mục trong ngoặc vuông ở `app/terms/page.tsx` và `app/privacy/page.tsx`, rồi đặt `draft: false`.

---

## Đã kiểm chứng (10/10/2026)

Lượt tạo 9 ảnh/video mẫu cho trang chủ (5 ảnh Nano Banana 2 1k, 4 video VEO 3.1 Fast 720p 8s, gọi thẳng Gommo, không qua ví GAIA):

- **Giá thật Gommo trừ đúng bằng bảng giá** `/ai/models` và bằng `credit`/`credit_fee` Gommo trả về: số dư 191.600 → 184.800, trừ đúng 6.800 = 5 × 400 + 4 × 1.200. Vì vậy bật `GAIA_SETTLE_ACTUAL_COST=1` là an toàn (hiện chưa bật).
- **Gommo không trả prompt đã dịch** khi gửi `translate_to_en`: cả lúc gửi lẫn lúc xong, `prompt` vẫn là câu tiếng Việt gốc. `prompt_sent` vì thế sẽ để trống.
- Thời gian: ảnh xong sau khoảng 35–75 giây, video VEO 3.1 Fast sau khoảng 2,5–3 phút.

Lượt bạn kiểm thử trong app (11/10/2026) xác nhận thêm:

- Ảnh tham chiếu (`subjects`) gửi đúng định dạng: model dùng đúng người/đồ vật trong ảnh.
- Đóng tab trong lúc đang tạo thì ảnh vẫn tạo xong.
- Sửa ảnh tốn bằng tạo ảnh (Nano Banana 2 1K = 400 credit Gommo).

**Upscale đã gỡ khỏi GAIA (11/10/2026).** Công cụ upscale của Gommo báo lỗi "Upload ảnh thất bại (HTTP 401)" và một lần còn trừ 200 credit mà không trả ảnh. Sau này GAIA sẽ tự làm tính năng này.

## Những điều chưa kiểm chứng

1. **Ảnh khung (Start/End frame) của video** gửi sang Gommo. Code dùng chung định dạng với ảnh tham chiếu (đã chạy đúng), nhưng chưa thử với video. Nếu sai thì sửa hàm `toGommoImageRefs` trong `lib/gommo.ts`.

## Tuỳ chỉnh nhanh

- **Model được bán, sắp xếp model, model trên trang chủ**: `VERIFIED_MODELS` (danh sách trắng: chỉ model và chức năng đã kiểm thử mới hiện), `MODEL_ORDER`, `FEATURED_MODELS` trong `lib/models.server.ts`.
- **Tỉ lệ lời / giá vốn**: `GAIA_MARKUP`, `GAIA_COST_PER_GOMMO_CREDIT` trong `.env`.
- **Mốc nạp, thưởng, hạn dùng**: `lib/topup-rules.ts`. Nếu đổi số ngày hết hạn thì sửa cả `interval '90 days'` trong file SQL.
- **Ý tưởng gợi ý** (Studio lần đầu và cột "Thử một ý tưởng" ở trang chủ): `lib/suggestions.ts`.
- **Ảnh/video mẫu**: đặt file vào `public/samples/` rồi điền `sample` cho đúng gợi ý trong `lib/suggestions.ts`. Chỉ dùng kết quả thật tạo bằng GAIA từ đúng prompt đó. Có mẫu thì thẻ gợi ý hiện ảnh, và trang chủ tự hiện mục "Tạo bằng GAIA".
- **Điều khoản / Chính sách bảo mật**: `app/terms/page.tsx`, `app/privacy/page.tsx`. Hiện đang là chỗ trống chờ nội dung.
