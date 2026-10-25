# Cùng làm GAIA Studio (25/10/2026)

Tài liệu cho người cùng phát triển GAIA với chủ dự án (Đỗ Hiếu Nghĩa). Đọc file này trước, rồi tới [CLAUDE.md](CLAUDE.md).

Trang **Quản trị** (`/admin`, trong menu tài khoản): chủ nhóm và quản trị viên mời/gỡ người dùng bằng tài khoản Google của mình; chỉ chủ nhóm cấp credit và thêm quản trị viên.

## GAIA là gì, đang ở đâu

GAIA Studio là web app tạo ảnh và video bằng AI, gõ prompt tiếng Việt. Phía sau, GAIA gọi API của **Gommo** qua tài khoản **79ai** của chủ dự án.

**Chế độ hiện tại: nhóm riêng** (chọn ngày 21/10/2026). GAIA chỉ dành cho chủ dự án và vài người bạn được mời, không bán credit:
- Chỉ chủ nhóm (`GAIA_OWNER_EMAIL`) và người được mời trên trang Quản trị mới đăng nhập được.
- Chủ nhóm cấp credit bằng SQL (`gaia_grant`). 1 credit = 1đ chi phí 79ai, không cộng lãi.
- Trang "Quy ước dùng chung" (`/rules`) thay cho Điều khoản/Bảo mật.

Chi tiết và lý do (pháp lý): [CLAUDE.md](CLAUDE.md), mục "Private group mode", và [SETUP.md](SETUP.md), mục "Chế độ nhóm riêng".

**Đã chạy được trên máy (localhost):**
- Đăng nhập Google theo danh sách mời.
- Tạo ảnh và sửa ảnh (nhiều bản cùng lúc).
- Tạo video từ prompt, Start frame hoặc Start + End frame.
- Thư viện gom theo ngày, mỗi ngày 8 mục một trang. Thùng rác 30 ngày, chọn nhiều để xoá/khôi phục.
- Ví credit có hạn 90 ngày, tự hoàn credit khi tạo lỗi.

**Chưa có:**
- Bản chạy thật trên mạng. Code đã sẵn cho Vercel gói miễn phí; các bước ở [SETUP.md](SETUP.md), Bước 7.
- PayOS và Điều khoản/Bảo mật đã có code và bản nháp, để dành khi nào mở bán công khai.

## Chạy trên máy

1. Cài **Node.js 24** và git, rồi `git clone https://github.com/gaia-studio-vn/Gaia-Studio.git`. Repo nằm trong Organization `gaia-studio-vn` (chuyển từ `dohieunghia2002/Gaia-Studio` ngày 25/10/2026; địa chỉ cũ tự chuyển hướng). Push bằng tài khoản GitHub của bạn; nhớ chấp nhận lời mời vào Organization.
2. `npm install`
3. Lấy file **`gaia-studio.env`** trong thư mục bí mật chủ dự án gửi riêng (không có trên GitHub), đặt vào thư mục gốc repo và đổi tên thành **`.env`**.
4. `npm run dev`, rồi mở http://localhost:3000 và đăng nhập Google bằng email đã được mời (Bằng: quản trị viên).
5. Tài khoản mới có 0 credit. Cấp credit bằng SQL trong Supabase:

```sql
select gaia_grant((select id from auth.users where email = 'email@gmail.com'), 50000, 'Credit dùng thử');
```

**Lưu ý khi chạy:**
- **Dùng chung database và tài khoản 79ai với chủ dự án.**
  - Mỗi lần bấm Tạo là tiêu tiền thật ở 79ai.
  - Dữ liệu bạn tạo nằm chung database thật.
  - Số dư 79ai đang thấp (khoảng 2.750 ngày 24/10). Hết tiền thì GAIA báo "GAIA đang tạm dừng nhận yêu cầu tạo mới".
- **Không chạy `npm run build` khi `npm run dev` đang chạy.** Hai lệnh dùng chung thư mục `.next`; build chen ngang sẽ làm mọi trang báo 404. Nếu đã lỡ: tắt dev, xoá thư mục `.next`, chạy lại `npm run dev`. Trên Windows, đọc cảnh báo về `.next` trong [CLAUDE.md](CLAUDE.md) trước khi xoá.
- **Đăng nhập Google** chỉ chạy ở đúng `http://localhost:3000`. Nếu app Google (Google Cloud → Google Auth Platform → Audience) đang ở chế độ Testing, email phải có trong danh sách Test users.
- **Đổi database:** các file trong `supabase/migrations/` (0001 → 0003) đã chạy trên Supabase. File SQL mới phải chạy tay trong SQL Editor. Vì database dùng chung, báo chủ dự án trước khi chạy.
- Lần đầu mở mỗi trang sau khi bật dev sẽ chậm vài giây vì phải biên dịch.

## Làm việc chung trên GitHub

- Trước khi làm: `git pull`. Commit nhỏ và push thường xuyên lên `main`, giống cách chủ dự án đang làm.
- Hai người sửa cùng một file lớn (vd. `components/studio/StudioApp.tsx`) thì báo nhau trước để tránh xung đột.
- Repo **PUBLIC**: không bao giờ commit `.env`, file `client_secret_*` hay khoá nào. Xem lại diff trước mỗi lần push.
- Trước khi push: `npm run typecheck` và `npm run lint` phải sạch.

## Bắt đầu với Claude Code

Mở Claude Code trong thư mục repo và dán nguyên đoạn dưới đây. **Không cần chạy `/init`**: Claude Code tự đọc [CLAUDE.md](CLAUDE.md) có sẵn, còn `/init` có thể ghi đè file này.

```text
Mình là Lê Hữu Bằng, cùng phát triển GAIA Studio với chủ dự án (Đỗ Hiếu Nghĩa). Hãy tìm hiểu dự án trước khi làm bất cứ việc gì:

1. Đọc theo thứ tự: HANDOFF.md, CLAUDE.md, AGENTS.md, SETUP.md, docs/gommo-api.md. CLAUDE.md là nguồn mới nhất về kiến trúc và quyết định kỹ thuật. Thư mục docs/claude-memory/ là ghi chú cũ chụp ngày 12/10/2026: dùng để hiểu bối cảnh, nhưng chỗ nào khác CLAUDE.md/HANDOFF.md thì theo hai file đó.
2. Kiểm tra máy mình, không gọi API nào tốn tiền: đã có file .env chưa, rồi chạy npm install, npm run typecheck, npm run lint.
3. Tóm tắt lại cho mình bằng tiếng Việt: sản phẩm là gì, kiến trúc chính, trạng thái hiện tại, các việc còn dở, và những điều bạn chưa rõ cần hỏi mình.
4. Lưu những điều cần nhớ lâu dài vào memory của bạn: quy ước giao diện, những điều đã kiểm chứng về Gommo, và các quy tắc dưới đây.

Quy tắc bắt buộc:
- KHÔNG gọi API tạo ảnh/video của Gommo, cũng không bấm Tạo trong app, khi mình chưa đồng ý rõ ràng. Mỗi lần là tiền thật.
- Database Supabase là database thật, dùng chung: không chạy SQL thay đổi dữ liệu hay cấu trúc khi mình chưa đồng ý.
- Repo đang PUBLIC: không bao giờ commit .env, file client_secret hay bất kỳ khoá nào; quét diff trước mỗi lần push.
- Không chạy npm run build khi npm run dev đang chạy (hỏng thư mục .next, mọi trang báo 404).
- Next.js 16 khác với kiến thức cũ của bạn: đọc tài liệu trong node_modules/next/dist/docs trước khi viết code Next.
- Chữ trên giao diện bằng tiếng Việt, thuật ngữ creator giữ tiếng Anh; không hứa điều Gommo chưa hỗ trợ; đổi thiết kế thì sửa cả mockup trong design/mockup-gaia.

Ở bước này chưa sửa code: chỉ đọc, kiểm tra rồi báo lại cho mình.
```

## Tài khoản dùng cho dự án

GAIA có hai quản trị viên là Nghĩa (chủ nhóm) và Bằng. Mỗi người dùng tài khoản riêng của mình, trừ việc trả tiền: chỉ chủ nhóm nạp tiền 79ai và cấp credit.

| Dịch vụ | Cách dùng | Để làm gì |
|---|---|---|
| GitHub (Organization `gaia-studio-vn`) | Tài khoản riêng của mỗi người, cả hai là Owner của Organization | Đẩy code, quản lý repo |
| Supabase project `ynifiicggklbnszvjjkb` | Chủ nhóm mời email của Bằng vào Organization (vai trò Administrator) | Database, đăng nhập, xem log, chạy SQL |
| Google Cloud (OAuth client của GAIA) | Chủ nhóm thêm tài khoản Google của Bằng trong IAM | Cấu hình đăng nhập Google, Test users, thêm địa chỉ khi deploy |
| 79ai / Gommo | Chỉ chủ nhóm | Nạp tiền. Token API nằm trong `.env`, nên chạy app trên máy vẫn tiêu tiền 79ai thật |
| Vercel (khi tạo) | Project của chủ nhóm, gói miễn phí | Theo tài liệu Vercel, repo công khai được cộng tác miễn phí: ai push lên `main` thì Vercel tự deploy (sẽ thử thật lần deploy đầu). Trang quản lý Vercel (biến môi trường, log) trên gói miễn phí chỉ có 1 người |

Các khoá bí mật (`.env`, Google client secret) chủ nhóm gửi riêng, kèm file `DOC-TRUOC.txt` hướng dẫn và cách đổi khoá nếu lộ.

## Tài liệu trong repo

| File / thư mục | Nội dung |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Kiến trúc code và các quyết định kỹ thuật, **mới nhất, đọc đầu tiên** (tiếng Anh) |
| [SETUP.md](SETUP.md) | Cài Supabase, Google từ đầu; chế độ nhóm riêng (thêm bạn, cấp credit); các bước deploy Vercel |
| [docs/gommo-api.md](docs/gommo-api.md) | Tài liệu API Gommo và những điều đã kiểm chứng |
| [docs/qa/](docs/qa/) | Kết quả kiểm thử vòng 1 (tạo ảnh) và vòng 2 (hệ thống) |
| [design/mockup-gaia/](design/mockup-gaia/) | Mockup: mở `GAIA-Studio-mockup.html` bằng trình duyệt; các màn hình `#studio`, `#empty`, `#edit`, `#video`, `#home`, `#auth`, `#credit`. Giao diện app được dựng theo file này |
| [design/logo/](design/logo/) | Logo: `final/gaia-mark.svg` là bản gốc |
| [docs/claude-memory/](docs/claude-memory/) | Ghi chú làm việc của Claude, **chụp ngày 12/10/2026, đã cũ** (vd. đơn vị credit cũ). Chỗ nào khác thì theo CLAUDE.md |

## Quy ước sản phẩm cần giữ

- Chữ trên giao diện bằng tiếng Việt. Thuật ngữ creator giữ tiếng Anh: prompt, model, frame, reference, credit…
- Không đưa lên giao diện tính năng, ước tính thời gian hay lời hứa nào mà Gommo chưa thật sự hỗ trợ.
- Nút nào tốn credit cũng hiện giá ngay cạnh nút. Tạo lỗi thì hoàn credit và ghi rõ "Đã hoàn X credit".
- Không nhắc tên Gommo hay 79ai trên giao diện.
- Thư viện dạng lưới đều ô (không masonry), tối đa 4 cột; ảnh luôn hiển thị trọn khung, không cắt.
- Model chỉ được bán sau khi đã chạy thử thật qua GAIA và xem kết quả bằng mắt (`VERIFIED_MODELS` trong `lib/models.server.ts`).
- Đổi thiết kế thì sửa cả mockup ([design/mockup-gaia](design/mockup-gaia/)) lẫn app cho khớp.

## Việc còn dở, theo thứ tự nên làm

1. **Nạp tiền 79ai** (chủ dự án). Số dư thấp thì không tạo được gì.
2. **Deploy lên Vercel** theo [SETUP.md](SETUP.md), Bước 7. Code đã sẵn: máy chủ ở Singapore, cron mỗi ngày, ảnh tải lên nén dưới 4 MB. Cần:
   - kiểm tra chế độ Testing của app Google;
   - điền địa chỉ Vercel vào Supabase.
3. **Kiểm tra sau khi deploy:**
   - tải video về qua Vercel;
   - Gommo có nhận yêu cầu từ máy chủ Vercel không;
   - giao diện trên điện thoại (chưa kiểm tra lại sau các thay đổi gần đây).
4. **Tuỳ chọn:** trang quản trị trong app (thêm email được mời, cấp credit bằng nút bấm) thay cho sửa biến môi trường và chạy SQL.
5. **Mockup** chưa có chip ảnh khung mới (chữ "đã cắt 16:9" và khung xem trước khi bấm vào hình thu nhỏ).
6. **Luật Trí tuệ nhân tạo 2025:** ảnh/video do GAIA tạo chưa được đánh dấu dạng máy đọc được. Rủi ro thấp khi dùng trong nhóm riêng; cần xem lại trước khi mở công khai.

## Những điều về Gommo đã học được (dễ vấp)

- **Cờ khả năng của model không đáng tin.** Ví dụ: Kling 2.5 báo tạo được từ prompt thuần nhưng thực tế bắt buộc có Start frame; Start + End frame của Kling 2.5 chỉ chạy ở Mode Professional. GAIA xử lý bằng `START_FRAME_REQUIRED` và `END_FRAME_MODES` trong `lib/models.server.ts`.
- **"Thành công" chưa chắc đã đúng.** Một số model báo SUCCESS nhưng vẽ ảnh khác hẳn, bỏ qua ảnh gốc. Luôn xem kết quả bằng mắt trước khi mở bán một model.
- **Video Veo đôi khi bị Google chặn** (`#vid_policy`), kể cả khi cùng ảnh và prompt lần sau lại chạy được. Gommo tự hoàn tiền, GAIA tự hoàn credit.
- Ảnh khung khác tỉ lệ video sẽ bị chèn viền đen, nên GAIA tự cắt ảnh khung trên trình duyệt.
- Kiểm tra số tiền thật đã bị trừ (miễn phí): `POST /api/apps/go-mmo/users/paymentsHistory` với `currency_name=credits_ai`.

## Liên kết chỉ chủ dự án mở được

Các trang trên claude.ai dưới đây là riêng tư; nội dung chính đã được sao vào repo:
- Bảng kiểm thử vòng 1: https://claude.ai/artifact/6V1FGJZQBgn2RN9gkKzyTo → [docs/qa/vong-1-tao-anh.md](docs/qa/vong-1-tao-anh.md)
- Bảng kiểm thử vòng 2: https://claude.ai/artifact/GLEQL5BL9Px7gobtFFwvng → [docs/qa/vong-2-he-thong.md](docs/qa/vong-2-he-thong.md)
