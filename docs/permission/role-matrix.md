# Ma trận phân quyền và tài khoản demo

Cập nhật: 2026-11-02. Nguồn: `backend/src/kernel/core/database/seeds/seed-roles.ts` (quyền theo role), `seed-users.ts` (tài khoản), `kernel/shared/services/data-scope.service.ts` (phạm vi dữ liệu). Ma trận được sinh bằng chính hàm `holds()` mà guard dùng, nên wildcard (`order:*`, `*:*`) đã được bung ra từng quyền.

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

Email dùng domain `SEED_EMAIL_DOMAIN` (mặc định `example.com`).

## 2. Phạm vi dữ liệu

Quyền quyết định **được làm hành động nào**; phạm vi dữ liệu quyết định **hành động đó chạm tới bản ghi nào**. Bản ghi ngoài phạm vi trả về 404 (không phải 403) để không lộ việc nó tồn tại.

| Phạm vi | Thấy gì |
|---|---|
| `all` | Mọi bản ghi |
| `ownSales` | Khách hàng, yêu cầu, báo giá, đơn hàng mà mình là sales phụ trách; tiến độ sản xuất của đơn của mình |
| `assignedEngineer` | Yêu cầu (và dự toán) được giao cho mình |
| `material` | Vật tư của mọi đơn, không thấy bản ghi bán hàng (khách, yêu cầu, báo giá, đơn); productionManager thấy mọi lệnh sản xuất |
| `assignedTechnician` | Chỉ các tủ được giao cho mình; không thấy bản ghi bán hàng, không thấy vật tư |

## 3. Ma trận quyền

✅ = có quyền. Mọi quyền trong bảng đều đã được khai báo và có hiệu lực.

| Quyền | `admin` | `director` | `salesManager` | `sales` | `engineeringLead` | `engineer` | `purchasing` | `storekeeper` | `productionManager` | `technician` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `customer:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `customer:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `customer:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `customer:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `contact:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `contact:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `contact:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `contact:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `project:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `project:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `project:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `project:delete` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `item:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |
| `item:create` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |
| `item:update` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |
| `item:delete` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |
| `item:import` | ✅ | ✅ |  |  | ✅ |  | ✅ |  |  |  |
| `item:stock_settings` | ✅ | ✅ |  |  | ✅ |  | ✅ | ✅ |  |  |
| `reference_price:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |
| `purchase_price:read` | ✅ | ✅ | ✅ |  |  |  | ✅ |  |  |  |
| `location:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `location:create` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `location:update` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `location:delete` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `request:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |
| `request:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `request:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `request:assign` | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |
| `request:cancel` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `estimate:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |
| `estimate:create` | ✅ |  |  |  | ✅ | ✅ |  |  |  |  |
| `estimate:update` | ✅ |  |  |  | ✅ | ✅ |  |  |  |  |
| `estimate:submit` | ✅ |  |  |  | ✅ | ✅ |  |  |  |  |
| `quotation:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:submit` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:approve` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `quotation:confirm` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:cancel` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `quotation:export` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `order:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `order:create` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `order:update` | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `order:cancel` | ✅ | ✅ | ✅ |  |  |  |  |  |  |  |
| `supplier:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `supplier:create` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `supplier:update` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `supplier:delete` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `stock:availability` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |  |
| `stock:read` | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |
| `stock:ledger` | ✅ | ✅ | ✅ |  |  |  | ✅ | ✅ |  |  |
| `purchase_order:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `purchase_order:create` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `purchase_order:update` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `purchase_order:submit` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `purchase_order:approve` | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `purchase_order:cancel` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `purchase_order:close` | ✅ | ✅ |  |  |  |  | ✅ |  |  |  |
| `material:read` | ✅ | ✅ | ✅ | ✅ | ✅ |  | ✅ | ✅ | ✅ |  |
| `stock_receipt:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `stock_receipt:create` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stock_issue:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `stock_issue:create` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stock_return:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `stock_return:create` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stocktake:read` | ✅ | ✅ |  |  |  |  | ✅ | ✅ |  |  |
| `stocktake:create` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stocktake:update` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stocktake:submit` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `stocktake:approve` | ✅ | ✅ |  |  |  |  |  |  |  |  |
| `stocktake:cancel` | ✅ |  |  |  |  |  |  | ✅ |  |  |
| `purchase_request:read` | ✅ | ✅ |  |  | ✅ | ✅ | ✅ | ✅ |  |  |
| `purchase_request:create` | ✅ |  |  |  | ✅ | ✅ | ✅ | ✅ |  |  |
| `purchase_request:update` | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `purchase_request:cancel` | ✅ |  |  |  |  |  | ✅ |  |  |  |
| `production_order:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  | ✅ | ✅ |
| `production_order:create` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `production_order:update` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `production_order:release` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `production_order:cancel` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `production_progress:read` | ✅ | ✅ | ✅ | ✅ |  |  |  |  | ✅ | ✅ |
| `production_progress:update` | ✅ |  |  |  |  |  |  |  | ✅ | ✅ |
| `production_progress:undo` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `production_issue:read` | ✅ | ✅ | ✅ |  |  |  |  |  | ✅ | ✅ |
| `production_issue:create` | ✅ |  |  |  |  |  |  |  | ✅ | ✅ |
| `production_issue:resolve` | ✅ |  |  |  |  |  |  |  | ✅ |  |
| `file:read` | ✅ |  |  |  |  |  |  |  |  |  |
| `file:write` | ✅ |  |  |  |  |  |  |  |  |  |
| `user:import` | ✅ |  |  |  |  |  |  |  |  |  |
| `user:export` | ✅ |  |  |  |  |  |  |  |  |  |

## 4. Ghi chú

- `file:read`, `file:write` chỉ admin có: các route file của kernel ký được mọi key lưu trữ; tệp đính kèm nghiệp vụ đi qua endpoint của từng tính năng.
- Chỉ `admin`, `director`, `salesManager` duyệt được báo giá (`quotation:approve`) và huỷ được đơn (`order:cancel`).
- productionManager và technician không có `order:read` và không thấy giá (`purchase_price:read`, `reference_price:read`).
- Quy ước đặt tên quyền và 6 lớp phân quyền: xem [permission-convention.md](permission-convention.md).

### Cập nhật tài liệu này

Khi `seed-roles.ts` hoặc quyền của một plugin thay đổi, sinh lại bảng ở mục 3 bằng `seededRoleCodes()`, `seededRolePermissions()` và `holds()` (cùng hàm guard dùng), rồi thay bảng; không sửa tay từng ô.
