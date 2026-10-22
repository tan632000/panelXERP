# panelXERP — Development Roadmap

ERP cho doanh nghiệp thiết kế, lắp đặt tủ điện tự động hóa. Sơ đồ nghiệp vụ: [erp-module.jpg](erp-module.jpg).

Cập nhật: 2026-10-22

## Chiến lược (GATE-SCOPE 2026-10-22)

- panelXERP là repo độc lập: copy kernel + hạ tầng từ `vn0047-haiphuong-erp-develop`
  (NestJS 11 + TypeORM/Postgres + Redis, Next.js 16 + React 19 + Tailwind 4), bỏ toàn bộ
  plugin nghiệp vụ Hải Phương, viết plugin mới cho domain tủ điện.
- Mã vạch: máy quét USB/Bluetooth dạng keyboard wedge (không dùng camera).
- HĐĐT: chưa tích hợp; chỉ ghi số/ngày hóa đơn nhập tay. Tích hợp nhà cung cấp là packet riêng sau P6.
- Mỗi packet chỉ được viết chi tiết khi packet trước đã qua GATE-DONE.

## Packets

| # | Packet | Nhóm tính năng (đề bài) | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| P1 | Nền tảng + chuỗi bán hàng: KH/dự án/liên hệ, danh mục vật tư, Yêu cầu → BOM/Dự toán → Báo giá → Đơn hàng | 1, 2, 3, một phần 9 | — | Planning — [specs/p1-foundation-sales-chain](../specs/p1-foundation-sales-chain/plan.md) |
| P2 | Mua hàng & Kho: NCC, đề nghị mua, PO, mã vạch, vị trí kho, nhập/xuất/trả/kiểm kê, cảnh báo tồn, đối chiếu dự toán–thực tế, kiểm tra tồn trong dự toán | 5, một phần 2 và 9 | P1 | Chưa bắt đầu |
| P3 | Sản xuất: lệnh sản xuất từ đơn hàng, phân công theo tủ, 6 công đoạn, ảnh/vấn đề, cảnh báo chậm/thiếu vật tư | 4 | P1, P2 | Chưa bắt đầu |
| P4 | QC & Giao hàng: checklist xuất xưởng, lỗi/khắc phục, phiếu giao từng đợt, lắp đặt công trình, biên bản nghiệm thu | 6 | P3 | Chưa bắt đầu |
| P5 | Kế toán: kế hoạch xuất HĐ, đợt thanh toán, thu tiền, công nợ KH/NCC, nhắc hạn | 7 | P1, P2, P4 | Chưa bắt đầu |
| P6 | Báo cáo & KPI: lãi lỗ dự kiến/thực tế theo đơn, KPI Sale/Kỹ thuật/Sản xuất theo công thức + trọng số | 8, phần còn lại của 9 | P1–P5 | Chưa bắt đầu |

Nhóm 9 (liên kết tự động, phân quyền, audit) được thực hiện dần trong từng packet:
mỗi bước chuyển giao phát notification và ghi activity log ngay trong packet sở hữu bước đó.
