# Ma trận phân quyền và tài khoản demo

Cập nhật: 2026-11-24. Nguồn: `backend/src/kernel/core/database/seeds/seed-roles.ts` (quyền theo role), `seed-users.ts` (tài khoản), `kernel/shared/services/data-scope.service.ts` (phạm vi dữ liệu). Ma trận được sinh bằng chính hàm `holds()` mà guard dùng, nên wildcard (`order:*`, `*:*`) đã được bung ra từng quyền.

Lúc lập tài liệu, trong DB không có role nào bị admin sửa trên màn hình phân quyền (`roles.updated_by` rỗng), nên quyền thực tế khớp seed. Nếu admin đã sửa một role, seed giữ nguyên bản sửa đó và tài liệu này không còn đúng cho role ấy.

## 1. Tài khoản demo theo role

Đăng nhập bằng **username hoặc email**. Mật khẩu của mọi tài khoản là giá trị `SEED_ADMIN_PASSWORD` trong `backend/.env` của môi trường đó (tài khoản demo dùng chung mật khẩu admin). Tài liệu này không ghi mật khẩu.

Tài khoản demo chỉ được tạo ngoài môi trường production; production chỉ có `admin`.

| Role (code) | Tên role | Username | Email | Phòng ban | Phạm vi dữ liệu |
|---|---|---|---|---|---|
| `admin` | Administrator | `admin` | admin@example.com | other | `all` |
| `director` | Director | `director` | director@example.com | other | `all` |
| `salesManager` | Sales Manager | `sales_mgr` | sales.mgr@example.com | sales | `all` |
| `sales` | Sales | `sales_a` | sales.a@example.com | sales | `ownSales` |
| `sales` | Sales | `sales_b` | sales.b@example.com | sales | `ownSales` |
| `engineeringLead` | Engineering Lead | `eng_lead` | eng.lead@example.com | technical | `all` |
| `engineer` | Engineer | `engineer_a` | engineer.a@example.com | technical | `assignedEngineer` |
| `engineer` | Engineer | `engineer_b` | engineer.b@example.com | technical | `assignedEngineer` |
| `purchasing` | Purchasing | `purchasing` | purchasing@example.com | purchasing | `material` |
| `storekeeper` | Storekeeper | `storekeeper` | storekeeper@example.com | warehouse | `material` |
| `productionManager` | Production Manager | `production_manager` | production.manager@example.com | planning | `material` |
| `technician` | Technician | `technician_a` | technician.a@example.com | technical | `assignedTechnician` |
| `technician` | Technician | `technician_b` | technician.b@example.com | technical | `assignedTechnician` |
| `qcInspector` | QC Inspector | `qc_a` | qc.a@example.com | qcLab | `material` |

Email dùng domain `SEED_EMAIL_DOMAIN` (mặc định `example.com`).

## 2. Phạm vi dữ liệu

Quyền quyết định **được làm hành động nào**; phạm vi dữ liệu quyết định **hành động đó chạm tới bản ghi nào**. Bản ghi ngoài phạm vi trả về 404 (không phải 403) để không lộ việc nó tồn tại.

| Phạm vi | Thấy gì |
|---|---|
| `all` | Mọi bản ghi |
| `ownSales` | Khách hàng, yêu cầu, báo giá, đơn hàng mà mình là sales phụ trách; tiến độ sản xuất của đơn của mình |
| `assignedEngineer` | Yêu cầu (và dự toán) được giao cho mình |
| `material` | Vật tư của mọi đơn, không thấy bản ghi bán hàng (khách, yêu cầu, báo giá, đơn); productionManager thấy mọi lệnh sản xuất; thấy mọi bản ghi QC, phiếu giao, lắp đặt và nghiệm thu (storekeeper, productionManager, qcInspector) |
| `assignedTechnician` | Chỉ các tủ được giao cho mình; không thấy bản ghi bán hàng, không thấy vật tư |

## 3. Ma trận quyền

✅ = có quyền. Mọi quyền trong bảng đều đã được khai báo và có hiệu lực.

| Quyền | `admin` | `director` | `salesManager` | `sales` | `engineeringLead` | `engineer` | `purchasing` | `storekeeper` | `productionManager` | `technician` | `qcInspector` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `customer:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `customer:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `customer:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `customer:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `contact:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `contact:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `contact:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `contact:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `project:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `project:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `project:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `project:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `item:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |
| `item:create` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |  |
| `item:update` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |  |
| `item:delete` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |  |
| `item:import` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |  |
| `item:stock_settings` | ✅ | ✅ |  |  | ✅ |  | ✅ | ✅ |  |  |  |
| `reference_price:read` | ✅ | ✅ | ✅ | ✅ |  |  | ✅ |  |  |  |  |
| `purchase_price:read` | ✅ | ✅ | ✅ |  |  |  | ✅ |  |  |  |  |
| `location:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `location:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `location:update` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `location:delete` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `request:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `request:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `request:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `request:assign` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `request:cancel` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `estimate:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `estimate:create` | ✅ | ✅ |  |  | ✅ | ✅ |  |  |  |  |  |
| `estimate:update` | ✅ | ✅ |  |  | ✅ | ✅ |  |  |  |  |  |
| `estimate:submit` | ✅ | ✅ |  |  | ✅ | ✅ |  |  |  |  |  |
| `estimate:ai_prefill` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `estimate:price` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation_template:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `quotation_template:create` | ✅ | ✅ | ✅ |  | ✅ |  |  |  |  |  |  |
| `quotation_template:update` | ✅ | ✅ | ✅ |  | ✅ |  |  |  |  |  |  |
| `quotation_template:delete` | ✅ | ✅ | ✅ |  | ✅ |  |  |  |  |  |  |
| `quotation:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:submit` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:approve` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `quotation:confirm` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:cancel` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:export` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `order:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `order:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `order:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `order:cancel` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `supplier:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `supplier:create` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `supplier:update` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `supplier:delete` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `stock:availability` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |
| `stock:read` | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |  |
| `stock:ledger` | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |  |
| `purchase_order:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `purchase_order:create` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `purchase_order:update` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `purchase_order:submit` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `purchase_order:approve` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `purchase_order:cancel` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `purchase_order:close` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `material:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  | ✅ | ✅ | ✅ |  |  |
| `stock_receipt:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `stock_receipt:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stock_issue:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `stock_issue:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stock_return:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `stock_return:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stocktake:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |  |
| `stocktake:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stocktake:update` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stocktake:submit` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `stocktake:approve` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `stocktake:cancel` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `purchase_request:read` | ✅ | ✅ |  |  | ✅ | ✅ | ✅ | ✅ |  |  |  |
| `purchase_request:create` | ✅ | ✅ |  |  | ✅ | ✅ | ✅ | ✅ |  |  |  |
| `purchase_request:update` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `purchase_request:cancel` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |  |
| `production_order:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |
| `production_order:create` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `production_order:update` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `production_order:release` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `production_order:cancel` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `production_progress:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |
| `production_progress:update` | ✅ | ✅ |  |  |  |  |  |  | ✅ | ✅ |  |
| `production_progress:undo` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `production_issue:read` | ✅ | ✅ | ✅ |  |  |  |  |  | ✅ | ✅ |  |
| `production_issue:create` | ✅ | ✅ |  |  |  |  |  |  | ✅ | ✅ |  |
| `production_issue:resolve` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `qc_checklist:read` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  | ✅ |
| `qc_checklist:manage` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `qc_inspection:read` | ✅ | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  | ✅ |
| `qc_inspection:create` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  | ✅ |
| `qc_inspection:fix` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `qc_inspection:verify` | ✅ | ✅ |  |  |  |  |  |  | ✅ |  | ✅ |
| `delivery_note:read` | ✅ | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |
| `delivery_note:create` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `delivery_note:ship` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `delivery_note:receive` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `delivery_note:cancel` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `installation:read` | ✅ | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |
| `installation:manage` | ✅ | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `acceptance:read` | ✅ | ✅ | ✅ | ✅ |  |  |  | ✅ |  |  |  |
| `acceptance:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `file:read` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `file:write` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `user:import` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `user:export` | ✅ | ✅ |  |  |  |  |  |  |  |  |  |

## 4. Ghi chú

- `file:read`, `file:write` chỉ admin có: các route file của kernel ký được mọi key lưu trữ; tệp đính kèm nghiệp vụ đi qua endpoint của từng tính năng.
- `director` giữ `*:*` như admin nên có mọi quyền, kể cả quản trị người dùng, role và tệp. Giám đốc nhận mọi thông báo nghiệp vụ, là người được soạn dự toán (cùng Trưởng kỹ thuật) và xem được lịch sử lệnh sản xuất. Role `director` bị khoá trên màn hình phân quyền (không thu hẹp được quyền), và chữ ký mới của giám đốc được lưu ngay, không qua bước duyệt chữ ký.
- Báo giá, đơn mua (PO) và phiếu kiểm kê do giám đốc gửi thì được duyệt ngay trong cùng thao tác; giám đốc không bị chặn bởi nguyên tắc 4 mắt. Admin vẫn phải theo nguyên tắc 4 mắt và không soạn được dự toán.
- Chỉ `admin`, `director`, `salesManager` duyệt được báo giá (`quotation:approve`) và huỷ được đơn (`order:cancel`).
- `engineer` và `engineeringLead` không có quyền xem giá nào (`reference_price:read`, `purchase_price:read`) và không có `estimate:price`: màn hình và API dự toán không trả tiền cho họ, kỹ sư chỉ nhập tủ, vật tư và số lượng.
- `estimate:price` (điền đơn giá vốn và chi phí khác của dự toán đã gửi, rồi "Hoàn tất giá") do `sales` và `salesManager` giữ; `director` và `admin` có qua `*:*`. Báo giá chỉ lập được từ dự toán đã điền giá.
- `estimate:ai_prefill` (nút "Phân tích & Điền bằng AI") do `sales` và `salesManager` giữ. `director` có qua `*:*`, và API AI chỉ nhận Sales, Trưởng phòng KD và Giám đốc; `admin` có `*:*` nhưng API trả 403. Kỹ sư không chạy AI; bản nháp AI được kỹ sư kiểm tra và gửi như dự toán thường.
- `quotation_template:create|update|delete` chỉ `salesManager` và `engineeringLead` giữ (cộng `director` và `admin` qua `*:*`). Vai trò có `quotation_template:read` chỉ xem được mẫu; mẫu không chứa giá.
- productionManager và technician không có `order:read` và không thấy giá (`purchase_price:read`, `reference_price:read`).
- `qcInspector` (`qc_a`, phòng `qcLab`) chỉ có `qc_checklist:read` và `qc_inspection:read|create|verify`: không có `order:read`, không có `material:read`, không thấy giá và không thấy bản ghi bán hàng; chỉ ghi nhận lượt QC theo từng tủ và xác nhận lỗi đã khắc phục.
- productionManager giữ mẫu checklist (`qc_checklist:*`) và xử lý lỗi QC (`qc_inspection:fix`); người xác nhận (`qc_inspection:verify`) phải khác người đã đánh dấu khắc phục, nên productionManager không tự xác nhận lỗi mình sửa. productionManager chỉ đọc phiếu giao và lắp đặt.
- `storekeeper` giao hàng (`delivery_note:*`), lắp đặt (`installation:*`) và chỉ đọc biên bản nghiệm thu (`acceptance:read`), đọc kết quả QC (`qc_inspection:read`).
- `sales` lập biên bản nghiệm thu (`acceptance:read|create`) cho đơn của mình; `salesManager` (`acceptance:*`, phạm vi `all`), `director` và `admin` lập cho mọi đơn. Cả hai chỉ đọc QC, phiếu giao và lắp đặt (sales: của đơn mình).
- Quy ước đặt tên quyền và 6 lớp phân quyền: xem [permission-convention.md](permission-convention.md).

### Cập nhật tài liệu này

Khi `seed-roles.ts` hoặc quyền của một plugin thay đổi, sinh lại bảng ở mục 3 bằng `seededRoleCodes()`, `seededRolePermissions()` và `holds()` (cùng hàm guard dùng), rồi thay bảng; không sửa tay từng ô.
