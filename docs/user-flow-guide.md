# Hướng dẫn luồng thao tác trên giao diện panelXERP

Tài liệu này đi theo đúng đường đi của một đơn hàng tủ điện qua hệ thống: từ lúc khách hỏi giá đến lúc xưởng làm xong tủ. Mỗi bước ghi rõ ai làm, vào màn hình nào, bấm nút gì và hệ thống tự làm gì sau đó.

Phạm vi: các giai đoạn đã hoàn thành P1 (bán hàng), P2 (mua hàng và kho) và P3 (sản xuất). QC, giao hàng, kế toán và báo cáo (P4–P6) chưa làm.

---

## 1. Toàn cảnh

```text
 Khách hàng ─► Yêu cầu báo giá ─► Dự toán ─► Báo giá ─► Đơn hàng
  (Sales)        (Sales)          (Kỹ sư)    (Sales,    (Sales)
                                              QL duyệt)    │
                                                           ├─► Kho tự giữ vật tư sẵn có
                                                           ├─► Thiếu vật tư ─► Đề nghị mua ─► Đơn mua (PO) ─► Duyệt ─► Nhập kho
                                                           │                  (Mua hàng)      (Mua hàng)    (GĐ)     (Thủ kho)
                                                           └─► Lệnh sản xuất ─► Phát hành ─► 6 công đoạn / tủ ─► Hoàn thành
                                                               (QL sản xuất)                 (Kỹ thuật viên)
                                                                          ▲
                                                           Xuất kho cho xưởng (Thủ kho)
```

| Bước | Chứng từ | Mã | Người làm chính |
|---|---|---|---|
| 1 | Khách hàng, Công trình | `KH_0001`, `DA_0001` | Sales |
| 2 | Yêu cầu báo giá | `YC_2026_0001` | Sales |
| 3 | Dự toán | `DT_2026_0001` | Kỹ sư được phân công |
| 4 | Báo giá | `03-08092026/BG` | Sales soạn, Trưởng phòng KD / Giám đốc duyệt |
| 5 | Đơn hàng | `DH_2026_0001` | Sales |
| 6 | Đề nghị mua → Đơn mua → Phiếu nhập | `PR_…`, `PO_…`, `NK_…` | Mua hàng, Giám đốc, Thủ kho |
| 7 | Phiếu xuất kho / nhập trả | `XK_…`, `NT_…` | Thủ kho |
| 8 | Lệnh sản xuất, tủ | `LSX_2026_0001`, `MSB-01-1` | QL sản xuất, Kỹ thuật viên |

Mã chứng từ dạng `XX_YYYY_NNNN` được đánh số lại từ `0001` mỗi năm. Riêng mã báo giá đánh số theo ngày.

---

## 2. Trước khi bắt đầu

### 2.1 Tài khoản demo

Môi trường dev và demo có sẵn các tài khoản dưới đây (đều ở `@example.com`). Mật khẩu là giá trị `SEED_ADMIN_PASSWORD` trong file `.env`; hỏi người quản trị nếu chưa có. Môi trường production chỉ có `admin`.

| Vai trò | Đăng nhập (username hoặc email) | Thấy dữ liệu nào |
|---|---|---|
| Quản trị (admin) | `admin` | Tất cả |
| Giám đốc (director) | `director` | Tất cả |
| Trưởng phòng KD (salesManager) | `sales_mgr` / `sales.mgr@…` | Tất cả |
| Sales | `sales_a`, `sales_b` | Chỉ khách và chứng từ mình phụ trách |
| Trưởng kỹ thuật (engineeringLead) | `eng_lead` / `eng.lead@…` | Tất cả |
| Kỹ sư (engineer) | `engineer_a`, `engineer_b` | Chỉ yêu cầu và dự toán được giao |
| Mua hàng (purchasing) | `purchasing` | Vật tư, kho, mua hàng |
| Thủ kho (storekeeper) | `storekeeper` | Vật tư, kho (không thấy giá mua) |
| QL sản xuất (productionManager) | `production_manager` / `production.manager@…` | Vật tư, sản xuất (không thấy giá) |
| Kỹ thuật viên (technician) | `technician_a`, `technician_b` | Chỉ các tủ được giao |

Mở một bản ghi nằm ngoài phạm vi của mình sẽ thấy trang "không tìm thấy" (404). Đó là cố ý: hệ thống không tiết lộ rằng bản ghi đó có tồn tại.

### 2.2 Giao diện chung

- **Đăng nhập** tại `/login`. Ô "Tên đăng nhập / Email" nhận cả hai dạng. Phiên làm việc kéo dài 8 giờ. Quên mật khẩu thì dùng link "Quên mật khẩu?".
- **Trang chủ** không có dashboard. Sau khi đăng nhập, hệ thống tự chuyển tới màn hình đầu tiên trên sidebar mà bạn có quyền.
- **Sidebar** chia nhóm theo thứ tự: Khách hàng → Danh mục → Bán hàng → Mua hàng & Kho → Sản xuất. Mục nào bạn không có quyền xem sẽ bị ẩn. Có ô "Tìm chức năng…" và nút ghim mục hay dùng.
- **Menu tài khoản** (avatar góc trên): Hồ Sơ, Ngôn Ngữ, Đăng Xuất. Admin thấy thêm "Quản lý người dùng" và "Phân quyền".
- **Chuông thông báo** trên header: bấm một dòng để mở đúng chứng từ. Thông báo không tự cập nhật theo thời gian thực; số đếm mới sẽ hiện khi bạn quay lại tab hoặc tải lại trang.

### 2.3 Dữ liệu nền cần có

Trước khi chạy luồng bán hàng, cần có sẵn:

1. **Vật tư** (Danh mục › Vật tư thiết bị): làm bởi admin, director, engineeringLead hoặc purchasing.
   - Bấm "Thêm vật tư". Nhập Mã hàng (gõ tay, không trùng), Tên vật tư, Nhóm, Đơn vị tính. Giá tham khảo nên nhập, vì dự toán lấy giá này làm đơn giá vốn mặc định.
   - Có thể nhập hàng loạt bằng "Import Excel" (bấm "Tải tệp mẫu" trước để lấy file mẫu).
   - Phần "Kho" trong form gồm Mã vạch, Vị trí mặc định, Tồn tối thiểu. Thủ kho cũng sửa được phần này.
2. **Vị trí kho** (Danh mục › Vị trí kho): admin hoặc thủ kho bấm "Thêm vị trí", nhập Mã vị trí (ví dụ `A-01-02`) và Tên vị trí.
3. **Nhà cung cấp** (Mua hàng & Kho › Nhà cung cấp): admin, director hoặc purchasing bấm "Thêm nhà cung cấp", nhập Mã (ví dụ `NCC_0001`) và Tên.

---

## 3. Bán hàng

### 3.1 Tạo khách hàng và công trình (Sales)

1. Vào **Khách hàng › Danh sách khách hàng**, bấm **"Thêm khách hàng"**.
   - Bắt buộc: Mã khách hàng (tự sinh `KH_0001`, sửa được) và Tên khách hàng.
   - "Nhân viên phụ trách" mặc định là bạn. Chỉ Trưởng phòng KD, Giám đốc và admin đổi được người phụ trách. Khi đổi, mọi yêu cầu, báo giá và đơn hàng của khách chuyển theo người mới.
2. Mở chi tiết khách hàng, bấm **"Thêm người liên hệ"**. Có thể đánh dấu "Người liên hệ chính"; mỗi khách chỉ có một người chính.
3. Vào **Khách hàng › Công trình**, bấm **"Thêm công trình"**: chọn Khách hàng, nhập Tên công trình (mã `DA_0001` tự sinh).

Khách hàng hoặc công trình đã dùng trong chứng từ bán hàng thì không xoá được.

### 3.2 Yêu cầu báo giá (Sales → Phân công kỹ sư)

1. **Bán hàng › Yêu cầu báo giá**, bấm **"Tạo yêu cầu"**.
   - Bắt buộc: Khách hàng và Tiêu đề.
   - Tuỳ chọn: Công trình, Người liên hệ (phải thuộc khách đã chọn), Yêu cầu kỹ thuật, Ngày khách cần hàng, Hạn báo giá.
   - Kết quả: mã `YC_…`, trạng thái **Nháp**.
2. Trong chi tiết yêu cầu, mục "Tài liệu đính kèm" → **"Chọn tệp"** để đính kèm bản vẽ (pdf, dwg, dxf, xlsx, png, jpg; tối đa 20 MB/tệp, 20 tệp).
3. Bấm **"Phân công"**, chọn một kỹ sư → **"Xác nhận"**. Yêu cầu chuyển **Đã phân công**, kỹ sư nhận thông báo. Có thể "Đổi kỹ sư" cho đến khi dự toán được gửi.

Trạng thái của yêu cầu chạy theo luồng:

```text
Nháp → Đã phân công → Đang dự toán → Đã dự toán → Đã báo giá → Thắng thầu
                                                   └──────────► Thất bại / Đã hủy
```

- **"Hủy yêu cầu"** (cần lý do): dùng được từ Nháp đến Đã dự toán.
- **"Đánh dấu thất bại"** (cần lý do): khi Đã dự toán hoặc Đã báo giá.
- Huỷ yêu cầu hoặc đánh dấu thất bại sẽ huỷ luôn báo giá đang mở. Riêng khi báo giá đã "Khách đã xác nhận" thì không đóng yêu cầu được nữa.

### 3.3 Dự toán (Kỹ sư được giao)

Chỉ kỹ sư được giao hoặc Trưởng kỹ thuật được sửa dự toán. Admin và Giám đốc chỉ xem được.

1. Đăng nhập bằng tài khoản kỹ sư, mở yêu cầu đã được giao, bấm **"Tạo dự toán"**. Mã `DT_…`, bản #1 ở trạng thái **Nháp**; yêu cầu chuyển **Đang dự toán**.
2. **"Thêm tủ"**: nhập Ký hiệu tủ (ví dụ `MSB-01`), Mô tả, Số lượng tủ.
3. Trong từng tủ:
   - "Vật tư của tủ" → chọn vật tư, nhập số lượng. Đơn giá vốn lấy sẵn từ Giá tham khảo.
   - "Chi phí khác của tủ" → "Thêm chi phí" (Thiết kế / Nhân công / Lắp đặt / Vận chuyển / Khác), tính cho 1 tủ.
   - Cột Tồn kho / Khả dụng / Thiếu cho biết kho đang có bao nhiêu.
4. Kiểm tra mục "Tổng hợp", rồi bấm **"Gửi dự toán"**. Mỗi tủ cần có ít nhất một vật tư.
   - Bản vừa gửi bị khoá, không sửa được nữa. Yêu cầu chuyển **Đã dự toán**, sales nhận thông báo.
5. Cần sửa lại thì bấm **"Lập bản mới"** để chép thành bản #2 ở trạng thái Nháp; bản cũ chuyển "Đã thay thế". Khi yêu cầu đã **Đã báo giá** thì không lập bản mới được nữa.

### 3.4 Báo giá (Sales soạn → Quản lý duyệt)

1. Có hai cách tạo báo giá cho một yêu cầu đang **Đã dự toán**:
   - Mở yêu cầu, ở mục Báo giá bấm **"Tạo báo giá"**.
   - Hoặc vào **Bán hàng › Báo giá** → **"Tạo báo giá"** → chọn yêu cầu.

   Kết quả: số báo giá dạng `NN-ddmmyyyy/BG`, phiên bản 1 ở trạng thái **Nháp**. Dữ liệu chép từ bản dự toán đã gửi mới nhất. Mặc định VAT 8%, có sẵn 5 điều khoản.
2. Định giá:
   - Nhập biên lợi nhuận cho từng tủ. Đơn giá tủ = giá vốn × (1 + biên lợi nhuận %).
   - Chọn chiết khấu (theo % hoặc theo số tiền) và VAT (0/5/8/10%).
   - Bấm **"Lưu giá"**. Sửa điều khoản rồi bấm **"Lưu điều khoản"**.
3. Bấm **"Gửi duyệt"** → **"Xác nhận gửi duyệt"**. Báo giá chuyển **Chờ duyệt**; Trưởng phòng KD, Giám đốc và admin nhận thông báo.
   - Nếu kỹ sư vừa gửi một bản dự toán mới hơn, hệ thống chặn gửi duyệt. Bấm **"Cập nhật từ dự toán mới nhất"** trước.
4. Người duyệt (Trưởng phòng KD, Giám đốc hoặc admin) **không được là người tạo hoặc người sửa báo giá đó** (nguyên tắc 4 mắt):
   - **"Duyệt"** → **Đã duyệt**. Lần duyệt đầu tiên chuyển yêu cầu sang **Đã báo giá**.
   - **"Từ chối"** (cần lý do) → **Bị từ chối**. Sales nhận thông báo kèm lý do.
5. Khi báo giá đã duyệt, bấm **"Tải Excel"** hoặc **"Tải PDF"** để gửi khách.
6. Ghi lại phản hồi của khách ở mục "Phản hồi của khách hàng" → **"Ghi nhận phản hồi"** (Ngày, Kênh, Nội dung).
7. Khi khách đồng ý, bấm **"Khách đã xác nhận"**. Bước này chưa tạo đơn hàng; nó chỉ mở nút chuyển thành đơn ở bước 3.5.

Muốn sửa một báo giá đã gửi duyệt, đã duyệt hay bị từ chối thì bấm **"Tạo phiên bản mới"**. Bản cũ chuyển **Đã đóng**, bản mới là **Nháp** và phải đi lại vòng duyệt. **"Hủy báo giá"** (cần lý do) đưa yêu cầu về **Thất bại**.

### 3.5 Đơn hàng (Sales)

1. Trên trang báo giá ở trạng thái **Khách đã xác nhận**, mục "Đơn hàng" → **"Chuyển thành đơn hàng"**. Có thể nhập ngay Số hợp đồng, Ngày hợp đồng, Ngày giao hàng.
2. Kết quả: mã `DH_…`, trạng thái **Đang mở**. Mỗi báo giá chỉ chuyển thành đơn một lần. Hệ thống tự động:
   - chuyển yêu cầu sang **Thắng thầu**;
   - **giữ vật tư đang có trong kho** cho đơn này;
   - nếu đơn còn thiếu vật tư, gửi thông báo cho Mua hàng, QL sản xuất và sales phụ trách;
   - báo cho Trưởng phòng KD, Giám đốc và admin là có đơn mới.
3. Khi đơn còn **Đang mở**, sửa mục "Hợp đồng và giao hàng" rồi bấm "Lưu".
4. Trang đơn hàng có hai nút dẫn sang các khâu sau:
   - **"Vật tư"**: mở màn hình Vật tư đơn hàng (mục 4.1).
   - **"Sản xuất"**: mở danh sách lệnh sản xuất của đơn (mục 5).

Trạng thái đơn: **Đang mở** → **Đang sản xuất** (khi lệnh sản xuất được phát hành) → *Đã giao / Hoàn thành* (chưa có luồng, thuộc P4).

**"Hủy đơn hàng"** chỉ dùng được khi đơn Đang mở; cần lý do; chỉ Trưởng phòng KD, Giám đốc và admin. Nếu đơn còn lệnh sản xuất chưa huỷ, phải huỷ lệnh đó trước. Huỷ đơn sẽ trả lại vật tư đã giữ và chuyển yêu cầu sang **Thất bại**.

---

## 4. Mua hàng và kho

### 4.1 Xem vật tư của một đơn

**Mua hàng & Kho › Vật tư đơn hàng** liệt kê các đơn. Mở một đơn để xem từng vật tư với các cột:

- **Nhu cầu**: tổng cần theo BOM.
- **Đã giữ**: kho đã dành riêng cho đơn này.
- **Đã xuất**: đã giao xuống xưởng.
- **Đã trả lại**: xưởng đã trả về kho.
- **Còn thiếu**: phần kho chưa có.

Khu nút "Kho" trên màn hình này gồm: **"Xuất kho"**, **"Nhập trả từ xưởng"**, **"Tạo đề nghị mua"** (khi có dòng Còn thiếu) và **"Tạo lệnh sản xuất"**.

Khi kho có hàng mới, hệ thống chia cho các đơn theo thứ tự ưu tiên: đơn được chỉ định trước, rồi đơn có ngày giao sớm hơn, rồi đơn tạo trước.

### 4.2 Đề nghị mua (Mua hàng, Kỹ sư, Thủ kho)

Có hai cách lập đề nghị mua:

- **Tự động từ đơn:** trên trang Vật tư đơn hàng bấm **"Tạo đề nghị mua"**. Hệ thống tính số lượng = phần thiếu − phần đã đề nghị − phần đang về theo các PO.
- **Thủ công:** vào **Mua hàng & Kho › Đề nghị mua hàng**, khu "Lập đề nghị mua" → quét hoặc nhập mã hàng, nhập số lượng → **"Lập đề nghị"**.

Trạng thái được tính tự động: **Đang mở** → **Đã đặt đủ** (khi mọi dòng đã nằm trong PO). Nút **"Huỷ"** (cần lý do) chỉ dùng được khi chưa có dòng nào được đặt. Đề nghị mua không có bước duyệt.

### 4.3 Đơn mua hàng – PO (Mua hàng → Giám đốc duyệt)

1. Có hai cách tạo PO:
   - Trên màn Đề nghị mua hàng: tick chọn các dòng, chọn "Nhà cung cấp" → **"Tạo PO ({n} dòng)"**. Số lượng các dòng này bị khoá, chỉ sửa được đơn giá.
   - Hoặc vào **Đơn mua hàng › "Tạo đơn mua"**: chọn Nhà cung cấp (phải đang hợp tác), Ngày dự kiến nhận, VAT, thêm các dòng vật tư và đơn giá → **"Lưu nháp"**.
2. **"Gửi duyệt"** → **Chờ duyệt**; Giám đốc nhận thông báo.
3. Giám đốc hoặc admin (không phải người tạo, người sửa hay người gửi duyệt) bấm:
   - **"Duyệt"** → **Đã duyệt**, người tạo nhận thông báo.
   - **"Từ chối"** (cần lý do) → PO quay về **Nháp**.
4. Các nút khác:
   - **"Huỷ đơn"** (cần lý do): khi chưa nhận hàng.
   - **"Đóng đơn"** (cần lý do): khi đã duyệt hoặc đã nhận một phần, để thôi không nhận phần còn lại.

Trạng thái PO: Nháp → Chờ duyệt → Đã duyệt → Nhận một phần → Đã nhận đủ (hoặc Đã đóng / Đã huỷ).

### 4.4 Nhập kho (Thủ kho)

1. Mở PO đã duyệt, bấm **"Nhập kho"**.
2. Quét mã từng món (mỗi lần quét cộng 1) hoặc gõ số lượng vào cột "Nhận lần này". Không được vượt số còn lại.
3. Bấm **"Nhập kho"**: tạo phiếu `NK_…`.
   - Tồn kho tăng, giá vốn bình quân được tính lại.
   - Hàng mới được giữ trước cho đơn đã sinh ra PO, phần còn lại chia cho các đơn đang thiếu.
   - PO tự chuyển sang Nhận một phần hoặc Đã nhận đủ.

Phiếu nhập không sửa được. Nếu nhập sai hoặc hàng lỗi, dùng **"Trả NCC"** trên PO: nhập "Trả lần này" và "Lý do trả" → **"Trả nhà cung cấp"** (phiếu `XT_…`).

### 4.5 Xuất kho cho xưởng và nhập trả (Thủ kho)

1. Trên trang Vật tư đơn hàng bấm **"Xuất kho"**, hoặc ở **Phiếu xuất kho** quét/nhập mã đơn. Chỉ xuất được cho đơn Đang mở hoặc Đang sản xuất.
2. Chọn "Tủ nhận vật tư" (một tủ hoặc "Cả đơn"), quét vật tư, rồi bấm **"Xuất kho"** (phiếu `XK_…`).
   - Vật tư không có trong BOM của tủ sẽ nằm ở dòng "Ngoài BOM".
   - Xuất vượt BOM thì phải nhập "Lý do vượt BOM".
   - Hệ thống chỉ lấy hàng đã giữ cho chính đơn này, không lấy sang phần đã giữ cho đơn khác.
3. Xưởng trả lại vật tư thừa: **"Nhập trả từ xưởng"** (phiếu `NT_…`). Không được trả nhiều hơn số xưởng đang giữ.

### 4.6 Tồn kho và kiểm kê

- **Tồn kho** hiển thị Tồn thực tế, Đang giữ, Khả dụng, Tồn tối thiểu, Giá vốn BQ, Giá trị tồn. Bật bộ lọc "Chỉ vật tư dưới tồn tối thiểu" để xem hàng cần mua. Bấm "Xem sổ kho" để xem lịch sử nhập, xuất, trả và điều chỉnh của từng vật tư.
- Khi Khả dụng < Tồn tối thiểu, bộ phận Mua hàng nhận thông báo tồn thấp.
- **Kiểm kê kho** (Thủ kho đếm, Giám đốc hoặc admin duyệt):
  1. **"Mở phiếu"**, chọn phạm vi "Toàn kho" hoặc "Một vị trí". Mỗi lúc chỉ có một phiếu đang mở.
  2. Quét hoặc nhập "Thực đếm" cho từng vật tư.
  3. **"Gửi duyệt"** → Chờ duyệt.
  4. Người duyệt (không phải người đã đếm hay đã gửi) bấm **"Duyệt"**: chênh lệch được ghi vào sổ kho dưới dạng "Điều chỉnh kiểm kê". **"Trả lại"** đưa phiếu về Đang đếm; **"Huỷ phiếu"** để huỷ.

---

## 5. Sản xuất

### 5.1 Tạo và phát hành lệnh sản xuất (QL sản xuất)

1. Có hai cách tạo lệnh cho một đơn đang **Đang mở** và chưa có lệnh:
   - **Sản xuất › Lệnh sản xuất › "Tạo lệnh sản xuất"** → chọn Đơn hàng → **"Tạo lệnh"**.
   - Hoặc **"Tạo lệnh sản xuất"** trên trang Vật tư đơn hàng.
2. Kết quả: lệnh `LSX_…` ở trạng thái **Nháp**. Mỗi tủ vật lý thành một dòng riêng, mã dạng `<ký hiệu>-<số thứ tự>` (ví dụ đơn có 2 tủ `MSB-01` sẽ tạo `MSB-01-1`, `MSB-01-2`).
3. Trong "Danh sách tủ", chọn **Kỹ thuật viên** và nhập **Hạn hoàn thành** cho từng tủ. Ô ngày lưu khi bạn rời khỏi ô hoặc nhấn Enter.
4. Bấm **"Phát hành"**. Mọi tủ phải có kỹ thuật viên và hạn hoàn thành; nếu thiếu, hệ thống liệt kê mã các tủ còn thiếu. Khi phát hành:
   - lệnh chuyển **Đã phát hành**, đơn hàng chuyển **Đang sản xuất**;
   - các kỹ thuật viên được giao và sales phụ trách nhận thông báo.
5. Sau khi phát hành vẫn giao lại tủ hoặc đổi hạn được, trừ tủ đã xong công đoạn cuối. Kỹ thuật viên mới nhận thông báo.
6. **"Huỷ lệnh"** (cần lý do): nếu lệnh đã phát hành, đơn hàng quay lại **Đang mở** và lịch sử công đoạn vẫn được giữ.

Mục "Thiếu vật tư" trên trang lệnh cho biết vật tư nào chưa đủ. Thiếu vật tư không chặn sản xuất.

### 5.2 Làm 6 công đoạn (Kỹ thuật viên)

Kỹ thuật viên vào **Sản xuất › Tủ của tôi** để thấy các tủ được giao. QL sản xuất và admin thấy màn này với tên "Tủ đang sản xuất", gồm mọi tủ và có bộ lọc.

Mỗi tủ đi qua 6 công đoạn theo đúng thứ tự:

1. Chuẩn bị vật tư
2. Gia công vỏ tủ
3. Lắp thiết bị
4. Đấu dây
5. Kiểm tra nội bộ
6. Hoàn thiện/đóng gói

Thao tác với từng công đoạn:

- **"Bắt đầu"**: Chưa bắt đầu → Đang làm. Chỉ bắt đầu được khi công đoạn trước đã xong.
- **"Hoàn thành"**: Đang làm → Đã xong.
- **"Hoàn tác"** (chỉ QL sản xuất và admin, cần lý do): đưa công đoạn đã xong gần nhất về Đang làm, khi công đoạn sau còn chưa bắt đầu.

Mọi thao tác chỉ làm được khi lệnh **Đã phát hành**. Khi tủ cuối cùng xong "Hoàn thiện/đóng gói", lệnh tự chuyển **Hoàn thành**; QL sản xuất và sales phụ trách nhận thông báo. Đơn hàng vẫn ở **Đang sản xuất** cho tới khi có luồng giao hàng (P4).

### 5.3 Ảnh và sự cố (trên trang tủ)

Mở một tủ (`/production/units/…`):

- **Ảnh:** chọn "Công đoạn của ảnh", tuỳ chọn "Gắn với sự cố", rồi "Chọn ảnh". Chấp nhận PNG hoặc JPEG, tối đa 10 MB mỗi ảnh và 30 ảnh mỗi tủ. Ảnh không xoá được.
- **Sự cố:** **"Báo sự cố"** → chọn Công đoạn, Mức độ (Thấp/Trung bình/Cao), Mô tả → **"Gửi báo cáo"**. QL sản xuất nhận thông báo.
- QL sản xuất xử lý ở **Sản xuất › Sự cố** → **"Giải quyết"** (nhập Cách giải quyết). Người báo nhận thông báo. Sự cố không chặn công đoạn.

Ảnh và sự cố chỉ thêm được khi lệnh **Đã phát hành**. Với lệnh nháp, đã hoàn thành hoặc đã huỷ, trang tủ hiện một dòng giải thích lý do.

### 5.4 Cảnh báo quá hạn và lịch sử

- Mỗi ngày lúc 07:00 (và mỗi lần hệ thống khởi động), tủ nào đã qua Hạn hoàn thành mà chưa xong sẽ sinh thông báo cho QL sản xuất và kỹ thuật viên được giao. Ví dụ: "Tủ MSB-01-1 của lệnh sản xuất LSX_2026_0001 đã quá hạn hoàn thành (dự kiến 20/11/2026)."
- Thông báo quá hạn tự mất khi tủ xong công đoạn cuối, khi hạn được dời sang ngày chưa qua, hoặc khi lệnh bị huỷ.
- Mục **"Lịch sử"** trên trang lệnh ghi lại: tạo, phát hành, huỷ, cập nhật tủ, bắt đầu/hoàn thành/hoàn tác công đoạn, hoàn thành lệnh, báo và giải quyết sự cố. Chỉ QL sản xuất và admin thấy mục này.
  - *Hạn chế hiện tại:* các dòng công đoạn còn hiện mã (`finishing`, `material_prep`…), và dòng cập nhật tủ còn hiện "planned end: 2026-11-20". Lỗi này đang được sửa (task-08, task-09 của `specs/p3-followups`).

---

## 6. Quản trị hệ thống (Admin)

Vào từ menu tài khoản ở góc trên.

- **Quản lý người dùng:** **"Thêm người dùng"** với Tên đăng nhập, Email, Họ và tên, Vai trò (mỗi người một vai trò), và cách đặt mật khẩu ("Quản trị viên đặt mật khẩu" hoặc "Gửi email để người dùng tự đặt mật khẩu"). Màn này còn có: vô hiệu hoá / kích hoạt lại, xoá, import/export Excel, đặt lại mật khẩu, duyệt chữ ký điện tử.
- **Phân quyền:** chọn vai trò → **"Gán quyền"** để tick các quyền. Vai trò toàn quyền không chỉnh được. Không tạo hay xoá vai trò trên giao diện.
- **Chữ ký điện tử:** người dùng tải chữ ký ở Hồ Sơ. Chữ ký phải được admin duyệt mới in lên báo giá PDF.

---

## 7. Kịch bản chạy thử đầu-cuối

Dùng kịch bản này để demo hoặc kiểm thử một vòng đầy đủ. Mỗi bước ghi tài khoản cần dùng.

| # | Tài khoản | Việc làm | Kết quả cần thấy |
|---|---|---|---|
| 1 | `sales_a` | Tạo khách hàng, công trình, yêu cầu báo giá | Yêu cầu `YC_…` ở Nháp |
| 2 | `sales_mgr` | Phân công yêu cầu cho `engineer_a` | Đã phân công; engineer_a có thông báo |
| 3 | `engineer_a` | Tạo dự toán, thêm 1 tủ (SL 2) với vài vật tư, gửi dự toán | Yêu cầu Đã dự toán |
| 4 | `sales_a` | Tạo báo giá, nhập biên lợi nhuận, lưu giá, gửi duyệt | Báo giá Chờ duyệt |
| 5 | `sales_mgr` | Duyệt báo giá | Đã duyệt; yêu cầu Đã báo giá |
| 6 | `sales_a` | Tải PDF, bấm "Khách đã xác nhận", "Chuyển thành đơn hàng" | Đơn `DH_…` Đang mở; có thông báo thiếu nếu kho chưa đủ |
| 7 | `purchasing` | Trang Vật tư đơn hàng → "Tạo đề nghị mua" → tạo PO từ các dòng → gửi duyệt | PO Chờ duyệt |
| 8 | `director` | Duyệt PO | PO Đã duyệt |
| 9 | `storekeeper` | Nhập kho theo PO | Đơn hết thiếu; PO Đã nhận đủ |
| 10 | `production_manager` | Tạo lệnh sản xuất, giao kỹ thuật viên và hạn cho 2 tủ, phát hành | Lệnh Đã phát hành; đơn Đang sản xuất |
| 11 | `storekeeper` | Xuất kho cho từng tủ | Cột Đã xuất tăng |
| 12 | `technician_a` | Tủ của tôi → làm lần lượt 6 công đoạn, tải ảnh, báo một sự cố | Tiến độ 6/6 |
| 13 | `production_manager` | Giải quyết sự cố; khi tủ cuối xong | Lệnh Hoàn thành; lịch sử đầy đủ |

---

## 8. Những gì chưa có

- **P4 – QC và giao hàng:** checklist xuất xưởng, phiếu giao từng đợt, nghiệm thu. Vì vậy đơn hàng chưa thể chuyển sang Đã giao / Hoàn thành.
- **P5 – Kế toán** và **P6 – Báo cáo/KPI**; hoá đơn điện tử.
- Duyệt đề nghị mua; nhiều kho / chuyển kho; lô và serial; gửi PO qua email.
- Công đoạn sản xuất cấu hình được; lệnh sản xuất từng phần; xoá ảnh tủ.
- So sánh các phiên bản báo giá; nhập BOM từ Excel; duyệt báo giá nhiều cấp.

Tiến độ các giai đoạn xem tại [development-roadmap.md](development-roadmap.md); quyền chi tiết theo vai trò xem tại [permission/role-matrix.md](permission/role-matrix.md).
